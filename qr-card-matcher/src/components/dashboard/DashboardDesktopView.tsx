import { useState, useEffect, useCallback } from "react";
import {
  Week,
  Stats,
  MemberWithPurchases,
  getMembersWithPurchases,
  getStatsByWeek,
  ensureCurrentWeekExists,
  getWeeksByYear,
  createOrUpdateWeek,
  getNextShabbat,
  getHebrewWeekNumber,
  fetchParashaFromSefaria,
} from "../../database";
import { getStoredUser, ApiUser } from "../../services/apiService";
import { DashboardHeader } from "./DashboardHeader";
import { NavTabs, TabId } from "./NavTabs";
import { ProgressWidget, UnpaidWidget } from "./SidebarWidgets";
import { PurchasesTable } from "./PurchasesTable";
import "./DashboardDesktop.css";

interface DashboardDesktopViewProps {
  initialWeek?: Week | null;
  onWeekChange?: (week: Week) => void;
  onScan: () => void;
  onEditPurchase: (memberId: number) => void;
  onSendReminder: (memberId: number) => void;
  onNavigateToMembers: () => void;
  onNavigateToMitzvot: () => void;
}

export function DashboardDesktopView({
  initialWeek,
  onWeekChange,
  onScan,
  onEditPurchase,
  onSendReminder,
  onNavigateToMembers,
  onNavigateToMitzvot,
}: DashboardDesktopViewProps) {
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(initialWeek || null);
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [user, setUser] = useState<ApiUser | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [membersWithPurchases, setMembersWithPurchases] = useState<MemberWithPurchases[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Load user data
  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  // Load weeks for navigation
  const loadWeeks = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const yearWeeks = await getWeeksByYear(currentYear);
      const prevYearWeeks = await getWeeksByYear(currentYear - 1);
      const allWeeks = [...yearWeeks, ...prevYearWeeks].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week_number - a.week_number;
      });
      setWeeks(allWeeks);
    } catch (error) {
      console.error("Error loading weeks:", error);
    }
  };

  // Initialize week and load weeks list
  useEffect(() => {
    const init = async () => {
      await loadWeeks();
      if (initialWeek) {
        setSelectedWeek(initialWeek);
      } else {
        const week = await ensureCurrentWeekExists();
        setSelectedWeek(week);
      }
    };
    init();
  }, [initialWeek]);

  // Update current index when week or weeks change
  useEffect(() => {
    if (selectedWeek && weeks.length > 0) {
      const idx = weeks.findIndex(w => w.id === selectedWeek.id);
      setCurrentIndex(idx);
    }
  }, [selectedWeek, weeks]);

  // Load stats and data when week changes
  useEffect(() => {
    const loadData = async () => {
      if (!selectedWeek) return;
      setLoading(true);
      try {
        const weekStats = await getStatsByWeek(selectedWeek.week_number, selectedWeek.year);
        setStats(weekStats);

        const members = await getMembersWithPurchases(selectedWeek.week_number, selectedWeek.year);
        setMembersWithPurchases(members);
      } catch (error) {
        console.error("Error loading data:", error);
      }
      setLoading(false);
    };
    loadData();
  }, [selectedWeek]);

  // Update parent when week changes
  const handleWeekChange = useCallback((week: Week) => {
    setSelectedWeek(week);
    onWeekChange?.(week);
  }, [onWeekChange]);

  // Navigate to next week (newer - towards index 0)
  const handleNextWeek = async () => {
    if (currentIndex > 0) {
      // Go to previous index (newer week)
      handleWeekChange(weeks[currentIndex - 1]);
    } else if (currentIndex === 0 || currentIndex === -1) {
      // At newest week or no weeks yet - create new week
      setLoading(true);
      try {
        const nextShabbat = getNextShabbat(new Date());
        const weekNumber = getHebrewWeekNumber(nextShabbat);
        const year = nextShabbat.getFullYear();
        const shabbatDateStr = nextShabbat.toISOString().split('T')[0];

        const parasha = await fetchParashaFromSefaria(nextShabbat);

        const newWeek = await createOrUpdateWeek(
          weekNumber,
          year,
          parasha?.nameHe,
          parasha?.nameEn,
          parasha?.ref,
          shabbatDateStr
        );

        await loadWeeks();
        handleWeekChange(newWeek);
      } catch (error) {
        console.error("Error creating new week:", error);
      }
      setLoading(false);
    }
  };

  // Navigate to previous week (older - towards higher index)
  const handlePrevWeek = () => {
    if (currentIndex >= 0 && currentIndex < weeks.length - 1) {
      handleWeekChange(weeks[currentIndex + 1]);
    }
  };

  // Handle tab navigation
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (tab === "members") {
      onNavigateToMembers();
    } else if (tab === "mitzvot") {
      onNavigateToMitzvot();
    }
  };

  // Get user initials
  const getUserInitials = () => {
    if (!user) return "??";
    const name = user.contact_name || user.email;
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
    }
    return name.substring(0, 2);
  };

  // Get user display name
  const getUserName = () => {
    if (!user) return "משתמש";
    return user.contact_name || user.email;
  };

  // Calculate payment stats
  const getTotalAmount = () => {
    return membersWithPurchases.reduce((sum, m) => sum + (m.total_price || 0), 0);
  };

  const getPaidAmount = () => {
    // TODO: Get actual paid amount from database
    // For now, assume all is unpaid
    return 0;
  };

  // Get unpaid members for widget
  const getUnpaidMembers = () => {
    return membersWithPurchases
      .filter(m => m.total_price > 0)
      .map(m => ({
        id: m.id,
        firstName: m.first_name,
        lastName: m.last_name,
        amount: m.total_price || 0,
        email: m.email || undefined,
        phone: m.phone || undefined,
      }));
  };

  const handleSendAllReminders = () => {
    // Send reminders to all unpaid members
    const unpaidMembers = getUnpaidMembers();
    unpaidMembers.forEach(m => onSendReminder(m.id));
  };

  if (loading && !selectedWeek) {
    return (
      <div className="dashboard-desktop">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          טוען...
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-desktop">
      {/* Header */}
      <DashboardHeader
        userName={getUserName()}
        userInitials={getUserInitials()}
        selectedWeek={selectedWeek}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* Navigation Tabs */}
      <NavTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        membersCount={stats?.totalMembers}
        mitzvotCount={stats?.totalMitzvot}
      />

      {/* Main Content */}
      <main className="main-content">
        <div className="content-layout">
          {/* Table */}
          <PurchasesTable
            members={membersWithPurchases}
            totalMembers={membersWithPurchases.length}
            totalMitzvot={stats?.totalMitzvot || 0}
            totalAmount={getTotalAmount()}
            onScan={onScan}
            onFilter={() => {/* TODO: implement filter */}}
            onExport={() => {/* TODO: implement export */}}
            onEditPurchase={onEditPurchase}
            onSendReminder={onSendReminder}
            searchQuery={searchQuery}
          />

          {/* Sidebar Widgets */}
          <div className="sidebar-widgets">
            <ProgressWidget
              totalAmount={getTotalAmount()}
              paidAmount={getPaidAmount()}
            />
            <UnpaidWidget
              members={getUnpaidMembers()}
              totalUnpaid={getTotalAmount() - getPaidAmount()}
              onSendReminder={onSendReminder}
              onSendAllReminders={handleSendAllReminders}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

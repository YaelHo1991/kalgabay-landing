/**
 * HomeScreen - Main home screen with stats, progress, and purchases
 * Matches prototype design
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { HebrewCalendar, HDate, flags } from '@hebcal/core';
import {
  Week,
  MemberWithPurchaseDetails,
  getMembersWithPurchaseDetails,
  ensureCurrentWeekExists,
  getWeeksByYear,
  createOrUpdateWeek,
} from '../../../database';
import { updateMemberPaymentStatusSync } from '../../../hooks/useSync';

// Calendar event type for week selector
interface CalendarEvent {
  date: Date;
  hebrewDate: string;
  name: string;
  type: 'parasha' | 'holiday';
  weekNumber: number;
  year: number;
}

// Get current Hebrew year
function getCurrentHebrewYear(): number {
  const today = new HDate();
  return today.getFullYear();
}

// Get week number for a date
function getCalendarWeekNumber(date: Date): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const jan1 = new Date(target.getFullYear(), 0, 1);
  const diff = target.getTime() - jan1.getTime();
  return Math.ceil((diff / 86400000 + 1) / 7);
}

// Get all parshiot and holidays for a Hebrew year
function getYearParshiot(hebrewYear: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  const calEvents = HebrewCalendar.calendar({
    year: hebrewYear,
    isHebrewYear: true,
    sedrot: true,
    il: true,
    locale: 'he',
  });

  for (const event of calEvents) {
    const eventFlags = event.getFlags();
    const hdate = event.getDate();
    const gregDate = hdate.greg();
    const hebrewDateStr = hdate.renderGematriya(true);

    // Only include parsha readings (Shabbat)
    if (eventFlags & flags.PARSHA_HASHAVUA) {
      events.push({
        date: gregDate,
        hebrewDate: hebrewDateStr,
        name: event.render('he'),
        type: 'parasha',
        weekNumber: getCalendarWeekNumber(gregDate),
        year: gregDate.getFullYear(),
      });
    }
  }

  // Sort by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  return events;
}

interface HomeScreenProps {
  user: {
    id: number;
    email: string;
    synagogue_name?: string;
    contact_name?: string;
  };
  onScan: () => void;
  onLogout: () => void;
  gmailConnected?: boolean;
  gmailEmail?: string | null;
  onConnectGmail?: () => void;
  onSendReminder?: (memberId: number) => void;
  onEditPurchase?: (memberId: number) => void;
  refreshTrigger?: number;
}

// Helper to format date as Hebrew date string
function formatHebrewDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

// Helper to get initials from name
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
}

export default function HomeScreen({
  user,
  onScan,
  onLogout,
  gmailConnected,
  gmailEmail,
  onConnectGmail,
  onSendReminder,
  onEditPurchase,
  refreshTrigger
}: HomeScreenProps) {
  const [showWeekSelector, setShowWeekSelector] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]); // All parshiot for week selector
  const [membersWithPurchases, setMembersWithPurchases] = useState<MemberWithPurchaseDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [gmailButtonPulse, setGmailButtonPulse] = useState(false);

  // Handle Gmail button click with animation
  const handleGmailClick = () => {
    console.log('Gmail button clicked!');
    setGmailButtonPulse(true);
    setTimeout(() => setGmailButtonPulse(false), 1000);
    if (onConnectGmail) {
      onConnectGmail();
    }
  };

  // Load all parshiot for the calendar (for week selector)
  const loadCalendarEvents = useCallback(() => {
    const hebrewYear = getCurrentHebrewYear();
    const currentYearEvents = getYearParshiot(hebrewYear);
    const prevYearEvents = getYearParshiot(hebrewYear - 1);
    // Combine and sort by date (newest first for display)
    const allEvents = [...currentYearEvents, ...prevYearEvents].sort((a, b) => b.date.getTime() - a.date.getTime());
    setCalendarEvents(allEvents);
  }, []);

  // Load weeks from DB for navigation arrows
  const loadWeeks = useCallback(async () => {
    try {
      const currentYear = new Date().getFullYear();
      const yearWeeks = await getWeeksByYear(currentYear);
      const prevYearWeeks = await getWeeksByYear(currentYear - 1);
      const allWeeks = [...yearWeeks, ...prevYearWeeks].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week_number - a.week_number;
      });
      setWeeks(allWeeks);
      return allWeeks;
    } catch (error) {
      console.error("Error loading weeks:", error);
      return [];
    }
  }, []);

  // Initialize week and load weeks list
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        // Load all parshiot for the week selector
        loadCalendarEvents();

        await loadWeeks();
        const week = await ensureCurrentWeekExists();
        setSelectedWeek(week);
      } catch (error) {
        console.error("Error initializing:", error);
      }
      setLoading(false);
    };
    init();
  }, [loadWeeks, loadCalendarEvents]);

  // Load purchases when week changes or refresh is triggered
  useEffect(() => {
    const loadPurchases = async () => {
      if (!selectedWeek) return;
      try {
        const members = await getMembersWithPurchaseDetails(selectedWeek.week_number, selectedWeek.year);
        setMembersWithPurchases(members);
      } catch (error) {
        console.error("Error loading purchases:", error);
      }
    };
    loadPurchases();
  }, [selectedWeek, refreshTrigger]);

  // Handle selecting a parasha from the calendar events (creates week if needed)
  const handleCalendarEventSelect = async (event: CalendarEvent) => {
    setShowWeekSelector(false);
    setLoading(true);
    try {
      // Check if week already exists in DB
      const existingWeek = weeks.find(w =>
        w.week_number === event.weekNumber && w.year === event.year
      );

      if (existingWeek) {
        setSelectedWeek(existingWeek);
      } else {
        // Create new week from calendar event
        const parashaName = event.name.replace('פרשת ', '');
        const shabbatDateStr = event.date.toISOString().split('T')[0];
        const newWeek = await createOrUpdateWeek(
          event.weekNumber,
          event.year,
          parashaName,
          undefined, // nameEn
          undefined, // ref
          shabbatDateStr
        );
        // Reload weeks list
        await loadWeeks();
        setSelectedWeek(newWeek);
      }
    } catch (error) {
      console.error('Error selecting calendar event:', error);
    }
    setLoading(false);
  };

  // Handle mark as paid - local implementation that uses selectedWeek
  const handleLocalMarkAsPaid = useCallback(async (memberId: number) => {
    if (!selectedWeek) {
      alert('שגיאה: לא נבחר שבוע');
      return;
    }

    const member = membersWithPurchases.find(m => m.id === memberId);
    if (!member) {
      alert('שגיאה: לא נמצא מתפלל');
      return;
    }

    // Toggle status - if all paid, mark as unpaid, otherwise mark as paid
    const allPaid = member.purchases.every(p => p.payment_status === 'paid');
    const newStatus = allPaid ? 'unpaid' : 'paid';

    try {
      await updateMemberPaymentStatusSync(memberId, selectedWeek.week_number, selectedWeek.year, newStatus);
      // Reload purchases to reflect changes
      const members = await getMembersWithPurchaseDetails(selectedWeek.week_number, selectedWeek.year);
      setMembersWithPurchases(members);
    } catch (error) {
      alert('שגיאה בעדכון סטטוס תשלום');
    }
  }, [selectedWeek, membersWithPurchases]);

  // Calculate stats from real data
  const getTotalAmount = () => membersWithPurchases.reduce((sum, m) => sum + (m.total_price || 0), 0);
  const getPaidAmount = () => membersWithPurchases.reduce((sum, m) => {
    return sum + m.purchases.filter(p => p.payment_status === 'paid').reduce((psum, p) => psum + (p.bid_price || 0), 0);
  }, 0);
  const getTotalMitzvot = () => membersWithPurchases.reduce((sum, m) => sum + m.purchases.length, 0);
  const getUnpaidAmount = () => getTotalAmount() - getPaidAmount();
  const getProgressPercent = () => {
    const total = getTotalAmount();
    if (total === 0) return 0;
    return Math.round((getPaidAmount() / total) * 100);
  };

  // Get unpaid members
  const getUnpaidMembers = () => {
    return membersWithPurchases
      .filter(m => m.purchases.some(p => p.payment_status === 'unpaid'))
      .map(m => {
        const unpaidAmount = m.purchases
          .filter(p => p.payment_status === 'unpaid')
          .reduce((sum, p) => sum + (p.bid_price || 0), 0);
        return {
          id: m.id,
          name: `${m.first_name} ${m.last_name}`,
          initials: getInitials(m.first_name, m.last_name),
          amount: unpaidAmount
        };
      });
  };

  // Transform purchases for display - use useMemo to update when data changes
  const purchasesForDisplay = useMemo(() => {
    return membersWithPurchases.map(m => ({
      id: m.id,
      name: `${m.first_name} ${m.last_name}`,
      initials: getInitials(m.first_name, m.last_name),
      phone: m.phone || '',
      price: m.total_price,
      mitzvot: m.purchases.map(p => p.mitzva_name),
      paid: m.purchases.length > 0 && m.purchases.every(p => p.payment_status === 'paid')
    }));
  }, [membersWithPurchases]);

  if (loading && !selectedWeek) {
    return (
      <div className="mobile-screen">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          טוען...
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-screen">
      {/* Header - Fixed at top */}
      <header className="mobile-header" style={{ flexShrink: 0 }}>
        <div className="header-row">
          <div className="header-brand">
            <h1 className="header-title">קלגבאי</h1>
            <div className="header-divider"></div>
            <div className="header-info header-info-clickable" onClick={() => setShowLogoutDialog(true)}>
              <div className="header-synagogue">{user.synagogue_name || 'בית כנסת'}</div>
              <div className="header-gabbai">{user.contact_name || 'גבאי'}</div>
            </div>
            {/* Gmail connection indicator - larger touch target for mobile */}
            <button
              className={`header-gmail-status ${gmailConnected ? 'connected' : 'disconnected'}`}
              title={gmailConnected ? `Gmail מחובר: ${gmailEmail}` : 'לחץ לחיבור Gmail'}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!gmailConnected) {
                  handleGmailClick();
                }
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!gmailConnected) {
                  handleGmailClick();
                }
              }}
              style={{
                transform: gmailButtonPulse ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.3s ease, background-color 0.3s ease',
                backgroundColor: gmailButtonPulse ? '#4CAF50' : undefined,
              }}
            >
              {gmailConnected ? (
                <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
              )}
            </button>
          </div>
          <div className="header-actions">
            <button className="header-icon-btn" onClick={onScan}>
              <svg viewBox="0 0 24 24">
                <path d="M9.4 10.5l4.77-8.26C13.47 2.09 12.75 2 12 2c-2.4 0-4.6.85-6.32 2.25l3.66 6.35.06-.1zM21.54 9c-.92-2.92-3.15-5.26-6-6.34L11.88 9h9.66zm.26 1h-7.49l.29.5 4.76 8.25C21 16.97 22 14.61 22 12c0-.69-.07-1.35-.2-2zM8.54 12l-3.9-6.75C3.01 7.03 2 9.39 2 12c0 .69.07 1.35.2 2h7.49l-1.15-2zm-6.08 3c.92 2.92 3.15 5.26 6 6.34L12.12 15H2.46zm11.27 0l-3.9 6.76c.7.15 1.42.24 2.17.24 2.4 0 4.6-.85 6.32-2.25l-3.66-6.35-.93 1.6z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Week Card - Click to open week selector */}
        <div className="week-card-header" onClick={() => setShowWeekSelector(true)}>
          <div className="week-icon">
            <svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>
          </div>
          <div className="week-info week-info-clickable">
            <div className="week-parasha">
              {selectedWeek?.parasha_name_he ? `פרשת ${selectedWeek.parasha_name_he}` : `שבוע ${selectedWeek?.week_number || ''}`}
            </div>
            <div className="week-date">
              {selectedWeek?.shabbat_date ? formatHebrewDate(selectedWeek.shabbat_date) : ''}
            </div>
          </div>
        </div>

        {/* Week Selector Modal - Shows ALL parshiot from calendar */}
        {showWeekSelector && (
          <div className="week-selector-overlay" onClick={() => setShowWeekSelector(false)}>
            <div className="week-selector-modal" onClick={(e) => e.stopPropagation()}>
              <div className="week-selector-header">
                <h3>בחר שבוע</h3>
                <button className="week-selector-close" onClick={() => setShowWeekSelector(false)}>
                  <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                </button>
              </div>
              <div className="week-selector-list">
                {calendarEvents.map((event) => {
                  // Check if this event matches the selected week
                  const isSelected = selectedWeek &&
                    selectedWeek.week_number === event.weekNumber &&
                    selectedWeek.year === event.year;
                  // Check if this week has data (exists in DB)
                  const hasData = weeks.some(w =>
                    w.week_number === event.weekNumber && w.year === event.year
                  );
                  // Check if this is today or upcoming
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const eventDate = new Date(event.date);
                  eventDate.setHours(0, 0, 0, 0);
                  const isUpcoming = eventDate >= today;

                  return (
                    <div
                      key={`${event.weekNumber}-${event.year}`}
                      className={`week-selector-item ${isSelected ? 'selected' : ''} ${!isUpcoming ? 'past' : ''}`}
                      onClick={() => handleCalendarEventSelect(event)}
                      style={{
                        opacity: isUpcoming ? 1 : 0.6,
                      }}
                    >
                      <div className="week-selector-item-icon">
                        <svg viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
                      </div>
                      <div className="week-selector-item-info">
                        <div className="week-selector-item-parasha">
                          {event.name}
                          {hasData && (
                            <span style={{
                              marginRight: '8px',
                              fontSize: '0.7rem',
                              background: '#DBEAFE',
                              color: '#2563EB',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}>יש נתונים</span>
                          )}
                        </div>
                        <div className="week-selector-item-date">
                          {event.hebrewDate} | {event.date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      {isSelected && (
                        <svg className="week-selector-check" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Scrollable Content */}
      <div className="screen-content">
        {/* Stats Row */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{membersWithPurchases.length}</div>
            <div className="stat-label">מתפללים</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{getTotalMitzvot()}</div>
            <div className="stat-label">מצוות</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">₪{getTotalAmount().toLocaleString()}</div>
            <div className="stat-label">סה"כ</div>
          </div>
        </div>

        {/* Progress Card */}
        <div className="progress-card">
          <div className="progress-header">
            <span className="progress-title">התקדמות גבייה</span>
            <span className="progress-percent">{getProgressPercent()}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${getProgressPercent()}%` }}></div>
          </div>
          <div className="progress-amounts">
            <span>₪{getPaidAmount().toLocaleString()} נגבה</span>
            <span>₪{getUnpaidAmount().toLocaleString()} חסר</span>
          </div>
        </div>

        {/* Unpaid Alert */}
        {getUnpaidMembers().length > 0 && (
          <div className="unpaid-alert">
            <div className="unpaid-header">
              <div className="unpaid-title">
                <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                ממתינים לתשלום
              </div>
              <span className="unpaid-amount">₪{getUnpaidAmount().toLocaleString()}</span>
            </div>
            <div className="unpaid-list">
              {getUnpaidMembers().map((item) => (
                <div key={item.id} className="unpaid-item">
                  <div className="unpaid-item-avatar">{item.initials}</div>
                  <div className="unpaid-item-info">
                    <div className="unpaid-item-name">{item.name}</div>
                    <div className="unpaid-item-amount">₪{item.amount.toLocaleString()}</div>
                  </div>
                  <button
                    className="unpaid-item-btn"
                    onClick={() => onSendReminder?.(item.id)}
                    title="שלח תזכורת תשלום"
                  >
                    <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Purchases Section */}
        <div className="section-header-row">
          <h2 className="section-title">
            רכישות השבוע
            <span className="section-badge">{membersWithPurchases.length}</span>
          </h2>
          <div className="section-actions">
            <button className="section-action-btn" title="סינון">
              <svg viewBox="0 0 24 24"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
            </button>
          </div>
        </div>

        <div className="purchase-list">
          {purchasesForDisplay.map((purchase) => (
            <div key={`${purchase.id}-${purchase.paid}`} className="purchase-card">
              <div className="purchase-header">
                <div className="purchase-avatar">{purchase.initials}</div>
                <div className="purchase-info">
                  <div className="purchase-name">{purchase.name}</div>
                  <div className="purchase-phone">{purchase.phone}</div>
                </div>
                <div className="purchase-price">₪{purchase.price.toLocaleString()}</div>
              </div>
              <div className="purchase-mitzvot">
                {purchase.mitzvot.map((mitzva, idx) => (
                  <span key={idx} className="mitzva-tag">{mitzva}</span>
                ))}
              </div>
              <div className="purchase-footer">
                <div className={`status-badge ${purchase.paid ? 'paid' : 'unpaid'}`}>
                  {purchase.paid ? (
                    <>
                      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      שולם
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                      ממתין
                    </>
                  )}
                </div>
                <div className="purchase-actions">
                  <button
                    className="action-btn-small"
                    onClick={() => onEditPurchase?.(purchase.id)}
                    title="ערוך רכישות"
                  >
                    <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  </button>
                  <button
                    className={`action-btn-small ${purchase.paid ? 'paid' : ''}`}
                    data-paid={purchase.paid ? "true" : "false"}
                    onClick={() => handleLocalMarkAsPaid(purchase.id)}
                    title={purchase.paid ? "סמן כלא שולם" : "סמן כשולם"}
                    style={purchase.paid ? {
                      background: '#DBEAFE',
                      color: '#2563EB',
                      borderColor: '#93C5FD'
                    } : {}}
                  >
                    <svg viewBox="0 0 24 24" style={purchase.paid ? { fill: '#2563EB' } : {}}><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state when no purchases */}
        {membersWithPurchases.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
            <p>אין רכישות לשבוע זה</p>
            <p>לחץ על כפתור הסריקה להוספת רכישה חדשה</p>
          </div>
        )}
      </div>

      {/* Logout Confirmation Dialog */}
      {showLogoutDialog && (
        <div className="week-selector-overlay" onClick={() => setShowLogoutDialog(false)}>
          <div className="week-selector-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '300px' }}>
            <div className="week-selector-header">
              <h3>התנתקות</h3>
              <button className="week-selector-close" onClick={() => setShowLogoutDialog(false)}>
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
            <div style={{ padding: '20px 16px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 20px', color: 'var(--gray-600)' }}>האם אתה בטוח שברצונך להתנתק?</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowLogoutDialog(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid var(--gray-200)',
                    background: 'white',
                    color: 'var(--gray-700)',
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  ביטול
                </button>
                <button
                  onClick={() => {
                    setShowLogoutDialog(false);
                    onLogout();
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'var(--blue-500)',
                    color: 'white',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  התנתק
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

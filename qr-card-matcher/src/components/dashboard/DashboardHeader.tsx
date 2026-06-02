import { useState, useRef, useEffect } from "react";
import { Week } from "../../database";

// SVG Icons as components
const LogoIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 3L4 9v12h16V9l-8-6zm0 2.5L18 10v9H6v-9l6-4.5z"/>
    <path d="M12 12c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/>
  </svg>
);

const ShabbatIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
  </svg>
);

const ChevronLeftIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
  </svg>
);

// Logout icon
const LogoutIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
  </svg>
);

// Chevron down icon for dropdown
const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </svg>
);

interface DashboardHeaderProps {
  userName: string;
  userInitials: string;
  synagogueName?: string;
  selectedWeek: Week | null;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onOpenWeekSelector?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onLogout?: () => void;
  gmailConnected?: boolean;
  gmailEmail?: string | null;
  onConnectGmail?: () => void;
}

export function DashboardHeader({
  userName,
  userInitials,
  synagogueName,
  selectedWeek,
  onPrevWeek,
  onNextWeek,
  onOpenWeekSelector,
  onLogout,
  gmailConnected,
  gmailEmail,
  onConnectGmail
}: DashboardHeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  // Format Hebrew date from week data
  const getHebrewDate = () => {
    if (!selectedWeek) return "";
    // TODO: Get actual Hebrew date from week
    return selectedWeek.shabbat_date || "";
  };

  const getParashaName = () => {
    if (!selectedWeek) return "טוען...";
    return selectedWeek.parasha_name_he ? `פרשת ${selectedWeek.parasha_name_he}` : `שבוע ${selectedWeek.week_number}`;
  };

  return (
    <header className="dashboard-header">
      <div className="header-top">
        <div className="header-right">
          {/* Logo */}
          <div className="logo">
            <div className="logo-icon">
              <LogoIcon />
            </div>
            <div className="logo-text">קלגבאי</div>
          </div>

          {/* Shabbat Card with Parasha and Week Navigation */}
          <div className="shabbat-card">
            <div className="week-nav-btns">
              <button className="week-nav-btn" onClick={onNextWeek} title="שבוע הבא">
                <ChevronRightIcon />
              </button>
            </div>
            <div className="shabbat-icon">
              <ShabbatIcon />
            </div>
            <div
              className={`shabbat-content ${onOpenWeekSelector ? 'clickable' : ''}`}
              onClick={onOpenWeekSelector}
              title={onOpenWeekSelector ? "לחץ לבחירת שבוע" : undefined}
            >
              <span className="shabbat-greeting">שבת שלום!</span>
              <span className="shabbat-parasha">{getParashaName()}</span>
              <span className="shabbat-date">{getHebrewDate()}</span>
              {onOpenWeekSelector && (
                <span className="shabbat-selector-hint">
                  <ChevronDownIcon />
                </span>
              )}
            </div>
            <div className="week-nav-btns">
              <button className="week-nav-btn" onClick={onPrevWeek} title="שבוע קודם">
                <ChevronLeftIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="header-left">
          {/* Gmail Status */}
          {onConnectGmail && (
            <button
              className={`header-gmail-btn ${gmailConnected ? 'connected' : ''}`}
              onClick={gmailConnected ? undefined : onConnectGmail}
              title={gmailConnected ? `Gmail מחובר: ${gmailEmail}` : "לחץ לחיבור Gmail"}
            >
              <span className="gmail-indicator" />
              {gmailConnected ? "Gmail" : "חבר Gmail"}
            </button>
          )}

          {/* User with dropdown */}
          <div className="header-user-container" ref={userMenuRef}>
            <div
              className={`header-user ${userMenuOpen ? 'active' : ''}`}
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div className="header-user-avatar">{userInitials}</div>
              <div className="header-user-info">
                {synagogueName && (
                  <div className="header-user-synagogue">{synagogueName}</div>
                )}
                <div className="header-user-name">{userName}</div>
              </div>
              <div className="header-user-chevron">
                <ChevronDownIcon />
              </div>
            </div>

            {/* Dropdown Menu */}
            {userMenuOpen && (
              <div className="header-user-dropdown">
                {onLogout && (
                  <button
                    className="dropdown-item logout"
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <LogoutIcon />
                    <span>התנתק</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

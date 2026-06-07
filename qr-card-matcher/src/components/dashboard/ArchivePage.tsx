import { useState, useEffect } from "react";
import {
  getWeeksWithPurchases,
  getMitzvotWithPurchasers,
  MitzvaWithPurchaser,
} from "../../database";
import { ProgressWidget, UnpaidWidget } from "./SidebarWidgets";
import "./ArchivePage.css";

// Check if running on Android
const isAndroidDevice = navigator.userAgent.toLowerCase().includes('android');

// SVG Icons
const DocumentIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);

const HolidayIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
  </svg>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);

const ExportIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
  </svg>
);

const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
  </svg>
);

// Helper to format currency
const formatPrice = (price: number): string => {
  return `₪${price.toLocaleString()}`;
};

// Helper to get initials
const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
};



// Member with their mitzvot grouped
interface MemberMitzvotGroup {
  memberId: number;
  memberName: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  mitzvot: MitzvaWithPurchaser[];
  totalPrice: number;
  paidAmount: number;
  unpaidAmount: number;
  allPaid: boolean;
}

// Week data with stats - can be real data or placeholder for parasha
interface WeekWithStats {
  id: number | null;
  week_number: number;
  year: number;
  parasha_name_he: string | null;
  parasha_name_en: string | null;
  parasha_ref: string | null;
  shabbat_date: string | null;
  created_at: string;
  totalAmount: number;
  paidAmount: number;
  unpaidCount: number;
  mitzvotCount: number;
  membersCount: number;
  memberGroups: MemberMitzvotGroup[];
  isPlaceholder?: boolean; // True if no data exists yet
}

interface ArchivePageProps {
  onSendReminder: (memberId: number) => void;
  onEditPurchase?: (memberId: number) => void;
}

export function ArchivePage({ onSendReminder, onEditPurchase }: ArchivePageProps) {
  const [weeks, setWeeks] = useState<WeekWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  // Load weeks for selected year
  useEffect(() => {
    loadWeeks();
  }, [selectedYear]);

  const loadWeeks = async () => {
    setLoading(true);
    try {
      // Get only weeks that have purchases
      const weeksWithPurchases = await getWeeksWithPurchases();

      // Extract available years from weeks with purchases
      const yearsSet = new Set<number>();
      weeksWithPurchases.forEach(w => yearsSet.add(w.year));
      const currentYear = new Date().getFullYear();
      // Always include current year and previous 2 years
      yearsSet.add(currentYear);
      yearsSet.add(currentYear - 1);
      yearsSet.add(currentYear - 2);
      const years = Array.from(yearsSet).sort((a, b) => b - a);
      setAvailableYears(years);

      // Filter weeks for selected year
      const yearWeeks = weeksWithPurchases.filter(w => w.year === selectedYear);

      // Load stats for each week
      const weeksWithStats: WeekWithStats[] = await Promise.all(
        yearWeeks.map(async (week) => {
          // Get all mitzvot with purchasers for this week
          const mitzvot = await getMitzvotWithPurchasers(week.week_number, week.year);

          // Filter only purchased mitzvot
          const purchasedMitzvot = mitzvot.filter(m => m.purchaser_id !== null);

          // Group by member
          const memberMap = new Map<number, MemberMitzvotGroup>();

          purchasedMitzvot.forEach(mitzva => {
            if (!mitzva.purchaser_id) return;

            const existing = memberMap.get(mitzva.purchaser_id);
            if (existing) {
              existing.mitzvot.push(mitzva);
              existing.totalPrice += mitzva.bid_price || 0;
              if (mitzva.payment_status === 'paid') {
                existing.paidAmount += mitzva.bid_price || 0;
              } else {
                existing.unpaidAmount += mitzva.bid_price || 0;
              }
            } else {
              const nameParts = (mitzva.purchaser_name || '').split(' ');
              const isPaid = mitzva.payment_status === 'paid';
              memberMap.set(mitzva.purchaser_id, {
                memberId: mitzva.purchaser_id,
                memberName: mitzva.purchaser_name || '',
                firstName: nameParts[0] || '',
                lastName: nameParts.slice(1).join(' ') || '',
                phone: mitzva.purchaser_phone,
                email: mitzva.purchaser_email,
                mitzvot: [mitzva],
                totalPrice: mitzva.bid_price || 0,
                paidAmount: isPaid ? (mitzva.bid_price || 0) : 0,
                unpaidAmount: isPaid ? 0 : (mitzva.bid_price || 0),
                allPaid: isPaid,
              });
            }
          });

          // Update allPaid for each member
          memberMap.forEach(group => {
            group.allPaid = group.mitzvot.every(m => m.payment_status === 'paid');
          });

          const memberGroups = Array.from(memberMap.values());

          const totalAmount = memberGroups.reduce((sum, m) => sum + m.totalPrice, 0);
          const paidAmount = memberGroups.reduce((sum, m) => sum + m.paidAmount, 0);
          const unpaidCount = memberGroups.filter(m => !m.allPaid).length;

          return {
            id: week.id,
            week_number: week.week_number,
            year: week.year,
            parasha_name_he: week.parasha_name_he,
            parasha_name_en: week.parasha_name_en,
            parasha_ref: week.parasha_ref,
            shabbat_date: week.shabbat_date,
            created_at: week.created_at,
            totalAmount,
            paidAmount,
            unpaidCount,
            mitzvotCount: purchasedMitzvot.length,
            membersCount: memberGroups.length,
            memberGroups,
            isPlaceholder: false,
          };
        })
      );

      // Sort by date (newest first)
      weeksWithStats.sort((a, b) => {
        if (a.shabbat_date && b.shabbat_date) {
          return new Date(b.shabbat_date).getTime() - new Date(a.shabbat_date).getTime();
        }
        return b.week_number - a.week_number;
      });

      setWeeks(weeksWithStats);

      // Auto-expand first week with unpaid or first week
      const firstUnpaid = weeksWithStats.find(w => w.unpaidCount > 0);
      if (firstUnpaid && firstUnpaid.parasha_name_he) {
        setExpandedParasha(firstUnpaid.parasha_name_he);
      } else if (weeksWithStats.length > 0 && weeksWithStats[0].parasha_name_he) {
        setExpandedParasha(weeksWithStats[0].parasha_name_he);
      }
    } catch (error) {
      console.error("Error loading weeks:", error);
    }
    setLoading(false);
  };

  // Use parasha name as key for toggle since id can be null for placeholders
  const [expandedParasha, setExpandedParasha] = useState<string | null>(null);

  const toggleWeek = (parasha: string) => {
    setExpandedParasha(expandedParasha === parasha ? null : parasha);
  };

  // Calculate YEARLY totals for sidebar (all weeks in selected year)
  const getYearlyTotalAmount = () => weeks.reduce((sum, w) => sum + w.totalAmount, 0);
  const getYearlyPaidAmount = () => weeks.reduce((sum, w) => sum + w.paidAmount, 0);

  // Get ALL unpaid members across ALL weeks for the year
  const getYearlyUnpaidMembers = () => {
    const memberMap = new Map<number, {
      id: number;
      firstName: string;
      lastName: string;
      amount: number;
      email?: string;
      phone?: string;
    }>();

    weeks.forEach(week => {
      week.memberGroups
        .filter(m => !m.allPaid)
        .forEach(m => {
          const existing = memberMap.get(m.memberId);
          if (existing) {
            existing.amount += m.unpaidAmount;
          } else {
            memberMap.set(m.memberId, {
              id: m.memberId,
              firstName: m.firstName,
              lastName: m.lastName,
              amount: m.unpaidAmount,
              email: m.email || undefined,
              phone: m.phone || undefined,
            });
          }
        });
    });

    return Array.from(memberMap.values());
  };

  const handleSendAllReminders = () => {
    const unpaidMembers = getYearlyUnpaidMembers();
    unpaidMembers.forEach(m => onSendReminder(m.id));
  };

  // Get Hebrew year label
  const getHebrewYearLabel = (year: number): string => {
    const hebrewYears: { [key: number]: string } = {
      2026: 'תשפ"ו',
      2025: 'תשפ"ה',
      2024: 'תשפ"ד',
      2023: 'תשפ"ג',
    };
    return hebrewYears[year] || year.toString();
  };

  if (loading) {
    return (
      <div className="archive-page">
        <div className="archive-loading">טוען ארכיון...</div>
      </div>
    );
  }

  return (
    <div className="archive-page">
      {/* Page Header */}
      <header className="archive-header">
        <div className="archive-title-section">
          <div className="archive-icon">
            <ArchiveIcon />
          </div>
          <div>
            <h1 className="archive-title">ארכיון רכישות</h1>
            <p className="archive-subtitle">צפייה בהיסטוריית הרכישות לפי שבוע</p>
          </div>
        </div>
        {!isAndroidDevice && (
          <div className="archive-actions">
            <button className="btn btn-outline">
              <ExportIcon />
              ייצוא לאקסל
            </button>
          </div>
        )}
      </header>

      {/* Content Layout - Weeks + Sidebar */}
      <div className="archive-content-layout">
        {/* Weeks List */}
        <div className="archive-weeks-section">
          {/* Year Selector */}
          <div className="year-selector">
            <label>שנה:</label>
            <select
              className="year-dropdown"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
            >
              {availableYears.map(year => (
                <option key={year} value={year}>
                  {getHebrewYearLabel(year)} ({year}-{year + 1})
                </option>
              ))}
            </select>
            {!isAndroidDevice && (
              <button className="btn btn-outline btn-sm year-export-btn">
                <ExportIcon />
                ייצוא לאקסל
              </button>
            )}
          </div>

          {/* Weeks List */}
          <div className="weeks-list">
            {weeks.map((week, index) => {
              const parashaName = week.parasha_name_he || week.parasha_name_en || `שבוע ${week.week_number}`;
              const isExpanded = expandedParasha === parashaName;
              const percentage = week.totalAmount > 0
                ? Math.round((week.paidAmount / week.totalAmount) * 100)
                : 100;
              const isHoliday = parashaName?.includes('חג') || parashaName?.includes('פורים') || parashaName?.includes('חנוכה');
              const isPlaceholder = week.isPlaceholder || week.membersCount === 0;

              return (
                <div key={`${parashaName}-${index}`} className={`week-card ${isExpanded ? 'expanded' : ''} ${isPlaceholder ? 'placeholder' : ''}`}>
                  {/* Week Header - Always Visible */}
                  <div className="week-card-header" onClick={() => toggleWeek(parashaName)}>
                    <div className="week-info">
                      <div className={`week-icon ${isHoliday ? 'holiday' : ''} ${isPlaceholder ? 'placeholder' : ''}`}>
                        {isHoliday ? <HolidayIcon /> : <DocumentIcon />}
                      </div>
                      <div className="week-details">
                        <div className="week-parasha">
                          {week.parasha_name_he ? `פרשת ${week.parasha_name_he}` : `שבוע ${week.week_number}`}
                        </div>
                        <div className="week-date">
                          {week.shabbat_date
                            ? new Date(week.shabbat_date).toLocaleDateString('he-IL', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })
                            : isPlaceholder ? 'טרם נקבע' : `שבוע ${week.week_number}, ${week.year}`
                          }
                        </div>
                      </div>
                    </div>

                    <div className="week-stats">
                      <div className="week-stat">
                        <div className="week-stat-value">{week.mitzvotCount}</div>
                        <div className="week-stat-label">מצוות</div>
                      </div>
                      <div className="week-stat">
                        <div className="week-stat-value">{week.membersCount}</div>
                        <div className="week-stat-label">קונים</div>
                      </div>
                      <div className="week-stat">
                        <div className="week-stat-value">{formatPrice(week.totalAmount)}</div>
                        <div className="week-stat-label">סה"כ</div>
                      </div>
                      <div className="week-progress-mini">
                        <div className="progress-mini-header">
                          <span>גבייה</span>
                          <span>{percentage}%</span>
                        </div>
                        <div className="progress-mini-bar">
                          <div
                            className="progress-mini-fill"
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                      <button className="week-toggle">
                        <ChevronDownIcon />
                      </button>
                    </div>
                  </div>

                  {/* Week Content - Expandable */}
                  {isExpanded && (
                    <div className="week-card-content">
                      {/* Unpaid Members - Orange rows at top */}
                      {week.memberGroups.filter(m => !m.allPaid).length > 0 && (
                        <div className="week-unpaid-section">
                          <div className="unpaid-header">
                            <ClockIcon />
                            <span>ממתינים לתשלום</span>
                            <span className="unpaid-count">{week.unpaidCount}</span>
                            <span className="unpaid-total">{formatPrice(week.totalAmount - week.paidAmount)}</span>
                          </div>
                          <div className="unpaid-rows">
                            {week.memberGroups
                              .filter(m => !m.allPaid)
                              .map(member => (
                                <div key={member.memberId} className="unpaid-row">
                                  <div className="unpaid-member-info">
                                    <div className="unpaid-avatar">
                                      {getInitials(member.firstName, member.lastName)}
                                    </div>
                                    <div className="unpaid-details">
                                      <div className="unpaid-name">{member.memberName}</div>
                                      <div className="unpaid-mitzvot">
                                        {member.mitzvot.filter(m => m.payment_status !== 'paid').map(m => m.name).join(', ')}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="unpaid-amount">{formatPrice(member.unpaidAmount)}</div>
                                  <div className="unpaid-actions">
                                    <button
                                      className="unpaid-action-btn"
                                      title="שלח תזכורת"
                                      onClick={(e) => { e.stopPropagation(); onSendReminder(member.memberId); }}
                                    >
                                      <SendIcon />
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Table Section */}
                      {week.memberGroups.length > 0 ? (
                        <div className="week-table-section">
                          <div className="table-header">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span className="table-title">רכישות השבוע</span>
                              <span className="table-count">
                                {week.membersCount} מתפללים • {week.mitzvotCount} מצוות
                              </span>
                            </div>
                            {!isAndroidDevice && (
                              <button className="btn btn-outline btn-sm">
                                <ExportIcon />
                                ייצוא
                              </button>
                            )}
                          </div>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>מתפלל</th>
                                <th>מצוות</th>
                                <th>סה"כ</th>
                                <th>סטטוס</th>
                                <th>פעולות</th>
                              </tr>
                            </thead>
                            <tbody>
                              {week.memberGroups.map(member => (
                                <tr key={member.memberId}>
                                  <td>
                                    <div className="table-member">
                                      <div className="table-avatar">
                                        {getInitials(member.firstName, member.lastName)}
                                      </div>
                                      <div>
                                        <div className="table-name">{member.memberName}</div>
                                        <div className="table-phone">{member.phone || ''}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <div className="table-mitzva-list">
                                      {member.mitzvot.map(mitzva => (
                                        <span key={mitzva.id} className="table-mitzva-tag">
                                          {mitzva.name}
                                        </span>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="table-price">{formatPrice(member.totalPrice)}</td>
                                  <td>
                                    <span className={`table-status ${member.allPaid ? 'paid' : 'unpaid'}`}>
                                      {member.allPaid ? <CheckIcon /> : <ClockIcon />}
                                      {member.allPaid ? 'שולם' : 'ממתין'}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="table-actions">
                                      <button
                                        className="table-action-btn"
                                        title="ערוך"
                                        onClick={() => onEditPurchase?.(member.memberId)}
                                      >
                                        <EditIcon />
                                      </button>
                                      <button className="table-action-btn" title="קבלה">
                                        <ReceiptIcon />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="no-purchases-message">
                          אין רכישות בשבוע זה
                        </div>
                      )}

                      {/* All Paid Message - shown at bottom if no unpaid */}
                      {week.unpaidCount === 0 && week.totalAmount > 0 && (
                        <div className="all-paid-message">
                          <CheckIcon />
                          כל התשלומים התקבלו בשבוע זה
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {weeks.length === 0 && (
              <div className="no-weeks-message">
                אין נתונים לשנה זו
              </div>
            )}
          </div>
        </div>

        {/* Sidebar - Shows YEARLY summary */}
        <div className="archive-sidebar">
          <div className="sidebar-year-title">
            סיכום שנתי - {getHebrewYearLabel(selectedYear)}
          </div>
          <ProgressWidget
            totalAmount={getYearlyTotalAmount()}
            paidAmount={getYearlyPaidAmount()}
          />
          <UnpaidWidget
            members={getYearlyUnpaidMembers()}
            totalUnpaid={getYearlyTotalAmount() - getYearlyPaidAmount()}
            onSendReminder={onSendReminder}
            onSendAllReminders={handleSendAllReminders}
          />
        </div>
      </div>
    </div>
  );
}

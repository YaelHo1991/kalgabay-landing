/**
 * ArchiveScreen - Archive with year selector and week accordion
 * Shows ONLY weeks with actual purchases
 */

import { useState, useEffect, useRef } from 'react';
import { HDate } from "@hebcal/core";
import {
  getMembersWithPurchaseDetails,
  getWeeksWithPurchases,
  Week,
} from '../../../database';

// Extended parasha with stats and purchases
interface ParashaWithStats {
  id: string;
  date: Date;
  hebrewDate: string;
  name: string;
  type: "parasha" | "holiday";
  weekNumber: number;
  year: number;
  mitzvotCount: number;
  total: number;
  hasActivity: boolean;
  purchases: {
    id: number;
    name: string;
    initials: string;
    phone: string;
    price: number;
    mitzvot: string[];
    paid: boolean;
  }[];
  purchasesLoaded: boolean;
}

// Helper to get initials from name
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
}

// Helper to format date
function formatDate(date: Date): string {
  try {
    return date.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

// Get Hebrew year name in gematria format (for export filename)
function getHebrewYearName(hebrewYear: number): string {
  try {
    const hdate = new HDate(1, "Tishrei", hebrewYear);
    return hdate.renderGematriya(false).split(" ").pop() || hebrewYear.toString();
  } catch {
    return hebrewYear.toString();
  }
}

// Get Hebrew year display for a Gregorian year
function getHebrewYearDisplay(gregYear: number): string {
  // For a given Gregorian year, get the Hebrew year that covers most of it
  // Hebrew year 5785 covers roughly Sept 2024 - Sept 2025
  const hebrewYear = gregYear + 3760;
  return getHebrewYearName(hebrewYear);
}

export default function ArchiveScreen() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [openParashot, setOpenParashot] = useState<string[]>([]);
  const [parashot, setParashot] = useState<ParashaWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPurchases, setLoadingPurchases] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Load only weeks with actual purchases
  useEffect(() => {
    const loadParashot = async () => {
      setLoading(true);
      setOpenParashot([]);
      try {
        // Get only weeks that have purchases
        const weeksWithPurchases = await getWeeksWithPurchases();

        // Extract available years from weeks with purchases
        const yearsSet = new Set<number>();
        weeksWithPurchases.forEach(w => yearsSet.add(w.year));
        const currentYear = new Date().getFullYear();
        // Always include current year
        yearsSet.add(currentYear);
        const years = Array.from(yearsSet).sort((a, b) => b - a);
        setAvailableYears(years);

        // Filter weeks for selected year
        const yearWeeks = weeksWithPurchases.filter(w => w.year === selectedYear);

        // Convert weeks to ParashaWithStats format
        const parashotWithStats: ParashaWithStats[] = yearWeeks.map((week: Week) => {
          // Create Hebrew date string from shabbat_date
          let hebrewDateStr = '';
          if (week.shabbat_date) {
            try {
              const hdate = new HDate(new Date(week.shabbat_date));
              hebrewDateStr = hdate.renderGematriya(true);
            } catch {
              hebrewDateStr = '';
            }
          }

          return {
            id: `parasha-${week.week_number}-${week.year}`,
            date: week.shabbat_date ? new Date(week.shabbat_date) : new Date(),
            hebrewDate: hebrewDateStr,
            name: week.parasha_name_he ? `פרשת ${week.parasha_name_he}` : `שבוע ${week.week_number}`,
            type: 'parasha' as const,
            weekNumber: week.week_number,
            year: week.year,
            mitzvotCount: 0,
            total: 0,
            hasActivity: true,
            purchases: [],
            purchasesLoaded: false,
          };
        });

        // Sort by date (newest first)
        parashotWithStats.sort((a, b) => b.date.getTime() - a.date.getTime());

        setParashot(parashotWithStats);
      } catch (error) {
        console.error('Error loading parashot:', error);
      }
      setLoading(false);
    };
    loadParashot();
  }, [selectedYear]);

  // Load purchases for a specific parasha
  const loadParashaPurchases = async (parashaIndex: number, parasha: ParashaWithStats) => {
    if (parasha.purchasesLoaded) return; // Already loaded

    setLoadingPurchases(parasha.id);
    try {
      const members = await getMembersWithPurchaseDetails(parasha.weekNumber, parasha.year);

      const purchases = members.map(m => ({
        id: m.id,
        name: `${m.first_name} ${m.last_name}`,
        initials: getInitials(m.first_name, m.last_name),
        phone: m.phone || '',
        price: m.total_price,
        mitzvot: m.purchases.map(p => p.mitzva_name),
        paid: m.purchases.every(p => p.payment_status === 'paid')
      }));

      const mitzvotCount = members.reduce((sum, m) => sum + m.purchases.length, 0);
      const total = members.reduce((sum, m) => sum + m.total_price, 0);

      setParashot(prev => {
        const updated = [...prev];
        updated[parashaIndex] = {
          ...updated[parashaIndex],
          purchases,
          mitzvotCount,
          total,
          hasActivity: purchases.length > 0,
          purchasesLoaded: true,
        };
        return updated;
      });
    } catch (error) {
      console.error('Error loading purchases:', error);
    }
    setLoadingPurchases(null);
  };

  const toggleParasha = (parashaIndex: number, parasha: ParashaWithStats) => {
    const parashaId = parasha.id;
    if (openParashot.includes(parashaId)) {
      setOpenParashot(prev => prev.filter(id => id !== parashaId));
    } else {
      setOpenParashot(prev => [...prev, parashaId]);
      loadParashaPurchases(parashaIndex, parasha);
    }
  };

  // Export handler with animation
  const handleExport = async () => {
    setExporting(true);

    try {
      // Generate CSV content
      const csvRows = ['פרשה,תאריך,שם,מצוות,סה"כ,שולם'];
      for (const parasha of parashot) {
        if (parasha.purchasesLoaded && parasha.purchases.length > 0) {
          for (const purchase of parasha.purchases) {
            csvRows.push(`${parasha.name},${formatDate(parasha.date)},${purchase.name},${purchase.mitzvot.join(';')},${purchase.price},${purchase.paid ? 'כן' : 'לא'}`);
          }
        }
      }

      const csvContent = '\ufeff' + csvRows.join('\n');
      const fileName = `archive_${getHebrewYearName(selectedYear)}.csv`;

      // Check if Web Share API is available (for mobile)
      if (navigator.share && navigator.canShare) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const file = new File([blob], fileName, { type: 'text/csv' });

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `דוח ארכיון ${getHebrewYearName(selectedYear)}`,
          });
        } else {
          // Fallback: share as text
          await navigator.share({
            title: `דוח ארכיון ${getHebrewYearName(selectedYear)}`,
            text: csvContent,
          });
        }
      } else {
        // Desktop fallback: download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting:', error);
      // User cancelled share or error occurred
    }

    setExporting(false);
  };

  if (loading) {
    return (
      <div className="mobile-screen">
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          טוען...
        </div>
      </div>
    );
  }

  // Count total stats
  const totalMitzvot = parashot.reduce((sum, p) => sum + p.mitzvotCount, 0);
  const totalAmount = parashot.reduce((sum, p) => sum + p.total, 0);
  const parashotWithActivity = parashot.filter(p => p.hasActivity || p.purchasesLoaded && p.purchases.length > 0).length;

  return (
    <div className="mobile-screen">
      {/* Header */}
      <header className="mobile-header" style={{ flexShrink: 0 }}>
        <div className="header-row">
          <div>
            <h1 className="header-title">ארכיון</h1>
            <div className="header-subtitle">
              {parashot.length} שבועות עם מכירות
            </div>
          </div>
        </div>
      </header>

      {/* Export animation styles */}
      <style>{`
        @keyframes exportBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .header-icon-btn.exporting {
          background: var(--primary-light);
        }
        .header-icon-btn.exporting svg {
          fill: var(--primary);
        }
        .export-animation {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .parasha-no-activity {
          opacity: 0.6;
        }
        .parasha-type-badge {
          font-size: 0.65rem;
          padding: 2px 6px;
          border-radius: 8px;
          margin-right: 8px;
        }
        .parasha-type-badge.parasha {
          background: var(--primary-light);
          color: var(--primary);
        }
        .parasha-type-badge.holiday {
          background: #FEF3C7;
          color: #B45309;
        }
      `}</style>

      {/* Scrollable Content */}
      <div className="screen-content">
        {/* Year Selector - aligned with content */}
        <div className="year-selector" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginTop: '1rem',
          marginBottom: '1rem',
          paddingRight: '1rem'
        }}>
          <label style={{ fontSize: '0.9rem', color: 'var(--gray-600)' }}>שנה:</label>
          <select
            className="year-dropdown"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--gray-300)',
              fontSize: '0.9rem',
              background: 'white'
            }}
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>{getHebrewYearDisplay(year)} ({year})</option>
            ))}
          </select>
        </div>

        {/* Stats Summary */}
        {totalMitzvot > 0 && (
          <div style={{
            display: 'flex',
            gap: '1rem',
            padding: '0.75rem',
            background: 'var(--primary-light)',
            borderRadius: '0.5rem',
            marginBottom: '1rem'
          }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>{totalMitzvot}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>מצוות</div>
            </div>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--primary)' }}>₪{totalAmount.toLocaleString()}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>סה"כ</div>
            </div>
          </div>
        )}

        {/* Parasha Accordion */}
        <div className="week-accordion">
          {parashot.map((parasha, index) => (
            <div
              key={parasha.id}
              className={`week-accordion-item ${openParashot.includes(parasha.id) ? 'open' : ''} ${!parasha.hasActivity && !parasha.purchasesLoaded ? 'parasha-no-activity' : ''}`}
            >
              <div
                className="week-accordion-header"
                onClick={() => toggleParasha(index, parasha)}
              >
                <div className="week-accordion-icon">
                  {parasha.type === 'holiday' ? (
                    <svg viewBox="0 0 24 24" style={{ fill: '#B45309' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                  ) : (
                    <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/></svg>
                  )}
                </div>
                <div className="week-accordion-info">
                  <div className="week-accordion-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {parasha.name}
                    {parasha.type === 'holiday' && (
                      <span className="parasha-type-badge holiday">חג</span>
                    )}
                  </div>
                  <div className="week-accordion-date">
                    {parasha.hebrewDate} • {formatDate(parasha.date)}
                  </div>
                </div>
                <div className="week-accordion-stats">
                  {parasha.purchasesLoaded && (
                    <>
                      <div className="week-stat-mini">
                        <div className="week-stat-mini-value">{parasha.mitzvotCount}</div>
                        <div className="week-stat-mini-label">מצוות</div>
                      </div>
                      <div className="week-stat-mini">
                        <div className="week-stat-mini-value">₪{parasha.total.toLocaleString()}</div>
                        <div className="week-stat-mini-label">סה"כ</div>
                      </div>
                    </>
                  )}
                </div>
                <svg className="week-accordion-chevron" viewBox="0 0 24 24">
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                </svg>
              </div>
              <div className="week-accordion-content">
                {loadingPurchases === parasha.id ? (
                  <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--gray-500)' }}>
                    טוען רכישות...
                  </div>
                ) : parasha.purchases.length > 0 ? (
                  parasha.purchases.map((purchase) => (
                    <div key={purchase.id} className="purchase-card" style={{ marginTop: 12 }}>
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
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state" style={{ textAlign: 'center', padding: '1rem', color: 'var(--gray-500)' }}>
                    <p>אין רכישות לפרשה זו</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {parashot.length === 0 && (
          <div className="empty-state" style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
            <svg viewBox="0 0 24 24" style={{ width: 48, height: 48, fill: 'currentColor', marginBottom: '1rem' }}>
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/>
            </svg>
            <p>אין פרשות בשנה זו</p>
          </div>
        )}
      </div>
    </div>
  );
}

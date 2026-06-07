import { MemberWithPurchaseDetails, PurchaseItem, PaymentStatus } from "../../database";

// Check if running on Android
const isAndroidDevice = navigator.userAgent.toLowerCase().includes('android');

// SVG Icons
const FilterIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
  </svg>
);

const ExportIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
  </svg>
);

const ScanIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M9.4 10.5l4.77-8.26C13.47 2.09 12.75 2 12 2c-2.4 0-4.6.85-6.32 2.25l3.66 6.35.06-.1zM21.54 9c-.92-2.92-3.15-5.26-6-6.34L11.88 9h9.66zm.26 1h-7.49l.29.5 4.76 8.25C21 16.97 22 14.61 22 12c0-.69-.07-1.35-.2-2zM8.54 12l-3.9-6.75C3.01 7.03 2 9.39 2 12c0 .69.07 1.35.2 2h7.49l-1.15-2zm-6.08 3c.92 2.92 3.15 5.26 6 6.34L12.12 15H2.46zm11.27 0l-3.9 6.76c.7.15 1.42.24 2.17.24 2.4 0 4.6-.85 6.32-2.25l-3.66-6.35-.93 1.6z"/>
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

const EditIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);

const PaymentIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
  </svg>
);

// Helper to format currency
const formatPrice = (price: number): string => {
  return `₪${price.toLocaleString()}`;
};

// Helper to get initials from name
const getInitials = (firstName: string, lastName: string): string => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`;
};

// Check if all purchases are paid
const isAllPaid = (purchases: PurchaseItem[]): boolean => {
  return purchases.length > 0 && purchases.every(p => p.payment_status === 'paid');
};

interface PurchasesTableProps {
  members: MemberWithPurchaseDetails[];
  totalMembers: number;
  totalMitzvot: number;
  totalAmount: number;
  onScan: () => void;
  onFilter: () => void;
  onExport: () => void;
  isExporting?: boolean;
  onEditPurchase: (memberId: number) => void;
  onMarkAsPaid: (memberId: number) => void;
  searchQuery?: string;
}

// Loading spinner icon
const LoadingIcon = () => (
  <svg viewBox="0 0 24 24" className="export-loading-icon">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" />
  </svg>
);

export function PurchasesTable({
  members,
  totalMembers,
  totalMitzvot,
  totalAmount,
  onScan,
  onFilter,
  onExport,
  isExporting = false,
  onEditPurchase,
  onMarkAsPaid,
  searchQuery = ""
}: PurchasesTableProps) {
  // Filter by search query
  const filteredMembers = searchQuery
    ? members.filter(member =>
        `${member.first_name} ${member.last_name}`.includes(searchQuery) ||
        member.phone?.includes(searchQuery)
      )
    : members;

  // Build rows - each mitzva is a separate row, but member info only on first row
  const rows: {
    memberId: number;
    firstName: string;
    lastName: string;
    phone?: string;
    purchase: PurchaseItem;
    isFirstRow: boolean;
    rowSpan: number;
    allPaid: boolean;
    totalAmount: number;
  }[] = [];

  for (const member of filteredMembers) {
    const allPaid = isAllPaid(member.purchases);
    member.purchases.forEach((purchase, index) => {
      rows.push({
        memberId: member.id,
        firstName: member.first_name,
        lastName: member.last_name,
        phone: member.phone || undefined,
        purchase,
        isFirstRow: index === 0,
        rowSpan: member.purchases.length,
        allPaid,
        totalAmount: member.total_price
      });
    });
  }

  return (
    <div className="table-container">
      <div className="table-toolbar">
        <div className="table-toolbar-right">
          <h2 className="table-title">רכישות השבוע</h2>
          <span className="table-count">
            {totalMembers} מתפללים • {totalMitzvot} מצוות • {formatPrice(totalAmount)}
          </span>
        </div>
        <div className="table-toolbar-left">
          <button className="table-filter-btn" onClick={onFilter}>
            <FilterIcon />
            סינון
          </button>
          {!isAndroidDevice && (
            <button
              className={`table-filter-btn export-btn ${isExporting ? 'exporting' : ''}`}
              onClick={onExport}
              disabled={isExporting}
            >
              {isExporting ? <LoadingIcon /> : <ExportIcon />}
              {isExporting ? 'מייצא...' : 'ייצוא'}
            </button>
          )}
          <button className="scan-btn" onClick={onScan}>
            <ScanIcon />
            התחל סריקה
          </button>
        </div>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>מתפלל</th>
              <th>מצווה</th>
              <th>מחיר</th>
              <th>סטטוס</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.memberId}-${row.purchase.link_id}`}
                className={row.isFirstRow ? 'member-first-row' : ''}
              >
                {row.isFirstRow && (
                  <td rowSpan={row.rowSpan}>
                    <div className="table-member">
                      <div className="table-member-avatar">
                        {getInitials(row.firstName, row.lastName)}
                      </div>
                      <div className="table-member-info">
                        <div className="table-member-name">{row.firstName} {row.lastName}</div>
                        {row.phone && <div className="table-member-phone">{row.phone}</div>}
                      </div>
                    </div>
                  </td>
                )}
                <td>
                  <span className="table-mitzva-name">{row.purchase.mitzva_name}</span>
                </td>
                <td className="table-price">{formatPrice(row.purchase.bid_price)}</td>
                <td>
                  <span className={`table-status ${row.purchase.payment_status}`}>
                    {row.purchase.payment_status === 'paid' ? <CheckIcon /> : <ClockIcon />}
                    {row.purchase.payment_status === 'paid' ? 'שולם' : 'ממתין'}
                  </span>
                </td>
                {row.isFirstRow && (
                  <td rowSpan={row.rowSpan}>
                    <div className="table-actions">
                      <button
                        className="table-action-btn"
                        onClick={() => onEditPurchase(row.memberId)}
                        title="ערוך רכישות"
                      >
                        <EditIcon />
                      </button>
                      <button
                        className={`table-action-btn ${row.allPaid ? 'paid' : ''}`}
                        onClick={() => onMarkAsPaid(row.memberId)}
                        title={row.allPaid ? "סמן כלא שולם" : "סמן כשולם"}
                      >
                        <PaymentIcon />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-400)' }}>
                  {searchQuery ? 'לא נמצאו תוצאות' : 'אין רכישות השבוע'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredMembers.length > 0 && (
        <div className="table-pagination">
          <div className="pagination-info">
            מציג 1-{Math.min(filteredMembers.length, 10)} מתוך {filteredMembers.length} מתפללים
          </div>
          <div className="pagination-controls">
            <button className="pagination-btn">הקודם</button>
            <button className="pagination-btn active">1</button>
            {filteredMembers.length > 10 && <button className="pagination-btn">2</button>}
            <button className="pagination-btn">הבא</button>
          </div>
        </div>
      )}
    </div>
  );
}

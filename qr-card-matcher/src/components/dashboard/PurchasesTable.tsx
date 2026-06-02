import { MemberWithPurchases } from "../../database";

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

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
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

// Display format for table row
interface PurchaseRow {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  mitzvotCount: number;
  totalAmount: number;
  paymentStatus: "paid" | "unpaid";
}

interface PurchasesTableProps {
  members: MemberWithPurchases[];
  totalMembers: number;
  totalMitzvot: number;
  totalAmount: number;
  onScan: () => void;
  onFilter: () => void;
  onExport: () => void;
  onEditPurchase: (memberId: number) => void;
  onSendReminder: (memberId: number) => void;
  searchQuery?: string;
}

export function PurchasesTable({
  members,
  totalMembers,
  totalMitzvot,
  totalAmount,
  onScan,
  onFilter,
  onExport,
  onEditPurchase,
  onSendReminder,
  searchQuery = ""
}: PurchasesTableProps) {
  // Transform members to purchase rows
  const rows: PurchaseRow[] = members.map(member => ({
    id: member.id,
    firstName: member.first_name,
    lastName: member.last_name,
    phone: member.phone || undefined,
    email: member.email || undefined,
    mitzvotCount: member.mitzvot_count,
    totalAmount: member.total_price,
    paymentStatus: member.total_price > 0 ? "unpaid" : "paid" as const, // TODO: Get actual status from database
  }));

  // Filter by search query
  const filteredRows = searchQuery
    ? rows.filter(row =>
        `${row.firstName} ${row.lastName}`.includes(searchQuery) ||
        row.phone?.includes(searchQuery)
      )
    : rows;

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
          <button className="table-filter-btn" onClick={onExport}>
            <ExportIcon />
            ייצוא
          </button>
          <button className="scan-btn" onClick={onScan}>
            <ScanIcon />
            התחל סריקה
          </button>
        </div>
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
          {filteredRows.map((row) => (
            <tr key={row.id}>
              <td>
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
              <td>
                <div className="table-mitzva-list">
                  <span className="table-mitzva-count">{row.mitzvotCount} מצוות</span>
                </div>
              </td>
              <td className="table-price">{formatPrice(row.totalAmount)}</td>
              <td>
                <span className={`table-status ${row.paymentStatus}`}>
                  {row.paymentStatus === 'paid' ? <CheckIcon /> : <ClockIcon />}
                  {row.paymentStatus === 'paid' ? 'שולם' : 'ממתין'}
                </span>
              </td>
              <td>
                <div className="table-actions">
                  <button
                    className="table-action-btn"
                    onClick={() => onEditPurchase(row.id)}
                    title="ערוך"
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="table-action-btn"
                    onClick={() => onSendReminder(row.id)}
                    title={row.paymentStatus === 'paid' ? "קבלה" : "תזכורת"}
                  >
                    {row.paymentStatus === 'paid' ? <ReceiptIcon /> : <EmailIcon />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {filteredRows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-400)' }}>
                {searchQuery ? 'לא נמצאו תוצאות' : 'אין רכישות השבוע'}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {filteredRows.length > 0 && (
        <div className="table-pagination">
          <div className="pagination-info">
            מציג 1-{Math.min(filteredRows.length, 10)} מתוך {filteredRows.length} מתפללים
          </div>
          <div className="pagination-controls">
            <button className="pagination-btn">הקודם</button>
            <button className="pagination-btn active">1</button>
            {filteredRows.length > 10 && <button className="pagination-btn">2</button>}
            <button className="pagination-btn">הבא</button>
          </div>
        </div>
      )}
    </div>
  );
}

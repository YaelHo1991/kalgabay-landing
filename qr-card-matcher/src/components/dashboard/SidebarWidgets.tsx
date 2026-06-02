// SVG Icons
const ProgressIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
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

// Progress Widget Props
interface ProgressWidgetProps {
  totalAmount: number;
  paidAmount: number;
}

export function ProgressWidget({ totalAmount, paidAmount }: ProgressWidgetProps) {
  const percentage = totalAmount > 0 ? Math.round((paidAmount / totalAmount) * 100) : 0;
  const unpaidAmount = totalAmount - paidAmount;

  return (
    <div className="progress-widget">
      <h3 className="widget-title">
        <ProgressIcon />
        התקדמות גבייה
      </h3>
      <div className="progress-bar-container">
        <div className="progress-bar-header">
          <span>{percentage}% נגבה</span>
          <span>{formatPrice(paidAmount)} / {formatPrice(totalAmount)}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
      <div className="progress-stats">
        <div className="progress-stat">
          <div className="progress-stat-value">{formatPrice(paidAmount)}</div>
          <div className="progress-stat-label">נגבה</div>
        </div>
        <div className="progress-stat">
          <div className="progress-stat-value">{formatPrice(unpaidAmount)}</div>
          <div className="progress-stat-label">חסר</div>
        </div>
      </div>
    </div>
  );
}

// Unpaid Member Item
interface UnpaidMember {
  id: number;
  firstName: string;
  lastName: string;
  amount: number;
  email?: string;
  phone?: string;
}

interface UnpaidWidgetProps {
  members: UnpaidMember[];
  totalUnpaid: number;
  onSendReminder: (memberId: number) => void;
  onSendAllReminders: () => void;
}

export function UnpaidWidget({
  members,
  totalUnpaid,
  onSendReminder,
  onSendAllReminders
}: UnpaidWidgetProps) {
  return (
    <div className="unpaid-widget">
      <div className="widget-header">
        <h3 className="widget-title">
          <ClockIcon />
          ממתינים לתשלום
          <span className="unpaid-total">{formatPrice(totalUnpaid)}</span>
        </h3>
        <button
          className="send-all-btn"
          onClick={onSendAllReminders}
          title="שלח תזכורת לכולם"
        >
          <SendIcon />
        </button>
      </div>
      <div className="unpaid-list">
        {members.map((member) => (
          <div key={member.id} className="unpaid-item">
            <div className="unpaid-item-avatar">
              {getInitials(member.firstName, member.lastName)}
            </div>
            <div className="unpaid-item-info">
              <div className="unpaid-item-name">
                {member.firstName} {member.lastName}
              </div>
              <div className="unpaid-item-amount">{formatPrice(member.amount)}</div>
            </div>
            <button
              className="unpaid-item-btn"
              onClick={() => onSendReminder(member.id)}
              title="שלח תזכורת"
            >
              <EmailIcon />
            </button>
          </div>
        ))}
        {members.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: 'var(--gray-400)',
            fontSize: '0.9rem'
          }}>
            אין ממתינים לתשלום
          </div>
        )}
      </div>
    </div>
  );
}

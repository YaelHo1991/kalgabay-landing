import { useState, useEffect, useMemo } from "react";
import { apiGetEmailTemplate, getStoredUser } from "../../services/apiService";
import { sendPaymentReminder } from "../../services/emailService";
import "./ReminderPreviewModal.css";

interface UnpaidMember {
  id: number;
  firstName: string;
  lastName: string;
  amount: number;
  email?: string;
  phone?: string;
  mitzvotNames?: string[];
}

interface ReminderPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  member?: UnpaidMember;
  members?: UnpaidMember[];
  onSent?: (successCount: number, failCount: number) => void;
}

export function ReminderPreviewModal({
  isOpen,
  onClose,
  member,
  members,
  onSent
}: ReminderPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState<string>("");
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [showRecipients, setShowRecipients] = useState(false);

  const user = getStoredUser();
  const synagogueName = user?.synagogue_name || 'בית הכנסת';

  // Determine if this is bulk mode or single mode
  const isBulkMode = !member && members && members.length > 0;
  const targetMembers = useMemo(() =>
    isBulkMode ? members! : (member ? [member] : []),
    [isBulkMode, members, member]
  );
  const membersWithEmail = useMemo(() =>
    targetMembers.filter(m => m.email),
    [targetMembers]
  );

  // Generate default message when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (targetMembers.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const generateMessage = async () => {
      setLoading(true);
      setError(null);

      // For bulk mode, use Hebrew placeholders. For single mode, use actual values
      const firstMember = targetMembers[0];
      const nameDisplay = isBulkMode ? '{שם}' : (firstMember?.firstName || 'מתפלל');
      const amountDisplay = isBulkMode ? '{סכום}' : `₪${firstMember?.amount?.toLocaleString() || '0'}`;
      const mitzvotDisplay = isBulkMode
        ? '{רשימת מצוות}'
        : ((firstMember?.mitzvotNames || []).length > 0
            ? firstMember!.mitzvotNames!.join(', ')
            : 'המצוות שרכשת');

      // Try to fetch template from server
      try {
        const result = await apiGetEmailTemplate('payment_reminder');

        // Get template text - prefer text_template, fallback to extracting from html_template
        let templateText = result.template?.text_template;

        // If text_template is empty but html_template exists, extract text from HTML
        if ((!templateText || templateText.trim() === '') && result.template?.html_template) {
          // Simple HTML to text conversion - remove tags and decode entities
          templateText = result.template.html_template
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
        }

        if (result.success && templateText && templateText.trim() !== '') {
          // Use server template - replace all variables with Hebrew placeholders or values
          let text = templateText;

          // Replace all known variables
          text = text.replace(/\{member_name\}/g, nameDisplay);
          text = text.replace(/\{member_first_name\}/g, nameDisplay);
          text = text.replace(/\{member_last_name\}/g, isBulkMode ? '{שם משפחה}' : (firstMember?.lastName || ''));
          text = text.replace(/\{synagogue_name\}/g, synagogueName);
          text = text.replace(/\{total_unpaid\}/g, amountDisplay);
          text = text.replace(/\{total_amount\}/g, amountDisplay);
          text = text.replace(/\{unpaid_text\}/g, mitzvotDisplay);
          text = text.replace(/\{unpaid_list\}/g, mitzvotDisplay);
          text = text.replace(/\{mitzvot_list\}/g, mitzvotDisplay);
          text = text.replace(/\{date\}/g, new Date().toLocaleDateString('he-IL'));
          text = text.replace(/\{custom_message\}/g, ''); // Remove custom_message placeholder

          // Clean up any empty lines that might result from removed placeholders
          text = text.replace(/\n\s*\n\s*\n/g, '\n\n');

          if (cancelled) return;
          setMessageContent(text);

          // Set email subject from template
          if (result.template?.subject) {
            setEmailSubject(result.template.subject.replace(/\{synagogue_name\}/g, synagogueName));
          } else {
            setEmailSubject(`תזכורת תשלום - ${synagogueName}`);
          }
        } else {
          if (cancelled) return;
          // Use default message
          setMessageContent(
            `שלום ${nameDisplay},\n\n` +
            `תזכורת: יש לך תשלום פתוח עבור מצוות שרכשת.\n` +
            `${mitzvotDisplay}\n\n` +
            `סה"כ לתשלום: ${amountDisplay}\n\n` +
            `בברכה,\n${synagogueName}`
          );
          setEmailSubject(`תזכורת תשלום - ${synagogueName}`);
        }
      } catch {
        if (cancelled) return;
        // Use default message on error
        setMessageContent(
          `שלום ${nameDisplay},\n\n` +
          `תזכורת: יש לך תשלום פתוח עבור מצוות שרכשת.\n` +
          `${mitzvotDisplay}\n\n` +
          `סה"כ לתשלום: ${amountDisplay}\n\n` +
          `בברכה,\n${synagogueName}`
        );
        setEmailSubject(`תזכורת תשלום - ${synagogueName}`);
      }

      if (!cancelled) {
        setLoading(false);
      }
    };

    generateMessage();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetMembers, synagogueName, isBulkMode]);

  // Send reminders
  const handleSend = async () => {
    if (membersWithEmail.length === 0) {
      setError('אין מתפללים עם כתובת מייל לשליחה');
      return;
    }

    setSending(true);
    setError(null);

    let successCount = 0;
    let failCount = 0;

    for (const m of membersWithEmail) {
      try {
        // Replace placeholders for each member
        const mitzvotText = (m.mitzvotNames || []).length > 0
          ? m.mitzvotNames!.map(name => `• ${name}`).join('\n')
          : '• המצוות שרכשת';

        let personalizedMessage = messageContent
          // Replace Hebrew placeholders
          .replace(/\{שם\}/g, m.firstName)
          .replace(/\{סכום\}/g, `₪${m.amount.toLocaleString()}`)
          .replace(/• \{רשימת מצוות\}/g, mitzvotText)
          .replace(/\{רשימת מצוות\}/g, mitzvotText)
          // Also handle English placeholders if any
          .replace(/\{member_name\}/g, m.firstName)
          .replace(/\{total_amount\}/g, `₪${m.amount.toLocaleString()}`)
          .replace(/\{mitzvot_list\}/g, mitzvotText);

        const result = await sendPaymentReminder(
          m.email!,
          `${m.firstName} ${m.lastName}`,
          personalizedMessage,
          synagogueName,
          emailSubject
        );

        if (result.success) {
          successCount++;
        } else {
          failCount++;
          console.error(`Failed to send to ${m.email}:`, result.error);
        }
      } catch (err) {
        failCount++;
        console.error(`Error sending to ${m.email}:`, err);
      }
    }

    setSending(false);

    if (onSent) {
      onSent(successCount, failCount);
    }

    if (failCount === 0) {
      onClose();
    } else {
      setError(`נשלחו ${successCount} תזכורות, ${failCount} נכשלו`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="reminder-modal-overlay" onClick={onClose}>
      <div className="reminder-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="reminder-modal-header">
          <h2>
            {isBulkMode
              ? `שליחת תזכורת ל-${membersWithEmail.length} מתפללים`
              : `תזכורת תשלום - ${member?.firstName} ${member?.lastName}`
            }
          </h2>
          <button className="reminder-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="reminder-modal-content">
          {loading ? (
            <div className="reminder-modal-loading">
              <div className="loading-spinner"></div>
              <p>טוען...</p>
            </div>
          ) : (
            <>
              {/* Recipients - compact inline display */}
              <div className="reminder-recipients-compact">
                <span className="recipients-label">נמענים:</span>
                <button
                  className="recipients-toggle"
                  onClick={() => setShowRecipients(!showRecipients)}
                >
                  <span className="recipients-count">{membersWithEmail.length}</span>
                  <span className="recipients-names">
                    {membersWithEmail.slice(0, 2).map(m => m.firstName).join(', ')}
                    {membersWithEmail.length > 2 && ` ועוד ${membersWithEmail.length - 2}`}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    style={{ transform: showRecipients ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                  >
                    <path fill="currentColor" d="M7 10l5 5 5-5z"/>
                  </svg>
                </button>
                {targetMembers.length > membersWithEmail.length && (
                  <span className="recipients-warning-inline">
                    ({targetMembers.length - membersWithEmail.length} ללא מייל)
                  </span>
                )}
              </div>

              {/* Expandable recipients list */}
              {showRecipients && (
                <div className="recipients-expanded">
                  {membersWithEmail.map(m => (
                    <div key={m.id} className="recipient-chip">
                      {m.firstName} {m.lastName}
                      {m.amount > 0 && <span className="chip-amount">₪{m.amount}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Message Content - editable */}
              <div className="reminder-message-editor">
                <label>תוכן ההודעה:</label>
                <textarea
                  value={messageContent}
                  onChange={e => setMessageContent(e.target.value)}
                  placeholder="הקלד את תוכן ההודעה..."
                  rows={10}
                />
                {isBulkMode && (
                  <p className="helper-text">
                    ההודעה תותאם אוטומטית לכל נמען עם השם והסכום שלו
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="reminder-error">
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="reminder-modal-footer">
          <button className="btn-cancel" onClick={onClose} disabled={sending}>
            ביטול
          </button>
          <button
            className="btn-send"
            onClick={handleSend}
            disabled={loading || sending || membersWithEmail.length === 0}
          >
            {sending ? (
              <>
                <div className="loading-spinner small"></div>
                <span>שולח...</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
                <span>
                  {isBulkMode
                    ? `שלח ל-${membersWithEmail.length} מתפללים`
                    : 'שלח תזכורת'
                  }
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReminderPreviewModal;

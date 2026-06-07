import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MitzvaWithPurchaser } from "../database";

type ReminderChannel = "email" | "whatsapp" | "sms";

interface ReminderModalProps {
  mitzva: MitzvaWithPurchaser;
  onClose: () => void;
  onSend: (channel: ReminderChannel, message: string) => Promise<void>;
}

export function ReminderModal({ mitzva, onClose, onSend }: ReminderModalProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState(() => {
    // Default message template
    const mitzvaName = mitzva.name || "";
    const amount = mitzva.bid_price ? `₪${mitzva.bid_price}` : "";
    return t("reminder.defaultMessage", {
      mitzvaName,
      amount,
      defaultValue: `שלום,\nזוהי תזכורת בנוגע לתשלום עבור ${mitzvaName}${amount ? ` בסכום ${amount}` : ""}.\nתודה רבה!`
    });
  });
  const [channel, setChannel] = useState<ReminderChannel>("whatsapp");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasEmail = !!mitzva.purchaser_email;
  const hasPhone = !!mitzva.purchaser_phone;

  const handleSend = async () => {
    setSending(true);
    setError(null);
    try {
      await onSend(channel, message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחה");
    } finally {
      setSending(false);
    }
  };

  const channelOptions: { value: ReminderChannel; label: string; icon: string; disabled: boolean }[] = [
    { value: "whatsapp", label: "WhatsApp", icon: "📱", disabled: !hasPhone },
    { value: "sms", label: "SMS", icon: "💬", disabled: !hasPhone },
    { value: "email", label: t("reminder.email") || "אימייל", icon: "📧", disabled: !hasEmail },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          padding: "30px",
          maxWidth: "500px",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: "0 0 20px 0", color: "#1E5AA8" }}>
          {t("reminder.title") || "שליחת תזכורת תשלום"}
        </h2>

        <div style={{ marginBottom: "15px" }}>
          <p style={{ margin: "0 0 10px 0" }}>
            <strong>{t("reminder.to") || "אל"}:</strong> {mitzva.purchaser_name}
          </p>
          <p style={{ margin: "0 0 10px 0" }}>
            <strong>{t("reminder.mitzva") || "מצווה"}:</strong> {mitzva.name}
          </p>
          {mitzva.bid_price && (
            <p style={{ margin: "0 0 10px 0" }}>
              <strong>{t("reminder.amount") || "סכום"}:</strong> ₪{mitzva.bid_price}
            </p>
          )}
        </div>

        {/* Channel Selection */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: "500" }}>
            {t("reminder.channel") || "שלח באמצעות"}
          </label>
          <div style={{ display: "flex", gap: "10px" }}>
            {channelOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => !opt.disabled && setChannel(opt.value)}
                disabled={opt.disabled}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "8px",
                  border: channel === opt.value ? "2px solid #1E5AA8" : "1px solid #ddd",
                  background: channel === opt.value ? "#EFF6FF" : "white",
                  cursor: opt.disabled ? "not-allowed" : "pointer",
                  opacity: opt.disabled ? 0.5 : 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <span style={{ fontSize: "20px" }}>{opt.icon}</span>
                <span style={{ fontSize: "12px" }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
            {t("reminder.message") || "תוכן ההודעה"}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("reminder.messagePlaceholder") || "הוסף הודעה אישית..."}
            style={{
              width: "100%",
              minHeight: "120px",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              resize: "vertical",
              fontFamily: "inherit",
              direction: "rtl",
            }}
          />
        </div>

        {error && (
          <div style={{
            color: "#DC2626",
            marginBottom: "15px",
            padding: "10px",
            background: "#FEE2E2",
            borderRadius: "8px",
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid #ddd",
              background: "white",
              cursor: "pointer",
            }}
          >
            {t("common.cancel") || "ביטול"}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
              color: "white",
              cursor: sending ? "wait" : "pointer",
              opacity: sending || !message.trim() ? 0.7 : 1,
            }}
          >
            {sending ? t("common.sending") || "שולח..." : t("reminder.send") || "שלח תזכורת"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReminderModal;

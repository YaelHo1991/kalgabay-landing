import { Week, getWeekDisplayName } from "../database";

interface WeekDisplayProps {
  week: Week | null;
  onWeekChange?: (week: Week | null) => void;
}

export function WeekDisplay({ week, onWeekChange }: WeekDisplayProps) {
  if (!week) {
    return (
      <div style={{
        padding: "10px 15px",
        backgroundColor: "#f0f0f0",
        borderRadius: "8px",
        textAlign: "center",
        color: "#666",
      }}>
        לא נבחר שבוע
      </div>
    );
  }

  const displayName = getWeekDisplayName(week);
  const dateStr = week.shabbat_date
    ? new Date(week.shabbat_date).toLocaleDateString("he-IL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <div
      style={{
        padding: "10px 15px",
        backgroundColor: "#EFF6FF",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "10px",
      }}
    >
      <div>
        <div style={{ fontWeight: "bold", color: "#1E40AF" }}>{displayName}</div>
        {dateStr && (
          <div style={{ fontSize: "12px", color: "#6B7280" }}>{dateStr}</div>
        )}
      </div>
      {onWeekChange && (
        <button
          onClick={() => onWeekChange(null)}
          style={{
            background: "none",
            border: "none",
            color: "#6B7280",
            cursor: "pointer",
            padding: "4px",
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default WeekDisplay;

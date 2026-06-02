import { useState, useEffect } from "react";
import { HebrewCalendar, HDate, flags } from "@hebcal/core";
import { useTranslation } from "react-i18next";
import { Week } from "../database";

interface HebrewYearSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onEventSelect?: (event: YearEvent) => void;
  selectedWeek?: Week | null;
}

// Event type for our calendar
export interface YearEvent {
  date: Date;
  hebrewDate: string;
  name: string;
  type: "parasha" | "holiday" | "roshChodesh";
  isShabbat: boolean;
  weekNumber?: number;
}

// Get Hebrew year name in gematria format
function getHebrewYearName(year: number): string {
  const hdate = new HDate(1, "Tishrei", year);
  return hdate.renderGematriya(false).split(" ").pop() || year.toString();
}

// Get current Hebrew year
function getCurrentHebrewYear(): number {
  const today = new HDate();
  return today.getFullYear();
}

// Generate all events for a Hebrew year
function getYearEvents(hebrewYear: number): YearEvent[] {
  const events: YearEvent[] = [];

  // Get start and end dates for the Hebrew year
  new HDate(1, "Tishrei", hebrewYear).greg();
  new HDate(29, "Elul", hebrewYear).greg();

  // Get all events from hebcal
  const calEvents = HebrewCalendar.calendar({
    year: hebrewYear,
    isHebrewYear: true,
    sedrot: true, // Include parasha
    il: true, // Israel calendar
    locale: "he",
  });

  // Process events
  for (const event of calEvents) {
    const eventFlags = event.getFlags();
    const hdate = event.getDate();
    const gregDate = hdate.greg();
    const hebrewDateStr = hdate.renderGematriya(true);

    // Check if it's Shabbat
    const isShabbat = gregDate.getDay() === 6;

    // Determine event type
    let eventType: "parasha" | "holiday" | "roshChodesh" | null = null;

    if (eventFlags & flags.PARSHA_HASHAVUA) {
      eventType = "parasha";
    } else if (
      eventFlags & flags.CHAG ||
      eventFlags & flags.MAJOR_FAST ||
      eventFlags & flags.YOM_TOV_ENDS
    ) {
      eventType = "holiday";
    } else if (eventFlags & flags.ROSH_CHODESH) {
      eventType = "roshChodesh";
    }

    if (eventType) {
      events.push({
        date: gregDate,
        hebrewDate: hebrewDateStr,
        name: event.render("he"),
        type: eventType,
        isShabbat,
        weekNumber: getWeekNumber(gregDate),
      });
    }
  }

  // Sort by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  return events;
}

// Get ISO week number for a date
function getWeekNumber(date: Date): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const jan1 = new Date(target.getFullYear(), 0, 1);
  const diff = target.getTime() - jan1.getTime();
  return Math.ceil((diff / 86400000 + 1) / 7);
}

// Check if event is current or upcoming
function isCurrentOrUpcoming(eventDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = new Date(eventDate);
  eventDay.setHours(0, 0, 0, 0);
  return eventDay >= today;
}

// Check if event is today
function isToday(eventDate: Date): boolean {
  const today = new Date();
  return (
    eventDate.getDate() === today.getDate() &&
    eventDate.getMonth() === today.getMonth() &&
    eventDate.getFullYear() === today.getFullYear()
  );
}

export function HebrewYearSidebar({
  isOpen,
  onClose,
  onEventSelect,
  selectedWeek,
}: HebrewYearSidebarProps) {
  useTranslation();
  const [hebrewYear, setHebrewYear] = useState(getCurrentHebrewYear());
  const [events, setEvents] = useState<YearEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearInput, setYearInput] = useState("");

  useEffect(() => {
    setLoading(true);
    const yearEvents = getYearEvents(hebrewYear);
    setEvents(yearEvents);
    setLoading(false);
  }, [hebrewYear]);

  // Scroll to current/upcoming event when opened
  useEffect(() => {
    if (isOpen && events.length > 0) {
      setTimeout(() => {
        const currentElement = document.getElementById("current-event");
        if (currentElement) {
          currentElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    }
  }, [isOpen, events]);

  const handleYearChange = (delta: number) => {
    setHebrewYear((prev) => prev + delta);
  };

  const handleYearInputSubmit = () => {
    const parsed = parseInt(yearInput);
    if (!isNaN(parsed) && parsed >= 5700 && parsed <= 6000) {
      setHebrewYear(parsed);
      setYearInput("");
    }
  };

  const getEventIcon = (type: "parasha" | "holiday" | "roshChodesh"): string => {
    switch (type) {
      case "parasha":
        return "\u{1F4D6}"; // Open book
      case "holiday":
        return "\u{2728}"; // Sparkles
      case "roshChodesh":
        return "\u{1F319}"; // Crescent moon
      default:
        return "";
    }
  };

  const getEventColor = (type: "parasha" | "holiday" | "roshChodesh"): string => {
    switch (type) {
      case "parasha":
        return "#1D4ED8"; // blue-700
      case "holiday":
        return "#2563EB"; // blue-600
      case "roshChodesh":
        return "#3B82F6"; // blue-500
      default:
        return "#6B7280"; // gray-500
    }
  };

  // Find first upcoming event
  const firstUpcomingIndex = events.findIndex((e) => isCurrentOrUpcoming(e.date));

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.3)",
            zIndex: 999,
          }}
        />
      )}

      {/* Sidebar */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: isOpen ? 0 : "-400px",
          width: "380px",
          height: "100vh",
          background: "linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)", // blue-50 to blue-100
          boxShadow: isOpen ? "-4px 0 20px rgba(0, 0, 0, 0.15)" : "none",
          zIndex: 1000,
          transition: "right 0.3s ease-in-out",
          display: "flex",
          flexDirection: "column",
          direction: "rtl",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px",
            background: "linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)", // blue-600 to blue-800
            color: "white",
            position: "relative",
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: "15px",
              left: "15px",
              background: "rgba(255, 255, 255, 0.2)",
              border: "none",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "18px",
            }}
          >
            &times;
          </button>

          {/* Year navigation */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "15px",
              marginBottom: "15px",
            }}
          >
            <button
              onClick={() => handleYearChange(-1)}
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                cursor: "pointer",
                color: "white",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &rarr;
            </button>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "2rem", fontWeight: "bold" }}>
                {getHebrewYearName(hebrewYear)}
              </div>
              <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>
                {hebrewYear}
              </div>
            </div>

            <button
              onClick={() => handleYearChange(1)}
              style={{
                background: "rgba(255, 255, 255, 0.2)",
                border: "none",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                cursor: "pointer",
                color: "white",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              &larr;
            </button>
          </div>

          {/* Year input */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            <input
              type="number"
              placeholder="הזן שנה עברית..."
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleYearInputSubmit()}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "none",
                fontSize: "0.9rem",
                width: "140px",
                textAlign: "center",
                direction: "ltr",
              }}
            />
            <button
              onClick={handleYearInputSubmit}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#3B82F6", // blue-500
                color: "white",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              עבור
            </button>
          </div>

          {/* Return to current year */}
          {hebrewYear !== getCurrentHebrewYear() && (
            <button
              onClick={() => setHebrewYear(getCurrentHebrewYear())}
              style={{
                marginTop: "10px",
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid rgba(255,255,255,0.5)",
                background: "transparent",
                color: "white",
                cursor: "pointer",
                fontSize: "0.8rem",
                display: "block",
                margin: "10px auto 0",
              }}
            >
              חזור לשנה הנוכחית
            </button>
          )}
        </div>

        {/* Events list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "15px",
          }}
        >
          {loading ? (
            <div
              style={{
                textAlign: "center",
                padding: "40px",
                color: "#888",
              }}
            >
              טוען...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {events.map((event, index) => {
                const isCurrent = index === firstUpcomingIndex;
                const isPast = index < firstUpcomingIndex;
                const isEventToday = isToday(event.date);
                const isSelected =
                  selectedWeek &&
                  event.weekNumber === selectedWeek.week_number &&
                  event.date.getFullYear() === selectedWeek.year;

                return (
                  <div
                    key={`${event.date.toISOString()}-${event.name}`}
                    id={isCurrent ? "current-event" : undefined}
                    onClick={() => onEventSelect?.(event)}
                    style={{
                      padding: "12px 15px",
                      borderRadius: "10px",
                      background: isEventToday
                        ? "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)" // blue-600 to blue-500
                        : isSelected
                        ? "#BFDBFE" // blue-200
                        : isPast
                        ? "#F3F4F6" // gray-100
                        : "white",
                      border: isEventToday
                        ? "2px solid #2563EB" // blue-600
                        : isCurrent
                        ? "2px solid #3B82F6" // blue-500
                        : isSelected
                        ? "2px solid #1D4ED8" // blue-700
                        : "1px solid #E5E7EB", // gray-200
                      cursor: onEventSelect ? "pointer" : "default",
                      opacity: isPast ? 0.6 : 1,
                      transition: "all 0.2s ease",
                      boxShadow: isEventToday || isCurrent
                        ? "0 2px 8px rgba(37, 99, 235, 0.2)" // blue-600 shadow
                        : "none",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                      }}
                    >
                      {/* Event icon */}
                      <span
                        style={{
                          fontSize: "1.2rem",
                          lineHeight: 1,
                        }}
                      >
                        {getEventIcon(event.type)}
                      </span>

                      {/* Event details */}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: "bold",
                            color: isEventToday ? "white" : getEventColor(event.type),
                            fontSize: "1rem",
                            marginBottom: "4px",
                          }}
                        >
                          {event.name}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            fontSize: "0.8rem",
                            color: isEventToday ? "rgba(255,255,255,0.9)" : "#888",
                          }}
                        >
                          <span>{event.hebrewDate}</span>
                          <span>|</span>
                          <span style={{ direction: "ltr" }}>
                            {event.date.toLocaleDateString("he-IL", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Badges */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {isEventToday && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: "rgba(255,255,255,0.3)",
                              color: "white",
                            }}
                          >
                            היום
                          </span>
                        )}
                        {isCurrent && !isEventToday && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "2px 8px",
                              borderRadius: "10px",
                              background: "#3B82F6", // blue-500
                              color: "white",
                            }}
                          >
                            הבא
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - Legend */}
        <div
          style={{
            padding: "15px 20px",
            borderTop: "1px solid #E5E7EB", // gray-200
            background: "#F9FAFB", // gray-50
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "20px",
              fontSize: "0.75rem",
              color: "#6B7280", // gray-500
            }}
          >
            <span>
              <span style={{ marginLeft: "4px" }}>{getEventIcon("parasha")}</span>
              פרשה
            </span>
            <span>
              <span style={{ marginLeft: "4px" }}>{getEventIcon("holiday")}</span>
              חג
            </span>
            <span>
              <span style={{ marginLeft: "4px" }}>{getEventIcon("roshChodesh")}</span>
              ר"ח
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

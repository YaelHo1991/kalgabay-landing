import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

type Page = "dashboard" | "members" | "mitzvot" | "linking";

interface HamburgerMenuProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onSettingsClick: () => void;
  user?: { email?: string } | null;
}

export function HamburgerMenu({ currentPage, onNavigate, onSettingsClick }: HamburgerMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  // Detect if running on Android/mobile
  const [isAndroid, setIsAndroid] = useState(false);
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsAndroid(userAgent.includes('android'));
  }, []);

  const menuItems: { page: Page; labelKey: string }[] = [
    { page: "dashboard", labelKey: "nav.home" },
    { page: "members", labelKey: "nav.members" },
    { page: "mitzvot", labelKey: "nav.mitzvot" },
    { page: "linking", labelKey: "nav.archive" },
  ];

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    // Don't close menu - let it stay open
  };

  return (
    <>
      {/* בס"ד - shown below the user info bar on Android, in fixed header on desktop */}
      <div
        style={{
          position: "fixed",
          top: isAndroid ? "52px" : "42px",
          right: "20px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            color: "#1E5AA8",
            fontSize: "0.95rem",
            fontWeight: "bold",
            fontFamily: "inherit",
          }}
        >
          בס"ד
        </div>
      </div>

      {/* Menu Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: "fixed",
          top: isAndroid ? "52px" : "40px",
          left: "60px",
          zIndex: 1001,
          background: "transparent",
          border: "none",
          padding: "8px",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
          justifyContent: "center",
          width: "36px",
          height: "36px",
          transition: "all 0.3s ease",
        }}
      >
        <span
          style={{
            display: "block",
            width: "20px",
            height: "2px",
            background: "#1E5AA8",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            transform: isOpen ? "rotate(45deg) translate(4px, 4px)" : "none",
          }}
        />
        <span
          style={{
            display: "block",
            width: "20px",
            height: "2px",
            background: "#1E5AA8",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            opacity: isOpen ? 0 : 1,
          }}
        />
        <span
          style={{
            display: "block",
            width: "20px",
            height: "2px",
            background: "#1E5AA8",
            borderRadius: "2px",
            transition: "all 0.3s ease",
            transform: isOpen ? "rotate(-45deg) translate(4px, -4px)" : "none",
          }}
        />
      </button>

      {/* Bubble Menu Items */}
      <div
        style={{
          position: "fixed",
          top: isAndroid ? "95px" : "85px",
          left: "20px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transform: isOpen ? "translateY(0)" : "translateY(-20px)",
          transition: "all 0.3s ease",
        }}
      >
        {menuItems.map((item, index) => (
          <button
            key={item.page}
            onClick={() => handleNavigate(item.page)}
            style={{
              padding: "12px 20px",
              background: currentPage === item.page
                ? "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)"
                : "rgba(255, 255, 255, 0.95)",
              border: currentPage === item.page
                ? "2px solid #4FA8D9"
                : "2px solid transparent",
              borderRadius: "25px",
              color: currentPage === item.page ? "white" : "#1E5AA8",
              fontSize: "1rem",
              fontWeight: currentPage === item.page ? "bold" : "normal",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
              transitionDelay: `${index * 50}ms`,
              transform: isOpen ? "translateX(0)" : "translateX(20px)",
              opacity: isOpen ? 1 : 0,
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}

      </div>

      {/* Settings Icon */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSettingsClick();
        }}
        title={t("nav.settings")}
        style={{
          position: "fixed",
          top: isAndroid ? "52px" : "40px",
          left: "20px",
          zIndex: 1000,
          background: "transparent",
          border: "none",
          padding: "8px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "36px",
          height: "36px",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#1E5AA8">
          <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
        </svg>
      </button>
    </>
  );
}

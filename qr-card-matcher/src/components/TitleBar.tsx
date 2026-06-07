import { useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";

interface TitleBarProps {
  title: string;
}

export function TitleBar({ title }: TitleBarProps) {
  const [appWindow, setAppWindow] = useState<Window | null>(null);

  useEffect(() => {
    // Dynamically import Tauri window API
    const loadWindow = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        setAppWindow(win);
      } catch (e) {
        console.log("Not running in Tauri environment", e);
      }
    };
    loadWindow();
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("Minimize clicked, appWindow:", appWindow);
    if (appWindow) {
      try {
        await appWindow.minimize();
      } catch (err) {
        console.error("Minimize error:", err);
      }
    }
  };

  const handleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("Maximize clicked, appWindow:", appWindow);
    if (appWindow) {
      try {
        const isMaximized = await appWindow.isMaximized();
        if (isMaximized) {
          await appWindow.unmaximize();
        } else {
          await appWindow.maximize();
        }
      } catch (err) {
        console.error("Maximize error:", err);
      }
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    console.log("Close clicked, appWindow:", appWindow);
    if (appWindow) {
      try {
        await appWindow.close();
      } catch (err) {
        console.error("Close error:", err);
      }
    }
  };

  const handleDragStart = async (e: React.MouseEvent) => {
    // Only start drag if clicking on the drag region itself, not buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    if (appWindow) {
      try {
        await appWindow.startDragging();
      } catch (err) {
        console.error("Drag error:", err);
      }
    }
  };

  return (
    <div
      onMouseDown={handleDragStart}
      style={{
        height: "32px",
        background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px",
        userSelect: "none",
        WebkitUserSelect: "none",
        cursor: "default",
      }}
    >
      {/* Title */}
      <div
        style={{
          color: "white",
          fontSize: "14px",
          fontWeight: "bold",
          flex: 1,
          textAlign: "right",
          paddingRight: "10px",
        }}
      >
        {title}
      </div>

      {/* Window Controls */}
      <div style={{ display: "flex", gap: "4px" }}>
        {/* Minimize */}
        <button
          onClick={handleMinimize}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: "30px",
            height: "24px",
            border: "none",
            background: "rgba(255,255,255,0.1)",
            color: "white",
            cursor: "pointer",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
        >
          ─
        </button>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: "30px",
            height: "24px",
            border: "none",
            background: "rgba(255,255,255,0.1)",
            color: "white",
            cursor: "pointer",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
        >
          □
        </button>

        {/* Close */}
        <button
          onClick={handleClose}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: "30px",
            height: "24px",
            border: "none",
            background: "rgba(255,255,255,0.1)",
            color: "white",
            cursor: "pointer",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#DC2626")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default TitleBar;

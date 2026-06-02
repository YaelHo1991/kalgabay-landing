import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LABEL_CONFIG } from "./LabelPositionSelector";

// Printer interface
interface Printer {
  name: string;
  is_default: boolean;
}

// Tauri invoke API - dynamically imported
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

// Load Tauri API
const loadTauriApi = async () => {
  try {
    const tauriModule = await import("@tauri-apps/api/core");
    tauriInvoke = tauriModule.invoke;
    return true;
  } catch {
    console.log("Tauri API not available (running in browser)");
    return false;
  }
};

// Get printers using our custom Rust command
const getSystemPrinters = async (): Promise<Printer[]> => {
  if (!tauriInvoke) return [];
  try {
    const printers = await tauriInvoke("get_system_printers") as Printer[];
    return printers;
  } catch (error) {
    console.error("Failed to get printers:", error);
    return [];
  }
};

// Item to print - unified interface for mitzvot and members
export interface PrintItem {
  id: number;
  name: string;
  code: string;
  serialNumber?: number;
  isMitzva?: boolean; // Preserve item type for correct styling in mixed print
}

interface PrintPreviewModalProps {
  items: PrintItem[];
  isMitzva: boolean;
  onClose: () => void;
  onPrint: (items: PrintItem[], startPosition: number, printerName?: string, customPositions?: Map<number, number>) => void;
  onLoadAll?: () => Promise<PrintItem[]>; // Function to load all items (mitzvot + members)
  loading?: boolean;
}

export function PrintPreviewModal({
  items: initialItems,
  isMitzva,
  onClose,
  onPrint,
  onLoadAll,
  loading = false,
}: PrintPreviewModalProps) {
  const { t } = useTranslation();
  const [startPosition] = useState(1);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [, setPrinterApiAvailable] = useState(false);
  const [loadingPrinters, setLoadingPrinters] = useState(true);

  // Items state - can be updated when loading all
  const [items, setItems] = useState<PrintItem[]>(initialItems);
  const [allLoaded, setAllLoaded] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);

  // Individual item positioning - maps item index to custom position
  const [itemPositions, setItemPositions] = useState<Map<number, number>>(new Map());
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);

  // Update items when initialItems change
  useEffect(() => {
    setItems(initialItems);
    setAllLoaded(false);
    setItemPositions(new Map());
    setSelectedItemIndex(null);
  }, [initialItems]);

  // Load all items handler - toggle between loaded and initial
  const handleLoadAllToggle = async () => {
    if (!onLoadAll || loadingAll) return;

    // If already loaded, revert to initial items
    if (allLoaded) {
      setItems(initialItems);
      setAllLoaded(false);
      setItemPositions(new Map());
      setSelectedItemIndex(null);
      return;
    }

    // Load all items
    setLoadingAll(true);
    try {
      const allItems = await onLoadAll();
      setItems(allItems);
      setAllLoaded(true);
      // Reset positions when items change
      setItemPositions(new Map());
      setSelectedItemIndex(null);
    } catch (error) {
      console.error("Error loading all items:", error);
    } finally {
      setLoadingAll(false);
    }
  };


  // Load printers on mount
  useEffect(() => {
    const initPrinters = async () => {
      setLoadingPrinters(true);
      const available = await loadTauriApi();
      setPrinterApiAvailable(available);

      if (available) {
        try {
          const printerList = await getSystemPrinters();
          setPrinters(printerList);

          // Select default printer or first one
          const defaultPrinter = printerList.find(p => p.is_default);
          const savedPrinter = localStorage.getItem("selectedPrinter");

          if (savedPrinter && printerList.some(p => p.name === savedPrinter)) {
            setSelectedPrinter(savedPrinter);
          } else if (defaultPrinter) {
            setSelectedPrinter(defaultPrinter.name);
          } else if (printerList.length > 0) {
            setSelectedPrinter(printerList[0].name);
          }
        } catch (err) {
          console.error("Failed to load printers:", err);
        }
      }
      setLoadingPrinters(false);
    };

    initPrinters();
  }, []);

  // Save selected printer
  const handlePrinterChange = (printerName: string) => {
    setSelectedPrinter(printerName);
    localStorage.setItem("selectedPrinter", printerName);
  };

  const totalItems = items.length;
  const labelsPerPage = LABEL_CONFIG.totalLabels;

  // Calculate positions - use custom positions if set, otherwise default sequential
  const getItemPosition = (index: number): number => {
    return itemPositions.get(index) ?? (startPosition + index);
  };

  // Find last position for page calculation
  const allPositions = items.map((_, index) => getItemPosition(index));
  const lastPosition = Math.max(...allPositions);
  const totalPages = Math.ceil(lastPosition / labelsPerPage);

  // A4 aspect ratio
  const a4AspectRatio = LABEL_CONFIG.pageWidth / LABEL_CONFIG.pageHeight;
  const marginPercentTop = (LABEL_CONFIG.topMargin / LABEL_CONFIG.pageHeight) * 100;
  const marginPercentBottom = (LABEL_CONFIG.bottomMargin / LABEL_CONFIG.pageHeight) * 100;

  // Map positions to items (with custom positions support)
  const filledPositions: Map<number, { item: PrintItem; index: number }> = new Map();
  items.forEach((item, index) => {
    const pos = getItemPosition(index);
    filledPositions.set(pos, { item, index });
  });

  // Removed unused takenPositions - can be re-added if overlap validation is needed

  // Generate positions array
  const positions = Array.from({ length: labelsPerPage }, (_, i) => i + 1);

  // Theme colors (default based on isMitzva prop, but items can override)
  const primaryColor = isMitzva ? "#1E5AA8" : "#4FA8D9";
  const secondaryColor = isMitzva ? "#1E5AA8" : "#2C7BE5";

  // Helper to get colors for each item based on its type
  const getItemColors = (item: PrintItem) => {
    // Use item's isMitzva if set, otherwise fall back to global isMitzva
    const itemIsMitzva = item.isMitzva !== undefined ? item.isMitzva : isMitzva;
    return {
      borderColor: itemIsMitzva ? "#1E5AA8" : "#1E5AA8",
      bgColor: itemIsMitzva ? "#e8f4fd" : "#f0f7ff",
    };
  };

  const renderPage = (pageNumber: number) => {
    const pageStartPosition = (pageNumber - 1) * labelsPerPage + 1;

    return (
      <div
        key={pageNumber}
        style={{
          width: totalPages > 1 ? "350px" : "100%",
          maxWidth: "550px",
          aspectRatio: `${a4AspectRatio}`,
          background: "white",
          border: "2px solid #333",
          boxShadow: "2px 2px 8px rgba(0,0,0,0.1)",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        {/* Page number - only show if multiple pages */}
        {totalPages > 1 && (
          <div style={{
            position: "absolute",
            top: "-22px",
            right: "0",
            left: "0",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "#666",
            fontWeight: "bold",
          }}>
            {t("common.page")} {pageNumber} / {totalPages}
          </div>
        )}

        {/* Top margin */}
        <div style={{
          height: `${marginPercentTop}%`,
          background: "#f5f5f5",
          borderBottom: "1px solid #ddd",
          flexShrink: 0,
        }} />

        {/* Grid */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${LABEL_CONFIG.columns}, 1fr)`,
          gridTemplateRows: `repeat(${LABEL_CONFIG.rows}, 1fr)`,
          direction: "rtl",
        }}>
          {positions.map((posInPage) => {
            const globalPosition = pageStartPosition + posInPage - 1;
            const posData = filledPositions.get(globalPosition);
            const item = posData?.item;
            const itemIndex = posData?.index;

            const isSelected = itemIndex !== undefined && selectedItemIndex === itemIndex;
            const isEmptyAndSelecting = !item && selectedItemIndex !== null;

            return (
              <div
                key={posInPage}
                onClick={() => {
                  if (item && itemIndex !== undefined) {
                    // Click on item - select it for moving
                    setSelectedItemIndex(isSelected ? null : itemIndex);
                  } else if (selectedItemIndex !== null && !item) {
                    // Click on empty cell while item is selected - move it here
                    setItemPositions(prev => {
                      const newMap = new Map(prev);
                      newMap.set(selectedItemIndex, globalPosition);
                      return newMap;
                    });
                    setSelectedItemIndex(null);
                  }
                }}
                onMouseEnter={(e) => {
                  if (isEmptyAndSelecting) {
                    e.currentTarget.style.background = "#e8f5e9";
                    e.currentTarget.style.border = `2px dashed ${primaryColor}`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (isEmptyAndSelecting) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.border = "0.5px dashed #ddd";
                  }
                }}
                style={{
                  border: isSelected ? `3px solid #2196F3` : "0.5px dashed #ddd",
                  background: item ? (isSelected ? "#bbdefb" : getItemColors(item).bgColor) : "transparent",
                  cursor: item || isEmptyAndSelecting ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  padding: "1px",
                  transition: "all 0.15s ease",
                  boxShadow: isSelected ? "0 0 8px rgba(33, 150, 243, 0.5)" : "none",
                }}
                title={item
                  ? (isSelected ? (t("common.clickEmptyToMove") || "לחץ על משבצת ריקה להעברה") : (t("common.clickToMove") || "לחץ לבחירה והעברה"))
                  : (isEmptyAndSelecting ? (t("common.clickToPlaceHere") || "לחץ למיקום כאן") : `${t("common.position")} ${globalPosition}`)}
              >
                {item ? (
                  <div style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2px",
                    background: isSelected ? "#e3f2fd" : "white",
                    border: isSelected ? `2px solid #1976D2` : `2px solid ${getItemColors(item).borderColor}`,
                    boxSizing: "border-box",
                    borderRadius: "2px",
                    padding: "2px",
                  }}>
                    {/* Name - on top, larger */}
                    <div style={{
                      width: "100%",
                      fontSize: "10px",
                      fontWeight: "bold",
                      color: isSelected ? "#1565C0" : "#333",
                      textAlign: "center",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.2,
                    }}>
                      {item.name}
                    </div>
                    {/* QR placeholder - below, smaller */}
                    <div style={{
                      width: "16px",
                      height: "16px",
                      background: isSelected ? "#bbdefb" : "#f0f0f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isSelected ? "#1976D2" : "#999"} strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7"/>
                        <rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/>
                      </svg>
                    </div>
                    {/* Selection indicator */}
                    {isSelected && (
                      <div style={{
                        position: "absolute",
                        top: "2px",
                        right: "2px",
                        width: "12px",
                        height: "12px",
                        background: "#2196F3",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "8px",
                        fontWeight: "bold",
                      }}>
                        ✓
                      </div>
                    )}
                  </div>
                ) : (
                  isEmptyAndSelecting ? (
                    <span style={{ fontSize: "1.2rem", color: primaryColor }}>+</span>
                  ) : (
                    <span style={{ fontSize: "0.7rem", color: "#bbb" }}>
                      {globalPosition}
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom margin */}
        <div style={{
          height: `${marginPercentBottom}%`,
          background: "#f5f5f5",
          borderTop: "1px solid #ddd",
          flexShrink: 0,
        }} />
      </div>
    );
  };

  return (
    <div
      onClick={onClose}
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
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          borderRadius: "12px",
          padding: "20px",
          maxWidth: totalPages > 1 ? "95%" : "650px",
          width: "95%",
          maxHeight: "95vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px",
        }}>
          <h3 style={{ margin: 0, color: primaryColor, fontSize: "1.1rem" }}>
            {t("common.print")} ({totalItems})
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.3rem",
              cursor: "pointer",
              color: "#999",
              padding: "0 5px",
            }}
          >
            ×
          </button>
        </div>

        {/* Printer selection card - radio button style */}
        <div style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "15px",
          maxWidth: totalPages > 1 ? "350px" : "550px",
          margin: "0 auto 15px auto",
        }}>
          <div style={{
            fontSize: "0.9rem",
            fontWeight: 500,
            color: "#374151",
            marginBottom: "12px",
          }}>
            {t("common.selectPrinter") || "בחר מדפסת:"}
          </div>

          {loadingPrinters ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              color: "#6b7280",
            }}>
              <span>{t("common.loadingPrinters") || "טוען מדפסות..."}</span>
            </div>
          ) : printers.length === 0 ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              padding: "20px",
              color: "#ef4444",
            }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
              </svg>
              <span style={{ fontWeight: 600 }}>{t("common.noPrinters") || "לא נמצאו מדפסות"}</span>
              <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                {t("common.checkPrinterConnection") || "אנא וודא שהמדפסת מחוברת ומופעלת"}
              </span>
            </div>
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              maxHeight: "150px",
              overflowY: "auto",
            }}>
              {printers.map((printer) => (
                <div
                  key={printer.name}
                  onClick={() => handlePrinterChange(printer.name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: selectedPrinter === printer.name ? "2px solid #3b82f6" : "1px solid #e2e8f0",
                    background: selectedPrinter === printer.name ? "#eff6ff" : "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPrinter !== printer.name) {
                      e.currentTarget.style.background = "#f0f9ff";
                      e.currentTarget.style.borderColor = "#bfdbfe";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPrinter !== printer.name) {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.borderColor = "#e2e8f0";
                    }
                  }}
                >
                  {/* Radio circle */}
                  <div style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    border: selectedPrinter === printer.name ? "none" : "2px solid #d1d5db",
                    background: selectedPrinter === printer.name ? "#3b82f6" : "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {selectedPrinter === printer.name && (
                      <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </div>
                  {/* Printer name */}
                  <span style={{
                    color: "#000",
                    fontWeight: 600,
                    fontSize: "14px",
                    flex: 1,
                  }}>
                    {printer.name || (t("common.unknownPrinter") || "מדפסת ללא שם")}
                  </span>
                  {/* Default badge */}
                  {printer.is_default && (
                    <span style={{
                      fontSize: "0.75rem",
                      color: "#2563eb",
                      background: "#dbeafe",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      fontWeight: 500,
                    }}>
                      {t("common.default") || "ברירת מחדל"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action buttons row */}
        <div style={{
          display: "flex",
          gap: "10px",
          marginBottom: "15px",
          alignItems: "stretch",
          justifyContent: "center",
          maxWidth: totalPages > 1 ? "350px" : "550px",
          margin: "0 auto 15px auto",
        }}>
          {/* Print button */}
          <button
            onClick={() => onPrint(items, startPosition, selectedPrinter || undefined, itemPositions.size > 0 ? itemPositions : undefined)}
            disabled={loading || (printers.length > 0 && !selectedPrinter)}
            style={{
              flex: "0 0 auto",
              padding: "10px 20px",
              background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              fontSize: "0.95rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              opacity: loading ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? t("common.printing") : `🖨️ ${t("common.print")}`}
          </button>

          {/* Download PDF button */}
          <button
            onClick={() => onPrint(items, startPosition, "__PDF__", itemPositions.size > 0 ? itemPositions : undefined)}
            disabled={loading}
            style={{
              flex: "0 0 auto",
              padding: "10px 20px",
              background: `linear-gradient(135deg, ${secondaryColor} 0%, ${primaryColor} 100%)`,
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "bold",
              fontSize: "0.95rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              opacity: loading ? 0.7 : 1,
              whiteSpace: "nowrap",
            }}
          >
            📄 {t("common.downloadPdf") || "הורד PDF"}
          </button>

          {/* Load All button - toggles between loading all and reverting to initial */}
          {onLoadAll && (
            <button
              onClick={handleLoadAllToggle}
              disabled={loadingAll}
              style={{
                flex: "0 0 auto",
                padding: "10px 20px",
                background: "#607D8B",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: loadingAll ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: "0.95rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                opacity: loadingAll ? 0.7 : 1,
                whiteSpace: "nowrap",
              }}
            >
              {loadingAll ? "..." : allLoaded ? `↩️ ${t("common.cancel")}` : `📥 ${t("common.loadAll")}`}
            </button>
          )}
        </div>

        {/* Description with instruction */}
        <p style={{
          color: "#666",
          marginBottom: "10px",
          fontSize: "0.8rem",
          textAlign: "center",
        }}>
          {t("common.bulkPrint.description", { count: totalItems })}
          <br />
          <span style={{ color: primaryColor, fontWeight: "bold" }}>
            {t("common.clickToSelectPosition") || "לחץ על משבצת לבחירת מיקום התחלה"}
          </span>
        </p>

        {/* Pages preview */}
        <div style={{
          display: "flex",
          gap: "15px",
          justifyContent: totalPages === 1 ? "center" : "flex-start",
          overflowX: totalPages > 1 ? "auto" : "visible",
          paddingTop: totalPages > 1 ? "25px" : "5px",
          paddingBottom: "10px",
          direction: "ltr",
        }}>
          {Array.from({ length: totalPages }, (_, i) => renderPage(i + 1))}
        </div>

        {/* Info */}
        <div style={{
          textAlign: "center",
          fontSize: "0.75rem",
          color: "#888",
          marginTop: "5px",
        }}>
          {t("common.startingFrom")} {startPosition}
          {totalPages > 1 && ` • ${totalPages} ${t("common.pages")}`}
        </div>
      </div>
    </div>
  );
}

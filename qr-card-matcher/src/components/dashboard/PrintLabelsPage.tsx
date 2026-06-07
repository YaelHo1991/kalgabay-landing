import { useState, useEffect } from "react";
import {
  Member,
  Mitzva,
  getAllMembers,
  getAllMitzvot,
  getSetting,
  setSetting,
} from "../../database";
import { LABEL_CONFIG } from "../LabelPositionSelector";
import { PrintItem } from "../PrintPreviewModal";
import { generatePDF, generateServerPDF } from "../../utils/pdfGenerator";
import { generateQRDataUrl } from "../QRGenerator";
import "./PrintLabelsPage.css";

// Print mode types
type PrintMode = "members" | "mitzvot" | "combined" | "printer";

// Printer interface
interface Printer {
  name: string;
  is_default: boolean;
}

// Tauri invoke API - dynamically imported
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
let tauriApiLoaded = false;
let isAndroidPlatform = false;

// Load Tauri API (cached)
const loadTauriApi = async () => {
  if (tauriApiLoaded) return tauriInvoke !== null;
  try {
    const tauriModule = await import("@tauri-apps/api/core");
    tauriInvoke = tauriModule.invoke;
    tauriApiLoaded = true;

    // Check if running on Android
    try {
      const osModule = await import("@tauri-apps/plugin-os");
      const platform = await osModule.platform();
      isAndroidPlatform = platform === "android";
      console.log("Platform detected:", platform, "isAndroid:", isAndroidPlatform);
    } catch {
      // OS plugin not available, check user agent
      isAndroidPlatform = navigator.userAgent.toLowerCase().includes("android");
    }

    return true;
  } catch {
    console.log("Tauri API not available (running in browser)");
    tauriApiLoaded = true;
    return false;
  }
};

// Cache for data - persists across component remounts
let cachedMembers: Member[] | null = null;
let cachedMitzvot: Mitzva[] | null = null;
let cachedPrinters: Printer[] | null = null;

// Get printers using our custom Rust command (Windows only)
const getSystemPrinters = async (): Promise<Printer[]> => {
  if (!tauriInvoke) return [];
  // On Android, we don't enumerate printers - the system print dialog handles that
  if (isAndroidPlatform) {
    return [{ name: "Android Print", is_default: true }];
  }
  try {
    const printers = await tauriInvoke("get_system_printers") as Printer[];
    return printers;
  } catch (error) {
    console.error("Failed to get printers:", error);
    return [];
  }
};

// Print PDF on Android - use Web Share API to open PDF with print option
const printPdfOnAndroid = async (pdfBase64: string): Promise<boolean> => {
  try {
    console.log("Printing PDF on Android, data length:", pdfBase64.length);

    // Convert base64 to binary
    const byteCharacters = atob(pdfBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });

    // Create file for sharing
    const fileName = `מדבקות-${Date.now()}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    // Use Web Share API to open share dialog - user can choose PDF viewer or print app
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
      await navigator.share({
        files: [pdfFile],
        title: 'הדפסת מדבקות',
      });
      console.log("PDF shared successfully via Web Share API");
      return true;
    }

    // Fallback: Create object URL and open in new tab
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, '_blank');

    // Clean up after a delay
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  } catch (error: unknown) {
    console.error("Android print error:", error);

    // If user cancelled the share, don't show error
    if (error instanceof Error && error.name === 'AbortError') {
      return false;
    }

    let errorMsg = "שגיאה לא ידועה";
    if (error instanceof Error) {
      errorMsg = error.message;
    }

    alert(`שגיאת הדפסה: ${errorMsg}`);
    return false;
  }
};

// SVG Icons
const MembersIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
  </svg>
);

const MitzvotIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);

const CombinedIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
  </svg>
);

const PrintIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
  </svg>
);

const MemoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
  </svg>
);

const QRIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
  </svg>
);

interface PrintLabelsPageProps {
  onPrint: (items: PrintItem[], startPosition: number, printerName?: string, customPositions?: Map<number, number>) => void;
  loading?: boolean;
}

export function PrintLabelsPage({ onPrint, loading = false }: PrintLabelsPageProps) {
  const [printMode, setPrintMode] = useState<PrintMode>("members");
  const [members, setMembers] = useState<Member[]>([]);
  const [mitzvot, setMitzvot] = useState<Mitzva[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());
  const [selectedMitzvot, setSelectedMitzvot] = useState<Set<number>>(new Set());
  const [lastPrintPosition, setLastPrintPosition] = useState<number>(0);
  const [startPosition, setStartPosition] = useState<number>(1);
  const [dataLoading, setDataLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Printer state
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [printerApiAvailable, setPrinterApiAvailable] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  // Custom positions for labels - allows moving individual labels
  const [customPositions, setCustomPositions] = useState<Map<number, number>>(new Map());
  // Selected label for moving
  const [selectedLabelIndex, setSelectedLabelIndex] = useState<number | null>(null);

  // Load data on mount - use cache for instant display
  useEffect(() => {
    const loadData = async () => {
      console.log("PrintLabelsPage: loadData called, cachedMembers:", cachedMembers?.length, "cachedMitzvot:", cachedMitzvot?.length);

      // If we have cached data, use it immediately (no loading state)
      if (cachedMembers && cachedMitzvot) {
        console.log("PrintLabelsPage: Using cached data");
        setMembers(cachedMembers);
        setMitzvot(cachedMitzvot);
        setDataLoading(false);

        // Still load settings and refresh data in background
        const lastPos = await getSetting("lastPrintPosition");
        if (lastPos) {
          const pos = parseInt(lastPos, 10);
          // If we've filled a full page, reset to start fresh and save to DB
          if (pos >= LABEL_CONFIG.totalLabels) {
            setSetting("lastPrintPosition", "0");
            setLastPrintPosition(0);
            setStartPosition(1);
          } else {
            setLastPrintPosition(pos);
            setStartPosition(pos + 1);
          }
        }

        // Refresh cache in background
        Promise.all([getAllMembers(), getAllMitzvot()]).then(([m, mt]) => {
          cachedMembers = m;
          cachedMitzvot = mt;
          setMembers(m);
          setMitzvot(mt);
        });
        return;
      }

      // First load - show loading state
      console.log("PrintLabelsPage: First load, fetching data from database");
      setDataLoading(true);
      try {
        const [allMembers, allMitzvot] = await Promise.all([
          getAllMembers(),
          getAllMitzvot(),
        ]);
        console.log("PrintLabelsPage: Loaded members:", allMembers.length, "mitzvot:", allMitzvot.length);
        // Update cache
        cachedMembers = allMembers;
        cachedMitzvot = allMitzvot;
        setMembers(allMembers);
        setMitzvot(allMitzvot);

        // Load last print position from settings
        const lastPos = await getSetting("lastPrintPosition");
        if (lastPos) {
          const pos = parseInt(lastPos, 10);
          // If we've filled a full page, reset to start fresh and save to DB
          if (pos >= LABEL_CONFIG.totalLabels) {
            setSetting("lastPrintPosition", "0");
            setLastPrintPosition(0);
            setStartPosition(1);
          } else {
            setLastPrintPosition(pos);
            setStartPosition(pos + 1);
          }
        }
      } catch (error) {
        console.error("Error loading data:", error);
      }
      setDataLoading(false);
    };
    loadData();
  }, []);

  // Load printers on mount - use cache for instant display
  useEffect(() => {
    const initPrinters = async () => {
      // Use cached printers if available
      if (cachedPrinters !== null && tauriApiLoaded) {
        setPrinters(cachedPrinters);
        setPrinterApiAvailable(tauriInvoke !== null);
        setLoadingPrinters(false);

        // Select saved or default printer
        const savedPrinter = localStorage.getItem("selectedPrinter");
        if (savedPrinter && cachedPrinters.some(p => p.name === savedPrinter)) {
          setSelectedPrinter(savedPrinter);
        } else {
          const defaultPrinter = cachedPrinters.find(p => p.is_default);
          if (defaultPrinter) {
            setSelectedPrinter(defaultPrinter.name);
          } else if (cachedPrinters.length > 0) {
            setSelectedPrinter(cachedPrinters[0].name);
          }
        }
        return;
      }

      setLoadingPrinters(true);
      const available = await loadTauriApi();
      setPrinterApiAvailable(available);
      setIsAndroid(isAndroidPlatform);

      if (available) {
        try {
          const printerList = await getSystemPrinters();
          console.log("System printers:", printerList);
          cachedPrinters = printerList;
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
          cachedPrinters = [];
        }
      } else {
        cachedPrinters = [];
      }
      setLoadingPrinters(false);
    };

    initPrinters();
  }, []);

  // Calculate how many items can fit
  const availableSlots = LABEL_CONFIG.totalLabels - lastPrintPosition;

  // Build print items based on mode
  const buildPrintItems = (): PrintItem[] => {
    const items: PrintItem[] = [];

    switch (printMode) {
      case "members":
        members
          .filter(m => selectedMembers.has(m.id))
          .forEach((m) => {
            items.push({
              id: m.id,
              name: `${m.first_name} ${m.last_name}`,
              code: m.code,
              serialNumber: m.id, // Use database ID
              isMitzva: false,
            });
          });
        break;

      case "mitzvot":
        mitzvot
          .filter(m => selectedMitzvot.has(m.id))
          .forEach((m) => {
            items.push({
              id: m.id,
              name: m.name,
              code: m.code,
              serialNumber: m.id, // Use database ID
              isMitzva: true,
            });
          });
        break;

      case "combined":
      case "printer":
        // First add selected members
        members
          .filter(m => selectedMembers.has(m.id))
          .forEach((m) => {
            items.push({
              id: m.id,
              name: `${m.first_name} ${m.last_name}`,
              code: m.code,
              serialNumber: m.id, // Use database ID
              isMitzva: false,
            });
          });
        // Then add selected mitzvot
        mitzvot
          .filter(m => selectedMitzvot.has(m.id))
          .forEach((m) => {
            items.push({
              id: m.id,
              name: m.name,
              code: m.code,
              serialNumber: m.id, // Use database ID
              isMitzva: true,
            });
          });
        break;
    }

    return items;
  };

  // Handle print button - send directly to print without modal
  const handleStartPrint = async () => {
    const items = buildPrintItems();
    if (items.length === 0) return;

    // Calculate last position
    const lastPos = calculateLastPosition();

    // On Android, use the Android print plugin
    if (isAndroid) {
      setPdfLoading(true);
      try {
        // Generate QR codes for all items
        const labelItems = await Promise.all(
          items.map(async (item) => ({
            name: item.name,
            qrDataUrl: await generateQRDataUrl(item.code, 200),
            serialNumber: item.serialNumber,
            isMitzva: item.isMitzva,
          }))
        );

        // Determine type based on print mode
        const pdfType = printMode === "mitzvot" ? "mitzvot" :
                        printMode === "combined" ? "combined" : "members";

        // Generate PDF using server (ensures 100% match with desktop)
        const pdfBlob = await generateServerPDF(labelItems, startPosition, pdfType, customPositions);

        if (pdfBlob) {
          // Convert blob to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              // Remove the data URL prefix (data:application/pdf;base64,)
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(pdfBlob);

          const base64Data = await base64Promise;
          const success = await printPdfOnAndroid(base64Data);

          if (success) {
            // Update position only on successful print
            if (lastPos >= LABEL_CONFIG.totalLabels) {
              await setSetting("lastPrintPosition", "0");
              setLastPrintPosition(0);
              setStartPosition(1);
            } else {
              await setSetting("lastPrintPosition", lastPos.toString());
              setLastPrintPosition(lastPos);
              setStartPosition(lastPos + 1);
            }
            setCustomPositions(new Map());
            setSelectedLabelIndex(null);
          }
        }
      } catch (error) {
        console.error("Error printing on Android:", error);
      } finally {
        setPdfLoading(false);
      }
      return;
    }

    // On desktop, send directly to print with selected printer
    onPrint(items, startPosition, selectedPrinter || undefined, customPositions);

    // Reset for next batch - if we've filled a page, start fresh
    if (lastPos >= LABEL_CONFIG.totalLabels) {
      await setSetting("lastPrintPosition", "0");
      setLastPrintPosition(0);
      setStartPosition(1);
    } else {
      await setSetting("lastPrintPosition", lastPos.toString());
      setLastPrintPosition(lastPos);
      setStartPosition(lastPos + 1);
    }
    setCustomPositions(new Map());
    setSelectedLabelIndex(null);
  };

  // Handle printer selection change
  const handlePrinterChange = (printerName: string) => {
    setSelectedPrinter(printerName);
    localStorage.setItem("selectedPrinter", printerName);
  };

  // Check if printer is available for printing
  // On Android, always allow printing (system print dialog handles printer selection)
  const isPrinterAvailable = isAndroid || (printerApiAvailable && printers.length > 0 && selectedPrinter);

  // Calculate the last position based on items and custom positions
  const calculateLastPosition = (): number => {
    const items = buildPrintItems();
    if (items.length === 0) return lastPrintPosition;

    if (customPositions.size > 0) {
      const allPositions = items.map((_, idx) => customPositions.get(idx) ?? (startPosition + idx));
      return Math.max(...allPositions);
    }
    return startPosition + items.length - 1;
  };

  // Handle PDF download
  const handleDownloadPdf = async () => {
    const items = buildPrintItems();
    if (items.length === 0) return;

    setPdfLoading(true);
    try {
      // Generate QR codes for all items
      const labelItems = await Promise.all(
        items.map(async (item) => ({
          name: item.name,
          qrDataUrl: await generateQRDataUrl(item.code, 200),
          serialNumber: item.serialNumber,
          isMitzva: item.isMitzva,
        }))
      );

      // Determine type based on print mode
      const pdfType = printMode === "mitzvot" ? "mitzvot" :
                      printMode === "combined" ? "combined" : "members";

      // On Android: use server-based PDF generation (100% match with desktop)
      if (isAndroid) {
        console.log('[PDF] Android detected, using server-based PDF generation...');
        console.log('[PDF] tauriInvoke available:', !!tauriInvoke);
        const pdfBlob = await generateServerPDF(labelItems, startPosition, pdfType, customPositions);
        console.log('[PDF] Blob generated:', pdfBlob ? `${pdfBlob.size} bytes` : 'null');

        if (pdfBlob && tauriInvoke) {
          const fileName = `labels-${Date.now()}.pdf`;
          console.log('[PDF] Converting to base64...');

          // Convert blob to base64
          const arrayBuffer = await pdfBlob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          console.log('[PDF] Base64 length:', base64.length);

          // Call Rust function to save and open PDF
          try {
            console.log('[PDF] Calling save_and_open_pdf...');
            const result = await tauriInvoke('save_and_open_pdf', {
              pdfBase64: base64,
              fileName: fileName
            });
            console.log('[PDF] Result:', result);
          } catch (openError) {
            console.error('[PDF] Failed to open PDF:', openError);
            // Fallback: try Web Share API
            try {
              console.log('[PDF] Trying Web Share API fallback...');
              const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
              if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                await navigator.share({
                  files: [pdfFile],
                  title: 'מדבקות קלגבאי',
                });
              } else {
                console.log('[PDF] Web Share API not available');
              }
            } catch (shareError) {
              console.log('[PDF] Share API also failed:', shareError);
            }
          }
        } else {
          console.log('[PDF] Missing blob or tauriInvoke');
        }
      } else {
        // On desktop: download normally
        await generatePDF(labelItems, startPosition, pdfType, customPositions);
      }

      // Save last position - same as print
      const lastPos = calculateLastPosition();

      // Reset for next batch - if we've filled a page, start fresh
      if (lastPos >= LABEL_CONFIG.totalLabels) {
        await setSetting("lastPrintPosition", "0");
        setLastPrintPosition(0);
        setStartPosition(1);
      } else {
        await setSetting("lastPrintPosition", lastPos.toString());
        setLastPrintPosition(lastPos);
        setStartPosition(lastPos + 1);
      }

      // Clear selections
      setCustomPositions(new Map());
      setSelectedLabelIndex(null);
    } catch (error) {
      console.error("Error generating PDF:", error);
    } finally {
      setPdfLoading(false);
    }
  };

  // Select all members
  const selectAllMembers = () => {
    setSelectedMembers(new Set(members.map(m => m.id)));
  };

  // Select all mitzvot
  const selectAllMitzvot = () => {
    setSelectedMitzvot(new Set(mitzvot.map(m => m.id)));
  };

  // Toggle member selection
  const toggleMember = (id: number) => {
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Reset custom positions when selection changes
    setCustomPositions(new Map());
    setSelectedLabelIndex(null);
  };

  // Toggle mitzva selection
  const toggleMitzva = (id: number) => {
    setSelectedMitzvot(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Reset custom positions when selection changes
    setCustomPositions(new Map());
    setSelectedLabelIndex(null);
  };

  // Reset page (start fresh)
  const resetPage = async () => {
    await setSetting("lastPrintPosition", "0");
    setLastPrintPosition(0);
    setStartPosition(1);
  };

  // Get count of selected items
  const getSelectedCount = (): number => {
    switch (printMode) {
      case "members":
        return selectedMembers.size;
      case "mitzvot":
        return selectedMitzvot.size;
      case "combined":
      case "printer":
        return selectedMembers.size + selectedMitzvot.size;
      default:
        return 0;
    }
  };

  // Get preview items for A4 display - build print items for current selection
  const getPreviewItems = (): PrintItem[] => {
    return buildPrintItems();
  };

  // Get item at a specific position for preview (supports custom positions)
  const getItemAtPosition = (position: number): { item: PrintItem; index: number } | null => {
    const items = getPreviewItems();

    // Check if any item has a custom position at this location
    for (let i = 0; i < items.length; i++) {
      const customPos = customPositions.get(i);
      if (customPos === position) {
        return { item: items[i], index: i };
      }
    }

    // If no custom position, calculate default position
    for (let i = 0; i < items.length; i++) {
      // Skip items that have custom positions
      if (customPositions.has(i)) continue;

      const defaultPos = startPosition + i;
      if (defaultPos === position) {
        return { item: items[i], index: i };
      }
    }

    return null;
  };

  // Handle cell click - either select a label or move selected label
  const handleCellClick = (position: number, isUsed: boolean) => {
    if (isUsed) return;

    const itemAtPos = getItemAtPosition(position);

    if (selectedLabelIndex !== null) {
      // We have a selected label - move it to this position
      if (!itemAtPos) {
        // Empty cell - move the selected label here
        setCustomPositions(prev => {
          const next = new Map(prev);
          next.set(selectedLabelIndex, position);
          return next;
        });
      }
      setSelectedLabelIndex(null);
    } else if (itemAtPos) {
      // Click on a label - select it for moving
      setSelectedLabelIndex(itemAtPos.index);
    }
  };

  if (dataLoading) {
    return (
      <div className="print-labels-page">
        <div className="print-loading">טוען נתונים...</div>
      </div>
    );
  }

  return (
    <div className={`print-labels-page ${!isAndroid ? 'desktop' : ''}`}>
      {/* Header */}
      <header className="print-header">
        <div className="print-header-content">
          <div className="print-header-icon">
            <PrintIcon />
          </div>
          <div>
            <h1 className="print-header-title">הדפסת מדבקות QR</h1>
            <p className="print-header-subtitle">
              בחר סוג הדפסה והגדר את המיקומים על דף המדבקות
            </p>
          </div>
        </div>
      </header>

      {/* Mode Selection - Hidden on Android (printing not yet supported) */}
      {!isAndroid && (
      <div className="mode-selection">
        <div className="mode-cards">
          <button
            className={`mode-card ${printMode === "members" ? "active" : ""}`}
            onClick={() => setPrintMode("members")}
          >
            <div className="mode-card-icon members">
              <MembersIcon />
            </div>
            <div className="mode-card-content">
              <span className="mode-card-title">מתפללים</span>
              <span className="mode-card-count">{members.length} רשומים</span>
            </div>
          </button>

          <button
            className={`mode-card ${printMode === "mitzvot" ? "active" : ""}`}
            onClick={() => setPrintMode("mitzvot")}
          >
            <div className="mode-card-icon mitzvot">
              <MitzvotIcon />
            </div>
            <div className="mode-card-content">
              <span className="mode-card-title">מצוות</span>
              <span className="mode-card-count">{mitzvot.length} מצוות</span>
            </div>
          </button>

          <button
            className={`mode-card ${printMode === "combined" ? "active" : ""}`}
            onClick={() => setPrintMode("combined")}
          >
            <div className="mode-card-icon combined">
              <CombinedIcon />
            </div>
            <div className="mode-card-content">
              <span className="mode-card-title">משולב</span>
              <span className="mode-card-count">מתפללים + מצוות</span>
            </div>
          </button>

          <button
            className={`mode-card ${printMode === "printer" ? "active" : ""}`}
            onClick={() => setPrintMode("printer")}
          >
            <div className="mode-card-icon custom">
              <PrintIcon />
            </div>
            <div className="mode-card-content">
              <span className="mode-card-title">הגדרות מדפסת</span>
              <span className="mode-card-count" style={{ fontSize: selectedPrinter && selectedPrinter.length > 15 ? "0.7rem" : "0.8rem" }}>
                {loadingPrinters ? "טוען..." :
                 printers.length === 0 ? "לא נמצאו מדפסות" :
                 selectedPrinter || "בחר מדפסת"}
              </span>
            </div>
          </button>
        </div>
      </div>
      )}

      {/* Content Layout */}
      <div className="print-content-layout">
        {/* Left: A4 Page Preview */}
        <div className="page-preview-section">
          <div className="page-preview-header">
            <div className="page-preview-title-row">
              <h3>תצוגת דף מדבקות (A4)</h3>
              <div className="page-info">
                <span>{lastPrintPosition} תאים נוצלו</span>
                <span>•</span>
                <span>{availableSlots} פנויים</span>
                <button className="reset-page-btn" onClick={resetPage}>
                  התחל דף חדש
                </button>
              </div>
            </div>
            <div className="page-legend">
              <span className="legend-item">
                <span className="legend-dot used"></span>
                נוצל
              </span>
              <span className="legend-item">
                <span className="legend-dot available"></span>
                פנוי
              </span>
              <span className="legend-item">
                <span className="legend-dot start"></span>
                התחלה
              </span>
            </div>
          </div>

          <div className="a4-pages-container">
            {(() => {
              // Calculate how many pages are needed
              const items = getPreviewItems();
              const totalItems = items.length;

              // Find the highest position (either custom or default)
              let maxPosition = startPosition + totalItems - 1;
              if (customPositions.size > 0) {
                const customMax = Math.max(...Array.from(customPositions.values()));
                maxPosition = Math.max(maxPosition, customMax);
              }

              // Calculate number of pages needed
              const labelsPerPage = LABEL_CONFIG.totalLabels;
              const numPages = Math.max(1, Math.ceil(maxPosition / labelsPerPage));

              return Array.from({ length: numPages }, (_, pageIndex) => {
                const pageNumber = pageIndex + 1;
                const pageStartPos = pageIndex * labelsPerPage + 1;

                return (
                  <div key={pageIndex} className="a4-page-wrapper">
                    {numPages > 1 && (
                      <div className="page-number-label">עמוד {pageNumber} מתוך {numPages}</div>
                    )}
                    <div className="a4-page">
                      <div className="label-grid">
                        {Array.from({ length: LABEL_CONFIG.totalLabels }, (_, i) => {
                          const pos = pageStartPos + i;
                          const isUsed = pos <= lastPrintPosition; // תאים שנוצלו הם רק אלה שהודפסו בפועל
                          const itemData = getItemAtPosition(pos);
                          const hasItem = itemData !== null;
                          const isSelected = hasItem && selectedLabelIndex === itemData.index;

                          return (
                            <div
                              key={pos}
                              className={`label-cell ${isUsed ? "used" : ""} ${hasItem ? "has-item" : ""} ${isSelected ? "selected-for-move" : ""}`}
                              onClick={() => handleCellClick(pos, isUsed)}
                              title={isUsed ? "תא נוצל" : hasItem ? `${itemData.item.name} - לחץ להזיז` : selectedLabelIndex !== null ? "לחץ להעביר לכאן" : `תא ${pos}`}
                            >
                              {isUsed ? (
                                <div className="label-used-mark">
                                  <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                  </svg>
                                </div>
                              ) : hasItem ? (
                                <div className={`label-content ${itemData.item.isMitzva ? "mitzva" : "member"}`}>
                                  {/* Name frame with decorations - matching print output */}
                                  <div className="label-name-frame">
                                    <span className="label-decor">{itemData.item.isMitzva ? "✡" : "●"}</span>
                                    <div className="label-name">{itemData.item.name}</div>
                                    <span className="label-decor">{itemData.item.isMitzva ? "✡" : "●"}</span>
                                  </div>
                                  {/* QR code at bottom */}
                                  <div className="label-qr">
                                    <QRIcon />
                                  </div>
                                </div>
                              ) : (
                                <span className="label-number">{pos}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* Right: Selection Panel */}
        <div className="selection-panel">
          {/* Memory Card */}
          {lastPrintPosition > 0 && (
            <div className="memory-card">
              <div className="memory-header">
                <span className="memory-icon">
                  <MemoryIcon />
                </span>
                <div>
                  <span className="memory-title">זיכרון מיקומים</span>
                  <span className="memory-subtitle">המשך מההדפסה האחרונה</span>
                </div>
              </div>
              <div className="memory-info">
                <div className="memory-row">
                  <span>מיקום אחרון:</span>
                  <strong>תא {lastPrintPosition}</strong>
                </div>
                <div className="memory-row">
                  <span>פנויים בדף:</span>
                  <strong>{availableSlots} מדבקות</strong>
                </div>
              </div>
              <button
                className="memory-continue-btn"
                onClick={() => setStartPosition(lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1)}
              >
                המשך מתא {lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1}
              </button>
            </div>
          )}

          {/* Items Selection based on mode */}
          {(printMode === "members" || printMode === "combined") && (
            <div className="selection-card">
              <div className="selection-card-header">
                <h4>מתפללים ({selectedMembers.size}/{members.length})</h4>
                <div className="selection-actions">
                  <button onClick={selectAllMembers}>בחר הכל</button>
                  <button onClick={() => setSelectedMembers(new Set())}>נקה</button>
                </div>
              </div>
              <div className="items-list">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className={`item-row ${selectedMembers.has(member.id) ? "selected" : ""}`}
                    onClick={() => toggleMember(member.id)}
                  >
                    <div className="item-checkbox">
                      {selectedMembers.has(member.id) && "✓"}
                    </div>
                    <div className="item-info">
                      <span className="item-name">{member.first_name} {member.last_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(printMode === "mitzvot" || printMode === "combined") && (
            <div className="selection-card">
              <div className="selection-card-header">
                <h4>מצוות ({selectedMitzvot.size}/{mitzvot.length})</h4>
                <div className="selection-actions">
                  <button onClick={selectAllMitzvot}>בחר הכל</button>
                  <button onClick={() => setSelectedMitzvot(new Set())}>נקה</button>
                </div>
              </div>
              <div className="items-list">
                {mitzvot.map((mitzva) => (
                  <div
                    key={mitzva.id}
                    className={`item-row ${selectedMitzvot.has(mitzva.id) ? "selected" : ""}`}
                    onClick={() => toggleMitzva(mitzva.id)}
                  >
                    <div className="item-checkbox">
                      {selectedMitzvot.has(mitzva.id) && "✓"}
                    </div>
                    <div className="item-info">
                      <span className="item-name">{mitzva.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {printMode === "printer" && (
            <div className="custom-settings-card printer-settings">
              <h4>הגדרות מדפסת</h4>

              {loadingPrinters ? (
                <div className="printer-loading">
                  <span>טוען מדפסות...</span>
                </div>
              ) : printers.length === 0 ? (
                <div className="no-printer-warning">
                  <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                  </svg>
                  <span className="warning-title">לא נמצאו מדפסות</span>
                  <span className="warning-text">אנא וודא שהמדפסת מחוברת ומופעלת</span>
                </div>
              ) : (
                <>
                  <div className="printer-select-label">בחר מדפסת:</div>
                  <div className="printer-list">
                    {printers.map((printer) => (
                      <div
                        key={printer.name}
                        className={`printer-item ${selectedPrinter === printer.name ? "selected" : ""}`}
                        onClick={() => handlePrinterChange(printer.name)}
                        style={{ color: '#000' }}
                      >
                        <div className="printer-radio">
                          {selectedPrinter === printer.name && "✓"}
                        </div>
                        <span style={{ color: '#000', fontWeight: 600, fontSize: '14px', flex: 1 }}>{printer.name || "מדפסת ללא שם"}</span>
                        {printer.is_default && <span className="printer-default">ברירת מחדל</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer with print button */}
      <footer className="print-footer">
        <div className="print-summary">
          <span className="summary-count">{getSelectedCount()}</span>
          <span className="summary-text">פריטים נבחרו להדפסה</span>
          <span className="summary-position">
            מתא {startPosition} עד {Math.min(startPosition + getSelectedCount() - 1, LABEL_CONFIG.totalLabels)}
          </span>
        </div>
        <div className="print-actions">
          <button
            className="footer-btn outline"
            onClick={handleDownloadPdf}
            disabled={getSelectedCount() === 0 || pdfLoading || loading}
          >
            <span className={`btn-icon download-icon ${pdfLoading ? "downloading" : ""}`}>
              <DownloadIcon />
            </span>
            {pdfLoading ? "מוריד..." : "הורד כ-PDF"}
          </button>
          <button
            className={`footer-btn filled ${loading ? "printing" : ""}`}
            onClick={handleStartPrint}
            disabled={getSelectedCount() === 0 || loading || pdfLoading || !isPrinterAvailable}
            title={!isPrinterAvailable ? "לא נמצאה מדפסת מחוברת" : ""}
          >
            {loading && (
              <span className="btn-spinner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
              </span>
            )}
            {loading || pdfLoading ? "מדפיס..." : !isPrinterAvailable ? "אין מדפסת" : "הדפס"}
          </button>
        </div>
      </footer>

    </div>
  );
}

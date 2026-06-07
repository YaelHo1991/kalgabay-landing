import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Mitzva,
  getAllMitzvot,
  getNextAvailableMitzvaCode,
  getSetting,
  setSetting,
} from "../../database";
import {
  createMitzvaSync,
  updateMitzvaSync,
  deleteMitzvaSync,
} from "../../hooks/useSync";
import { generateQRDataUrl } from "../QRGenerator";
import { LABEL_CONFIG } from "../LabelPositionSelector";
import { generatePDF } from "../../utils/pdfGenerator";
import { exportMitzvotToExcel, importMitzvotFromExcel } from "../../services/excelService";
import "./MitzvotPage.css";

// Check if running on Android
const isAndroidDevice = navigator.userAgent.toLowerCase().includes('android');

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

// Interface for multi-item creation
interface MitzvaFormItem {
  id: string;
  name: string;
  notes: string;
}

// SVG Icons
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
  </svg>
);

const PrintIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
  </svg>
);

const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
  </svg>
);

const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 14h4v-4H4v4zm0 5h4v-4H4v4zM4 9h4V5H4v4zm5 5h12v-4H9v4zm0 5h12v-4H9v4zM9 5v4h12V5H9z"/>
  </svg>
);

const FilterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
  </svg>
);

const ImportIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
  </svg>
);

const ExportIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
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

// Mitzva page icon
const MitzvaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3zm-1.06 13.54L7.4 12l1.41-1.41 2.12 2.12 4.24-4.24 1.41 1.41-5.64 5.66z"/>
  </svg>
);

type ViewMode = "grid" | "list";

export function MitzvotPage() {
  const { t } = useTranslation();
  const [mitzvot, setMitzvot] = useState<Mitzva[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filter, setFilter] = useState<"all" | "regular" | "holidays">("all");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMitzva, setSelectedMitzva] = useState<Mitzva | null>(null);

  // Form fields for single edit
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [availableOnHolidays, setAvailableOnHolidays] = useState(true);
  const [holidaysOnly, setHolidaysOnly] = useState(false);

  // Multi-item creation form
  const [formItems, setFormItems] = useState<MitzvaFormItem[]>([
    { id: crypto.randomUUID(), name: "", notes: "" }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const lastInputRef = useRef<HTMLInputElement>(null);

  // Print position modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printTarget, setPrintTarget] = useState<Mitzva | null>(null);
  const [selectedPrintPosition, setSelectedPrintPosition] = useState(1);
  const [lastPrintPosition, setLastPrintPosition] = useState(0);

  // Delete confirmation (inline on card)
  const [deletingMitzvaId, setDeletingMitzvaId] = useState<number | null>(null);

  // Printer state
  const [printerApiAvailable, setPrinterApiAvailable] = useState(false);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [loadingPrinters, setLoadingPrinters] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Import/Export state
  const [isExporting, setIsExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{name: string; price?: number; notes?: string; availableOnHolidays: boolean; holidaysOnly: boolean}>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMitzvot = async () => {
    setLoading(true);
    try {
      const data = await getAllMitzvot();
      // Filter by search
      const filtered = searchQuery
        ? data.filter(m => m.name.includes(searchQuery))
        : data;
      setMitzvot(filtered);
    } catch (error) {
      console.error("Error loading mitzvot:", error);
    }
    setLoading(false);
  };

  // Load last print position on mount
  useEffect(() => {
    const loadLastPosition = async () => {
      try {
        const lastPos = await getSetting("lastPrintPosition");
        if (lastPos) {
          const pos = parseInt(lastPos, 10);
          setLastPrintPosition(pos);
        }
      } catch (error) {
        console.error("Error loading last print position:", error);
      }
    };
    loadLastPosition();
  }, []);

  // Load printer API and check for saved printer
  useEffect(() => {
    const initPrinters = async () => {
      setLoadingPrinters(true);
      const available = await loadTauriApi();
      setPrinterApiAvailable(available);

      if (available) {
        try {
          const printerList = await getSystemPrinters();
          setPrinters(printerList);

          // Check for saved printer in localStorage
          const savedPrinter = localStorage.getItem("selectedPrinter");
          if (savedPrinter && printerList.some(p => p.name === savedPrinter)) {
            setSelectedPrinter(savedPrinter);
          } else {
            // Use default printer
            const defaultPrinter = printerList.find(p => p.is_default);
            if (defaultPrinter) {
              setSelectedPrinter(defaultPrinter.name);
            } else if (printerList.length > 0) {
              setSelectedPrinter(printerList[0].name);
            }
          }
        } catch (err) {
          console.error("Failed to load printers:", err);
        }
      }
      setLoadingPrinters(false);
    };
    initPrinters();
  }, []);

  useEffect(() => {
    loadMitzvot();
  }, [searchQuery]);

  const resetForm = () => {
    setName("");
    setNotes("");
    setAvailableOnHolidays(true);
    setHolidaysOnly(false);
    setFormItems([{ id: crypto.randomUUID(), name: "", notes: "" }]);
    setIsCreating(false);
  };

  // Update a form item
  const updateFormItem = (id: string, field: keyof MitzvaFormItem, value: string) => {
    setFormItems(items =>
      items.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Add new empty form item
  const addFormItem = () => {
    setFormItems(items => [...items, { id: crypto.randomUUID(), name: "", notes: "" }]);
    // Focus the new input after render
    setTimeout(() => lastInputRef.current?.focus(), 50);
  };

  // Remove a form item
  const removeFormItem = (id: string) => {
    if (formItems.length <= 1) return;
    setFormItems(items => items.filter(item => item.id !== id));
  };

  // Handle Enter key to add new item
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, itemId: string, field: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const currentIndex = formItems.findIndex(item => item.id === itemId);
      const isLastItem = currentIndex === formItems.length - 1;

      if (isLastItem && field === "name" && formItems[currentIndex].name.trim()) {
        addFormItem();
      }
    }
  };

  const handleCreate = async () => {
    // Filter out empty items
    const validItems = formItems.filter(item => item.name.trim());

    if (validItems.length === 0) {
      alert(t("mitzvot.messages.enterName"));
      return;
    }

    setIsCreating(true);

    try {
      // Create each mitzva with auto-generated code
      for (const item of validItems) {
        const code = await getNextAvailableMitzvaCode();
        await createMitzvaSync(
          item.name.trim(),
          0,
          item.notes.trim() || undefined,
          true,
          false,
          code
        );
      }
      await loadMitzvot();
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error("Error creating mitzvot:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedMitzva || !name.trim()) {
      alert(t("mitzvot.messages.enterName"));
      return;
    }

    try {
      await updateMitzvaSync(
        selectedMitzva.id,
        name.trim(),
        selectedMitzva.price,
        notes.trim() || undefined,
        availableOnHolidays,
        holidaysOnly
      );
      await loadMitzvot();
      setShowEditModal(false);
      setSelectedMitzva(null);
      resetForm();
    } catch (error) {
      console.error("Error updating mitzva:", error);
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeletingMitzvaId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deletingMitzvaId === null) return;
    try {
      await deleteMitzvaSync(deletingMitzvaId);
      await loadMitzvot();
    } catch (error) {
      console.error("Error deleting mitzva:", error);
    } finally {
      setDeletingMitzvaId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeletingMitzvaId(null);
  };

  // Export mitzvot to Excel
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Simulate animation delay for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
      await exportMitzvotToExcel(mitzvot);
      // Show success briefly
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error("Error exporting mitzvot:", error);
      alert(t("common.error") + ": " + error);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleFileSelect = async (file: File) => {
    try {
      const data = await importMitzvotFromExcel(file);
      setImportPreview(data);
    } catch (error) {
      console.error("Error reading Excel file:", error);
      alert(t("mitzvot.import.error") || "שגיאה בקריאת קובץ האקסל");
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      handleFileSelect(file);
    }
  };

  // Execute the import
  const executeImport = async () => {
    if (importPreview.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      for (let i = 0; i < importPreview.length; i++) {
        const mitzva = importPreview[i];
        const code = await getNextAvailableMitzvaCode();
        await createMitzvaSync(
          mitzva.name,
          mitzva.price || 0,
          mitzva.notes,
          mitzva.availableOnHolidays,
          mitzva.holidaysOnly,
          code
        );
        setImportProgress(Math.round(((i + 1) / importPreview.length) * 100));
      }
      setImportComplete(true);
      await loadMitzvot();
    } catch (error) {
      console.error("Error importing mitzvot:", error);
      alert(t("common.error") + ": " + error);
    } finally {
      setIsImporting(false);
    }
  };

  // Close import modal
  const closeImportModal = () => {
    setShowImportModal(false);
    setImportPreview([]);
    setImportProgress(0);
    setImportComplete(false);
    setIsImporting(false);
  };

  const openEditModal = (mitzva: Mitzva) => {
    setSelectedMitzva(mitzva);
    setName(mitzva.name);
    setNotes(mitzva.notes || "");
    setAvailableOnHolidays(mitzva.available_on_holidays === 1);
    setHolidaysOnly(mitzva.holidays_only === 1);
    setShowEditModal(true);
  };

  const handlePrint = (mitzva: Mitzva) => {
    setPrintTarget(mitzva);
    // Set position based on last used position + 1
    const nextPosition = lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1;
    setSelectedPrintPosition(nextPosition);
    setShowPrintModal(true);
  };

  // Calculate available slots
  const availableSlots = LABEL_CONFIG.totalLabels - lastPrintPosition;

  // Handle printer change
  const handlePrinterChange = (printerName: string) => {
    setSelectedPrinter(printerName);
    localStorage.setItem("selectedPrinter", printerName);
  };

  // Reset print page
  const resetPrintPage = async () => {
    await setSetting("lastPrintPosition", "0");
    setLastPrintPosition(0);
    setSelectedPrintPosition(1);
  };

  // Check if printer is available
  const isPrinterAvailable = printerApiAvailable && selectedPrinter;

  // Print directly to printer by generating PDF and sending to printer
  const printMitzvaAtPosition = async (position: number) => {
    if (!printTarget || !tauriInvoke || !selectedPrinter) return;

    setIsPrinting(true);
    try {
      const qrDataUrl = await generateQRDataUrl(printTarget.code, 200);

      // Generate PDF with the label at the specific position
      const labelItems = [{
        name: printTarget.name,
        qrDataUrl,
        serialNumber: printTarget.id,
        isMitzva: true,
      }];

      // Generate PDF blob
      const pdfBlob = await generatePDF(labelItems, position, "mitzvot", undefined, true) as Blob;

      if (pdfBlob) {
        // Convert blob to base64 using FileReader (handles large files)
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64Data = dataUrl.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });

        // Send PDF to printer via Rust command
        await tauriInvoke("print_pdf_direct", {
          pdfBase64: base64,
          printerName: selectedPrinter,
        });
      }

      // Save the position after printing (wrap in try-catch to not fail the whole operation)
      try {
        await setSetting("lastPrintPosition", position.toString());
        setLastPrintPosition(position);
      } catch (e) {
        console.warn("Failed to save last print position:", e);
      }

      setShowPrintModal(false);
      setPrintTarget(null);
    } catch (error) {
      console.error('Print error:', error);
      alert(t("common.error") + ": " + error);
    } finally {
      setIsPrinting(false);
    }
  };

  // Download as PDF
  const downloadAsPdf = async () => {
    if (!printTarget) return;

    setPdfLoading(true);
    try {
      const qrDataUrl = await generateQRDataUrl(printTarget.code, 200);

      // Create label item for PDF generation
      const labelItems = [{
        name: printTarget.name,
        qrDataUrl,
        serialNumber: printTarget.id,
        isMitzva: true,
      }];

      // Generate PDF with the label at the selected position
      const customPositions = new Map<number, number>();
      customPositions.set(0, selectedPrintPosition);

      await generatePDF(labelItems, selectedPrintPosition, "mitzvot", customPositions);

      // Save the position after generating PDF
      await setSetting("lastPrintPosition", selectedPrintPosition.toString());
      setLastPrintPosition(selectedPrintPosition);
      setShowPrintModal(false);
      setPrintTarget(null);
    } catch (error) {
      console.error('PDF error:', error);
      alert(t("common.error") + ": " + error);
    } finally {
      setPdfLoading(false);
    }
  };

  // Filter mitzvot
  const filteredMitzvot = mitzvot.filter(m => {
    if (filter === "holidays") {
      return m.holidays_only === 1;
    }
    if (filter === "regular") {
      return m.holidays_only !== 1;
    }
    return true;
  });

  if (loading && mitzvot.length === 0) {
    return (
      <div className="mitzvot-page">
        <div className="mitzvot-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mitzvot-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="page-header-right">
          <div className="page-icon">
            <MitzvaIcon />
          </div>
          <div className="page-title-section">
            <h1 className="page-title">{t("mitzvot.title")}</h1>
            <p className="page-subtitle">{mitzvot.length} {t("mitzvot.registered")}</p>
          </div>
        </div>
        <div className="page-header-left">
          {!isAndroidDevice && (
            <>
              <button className="header-btn outline" onClick={() => setShowImportModal(true)}>
                <ImportIcon />
                {t("common.import")}
              </button>
              <button
                className={`header-btn outline ${isExporting ? 'exporting' : ''}`}
                onClick={handleExport}
                disabled={isExporting || mitzvot.length === 0}
              >
                <span className="export-animation">
                  <ExportIcon />
                  {isExporting ? t("common.exporting") || "מייצא..." : t("common.export")}
                </span>
              </button>
            </>
          )}
          <button className="header-btn primary" onClick={() => { resetForm(); setShowCreateModal(true); }}>
            <PlusIcon />
            {t("mitzvot.addNew")}
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-right">
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder={t("mitzvot.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="filter-buttons">
            <button
              className={`filter-btn ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              {t("common.all")}
            </button>
            <button
              className={`filter-btn ${filter === "regular" ? "active" : ""}`}
              onClick={() => setFilter("regular")}
            >
              {t("mitzvot.filter.regular")}
            </button>
            <button
              className={`filter-btn ${filter === "holidays" ? "active" : ""}`}
              onClick={() => setFilter("holidays")}
            >
              {t("mitzvot.filter.holidays")}
            </button>
          </div>
        </div>
        <div className="toolbar-left">
          <div className="view-toggle">
            <button
              className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
            >
              <GridIcon />
            </button>
            <button
              className={`view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
            >
              <ListIcon />
            </button>
          </div>
          <button className="toolbar-btn">
            <FilterIcon />
            {t("common.sort")}
          </button>
        </div>
      </div>

      {/* Mitzvot Grid/List */}
      {filteredMitzvot.length === 0 ? (
        <div className="empty-state">
          <MitzvaIcon />
          <h3>{searchQuery ? t("mitzvot.noResults") : t("mitzvot.noMitzvot")}</h3>
          <p>{searchQuery ? t("mitzvot.tryOtherSearch") : t("mitzvot.clickToAdd")}</p>
        </div>
      ) : (
        <div className={`mitzvot-${viewMode}`}>
          {filteredMitzvot.map((mitzva) => (
            <div key={mitzva.id} className="mitzva-card">
              {/* Delete confirmation overlay */}
              {deletingMitzvaId === mitzva.id && (
                <div className="delete-confirm-overlay">
                  <div className="delete-confirm-content">
                    <p>{t("mitzvot.messages.confirmDelete")}</p>
                    <div className="delete-confirm-actions">
                      <button className="confirm-btn yes" onClick={handleDeleteConfirm}>
                        {t("common.yes")}
                      </button>
                      <button className="confirm-btn no" onClick={handleDeleteCancel}>
                        {t("common.no")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mitzva-card-header">
                <div className="mitzva-avatar">
                  <MitzvaIcon />
                </div>
                <div className="mitzva-info">
                  <div className="mitzva-name">{mitzva.name}</div>
                  <div className="mitzva-code">מצווה-{mitzva.id}</div>
                </div>
              </div>

              <div className="mitzva-details">
                {mitzva.holidays_only === 1 && (
                  <span className="mitzva-badge holiday">{t("mitzvot.holidaysOnly")}</span>
                )}
                {mitzva.available_on_holidays === 1 && mitzva.holidays_only !== 1 && (
                  <span className="mitzva-badge available">{t("mitzvot.availableOnHolidays")}</span>
                )}
                {mitzva.notes && (
                  <div className="mitzva-notes">{mitzva.notes}</div>
                )}
              </div>

              <div className="mitzva-actions">
                <button className="action-btn" onClick={() => openEditModal(mitzva)}>
                  <EditIcon />
                  {t("common.edit")}
                </button>
                {!isAndroidDevice && (
                  <button className="action-btn primary" onClick={() => handlePrint(mitzva)}>
                    <PrintIcon />
                    {t("common.print")}
                  </button>
                )}
                <button className="action-btn danger" onClick={() => handleDeleteClick(mitzva.id)}>
                  <DeleteIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Add Button (mobile) */}
      <button className="fab" onClick={() => { resetForm(); setShowCreateModal(true); }}>
        <PlusIcon />
      </button>

      {/* Create Modal - Multi-item */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal modal-multi" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t("mitzvot.create.title")}</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-hint">{t("mitzvot.create.multiHint") || "הקש Enter להוספת מצווה נוספת"}</p>

              <div className="multi-form-container">
                {formItems.map((item, index) => (
                  <div key={item.id} className="multi-form-item">
                    <div className="multi-form-number">{index + 1}</div>
                    <div className="multi-form-fields">
                      <input
                        ref={index === formItems.length - 1 ? lastInputRef : null}
                        type="text"
                        className="form-input"
                        value={item.name}
                        onChange={(e) => updateFormItem(item.id, "name", e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, item.id, "name")}
                        placeholder={t("mitzvot.create.namePlaceholder")}
                        autoFocus={index === 0}
                      />
                      <input
                        type="text"
                        className="form-input form-input-sm"
                        value={item.notes}
                        onChange={(e) => updateFormItem(item.id, "notes", e.target.value)}
                        placeholder={t("mitzvot.create.notesPlaceholder")}
                      />
                    </div>
                    {formItems.length > 1 && (
                      <button
                        type="button"
                        className="multi-form-remove"
                        onClick={() => removeFormItem(item.id)}
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button type="button" className="add-item-btn" onClick={addFormItem}>
                <PlusIcon />
                {t("mitzvot.create.addAnother") || "הוסף מצווה נוספת"}
              </button>
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn primary"
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? t("common.loading") : (
                  formItems.filter(i => i.name.trim()).length > 1
                    ? `${t("mitzvot.create.submit")} (${formItems.filter(i => i.name.trim()).length})`
                    : t("mitzvot.create.submit")
                )}
              </button>
              <button className="modal-btn secondary" onClick={() => setShowCreateModal(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedMitzva && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t("mitzvot.edit.title")}</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="qr-code-notice">
                {t("mitzvot.edit.qrCode")}: {selectedMitzva.code}
              </div>
              <div className="form-group">
                <label className="form-label">{t("mitzvot.create.name")} *</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("mitzvot.create.notes")}</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Holiday settings */}
              <div className="holiday-settings">
                <div className="holiday-option" onClick={() => setAvailableOnHolidays(!availableOnHolidays)}>
                  <div className={`holiday-checkbox ${availableOnHolidays ? "checked" : ""}`}>
                    {availableOnHolidays && "✓"}
                  </div>
                  <div className="holiday-option-content">
                    <div className="holiday-option-label">{t("mitzvot.create.availableOnHolidays")}</div>
                    <div className="holiday-option-hint">{t("mitzvot.create.availableOnHolidaysHelp")}</div>
                  </div>
                </div>
                <div className="holiday-option" onClick={() => setHolidaysOnly(!holidaysOnly)}>
                  <div className={`holiday-checkbox ${holidaysOnly ? "checked" : ""}`}>
                    {holidaysOnly && "✓"}
                  </div>
                  <div className="holiday-option-content">
                    <div className="holiday-option-label">{t("mitzvot.create.holidaysOnly")}</div>
                    <div className="holiday-option-hint">{t("mitzvot.create.holidaysOnlyHelp")}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn primary" onClick={handleEdit}>
                {t("common.saveChanges")}
              </button>
              <button className="modal-btn secondary" onClick={() => setShowEditModal(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Position Modal */}
      {showPrintModal && printTarget && (
        <div className="modal-overlay" onClick={() => { setShowPrintModal(false); setPrintTarget(null); }}>
          <div className="modal modal-print" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t("mitzvot.printPosition.title")}</h2>
              <button className="modal-close" onClick={() => { setShowPrintModal(false); setPrintTarget(null); }}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="print-modal-layout">
                {/* A4 Page Preview */}
                <div className="print-page-preview">
                  <div className="print-preview-header">
                    <h4>{t("mitzvot.printPosition.pagePreview") || "תצוגת דף מדבקות"}</h4>
                    <div className="page-legend">
                      <span className="legend-item">
                        <span className="legend-dot used"></span>
                        {t("mitzvot.printPosition.used") || "נוצל"}
                      </span>
                      <span className="legend-item">
                        <span className="legend-dot available"></span>
                        {t("mitzvot.printPosition.available") || "פנוי"}
                      </span>
                    </div>
                  </div>
                  <div className="a4-page-container">
                    <div className="a4-page">
                      <div className="label-grid">
                        {Array.from({ length: LABEL_CONFIG.totalLabels }, (_, i) => {
                          const pos = i + 1;
                          const isUsed = pos <= lastPrintPosition;
                          const isSelected = pos === selectedPrintPosition;

                          return (
                            <div
                              key={pos}
                              className={`label-cell ${isUsed ? "used" : ""} ${isSelected ? "selected" : ""}`}
                              onClick={() => !isUsed && setSelectedPrintPosition(pos)}
                              title={isUsed ? t("mitzvot.printPosition.cellUsed") || "תא נוצל" : `${t("common.position")} ${pos}`}
                            >
                              {isUsed ? (
                                <div className="label-used-mark">
                                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                  </svg>
                                </div>
                              ) : isSelected ? (
                                <div className="label-content mitzva">
                                  <div className="label-name-frame">
                                    <span className="label-decor">✡</span>
                                    <div className="label-name">{printTarget.name}</div>
                                    <span className="label-decor">✡</span>
                                  </div>
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
                </div>

                {/* Memory & Info Panel */}
                <div className="print-info-panel">
                  {lastPrintPosition > 0 && (
                    <div className="memory-card">
                      <div className="memory-header">
                        <span className="memory-icon">
                          <MemoryIcon />
                        </span>
                        <div>
                          <span className="memory-title">{t("mitzvot.printPosition.memoryTitle") || "זיכרון מיקומים"}</span>
                          <span className="memory-subtitle">{t("mitzvot.printPosition.memorySubtitle") || "המשך מההדפסה האחרונה"}</span>
                        </div>
                      </div>
                      <div className="memory-info">
                        <div className="memory-row">
                          <span>{t("mitzvot.printPosition.lastPosition") || "מיקום אחרון:"}</span>
                          <strong>{t("common.cell") || "תא"} {lastPrintPosition}</strong>
                        </div>
                        <div className="memory-row">
                          <span>{t("mitzvot.printPosition.availableSlots") || "פנויים בדף:"}</span>
                          <strong>{availableSlots} {t("mitzvot.printPosition.labels") || "מדבקות"}</strong>
                        </div>
                      </div>
                      <button
                        className="memory-continue-btn"
                        onClick={() => setSelectedPrintPosition(lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1)}
                      >
                        {t("mitzvot.printPosition.continueFrom") || "המשך מתא"} {lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1}
                      </button>
                    </div>
                  )}

                  <div className="print-target-info">
                    <h4>{t("mitzvot.printPosition.printingLabel") || "מדפיס מדבקה"}</h4>
                    <div className="target-card">
                      <div className="target-avatar">
                        <MitzvaIcon />
                      </div>
                      <div className="target-details">
                        <span className="target-name">{printTarget.name}</span>
                        <span className="target-code">{printTarget.code.length > 10 ? `מצ-${printTarget.id}` : printTarget.code}</span>
                      </div>
                    </div>
                    <div className="selected-position-info">
                      <span>{t("mitzvot.printPosition.selectedPosition") || "מיקום נבחר:"}</span>
                      <strong>{t("common.cell") || "תא"} {selectedPrintPosition}</strong>
                    </div>
                  </div>

                  <button className="reset-page-btn" onClick={resetPrintPage}>
                    {t("mitzvot.printPosition.startNewPage") || "התחל דף חדש"}
                  </button>

                  {/* Printer Selection */}
                  <div className="printer-selection-card">
                    <div className="printer-selection-label">
                      בחר מדפסת:
                    </div>
                    {loadingPrinters ? (
                      <div className="printer-loading-state">
                        <span>{t("common.loadingPrinters") || "טוען מדפסות..."}</span>
                      </div>
                    ) : printers.length === 0 ? (
                      <div className="printer-empty-state">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                        <span>{t("common.noPrinters") || "לא נמצאו מדפסות"}</span>
                      </div>
                    ) : (
                      <div className="printer-list-modal">
                        {printers.map((printer) => (
                          <div
                            key={printer.name}
                            className={`printer-item-modal ${selectedPrinter === printer.name ? "selected" : ""}`}
                            onClick={() => handlePrinterChange(printer.name)}
                          >
                            <div className="printer-radio-modal">
                              {selectedPrinter === printer.name && "✓"}
                            </div>
                            <span className="printer-name-modal">{printer.name || "מדפסת ללא שם"}</span>
                            {printer.is_default && (
                              <span className="printer-default-badge">
                                {t("common.default") || "ברירת מחדל"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer print-modal-footer">
              <div className="print-modal-actions">
                <button
                  className="modal-btn outline"
                  onClick={downloadAsPdf}
                  disabled={pdfLoading || isPrinting}
                >
                  <span className={`btn-icon ${pdfLoading ? "downloading" : ""}`}>
                    <DownloadIcon />
                  </span>
                  {pdfLoading ? t("common.loading") : t("mitzvot.printPosition.downloadPdf")}
                </button>
                <button
                  className="modal-btn primary"
                  onClick={() => printMitzvaAtPosition(selectedPrintPosition)}
                  disabled={!isPrinterAvailable || isPrinting || pdfLoading}
                  title={!isPrinterAvailable ? t("mitzvot.printPosition.noPrinter") : ""}
                >
                  <PrintIcon />
                  {isPrinting ? t("common.loading") : !isPrinterAvailable ? t("mitzvot.printPosition.noPrinter") : t("mitzvot.printPosition.print")}
                </button>
              </div>
              <button className="modal-btn secondary" onClick={() => { setShowPrintModal(false); setPrintTarget(null); }}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="import-overlay" onClick={closeImportModal}>
          <div className="import-modal" onClick={(e) => e.stopPropagation()}>
            {importComplete ? (
              <div className="import-success">
                <div className="import-success-icon">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                </div>
                <h4>{t("mitzvot.import.success") || "הייבוא הושלם בהצלחה!"}</h4>
                <p>{importPreview.length} {t("mitzvot.import.mitzvotImported") || "מצוות יובאו"}</p>
                <button className="modal-btn primary" onClick={closeImportModal}>
                  {t("common.close") || "סגור"}
                </button>
              </div>
            ) : isImporting ? (
              <>
                <h3>{t("mitzvot.import.importing") || "מייבא מצוות..."}</h3>
                <div className="import-progress">
                  <div className="import-progress-bar">
                    <div className="import-progress-fill" style={{ width: `${importProgress}%` }} />
                  </div>
                  <div className="import-progress-text">
                    {importProgress}% - {Math.round((importProgress / 100) * importPreview.length)} / {importPreview.length}
                  </div>
                </div>
              </>
            ) : importPreview.length > 0 ? (
              <>
                <h3>{t("mitzvot.import.preview") || "תצוגה מקדימה"}</h3>
                <p>{t("mitzvot.import.previewHint") || "בדוק את הנתונים לפני הייבוא"}</p>

                <div className="import-preview">
                  <div className="import-preview-header">
                    <h4>{t("mitzvot.import.mitzvotToImport") || "מצוות לייבוא"}</h4>
                    <span className="import-count">{importPreview.length}</span>
                  </div>
                  <div className="import-preview-list">
                    {importPreview.slice(0, 5).map((mitzva, index) => (
                      <div key={index} className="import-preview-item">
                        <span className="preview-number">{index + 1}</span>
                        <span>{mitzva.name}</span>
                      </div>
                    ))}
                    {importPreview.length > 5 && (
                      <div className="import-preview-item" style={{ opacity: 0.7, justifyContent: 'center' }}>
                        +{importPreview.length - 5} {t("mitzvot.import.more") || "נוספים"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="import-actions">
                  <button className="modal-btn primary" onClick={executeImport}>
                    {t("mitzvot.import.confirm") || "ייבא"} ({importPreview.length})
                  </button>
                  <button className="modal-btn secondary" onClick={() => setImportPreview([])}>
                    {t("common.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>{t("mitzvot.import.title") || "ייבוא מצוות מאקסל"}</h3>
                <p>{t("mitzvot.import.hint") || "בחר קובץ אקסל עם נתוני מצוות"}</p>

                <div
                  className={`import-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
                  </svg>
                  <div className="dropzone-text">
                    {t("mitzvot.import.dropzone") || "גרור קובץ לכאן או לחץ לבחירה"}
                  </div>
                  <div className="dropzone-hint">
                    {t("mitzvot.import.dropzoneHint") || "קבצי .xlsx או .xls"}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileInputChange}
                  />
                </div>

                <div className="import-actions">
                  <button className="modal-btn secondary" onClick={closeImportModal}>
                    {t("common.cancel")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

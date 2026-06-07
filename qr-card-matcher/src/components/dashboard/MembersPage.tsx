import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  getAllMembersWithStats,
  MemberWithStats,
  searchMembersWithStats,
  getNextAvailableMemberCode,
  getSetting,
  setSetting,
} from "../../database";
import {
  createMemberSync,
  updateMemberSync,
  deleteMemberSync,
} from "../../hooks/useSync";
import { generateQRDataUrl } from "../QRGenerator";
import { LABEL_CONFIG } from "../LabelPositionSelector";
import { generatePDF } from "../../utils/pdfGenerator";
import { ApiUser } from "../../services/apiService";
import { exportMembersToExcel, importMembersFromExcel } from "../../services/excelService";
import "./MembersPage.css";

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
interface MemberFormItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
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

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
  </svg>
);

const EmailIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
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

const DownloadIcon = () => (
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

// Member page icon
const MemberIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>
);

interface MemberWithPurchases extends MemberWithStats {
  // purchase_count comes from MemberWithStats
}

type ViewMode = "grid" | "list";

interface MembersPageProps {
  currentUser?: ApiUser | null;
}

export function MembersPage({ currentUser }: MembersPageProps) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<MemberWithPurchases[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filter, setFilter] = useState<"all" | "active" | "debt">("all");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberWithPurchases | null>(null);

  // Form fields for single edit
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [notificationPrefs, setNotificationPrefs] = useState<Set<string>>(new Set());

  // Multi-item creation form
  const [formItems, setFormItems] = useState<MemberFormItem[]>([
    { id: crypto.randomUUID(), firstName: "", lastName: "", phone: "" }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const lastInputRef = useRef<HTMLInputElement>(null);

  // Print position modal
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printTarget, setPrintTarget] = useState<MemberWithPurchases | null>(null);
  const [selectedPrintPosition, setSelectedPrintPosition] = useState(1);
  const [lastPrintPosition, setLastPrintPosition] = useState(0);

  // Delete confirmation (inline on card)
  const [deletingMemberId, setDeletingMemberId] = useState<number | null>(null);

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
  const [importPreview, setImportPreview] = useState<Array<{firstName: string; lastName: string; phone?: string; email?: string; notes?: string}>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importComplete, setImportComplete] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMembers = async () => {
    setLoading(true);
    try {
      // Single efficient query that includes purchase count
      const data = searchQuery
        ? await searchMembersWithStats(searchQuery)
        : await getAllMembersWithStats();
      setMembers(data);
    } catch (error) {
      console.error("Error loading members:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
  }, [searchQuery]);

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

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setNotes("");
    setNotificationPrefs(new Set());
    setFormItems([{ id: crypto.randomUUID(), firstName: "", lastName: "", phone: "" }]);
    setIsCreating(false);
  };

  const toggleNotificationPref = (pref: string) => {
    setNotificationPrefs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pref)) {
        newSet.delete(pref);
      } else {
        newSet.add(pref);
      }
      return newSet;
    });
  };

  // Update a form item
  const updateFormItem = (id: string, field: keyof MemberFormItem, value: string) => {
    setFormItems(items =>
      items.map(item => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Add new empty form item
  const addFormItem = () => {
    setFormItems(items => [...items, { id: crypto.randomUUID(), firstName: "", lastName: "", phone: "" }]);
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
      const currentItem = formItems[currentIndex];

      if (isLastItem && field === "phone" && currentItem.firstName.trim() && currentItem.lastName.trim()) {
        addFormItem();
      }
    }
  };

  const handleCreate = async () => {
    // Filter out empty items (must have first and last name)
    const validItems = formItems.filter(item => item.firstName.trim() && item.lastName.trim());

    if (validItems.length === 0) {
      alert(t("members.messages.enterNames"));
      return;
    }

    setIsCreating(true);

    try {
      // Create each member with auto-generated code
      for (const item of validItems) {
        const code = await getNextAvailableMemberCode();
        await createMemberSync(
          item.firstName.trim(),
          item.lastName.trim(),
          item.phone.trim() || undefined,
          undefined,
          undefined,
          undefined,
          code
        );
      }
      await loadMembers();
      setShowCreateModal(false);
      resetForm();
    } catch (error) {
      console.error("Error creating members:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedMember || !firstName.trim() || !lastName.trim()) {
      alert(t("members.messages.enterNames"));
      return;
    }

    try {
      await updateMemberSync(
        selectedMember.id,
        firstName.trim(),
        lastName.trim(),
        phone.trim(),
        email.trim(),
        notes.trim(),
        Array.from(notificationPrefs).join(',') || undefined
      );
      await loadMembers();
      setShowEditModal(false);
      setSelectedMember(null);
      resetForm();
    } catch (error) {
      console.error("Error updating member:", error);
    }
  };

  const openEditModal = (member: MemberWithPurchases) => {
    setSelectedMember(member);
    setFirstName(member.first_name);
    setLastName(member.last_name);
    setPhone(member.phone || "");
    setEmail(member.email || "");
    setNotes(member.notes || "");
    const prefs = member.notification_preferences?.split(',').filter(s => s.trim()) || [];
    setNotificationPrefs(new Set(prefs));
    setShowEditModal(true);
  };

  const handleDeleteClick = (id: number) => {
    setDeletingMemberId(id);
  };

  const handleDeleteConfirm = async () => {
    if (deletingMemberId === null) return;
    try {
      await deleteMemberSync(deletingMemberId);
      await loadMembers();
    } catch (error) {
      console.error("Error deleting member:", error);
    } finally {
      setDeletingMemberId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeletingMemberId(null);
  };

  // Export members to Excel
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Simulate animation delay for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
      await exportMembersToExcel(members);
      // Show success briefly
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error("Error exporting members:", error);
      alert(t("common.error") + ": " + error);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle file selection for import
  const handleFileSelect = async (file: File) => {
    try {
      const data = await importMembersFromExcel(file);
      setImportPreview(data);
    } catch (error) {
      console.error("Error reading Excel file:", error);
      alert(t("members.import.error") || "שגיאה בקריאת קובץ האקסל");
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
        const member = importPreview[i];
        const code = await getNextAvailableMemberCode();
        await createMemberSync(
          member.firstName,
          member.lastName,
          member.phone,
          member.email,
          member.notes,
          undefined,
          code
        );
        setImportProgress(Math.round(((i + 1) / importPreview.length) * 100));
      }
      setImportComplete(true);
      await loadMembers();
    } catch (error) {
      console.error("Error importing members:", error);
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

  const handlePrint = (member: MemberWithPurchases) => {
    setPrintTarget(member);
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
  const printMemberAtPosition = async (position: number) => {
    if (!printTarget || !tauriInvoke || !selectedPrinter) return;

    setIsPrinting(true);
    try {
      const qrDataUrl = await generateQRDataUrl(printTarget.code, 200);

      // Generate PDF with the label at the specific position
      const labelItems = [{
        name: `${printTarget.first_name} ${printTarget.last_name}`,
        qrDataUrl,
        serialNumber: printTarget.id,
        isMitzva: false,
      }];

      // Generate PDF blob
      const pdfBlob = await generatePDF(labelItems, position, "members", undefined, true) as Blob;

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
        name: `${printTarget.first_name} ${printTarget.last_name}`,
        qrDataUrl,
        serialNumber: printTarget.id,
        isMitzva: false,
      }];

      // Generate PDF with the label at the selected position
      const customPositions = new Map<number, number>();
      customPositions.set(0, selectedPrintPosition);

      await generatePDF(labelItems, selectedPrintPosition, "members", customPositions);

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

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`;
  };

  // Find the gabbai member (only one - best match with user)
  const findGabbaiId = (): number | null => {
    if (!currentUser) return null;

    const userContactName = currentUser.contact_name?.toLowerCase().trim() || "";
    const userEmail = currentUser.email?.toLowerCase().trim() || "";

    // First priority: exact match on BOTH name AND email
    const exactMatch = members.find(m => {
      const memberFullName = `${m.first_name} ${m.last_name}`.toLowerCase().trim();
      const memberEmail = m.email?.toLowerCase().trim() || "";
      return userContactName !== "" && memberFullName === userContactName &&
             memberEmail !== "" && userEmail !== "" && memberEmail === userEmail;
    });
    if (exactMatch) return exactMatch.id;

    // Second priority: match on name only
    const nameMatch = members.find(m => {
      const memberFullName = `${m.first_name} ${m.last_name}`.toLowerCase().trim();
      return userContactName !== "" && memberFullName === userContactName;
    });
    if (nameMatch) return nameMatch.id;

    // Third priority: match on email only (only first match)
    const emailMatch = members.find(m => {
      const memberEmail = m.email?.toLowerCase().trim() || "";
      return memberEmail !== "" && userEmail !== "" && memberEmail === userEmail;
    });
    if (emailMatch) return emailMatch.id;

    return null;
  };

  const gabbaiId = findGabbaiId();

  const isGabbai = (member: MemberWithPurchases): boolean => {
    return member.id === gabbaiId;
  };

  // Filter and sort members - gabbai first
  const filteredMembers = members
    .filter(m => {
      if (filter === "active") {
        return (m.purchase_count || 0) > 0;
      }
      // "debt" filter - would need payment status logic
      return true;
    })
    .sort((a, b) => {
      // Gabbai always comes first
      if (a.id === gabbaiId && b.id !== gabbaiId) return -1;
      if (a.id !== gabbaiId && b.id === gabbaiId) return 1;
      return 0;
    });

  if (loading && members.length === 0) {
    return (
      <div className="members-page">
        <div className="members-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="members-page">
      {/* Page Header */}
      <header className="page-header">
        <div className="page-header-right">
          <div className="page-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div className="page-title-section">
            <h1 className="page-title">{t("members.title")}</h1>
            <p className="page-subtitle">{members.length} {t("members.registered")}</p>
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
                disabled={isExporting || members.length === 0}
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
            {t("members.addNew")}
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
              placeholder={t("members.searchPlaceholder")}
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
              className={`filter-btn ${filter === "active" ? "active" : ""}`}
              onClick={() => setFilter("active")}
            >
              {t("members.filter.active")}
            </button>
            <button
              className={`filter-btn ${filter === "debt" ? "active" : ""}`}
              onClick={() => setFilter("debt")}
            >
              {t("members.filter.debt")}
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

      {/* Members Grid/List */}
      {filteredMembers.length === 0 ? (
        <div className="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C17.52 2 22 6.48 22 12C22 17.52 17.52 22 12 22C6.48 22 2 17.52 2 12C2 6.48 6.48 2 12 2ZM12 6C9.79 6 8 7.79 8 10C8 12.21 9.79 14 12 14C14.21 14 16 12.21 16 10C16 7.79 14.21 6 12 6ZM12 16C9.33 16 4 17.34 4 20V22H20V20C20 17.34 14.67 16 12 16Z"/>
          </svg>
          <h3>{searchQuery ? t("members.noResults") : t("members.noMembers")}</h3>
          <p>{searchQuery ? t("members.tryOtherSearch") : t("members.clickToAdd")}</p>
        </div>
      ) : (
        <div className={`members-${viewMode}`}>
          {filteredMembers.map((member) => (
            <div key={member.id} className={`member-card ${isGabbai(member) ? 'gabbai-card' : ''}`}>
              {/* Delete confirmation overlay */}
              {deletingMemberId === member.id && (
                <div className="delete-confirm-overlay">
                  <div className="delete-confirm-content">
                    <p>{t("members.messages.confirmDelete")}</p>
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

              <div className="member-card-header">
                <div className={`member-avatar ${isGabbai(member) ? 'gabbai-avatar' : ''}`}>
                  {getInitials(member.first_name, member.last_name)}
                </div>
                <div className="member-info">
                  <div className="member-name">{member.first_name} {member.last_name}</div>
                  <div className="member-code">מתפלל-{member.id}</div>
                </div>
              </div>

              <div className="member-contact">
                {member.phone && (
                  <div className="contact-row">
                    <PhoneIcon />
                    <span dir="ltr">{member.phone}</span>
                  </div>
                )}
                {member.email && (
                  <div className="contact-row">
                    <EmailIcon />
                    <span dir="ltr">{member.email}</span>
                  </div>
                )}
              </div>

              <div className="member-stats">
                <div className="member-stat">
                  <div className="stat-value">{member.purchase_count || 0}</div>
                  <div className="stat-label">{t("members.stats.purchases")}</div>
                </div>
                <div className="member-stat">
                  <div className="stat-value">
                    {new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(0)}
                  </div>
                  <div className="stat-label">{t("members.stats.total")}</div>
                </div>
                <div className="member-stat">
                  <div className="stat-value">
                    {new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(0)}
                  </div>
                  <div className="stat-label">{t("members.stats.debt")}</div>
                </div>
              </div>

              <div className="member-actions">
                <button className="action-btn" onClick={() => openEditModal(member)}>
                  <EditIcon />
                  {t("common.edit")}
                </button>
                {!isAndroidDevice && (
                  <button className="action-btn primary" onClick={() => handlePrint(member)}>
                    <PrintIcon />
                    {t("common.print")}
                  </button>
                )}
                <button className="action-btn danger" onClick={() => handleDeleteClick(member.id)}>
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
              <h2 className="modal-title">{t("members.create.title")}</h2>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-hint">{t("members.create.multiHint") || "הקש Enter להוספת מתפלל נוסף"}</p>

              <div className="multi-form-container">
                {formItems.map((item, index) => (
                  <div key={item.id} className="multi-form-item">
                    <div className="multi-form-number">{index + 1}</div>
                    <div className="multi-form-fields multi-form-fields-row">
                      <input
                        ref={index === formItems.length - 1 ? lastInputRef : null}
                        type="text"
                        className="form-input"
                        value={item.firstName}
                        onChange={(e) => updateFormItem(item.id, "firstName", e.target.value)}
                        placeholder={t("members.create.firstNamePlaceholder")}
                        autoFocus={index === 0}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={item.lastName}
                        onChange={(e) => updateFormItem(item.id, "lastName", e.target.value)}
                        placeholder={t("members.create.lastNamePlaceholder")}
                      />
                      <input
                        type="tel"
                        className="form-input form-input-sm"
                        value={item.phone}
                        onChange={(e) => updateFormItem(item.id, "phone", e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, item.id, "phone")}
                        placeholder="050-000-0000"
                        dir="ltr"
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
                {t("members.create.addAnother") || "הוסף מתפלל נוסף"}
              </button>
            </div>
            <div className="modal-footer">
              <button
                className="modal-btn primary"
                onClick={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? t("common.loading") : (
                  formItems.filter(i => i.firstName.trim() && i.lastName.trim()).length > 1
                    ? `${t("members.create.submit")} (${formItems.filter(i => i.firstName.trim() && i.lastName.trim()).length})`
                    : t("members.create.submit")
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
      {showEditModal && selectedMember && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal modal-edit" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t("members.edit.title")}</h2>
              <button className="modal-close" onClick={() => setShowEditModal(false)}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="qr-code-notice">
                {t("members.edit.qrCodeFixed", { code: selectedMember.code })}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t("members.create.firstName")} *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t("members.create.lastName")} *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t("members.create.phone")}</label>
                <input
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("members.create.email")}</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t("members.create.notificationPrefs")}</label>
                <div className="notification-options">
                  <div
                    className={`notification-option ${notificationPrefs.has("email") ? "selected" : ""}`}
                    onClick={() => toggleNotificationPref("email")}
                  >
                    <div className="notification-checkbox">
                      {notificationPrefs.has("email") && "✓"}
                    </div>
                    <span className="notification-label">
                      <EmailIcon />
                      {t("common.email")}
                    </span>
                  </div>
                  <div
                    className={`notification-option ${notificationPrefs.has("whatsapp") ? "selected" : ""}`}
                    onClick={() => toggleNotificationPref("whatsapp")}
                  >
                    <div className="notification-checkbox">
                      {notificationPrefs.has("whatsapp") && "✓"}
                    </div>
                    <span className="notification-label">WhatsApp</span>
                  </div>
                  <div
                    className={`notification-option ${notificationPrefs.has("sms") ? "selected" : ""}`}
                    onClick={() => toggleNotificationPref("sms")}
                  >
                    <div className="notification-checkbox">
                      {notificationPrefs.has("sms") && "✓"}
                    </div>
                    <span className="notification-label">SMS</span>
                  </div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t("members.create.notes")}</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
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
              <h2 className="modal-title">{t("members.printPosition.title")}</h2>
              <button className="modal-close" onClick={() => { setShowPrintModal(false); setPrintTarget(null); }}>
                <CloseIcon />
              </button>
            </div>
            <div className="modal-body">
              <div className="print-modal-layout">
                {/* A4 Page Preview */}
                <div className="print-page-preview">
                  <div className="print-preview-header">
                    <h4>{t("members.printPosition.pagePreview") || "תצוגת דף מדבקות"}</h4>
                    <div className="page-legend">
                      <span className="legend-item">
                        <span className="legend-dot used"></span>
                        {t("members.printPosition.used") || "נוצל"}
                      </span>
                      <span className="legend-item">
                        <span className="legend-dot available"></span>
                        {t("members.printPosition.available") || "פנוי"}
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
                              title={isUsed ? t("members.printPosition.cellUsed") || "תא נוצל" : `${t("common.position")} ${pos}`}
                            >
                              {isUsed ? (
                                <div className="label-used-mark">
                                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                  </svg>
                                </div>
                              ) : isSelected ? (
                                <div className="label-content member">
                                  <div className="label-name-frame">
                                    <span className="label-decor">●</span>
                                    <div className="label-name">{printTarget.first_name} {printTarget.last_name}</div>
                                    <span className="label-decor">●</span>
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
                          <span className="memory-title">{t("members.printPosition.memoryTitle") || "זיכרון מיקומים"}</span>
                          <span className="memory-subtitle">{t("members.printPosition.memorySubtitle") || "המשך מההדפסה האחרונה"}</span>
                        </div>
                      </div>
                      <div className="memory-info">
                        <div className="memory-row">
                          <span>{t("members.printPosition.lastPosition") || "מיקום אחרון:"}</span>
                          <strong>{t("common.cell") || "תא"} {lastPrintPosition}</strong>
                        </div>
                        <div className="memory-row">
                          <span>{t("members.printPosition.availableSlots") || "פנויים בדף:"}</span>
                          <strong>{availableSlots} {t("members.printPosition.labels") || "מדבקות"}</strong>
                        </div>
                      </div>
                      <button
                        className="memory-continue-btn"
                        onClick={() => setSelectedPrintPosition(lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1)}
                      >
                        {t("members.printPosition.continueFrom") || "המשך מתא"} {lastPrintPosition + 1 > LABEL_CONFIG.totalLabels ? 1 : lastPrintPosition + 1}
                      </button>
                    </div>
                  )}

                  <div className="print-target-info">
                    <h4>{t("members.printPosition.printingLabel") || "מדפיס מדבקה"}</h4>
                    <div className="target-card">
                      <div className="target-avatar">
                        <MemberIcon />
                      </div>
                      <div className="target-details">
                        <span className="target-name">{printTarget.first_name} {printTarget.last_name}</span>
                        <span className="target-code">{printTarget.code.length > 10 ? `מת-${printTarget.id}` : printTarget.code}</span>
                      </div>
                    </div>
                    <div className="selected-position-info">
                      <span>{t("members.printPosition.selectedPosition") || "מיקום נבחר:"}</span>
                      <strong>{t("common.cell") || "תא"} {selectedPrintPosition}</strong>
                    </div>
                  </div>

                  <button className="reset-page-btn" onClick={resetPrintPage}>
                    {t("members.printPosition.startNewPage") || "התחל דף חדש"}
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
                  {pdfLoading ? t("common.loading") : t("members.printPosition.downloadPdf")}
                </button>
                <button
                  className="modal-btn primary"
                  onClick={() => printMemberAtPosition(selectedPrintPosition)}
                  disabled={!isPrinterAvailable || isPrinting || pdfLoading}
                  title={!isPrinterAvailable ? t("members.printPosition.noPrinter") : ""}
                >
                  <PrintIcon />
                  {isPrinting ? t("common.loading") : !isPrinterAvailable ? t("members.printPosition.noPrinter") : t("members.printPosition.print")}
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
                <h4>{t("members.import.success") || "הייבוא הושלם בהצלחה!"}</h4>
                <p>{importPreview.length} {t("members.import.membersImported") || "מתפללים יובאו"}</p>
                <button className="modal-btn primary" onClick={closeImportModal}>
                  {t("common.close") || "סגור"}
                </button>
              </div>
            ) : isImporting ? (
              <>
                <h3>{t("members.import.importing") || "מייבא מתפללים..."}</h3>
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
                <h3>{t("members.import.preview") || "תצוגה מקדימה"}</h3>
                <p>{t("members.import.previewHint") || "בדוק את הנתונים לפני הייבוא"}</p>

                <div className="import-preview">
                  <div className="import-preview-header">
                    <h4>{t("members.import.membersToImport") || "מתפללים לייבוא"}</h4>
                    <span className="import-count">{importPreview.length}</span>
                  </div>
                  <div className="import-preview-list">
                    {importPreview.slice(0, 5).map((member, index) => (
                      <div key={index} className="import-preview-item">
                        <span className="preview-number">{index + 1}</span>
                        <span>{member.firstName} {member.lastName}</span>
                      </div>
                    ))}
                    {importPreview.length > 5 && (
                      <div className="import-preview-item" style={{ opacity: 0.7, justifyContent: 'center' }}>
                        +{importPreview.length - 5} {t("members.import.more") || "נוספים"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="import-actions">
                  <button className="modal-btn primary" onClick={executeImport}>
                    {t("members.import.confirm") || "ייבא"} ({importPreview.length})
                  </button>
                  <button className="modal-btn secondary" onClick={() => setImportPreview([])}>
                    {t("common.cancel")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3>{t("members.import.title") || "ייבוא מתפללים מאקסל"}</h3>
                <p>{t("members.import.hint") || "בחר קובץ אקסל עם נתוני מתפללים"}</p>

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
                    {t("members.import.dropzone") || "גרור קובץ לכאן או לחץ לבחירה"}
                  </div>
                  <div className="dropzone-hint">
                    {t("members.import.dropzoneHint") || "קבצי .xlsx או .xls"}
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

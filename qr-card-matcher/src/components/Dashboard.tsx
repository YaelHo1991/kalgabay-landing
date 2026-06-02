import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Stats,
  Member,
  Mitzva,
  Week,
  getMemberByCode,
  getMitzvaByCode,
  isTicketLinkedForWeek,
  getStatsByWeek,
  ensureCurrentWeekExists,
  getMitzvotForMemberInWeek,
  getMitzvotWithPurchasers,
  getMembersWithPurchases,
  getMitzvotWithBidPriceForMember,
  MitzvaWithPurchaser,
  MemberWithPurchases,
  MitzvaWithBidPrice,
  updateLinkReminderSent,
  getAllMembers,
  getAllMitzvot,
  PaymentStatus,
  getSetting,
} from "../database";
import {
  createMemberSync,
  updateMemberSync,
  deleteMemberSync,
  createMitzvaSync,
  updateMitzvaSync,
  deleteMitzvaSync,
  linkTicketToMemberSync,
  unlinkTicketSync,
  updateLinkBidPriceSync,
  updateLinkMemberSync,
  updateLinkPaymentStatusSync,
} from "../hooks/useSync";
import { QRGenerator, generateQRDataUrl } from "./QRGenerator";
import { generateCardPng } from "../utils/pdfGenerator";
import { QRScanner, ManualQRInput, ScanResult } from "./QRScanner";
import { WeekDisplay } from "./WeekDisplay";
import { ReminderModal } from "./ReminderModal";
import { LabelPositionSelector, LABEL_CONFIG, getLabelPosition } from "./LabelPositionSelector";
import { PrintPreviewModal, PrintItem } from "./PrintPreviewModal";
import { sendPaymentReminder as sendEmailReminder } from "../services/emailService";
import { saveDraft, deleteDraft, subscribeToDrafts, ScanDraft } from "../services/draftsService";
import { getStoredUser, ApiUser } from "../services/apiService";
import { DashboardHeader } from "./dashboard/DashboardHeader";
import { NavTabs, TabId } from "./dashboard/NavTabs";
import { ProgressWidget, UnpaidWidget } from "./dashboard/SidebarWidgets";
import { PurchasesTable } from "./dashboard/PurchasesTable";
import { MembersPage } from "./dashboard/MembersPage";
import { MitzvotPage } from "./dashboard/MitzvotPage";
import { ArchivePage } from "./dashboard/ArchivePage";
import { PrintLabelsPage } from "./dashboard/PrintLabelsPage";
import { ScanningModal, CartItem as ScanningCartItem } from "./dashboard/ScanningModal";
import "./dashboard/DashboardDesktop.css";

type ScanMode = "member" | "mitzva" | "mitzva-multi" | null;

// Check if running on Android
const isAndroid = (): boolean => navigator.userAgent.toLowerCase().includes('android');

// Cart item for auction-style bidding
interface CartItem {
  mitzva: Mitzva;
  price: number;
}

interface DashboardProps {
  initialWeek?: Week | null;
  onWeekChange?: (week: Week) => void;
  onLogout?: () => void;
  onOpenWeekSelector?: () => void;
  gmailConnected?: boolean;
  gmailEmail?: string | null;
  onConnectGmail?: () => void;
  onTabChange?: (tab: TabId) => void;
}

export function Dashboard({
  initialWeek,
  onWeekChange,
  onLogout,
  onOpenWeekSelector,
  gmailConnected,
  gmailEmail,
  onConnectGmail,
  onTabChange
}: DashboardProps = {}) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // New desktop design state
  const [user, setUser] = useState<ApiUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("home");

  // Notify parent when tab changes
  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  // Load user on mount
  useEffect(() => {
    const storedUser = getStoredUser();
    setUser(storedUser);
  }, []);

  // Detect mobile/Android for responsive layout - desktop Tauri app always uses desktop layout
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      // Check if running in Tauri desktop environment (Windows/Mac/Linux)
      const isTauriDesktop = '__TAURI_INTERNALS__' in window &&
        !/Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);

      // On Tauri desktop, always use desktop layout regardless of window size
      if (isTauriDesktop) {
        setIsMobile(false);
        return;
      }

      // For browser/mobile: use window width
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [, setLinkedMitzvot] = useState<Mitzva[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [scanError, setScanError] = useState<{ type: "member" | "mitzva"; code: string; message: string } | null>(null);
  const [scanResetTrigger, setScanResetTrigger] = useState(0);

  // Cart for auction-style purchasing
  const [cart, setCart] = useState<CartItem[]>([]);
  const [editingCartItemId, setEditingCartItemId] = useState<number | null>(null); // ID of cart item being edited
  const [editingCartPrice, setEditingCartPrice] = useState<string>(""); // Price being edited

  const [selectedWeek, setSelectedWeekInternal] = useState<Week | null>(null);

  // Wrapper to notify parent when week changes
  const setSelectedWeek = (week: Week | null) => {
    setSelectedWeekInternal(week);
    if (week && onWeekChange) {
      onWeekChange(week);
    }
  };

  // Purchase list view state
  type ViewMode = "mitzvot" | "members";
  const [viewMode, setViewMode] = useState<ViewMode>("mitzvot");
  const [mitzvotWithPurchasers, setMitzvotWithPurchasers] = useState<MitzvaWithPurchaser[]>([]);
  const [membersWithPurchases, setMembersWithPurchases] = useState<MemberWithPurchases[]>([]);
  const [allMembersForView, setAllMembersForView] = useState<Member[]>([]); // All members for the members tab
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null);
  const [memberMitzvot, setMemberMitzvot] = useState<MitzvaWithBidPrice[]>([]);

  // Edit purchase state
  const [editingPurchase, setEditingPurchase] = useState<MitzvaWithPurchaser | null>(null);
  const [editPrice, setEditPrice] = useState<string>("");
  const [editMemberId, setEditMemberId] = useState<number | null>(null);
  const [allMembers, setAllMembers] = useState<Member[]>([]);

  // Delete confirmation state
  const [deletingPurchase, setDeletingPurchase] = useState<MitzvaWithPurchaser | null>(null);

  // Reminder modal state
  const [reminderMitzva, setReminderMitzva] = useState<MitzvaWithPurchaser | null>(null);

  // Edit mode state - for managing members/mitzvot directly from dashboard
  const [isEditMode, setIsEditMode] = useState(false);
  const [allMitzvotForEdit, setAllMitzvotForEdit] = useState<Mitzva[]>([]);
  const [, setAllMembersForEdit] = useState<Member[]>([]);
  const [editModeSelectedIds, setEditModeSelectedIds] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Create/Edit modals for edit mode
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [showCreateMitzvaModal, setShowCreateMitzvaModal] = useState(false);
  const [showEditMitzvaModal, setShowEditMitzvaModal] = useState(false);
  const [editModeMember, setEditModeMember] = useState<Member | null>(null);
  const [editModeMitzva, setEditModeMitzva] = useState<Mitzva | null>(null);
  const [showMemberDetailsModal, setShowMemberDetailsModal] = useState(false);
  const [detailsMember, setDetailsMember] = useState<MemberWithPurchases | null>(null);

  // Print position modal for member stickers
  const [showPrintPositionModal, setShowPrintPositionModal] = useState(false);
  const [printTargetMember, setPrintTargetMember] = useState<Member | null>(null);
  const [selectedPrintPosition, setSelectedPrintPosition] = useState<number>(1);

  // TEST MODAL - for debugging grid issue
  const [showTestModal, setShowTestModal] = useState(false);
  const [testTargetMember, setTestTargetMember] = useState<Member | null>(null);
  const [testSelectedPosition, setTestSelectedPosition] = useState<number>(1);

  // Unified print modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printItems, setPrintItems] = useState<PrintItem[]>([]);
  const [printIsMitzva, setPrintIsMitzva] = useState(true);

  // Desktop Scanning Modal state
  const [showScanningModal, setShowScanningModal] = useState(false);

  // Member form fields
  const [memberFirstName, setMemberFirstName] = useState("");
  const [memberLastName, setMemberLastName] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberNotes, setMemberNotes] = useState("");

  // Mitzva form fields
  const [mitzvaName, setMitzvaName] = useState("");
  const [mitzvaNotes, setMitzvaNotes] = useState("");
  const [mitzvaAvailableOnHolidays, setMitzvaAvailableOnHolidays] = useState(true);
  const [mitzvaHolidaysOnly, setMitzvaHolidaysOnly] = useState(false);

  // Message preview state (editable in sidebar)
  const [editableMessage, setEditableMessage] = useState("");

  // Message template from settings
  const DEFAULT_TEMPLATE = `שלום {MEMBER_NAME},

להלן פירוט המצוות שרכשת:

{MITZVOT_LIST}

סה"כ לתשלום: {TOTAL}

תודה רבה!
בית הכנסת`;
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_TEMPLATE);

  // Drafts state
  const [drafts, setDrafts] = useState<ScanDraft[]>([]);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (initialWeek) {
      setSelectedWeek(initialWeek);
    } else {
      initializeWeek();
    }
    loadMessageTemplate();
  }, []);

  // Subscribe to drafts from local storage
  useEffect(() => {
    const user = getStoredUser();
    if (!user) return;

    // Use user email as unique identifier for drafts
    const userId = user.email;
    const unsubscribe = subscribeToDrafts(userId, (newDrafts) => {
      setDrafts(newDrafts.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    });

    return () => unsubscribe();
  }, []);

  // Update when initialWeek prop changes (from sidebar selection)
  useEffect(() => {
    if (initialWeek) {
      setSelectedWeek(initialWeek);
    }
  }, [initialWeek]);

  // Load message template from settings
  const loadMessageTemplate = async () => {
    try {
      const savedTemplate = await getSetting("email_template");
      if (savedTemplate) {
        setMessageTemplate(savedTemplate);
      }
    } catch (error) {
      console.error("Error loading message template:", error);
    }
  };

  // Reload stats when week changes (also loads all members independently)
  useEffect(() => {
    loadStats();
  }, [selectedWeek]);

  // Update message preview when cart changes
  useEffect(() => {
    if (cart.length > 0 && currentMember) {
      // Only auto-update if user hasn't manually edited
      setEditableMessage(generatePaymentMessage());
    } else {
      setEditableMessage("");
    }
  }, [cart, currentMember, messageTemplate]);

  const initializeWeek = async () => {
    try {
      const week = await ensureCurrentWeekExists();
      setSelectedWeek(week);
    } catch (error) {
      console.error("Error initializing week:", error);
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Always load all members for the members tab (independent of week)
      const allMembers = await getAllMembers();
      setAllMembersForView(allMembers);

      if (selectedWeek) {
        const data = await getStatsByWeek(selectedWeek.week_number, selectedWeek.year);
        setStats(data);

        // Load purchase list data
        const mitzvotData = await getMitzvotWithPurchasers(selectedWeek.week_number, selectedWeek.year);
        setMitzvotWithPurchasers(mitzvotData);

        const membersData = await getMembersWithPurchases(selectedWeek.week_number, selectedWeek.year);
        setMembersWithPurchases(membersData);
      }
    } catch (error) {
      console.error("Error loading stats:", error);
    }
    setLoading(false);
  };

  // Helper functions for new desktop design
  const getUserInitials = () => {
    if (!user) return "??";
    const name = user.contact_name || user.email;
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
    }
    return name.substring(0, 2);
  };

  const getUserName = () => {
    if (!user) return "משתמש";
    return user.contact_name || user.email;
  };

  const getTotalAmount = () => {
    return membersWithPurchases.reduce((sum, m) => sum + (m.total_price || 0), 0);
  };

  const getPaidAmount = () => {
    // Calculate based on payment status
    return mitzvotWithPurchasers
      .filter(m => m.payment_status === 'paid')
      .reduce((sum, m) => sum + (m.bid_price || 0), 0);
  };

  const getUnpaidMembers = () => {
    // Get members with unpaid purchases
    const unpaidMitzvot = mitzvotWithPurchasers.filter(m => m.payment_status !== 'paid' && m.purchaser_id);
    const memberIds = [...new Set(unpaidMitzvot.map(m => m.purchaser_id))];

    return memberIds.map(id => {
      const memberMitzvot = unpaidMitzvot.filter(m => m.purchaser_id === id);
      const firstMitzva = memberMitzvot[0];
      return {
        id: id!,
        firstName: firstMitzva.purchaser_name?.split(' ')[0] || '',
        lastName: firstMitzva.purchaser_name?.split(' ').slice(1).join(' ') || '',
        amount: memberMitzvot.reduce((sum, m) => sum + (m.bid_price || 0), 0),
        email: firstMitzva.purchaser_email || undefined,
        phone: firstMitzva.purchaser_phone || undefined,
      };
    });
  };

  const loadMemberMitzvot = async (memberId: number) => {
    if (!selectedWeek) return;
    const mitzvot = await getMitzvotWithBidPriceForMember(memberId, selectedWeek.week_number, selectedWeek.year);
    setMemberMitzvot(mitzvot);
  };

  const toggleExpandMember = async (memberId: number) => {
    if (expandedMemberId === memberId) {
      setExpandedMemberId(null);
      setMemberMitzvot([]);
    } else {
      setExpandedMemberId(memberId);
      await loadMemberMitzvot(memberId);
    }
  };

  const loadLinkedMitzvot = async (memberId: number) => {
    if (!selectedWeek) return;
    const mitzvot = await getMitzvotForMemberInWeek(memberId, selectedWeek.week_number, selectedWeek.year);
    setLinkedMitzvot(mitzvot);
  };

  // Load all members for edit dropdown
  const loadAllMembers = async () => {
    const members = await getAllMembers();
    setAllMembers(members);
  };

  // Start editing a purchase
  const startEditPurchase = async (mitzva: MitzvaWithPurchaser) => {
    setEditingPurchase(mitzva);
    setEditPrice(mitzva.bid_price?.toString() || "0");
    setEditMemberId(mitzva.purchaser_id);
    if (allMembers.length === 0) {
      await loadAllMembers();
    }
  };

  // Save edited purchase
  const saveEditPurchase = async () => {
    if (!editingPurchase || !editingPurchase.link_id) return;

    try {
      const newPrice = parseFloat(editPrice) || 0;

      // Update price (with sync)
      await updateLinkBidPriceSync(editingPurchase.link_id, newPrice);

      // Update member if changed (with sync)
      if (editMemberId && editMemberId !== editingPurchase.purchaser_id) {
        await updateLinkMemberSync(editingPurchase.link_id, editMemberId);
      }

      setEditingPurchase(null);
      await loadStats();
      showMessage("success", t("dashboard.messages.purchaseUpdated"));
    } catch (error) {
      console.error("Error updating purchase:", error);
      showMessage("error", t("dashboard.messages.purchaseUpdateError"));
    }
  };

  // Save edited purchase and send email
  const saveEditPurchaseAndSend = async () => {
    if (!editingPurchase || !editingPurchase.link_id) return;

    try {
      const newPrice = parseFloat(editPrice) || 0;

      // Update price (with sync)
      await updateLinkBidPriceSync(editingPurchase.link_id, newPrice);

      // Update member if changed (with sync)
      let memberToEmail = allMembers.find(m => m.id === editingPurchase.purchaser_id);
      if (editMemberId && editMemberId !== editingPurchase.purchaser_id) {
        await updateLinkMemberSync(editingPurchase.link_id, editMemberId);
        memberToEmail = allMembers.find(m => m.id === editMemberId);
      }

      // Send email if member has email
      if (memberToEmail?.email) {
        const message = `שלום ${memberToEmail.first_name},\n\nלהלן פירוט הרכישה:\n\n• ${editingPurchase.name}: ${formatPrice(newPrice)}\n\nסה"כ לתשלום: ${formatPrice(newPrice)}\n\nתודה רבה!\nבית הכנסת`;

        const result = await sendEmailReminder(
          memberToEmail.email,
          `${memberToEmail.first_name} ${memberToEmail.last_name}`,
          message,
          'בית הכנסת'
        );

        if (result.success) {
          showMessage("success", "נשמר ונשלח בהצלחה!");
        } else {
          showMessage("error", "נשמר, אבל שליחת המייל נכשלה: " + result.error);
        }
      } else {
        showMessage("error", "נשמר, אבל למתפלל אין כתובת מייל");
      }

      setEditingPurchase(null);
      await loadStats();
    } catch (error) {
      console.error("Error updating purchase:", error);
      showMessage("error", t("dashboard.messages.purchaseUpdateError"));
    }
  };

  // Toggle payment status
  const togglePaymentStatus = async (mitzva: MitzvaWithPurchaser) => {
    if (!mitzva.link_id) return;

    try {
      const newStatus: PaymentStatus = mitzva.payment_status === 'paid' ? 'unpaid' : 'paid';
      await updateLinkPaymentStatusSync(mitzva.link_id, newStatus);
      await loadStats();
      showMessage("success", newStatus === 'paid' ? t("dashboard.messages.markedAsPaid") : t("dashboard.messages.markedAsUnpaid"));
    } catch (error) {
      console.error("Error updating payment status:", error);
      showMessage("error", t("dashboard.messages.paymentUpdateError"));
    }
  };

  // Open reminder modal
  const openReminderModal = (mitzva: MitzvaWithPurchaser) => {
    if (!mitzva.link_id) return;
    // Only open if has phone or email
    if (!mitzva.purchaser_phone && !mitzva.purchaser_email) return;
    setReminderMitzva(mitzva);
  };

  // Send payment reminder (called from modal)
  const sendPaymentReminder = async (channel: "email" | "whatsapp" | "sms", message: string) => {
    if (!reminderMitzva || !reminderMitzva.link_id) return;

    try {
      if (channel === "whatsapp" || channel === "sms") {
        // Send via WhatsApp/SMS
        if (!reminderMitzva.purchaser_phone) {
          throw new Error(t("reminderModal.noPhone", "אין מספר טלפון"));
        }
        const phone = reminderMitzva.purchaser_phone.replace(/\D/g, '');
        const encodedMessage = encodeURIComponent(message);

        if (channel === "whatsapp") {
          const whatsappUrl = `https://wa.me/972${phone.startsWith('0') ? phone.slice(1) : phone}?text=${encodedMessage}`;
          window.open(whatsappUrl, '_blank');
        } else {
          // SMS - use sms: protocol
          const smsUrl = `sms:${phone}?body=${encodedMessage}`;
          window.open(smsUrl, '_blank');
        }
      } else if (channel === "email") {
        // Send via Gmail API or Resend
        if (!reminderMitzva.purchaser_email) {
          throw new Error(t("reminderModal.noEmail", "אין כתובת מייל"));
        }

        // sendEmailReminder automatically uses Gmail if connected, otherwise Resend
        const result = await sendEmailReminder(
          reminderMitzva.purchaser_email,
          reminderMitzva.purchaser_name || '',
          message,
          'בית הכנסת' // TODO: Get synagogue name from user data
        );

        if (!result.success) {
          throw new Error(result.error || 'שגיאה בשליחת המייל');
        }
      }

      // Update reminder sent timestamp
      await updateLinkReminderSent(reminderMitzva.link_id);
      await loadStats();
      showMessage("success", t("dashboard.messages.reminderSent"));
    } catch (error) {
      console.error("Error sending reminder:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      showMessage("error", t("dashboard.messages.reminderError") + ": " + errorMessage);
      throw error; // Re-throw so the modal knows it failed
    }
  };

  // Load data for edit mode
  const loadEditModeData = async () => {
    try {
      const [mitzvot, members] = await Promise.all([
        getAllMitzvot(),
        getAllMembers()
      ]);
      setAllMitzvotForEdit(mitzvot);
      setAllMembersForEdit(members);
    } catch (error) {
      console.error("Error loading edit mode data:", error);
    }
  };

  // Load edit mode data when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      loadEditModeData();
    } else {
      // Clear selection when exiting edit mode
      setEditModeSelectedIds(new Set());
      setIsSelectionMode(false);
    }
  }, [isEditMode]);

  // Handle save from ScanningModal
  const handleScanningModalSave = async (
    memberId: number,
    items: ScanningCartItem[],
    sendMessage: boolean
  ) => {
    if (!selectedWeek) return;

    try {
      // Link each mitzva to the member with the price
      for (const item of items) {
        await linkTicketToMemberSync(memberId, item.mitzva.id, selectedWeek.week_number, selectedWeek.year, item.price);
      }

      // Refresh the data
      await loadStats();
      const updatedMitzvot = await getMitzvotWithPurchasers(selectedWeek.week_number, selectedWeek.year);
      setMitzvotWithPurchasers(updatedMitzvot);
      const updatedMembers = await getMembersWithPurchases(selectedWeek.week_number, selectedWeek.year);
      setMembersWithPurchases(updatedMembers);

      // Send message if requested
      if (sendMessage) {
        const member = allMembers.find(m => m.id === memberId);
        if (member?.email) {
          const mitzvotList = items.map(i => `• ${i.mitzva.name} - ₪${i.price}`).join("\n");
          const total = items.reduce((sum, i) => sum + i.price, 0);
          const message = `שלום ${member.first_name},\n\nתודה רבה על רכישת המצוות!\n\n${mitzvotList}\n\nסה"כ: ₪${total}\n\nשבת שלום!`;

          await sendEmailReminder(
            member.email,
            `${member.first_name} ${member.last_name}`,
            message,
            user?.synagogue_name || 'בית הכנסת'
          );
        }
      }

      showMessage("success", t("dashboard.messages.purchaseSaved"));
    } catch (error) {
      console.error("Error saving purchase:", error);
      throw error;
    }
  };

  // Load data when scanning modal opens
  useEffect(() => {
    if (showScanningModal) {
      // Load members if not already loaded
      if (allMembers.length === 0) {
        loadAllMembers();
      }
      // Load mitzvot if not already loaded
      if (allMitzvotForEdit.length === 0) {
        loadEditModeData();
      }
    }
  }, [showScanningModal]);

  // Toggle selection for edit mode
  const toggleEditModeSelection = (id: number) => {
    setEditModeSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Open print modal for selected items
  const handleBulkPrint = () => {
    const isMitzva = viewMode === "mitzvot";

    const selectedItems = isMitzva
      ? mitzvotWithPurchasers
          .map((m, index) => ({ id: m.id, name: m.name, code: m.code, serialNumber: index + 1 }))
          .filter(item => editModeSelectedIds.has(item.id))
      : allMembersForView
          .map(m => ({ id: m.id, name: `${m.first_name} ${m.last_name}`, code: m.code }))
          .filter(item => editModeSelectedIds.has(item.id));

    if (selectedItems.length === 0) return;
    setPrintItems(selectedItems);
    setPrintIsMitzva(isMitzva);
    setShowPrintModal(true);
  };

  // Load all items (mitzvot + members) for the print preview
  const loadAllForPrint = async (): Promise<PrintItem[]> => {
    const [allMitzvot, allMembers] = await Promise.all([
      getAllMitzvot(),
      getAllMembers()
    ]);

    // Convert mitzvot to PrintItem format
    const mitzvotItems: PrintItem[] = allMitzvot.map((m, index) => ({
      id: m.id,
      name: m.name,
      code: m.code,
      serialNumber: index + 1,
      isMitzva: true
    }));

    // Convert members to PrintItem format
    const memberItems: PrintItem[] = allMembers.map(m => ({
      id: m.id + 100000, // Offset to avoid ID collision with mitzvot
      name: `${m.first_name} ${m.last_name}`,
      code: m.code,
      isMitzva: false
    }));

    // Combine: mitzvot first, then members
    return [...mitzvotItems, ...memberItems];
  };

  // Execute print from selected position - unified for single and bulk print
  const executePrint = async (items: PrintItem[], startPosition: number, printerName?: string, customPositions?: Map<number, number>) => {
    if (items.length === 0) return;
    setBulkActionLoading(true);
    setShowPrintModal(false);

    try {
      const qrPromises = items.map(item => generateQRDataUrl(item.code, 200));
      const qrDataUrls = await Promise.all(qrPromises);

      // Generate labels with positioning based on startPosition or custom positions
      const getItemPosition = (index: number): number => {
        return customPositions?.get(index) ?? (startPosition + index);
      };

      // Build position to item map
      const positionToItem = new Map<number, { item: typeof items[0]; qrDataUrl: string }>();
      items.forEach((item, index) => {
        const pos = getItemPosition(index);
        positionToItem.set(pos, { item, qrDataUrl: qrDataUrls[index] });
      });

      // Find max position to determine how many cells we need
      const allPositions = items.map((_, index) => getItemPosition(index));
      const maxPosition = Math.max(...allPositions);

      let labelsHtml = "";
      for (let pos = 1; pos <= maxPosition; pos++) {
        const data = positionToItem.get(pos);
        if (data) {
          labelsHtml += `
            <div class="label">
              <div class="name">${data.item.name}</div>
              <div class="qr-section">
                <img src="${data.qrDataUrl}" alt="QR" />
              </div>
            </div>
          `;
        } else {
          labelsHtml += `<div class="label placeholder"></div>`;
        }
      }

      const fullHtml = `
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <title>הדפסה</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: ${LABEL_CONFIG.topMargin}mm ${LABEL_CONFIG.leftMargin}mm;
              background: white;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(${LABEL_CONFIG.columns}, ${LABEL_CONFIG.width}mm);
              grid-auto-rows: ${LABEL_CONFIG.height}mm;
              direction: rtl;
            }
            .label {
              width: ${LABEL_CONFIG.width}mm;
              height: ${LABEL_CONFIG.height}mm;
              box-sizing: border-box;
              background: white;
              padding: 2mm;
              page-break-inside: avoid;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 1mm;
            }
            .label.placeholder { background: transparent; padding: 0; }
            .name {
              font-size: 4.5mm;
              font-weight: bold;
              color: #333;
              line-height: 1.2;
              text-align: center;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              max-width: 100%;
            }
            .qr-section {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .qr-section img { width: 12mm; height: 12mm; }
            @media print {
              body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            }
          </style>
        </head>
        <body><div class="grid">${labelsHtml}</div></body>
        </html>
      `;

      // If PDF download requested
      if (printerName === "__PDF__") {
        try {
          const { generatePDF } = await import("../utils/pdfGenerator");
          await generatePDF(
            items.map((item, index) => ({
              name: item.name,
              qrDataUrl: qrDataUrls[index],
              isMitzva: item.isMitzva, // Preserve item type for correct styling
            })),
            startPosition,
            printIsMitzva ? "mitzvot" : "members",
            customPositions
          );
          return;
        } catch (err) {
          console.error("PDF generation failed:", err);
          alert("שגיאה ביצירת PDF");
        }
        return;
      }

      // If printer name provided, use direct printing via PDF
      if (printerName) {
        try {
          const { generatePDF } = await import("../utils/pdfGenerator");
          const { invoke } = await import("@tauri-apps/api/core");

          // Generate PDF blob (rotated 180 degrees for correct printer orientation)
          const pdfBlob = await generatePDF(
            items.map((item, index) => ({
              name: item.name,
              qrDataUrl: qrDataUrls[index],
              serialNumber: item.serialNumber,
              isMitzva: item.isMitzva,
            })),
            startPosition,
            items.some(i => i.isMitzva) ? (items.every(i => i.isMitzva) ? "mitzvot" : "combined") : "members",
            customPositions,
            true, // Return blob instead of downloading
            true  // Rotate 180 degrees for printer
          ) as Blob;

          if (pdfBlob) {
            // Convert blob to base64 using FileReader (handles large files)
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
                const base64Data = dataUrl.split(',')[1];
                resolve(base64Data);
              };
              reader.onerror = reject;
              reader.readAsDataURL(pdfBlob);
            });

            // Send PDF to printer via Rust command
            await invoke("print_pdf_direct", {
              pdfBase64: base64,
              printerName: printerName,
            });

            return; // Success - exit early
          }
        } catch (err) {
          console.error("Direct print failed, falling back to browser print:", err);
          // Fall through to browser print
        }
      }

      // Fallback: Browser print dialog
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        return;
      }

      doc.open();
      doc.write(fullHtml);
      doc.close();

      setTimeout(() => {
        if (isAndroid()) {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(doc.documentElement.outerHTML);
            printWindow.document.close();
            alert('התוכן נפתח בחלון חדש. השתמש בתפריט השיתוף של המכשיר להדפסה.');
          } else {
            alert('לא ניתן להדפיס במכשיר זה. נסה להוריד את התמונות במקום.');
          }
          document.body.removeChild(iframe);
        } else {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }
      }, 500);
    } catch (error) {
      console.error('Error printing:', error);
      if (isAndroid()) {
        alert('לא ניתן להדפיס במכשיר זה. נסה להוריד את התמונות במקום.');
      }
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk download for edit mode
  const handleBulkDownload = async () => {
    const items = viewMode === "mitzvot"
      ? mitzvotWithPurchasers.filter((m: MitzvaWithPurchaser) => editModeSelectedIds.has(m.id))
      : allMembersForView.filter((m: Member) => editModeSelectedIds.has(m.id));

    if (items.length === 0) return;
    setBulkActionLoading(true);

    try {
      for (const item of items) {
        if (viewMode === "mitzvot") {
          const mitzva = item as Mitzva;
          const serialNumber = allMitzvotForEdit.findIndex((m: Mitzva) => m.id === mitzva.id) + 1;
          await generateCardPng({
            type: "mitzva",
            name: mitzva.name,
            code: mitzva.code,
            serialNumber,
          });
        } else {
          const member = item as Member;
          await generateCardPng({
            type: "member",
            name: `${member.first_name} ${member.last_name}`,
            phone: member.phone || undefined,
            email: member.email || undefined,
            code: member.code,
          });
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } finally {
      setBulkActionLoading(false);
    }
  };

  // Bulk delete for edit mode
  const handleBulkDelete = async () => {
    const count = editModeSelectedIds.size;
    if (count === 0) return;

    const confirmMessage = viewMode === "mitzvot"
      ? t("mitzvot.messages.confirmDeleteMultiple", { count })
      : t("members.messages.confirmDeleteMultiple", { count });

    if (confirm(confirmMessage)) {
      setBulkActionLoading(true);
      try {
        for (const id of editModeSelectedIds) {
          if (viewMode === "mitzvot") {
            await deleteMitzvaSync(id);
          } else {
            await deleteMemberSync(id);
          }
        }
        await loadEditModeData();
        await loadStats();
        setEditModeSelectedIds(new Set());
        setIsSelectionMode(false);
      } catch (error) {
        console.error("Error deleting:", error);
      } finally {
        setBulkActionLoading(false);
      }
    }
  };

  // Handle single item print in edit mode - uses unified modal
  const handleEditModePrint = async (item: Mitzva | Member, isMitzva: boolean) => {
    if (isMitzva) {
      const mitzva = item as Mitzva;
      const serialNumber = allMitzvotForEdit.findIndex((m: Mitzva) => m.id === mitzva.id) + 1;
      setPrintItems([{ id: mitzva.id, name: mitzva.name, code: mitzva.code, serialNumber }]);
    } else {
      const member = item as Member;
      setPrintItems([{ id: member.id, name: `${member.first_name} ${member.last_name}`, code: member.code }]);
    }
    setPrintIsMitzva(isMitzva);
    setShowPrintModal(true);
  };


  // Print member sticker at selected position on A4 page with 4x8 grid (32 labels of 52.5x35mm - Galilyon sticker sheet)
  const printMemberSticker = async (position: number) => {
    if (!printTargetMember) return;

    try {
      const qrDataUrl = await generateQRDataUrl(printTargetMember.code, 200);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;top:-10000px;left:-10000px;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        return;
      }

      // A4 portrait: 210mm x 297mm
      // Label size: 52.5mm x 35mm (from Galilyon sticker sheet)
      // Grid: 4 columns x 8 rows = 32 labels per page
      const pos = getLabelPosition(position);

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html dir="rtl">
        <head>
          <title>הדפסת מדבקה - ${printTargetMember.first_name} ${printTargetMember.last_name}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              width: ${LABEL_CONFIG.pageWidth}mm;
              height: ${LABEL_CONFIG.pageHeight}mm;
              position: relative;
              background: white;
            }
            .label-container {
              position: absolute;
              top: ${pos.top};
              right: ${pos.right};
              width: ${LABEL_CONFIG.width}mm;
              height: ${LABEL_CONFIG.height}mm;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .label {
              width: 100%;
              height: 100%;
              background: white;
              padding: 2mm;
              display: flex;
              align-items: center;
              gap: 2mm;
            }
            .info {
              flex: 1;
              text-align: center;
              overflow: hidden;
            }
            .name {
              font-size: 3.5mm;
              font-weight: bold;
              color: #333;
              line-height: 1.2;
              word-wrap: break-word;
            }
            .qr-section {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding-right: 2mm;
              border-right: 0.2mm solid #e0e0e0;
            }
            .qr-section img {
              width: 15mm;
              height: 15mm;
            }
            .code {
              font-size: 1.5mm;
              color: #999;
              margin-top: 0.5mm;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="label-container">
            <div class="label">
              <div class="info">
                <div class="name">${printTargetMember.first_name} ${printTargetMember.last_name}</div>
              </div>
              <div class="qr-section">
                <img src="${qrDataUrl}" alt="QR Code" />
                <div class="code">${printTargetMember.code.substring(0, 8)}...</div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        if (isAndroid()) {
          const printWindow = window.open('', '_blank');
          if (printWindow) {
            printWindow.document.write(doc.documentElement.outerHTML);
            printWindow.document.close();
            alert('התוכן נפתח בחלון חדש. השתמש בתפריט השיתוף של המכשיר להדפסה.');
          } else {
            alert('לא ניתן להדפיס במכשיר זה. נסה להוריד את התמונות במקום.');
          }
          document.body.removeChild(iframe);
        } else {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }
      }, 500);

      setShowPrintPositionModal(false);
      setPrintTargetMember(null);
    } catch (error) {
      console.error('Error printing sticker:', error);
      if (isAndroid()) {
        alert('לא ניתן להדפיס במכשיר זה. נסה להוריד את התמונות במקום.');
      }
    }
  };

  // Handle single item download in edit mode
  const handleEditModeDownload = async (item: Mitzva | Member, isMitzva: boolean) => {
    setDownloadingId(item.id);
    try {
      if (isMitzva) {
        const mitzva = item as Mitzva;
        const serialNumber = allMitzvotForEdit.findIndex((m: Mitzva) => m.id === mitzva.id) + 1;
        await generateCardPng({
          type: "mitzva",
          name: mitzva.name,
          code: mitzva.code,
          serialNumber,
        });
      } else {
        const member = item as Member;
        await generateCardPng({
          type: "member",
          name: `${member.first_name} ${member.last_name}`,
          phone: member.phone || undefined,
          email: member.email || undefined,
          code: member.code,
        });
      }
    } finally {
      setTimeout(() => setDownloadingId(null), 500);
    }
  };

  // Handle single item delete in edit mode
  const handleEditModeDelete = async (id: number, isMitzva: boolean) => {
    const confirmMessage = isMitzva
      ? t("mitzvot.messages.confirmDelete")
      : t("members.messages.confirmDelete");

    if (confirm(confirmMessage)) {
      try {
        if (isMitzva) {
          await deleteMitzvaSync(id);
        } else {
          await deleteMemberSync(id);
        }
        await loadEditModeData();
        await loadStats();
      } catch (error) {
        console.error("Error deleting:", error);
      }
    }
  };

  // Reset member form
  const resetMemberForm = () => {
    setMemberFirstName("");
    setMemberLastName("");
    setMemberPhone("");
    setMemberEmail("");
    setMemberNotes("");
  };

  // Reset mitzva form
  const resetMitzvaForm = () => {
    setMitzvaName("");
    setMitzvaNotes("");
    setMitzvaAvailableOnHolidays(true);
    setMitzvaHolidaysOnly(false);
  };

  // Create member
  const handleCreateMember = async () => {
    if (!memberFirstName.trim() || !memberLastName.trim()) {
      alert(t("members.messages.enterNames"));
      return;
    }

    try {
      await createMemberSync(
        memberFirstName.trim(),
        memberLastName.trim(),
        memberPhone.trim(),
        memberEmail.trim(),
        memberNotes.trim()
      );
      await loadEditModeData();
      await loadStats();
      setShowCreateMemberModal(false);
      resetMemberForm();
    } catch (error) {
      console.error("Error creating member:", error);
    }
  };

  // Create mitzva
  const handleCreateMitzva = async () => {
    if (!mitzvaName.trim()) {
      alert(t("mitzvot.messages.enterName"));
      return;
    }

    try {
      await createMitzvaSync(mitzvaName.trim(), 0, mitzvaNotes.trim() || undefined);
      await loadEditModeData();
      await loadStats();
      setShowCreateMitzvaModal(false);
      resetMitzvaForm();
    } catch (error) {
      console.error("Error creating mitzva:", error);
    }
  };

  // Open edit member modal
  const openEditMemberModal = (member: Member) => {
    setEditModeMember(member);
    setMemberFirstName(member.first_name);
    setMemberLastName(member.last_name);
    setMemberPhone(member.phone || "");
    setMemberEmail(member.email || "");
    setMemberNotes(member.notes || "");
    setShowEditMemberModal(true);
  };

  // Open edit mitzva modal
  const openEditMitzvaModal = (mitzva: Mitzva) => {
    setEditModeMitzva(mitzva);
    setMitzvaName(mitzva.name);
    setMitzvaNotes(mitzva.notes || "");
    setMitzvaAvailableOnHolidays(mitzva.available_on_holidays === 1);
    setMitzvaHolidaysOnly(mitzva.holidays_only === 1);
    setShowEditMitzvaModal(true);
  };

  // Update member
  const handleUpdateMember = async () => {
    if (!editModeMember || !memberFirstName.trim() || !memberLastName.trim()) {
      alert(t("members.messages.enterNames"));
      return;
    }

    try {
      await updateMemberSync(
        editModeMember.id,
        memberFirstName.trim(),
        memberLastName.trim(),
        memberPhone.trim(),
        memberEmail.trim(),
        memberNotes.trim()
      );
      await loadEditModeData();
      await loadStats();
      setShowEditMemberModal(false);
      setEditModeMember(null);
      resetMemberForm();
    } catch (error) {
      console.error("Error updating member:", error);
    }
  };

  // Update mitzva
  const handleUpdateMitzva = async () => {
    if (!editModeMitzva || !mitzvaName.trim()) {
      alert(t("mitzvot.messages.enterName"));
      return;
    }

    try {
      await updateMitzvaSync(
        editModeMitzva.id,
        mitzvaName.trim(),
        editModeMitzva.price,
        mitzvaNotes.trim() || undefined,
        mitzvaAvailableOnHolidays,
        mitzvaHolidaysOnly
      );
      await loadEditModeData();
      await loadStats();
      setShowEditMitzvaModal(false);
      setEditModeMitzva(null);
      resetMitzvaForm();
    } catch (error) {
      console.error("Error updating mitzva:", error);
    }
  };

  // Delete a purchase
  // Show delete confirmation modal
  const confirmDeletePurchase = (mitzva: MitzvaWithPurchaser) => {
    if (!mitzva.link_id) return;
    setDeletingPurchase(mitzva);
  };

  // Actually delete the purchase
  const deletePurchase = async () => {
    if (!deletingPurchase || !deletingPurchase.link_id) return;

    try {
      await unlinkTicketSync(deletingPurchase.link_id);
      setDeletingPurchase(null);
      await loadStats();
      showMessage("success", t("dashboard.messages.purchaseDeleted"));
    } catch (error) {
      console.error("Error deleting purchase:", error);
      showMessage("error", t("dashboard.messages.purchaseDeleteError"));
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleMemberScan = async (code: string) => {
    setScanError(null);
    const member = await getMemberByCode(code);
    if (member) {
      setCurrentMember(member);
      await loadLinkedMitzvot(member.id);
      setScanMode(null);
      showMessage("success", t("dashboard.messages.memberLoaded", { name: `${member.first_name} ${member.last_name}` }));
    } else {
      // Show error overlay on camera - don't close scanner
      setScanError({
        type: "member",
        code,
        message: t("dashboard.messages.memberNotFound", { code })
      });
      // Keep scanMode active so camera stays open
    }
  };

  const handleMitzvaScan = async (code: string) => {
    // Delegate to the full handler with no amount
    handleMitzvaScanWithAmount({ code });
  };

  const handleMitzvaScanWithAmount = async (result: ScanResult) => {
    setScanError(null);

    if (!currentMember) {
      showMessage("error", t("dashboard.messages.scanMemberFirst"));
      return;
    }

    if (!selectedWeek) {
      showMessage("error", t("dashboard.messages.selectWeekFirst"));
      return;
    }

    const mitzva = await getMitzvaByCode(result.code);
    if (!mitzva) {
      setScanError({
        type: "mitzva",
        code: result.code,
        message: t("dashboard.messages.mitzvaNotFound", { code: result.code })
      });
      return;
    }

    // Check if already in cart
    const alreadyInCart = cart.some(item => item.mitzva.id === mitzva.id);
    if (alreadyInCart) {
      setScanError({
        type: "mitzva",
        code: result.code,
        message: t("dashboard.messages.mitzvaInCart", { name: mitzva.name })
      });
      return;
    }

    const alreadyLinked = await isTicketLinkedForWeek(
      mitzva.id,
      selectedWeek.week_number,
      selectedWeek.year
    );
    if (alreadyLinked) {
      setScanError({
        type: "mitzva",
        code: result.code,
        message: t("dashboard.messages.mitzvaLinked", { name: mitzva.name })
      });
      return;
    }

    // Add directly to cart with price 0 (user can edit price later)
    setCart(prev => [...prev, { mitzva, price: 0 }]);
    showMessage("success", t("dashboard.messages.mitzvaAdded", { name: mitzva.name }));
  };

  // Remove item from cart
  const removeFromCart = (mitzvaId: number) => {
    setCart(cart.filter(item => item.mitzva.id !== mitzvaId));
  };

  // Update cart item price
  const updateCartItemPrice = (mitzvaId: number, newPrice: number) => {
    setCart(cart.map(item =>
      item.mitzva.id === mitzvaId ? { ...item, price: newPrice } : item
    ));
    setEditingCartItemId(null);
    setEditingCartPrice("");
  };

  // Start editing cart item
  const startEditCartItem = (mitzvaId: number, currentPrice: number) => {
    setEditingCartItemId(mitzvaId);
    setEditingCartPrice(currentPrice.toString());
  };

  // Cancel editing cart item
  const cancelEditCartItem = () => {
    setEditingCartItemId(null);
    setEditingCartPrice("");
  };

  const resetMember = () => {
    setCurrentMember(null);
    setLinkedMitzvot([]);
    setCart([]);
    setScanMode(null);
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
    }).format(price);
  };

  const getCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.price, 0);
  };

  // Generate payment message for preview using template
  const generatePaymentMessage = () => {
    if (!currentMember) return "";

    const mitzvotList = cart.map(item => `• ${item.mitzva.name}: ${formatPrice(item.price)}`).join("\n");
    const total = getCartTotal();
    const memberName = `${currentMember.first_name} ${currentMember.last_name}`;

    // Replace template placeholders with actual values
    return messageTemplate
      .replace(/{MEMBER_NAME}/g, memberName)
      .replace(/{MITZVOT_LIST}/g, mitzvotList)
      .replace(/{TOTAL}/g, formatPrice(total));
  };

  // Save all cart items to database and send message directly
  const finishAndSend = async () => {
    if (!currentMember || !selectedWeek) {
      resetMember();
      return;
    }

    if (cart.length === 0) {
      showMessage("error", t("dashboard.messages.noItemsInCart"));
      return;
    }

    try {
      // Save each cart item to database with bid price (with sync)
      for (const item of cart) {
        await linkTicketToMemberSync(
          currentMember.id,
          item.mitzva.id,
          selectedWeek.week_number,
          selectedWeek.year,
          item.price
        );
      }

      // Send email if member has email address
      if (currentMember.email) {
        const messageToSend = editableMessage || generatePaymentMessage();
        try {
          const result = await sendEmailReminder(
            currentMember.email,
            `${currentMember.first_name} ${currentMember.last_name}`,
            messageToSend,
            'בית הכנסת' // TODO: Get synagogue name from user data
          );
          if (!result.success) {
            console.error('Email send failed:', result.error);
            // Don't fail the whole operation, just log the error
          }
        } catch (emailError) {
          console.error('Error sending email:', emailError);
          // Don't fail the whole operation
        }
      }

      await loadStats();
      const total = getCartTotal();
      showMessage("success", t("dashboard.messages.savedSuccess", { name: currentMember.first_name, count: cart.length, total: formatPrice(total) }));
      resetMember();
    } catch (error) {
      console.error("Error saving cart:", error);
      showMessage("error", t("dashboard.messages.saveError"));
    }
  };

  // Save current scan as draft (for continuing on another device)
  const saveAsDraft = async () => {
    if (!currentMember || !selectedWeek || cart.length === 0) {
      showMessage("error", "אין מה לשמור כטיוטה");
      return;
    }

    const user = getStoredUser();
    if (!user) {
      showMessage("error", "יש להתחבר כדי לשמור טיוטה");
      return;
    }

    setSavingDraft(true);
    try {
      const draft: Omit<ScanDraft, 'userId'> = {
        id: `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        member: {
          id: currentMember.id,
          code: currentMember.code,
          first_name: currentMember.first_name,
          last_name: currentMember.last_name,
          email: currentMember.email,
          phone: currentMember.phone,
        },
        cart: cart.map(item => ({
          mitzva: {
            id: item.mitzva.id,
            code: item.mitzva.code,
            name: item.mitzva.name,
            price: item.mitzva.price,
          },
          price: item.price,
        })),
        week: {
          week_number: selectedWeek.week_number,
          year: selectedWeek.year,
          parasha_name_he: selectedWeek.parasha_name_he,
          shabbat_date: selectedWeek.shabbat_date,
        },
        message: editableMessage || generatePaymentMessage(),
        createdAt: new Date().toISOString(),
        createdOnDevice: isAndroid() ? 'android' : 'desktop',
      };

      await saveDraft(user.email, draft);
      showMessage("success", "נשמר כטיוטה! תוכל להמשיך ממכשיר אחר");
      resetMember();
    } catch (error) {
      console.error("Error saving draft:", error);
      showMessage("error", "שגיאה בשמירת הטיוטה");
    } finally {
      setSavingDraft(false);
    }
  };

  // Load a draft and continue editing
  const loadDraft = async (draft: ScanDraft) => {
    try {
      // Get the member from database by code
      const member = await getMemberByCode(draft.member.code);
      if (!member) {
        showMessage("error", "המתפלל לא נמצא במערכת");
        return;
      }

      // Restore the cart - need to get fresh mitzva data
      const restoredCart: CartItem[] = [];
      for (const item of draft.cart) {
        const mitzva = await getMitzvaByCode(item.mitzva.code);
        if (mitzva) {
          restoredCart.push({
            mitzva,
            price: item.price,
          });
        }
      }

      if (restoredCart.length === 0) {
        showMessage("error", "המצוות מהטיוטה לא נמצאו במערכת");
        return;
      }

      // Set the state
      setCurrentMember(member);
      setCart(restoredCart);
      setEditableMessage(draft.message);
      setShowDraftsPanel(false);

      showMessage("success", `טיוטה נטענה: ${member.first_name} ${member.last_name} עם ${restoredCart.length} מצוות`);
    } catch (error) {
      console.error("Error loading draft:", error);
      showMessage("error", "שגיאה בטעינת הטיוטה");
    }
  };

  // Delete a draft
  const removeDraft = async (draftId: string) => {
    const user = getStoredUser();
    if (!user) return;

    try {
      await deleteDraft(user.email, draftId);
      showMessage("success", "הטיוטה נמחקה");
    } catch (error) {
      console.error("Error deleting draft:", error);
      showMessage("error", "שגיאה במחיקת הטיוטה");
    }
  };

  if (loading) {
    return <div className="empty-state">{t("common.loading")}</div>;
  }

  return (
    <div className={isMobile ? "container" : "dashboard-desktop"}>
      {message && (
        <div
          style={{
            position: "fixed",
            top: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "15px 30px",
            borderRadius: "8px",
            background: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
            zIndex: 1000,
            boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* New Desktop Header - only show on desktop */}
      {!isMobile && (
        <DashboardHeader
          userName={getUserName()}
          userInitials={getUserInitials()}
          synagogueName={user?.synagogue_name}
          selectedWeek={selectedWeek}
          onPrevWeek={() => {/* TODO: Implement week navigation */}}
          onNextWeek={() => {/* TODO: Implement week navigation */}}
          onOpenWeekSelector={onOpenWeekSelector}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onLogout={onLogout}
          gmailConnected={gmailConnected}
          gmailEmail={gmailEmail}
          onConnectGmail={onConnectGmail}
        />
      )}

      {/* Week Display - only on mobile, desktop has it in header */}
      {isMobile && <WeekDisplay week={selectedWeek} onWeekChange={setSelectedWeek} />}

      {/* Drafts Button - show when there are pending drafts */}
      {drafts.length > 0 && (
        <button
          onClick={() => setShowDraftsPanel(true)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            width: "100%",
            padding: "12px 20px",
            marginBottom: "15px",
            background: "linear-gradient(135deg, #FF9800 0%, #F57C00 100%)",
            color: "white",
            border: "none",
            borderRadius: "12px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "1rem",
            boxShadow: "0 2px 8px rgba(255, 152, 0, 0.3)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21"/>
            <polyline points="7 3 7 8 15 8"/>
          </svg>
          יש {drafts.length} טיוטות ממתינות - לחץ להמשך
          <span style={{
            background: "white",
            color: "#F57C00",
            borderRadius: "50%",
            width: "24px",
            height: "24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: "bold",
            fontSize: "0.9rem",
          }}>
            {drafts.length}
          </span>
        </button>
      )}

      {/* Drafts Panel Modal */}
      {showDraftsPanel && (
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
          onClick={() => setShowDraftsPanel(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, color: "#1E5AA8" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "8px", verticalAlign: "middle" }}>
                  <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                טיוטות ממתינות ({drafts.length})
              </h2>
              <button
                onClick={() => setShowDraftsPanel(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: "#666",
                }}
              >
                ×
              </button>
            </div>

            {drafts.length === 0 ? (
              <p style={{ textAlign: "center", color: "#666" }}>אין טיוטות ממתינות</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {drafts.map((draft) => (
                  <div
                    key={draft.id}
                    style={{
                      background: "#f8f9fa",
                      borderRadius: "12px",
                      padding: "15px",
                      border: "1px solid #e0e0e0",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontWeight: "bold", color: "#1E5AA8", fontSize: "1.1rem" }}>
                          {draft.member.first_name} {draft.member.last_name}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#666" }}>
                          {draft.cart.length} מצוות | סה"כ: {formatPrice(draft.cart.reduce((sum, item) => sum + item.price, 0))}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "#999", marginTop: "4px" }}>
                          {draft.week.parasha_name_he || `שבוע ${draft.week.week_number}`}
                        </div>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#999", textAlign: "left" }}>
                        <div>{draft.createdOnDevice === 'android' ? '📱' : '💻'}</div>
                        <div>{new Date(draft.createdAt).toLocaleDateString('he-IL')}</div>
                        <div>{new Date(draft.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        onClick={() => loadDraft(draft)}
                        style={{
                          flex: 1,
                          padding: "10px",
                          background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="1 4 1 10 7 10"/>
                          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                        </svg>
                        המשך
                      </button>
                      <button
                        onClick={() => removeDraft(draft.id)}
                        style={{
                          padding: "10px 15px",
                          background: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontWeight: "bold",
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Desktop Navigation Tabs */}
      {!isMobile && (
        <NavTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          membersCount={stats?.totalMembers}
          mitzvotCount={stats?.totalMitzvot}
        />
      )}

      {/* Desktop Main Content - New Design */}
      {!isMobile && activeTab === "home" && (
        <main className="main-content">
          <div className="content-layout">
            {/* Main Table */}
            <PurchasesTable
              members={membersWithPurchases}
              totalMembers={membersWithPurchases.length}
              totalMitzvot={stats?.totalMitzvot || 0}
              totalAmount={getTotalAmount()}
              onScan={() => setShowScanningModal(true)}
              onFilter={() => {/* TODO */}}
              onExport={() => {/* TODO */}}
              onEditPurchase={(memberId) => {
                const member = membersWithPurchases.find(m => m.id === memberId);
                if (member) {
                  setDetailsMember(member);
                  setShowMemberDetailsModal(true);
                }
              }}
              onSendReminder={(memberId) => {
                const mitzva = mitzvotWithPurchasers.find(m => m.purchaser_id === memberId);
                if (mitzva) openReminderModal(mitzva);
              }}
              searchQuery={searchQuery}
            />

            {/* Sidebar Widgets */}
            <div className="sidebar-widgets">
              <ProgressWidget
                totalAmount={getTotalAmount()}
                paidAmount={getPaidAmount()}
              />
              <UnpaidWidget
                members={getUnpaidMembers()}
                totalUnpaid={getTotalAmount() - getPaidAmount()}
                onSendReminder={(memberId) => {
                  const mitzva = mitzvotWithPurchasers.find(m => m.purchaser_id === memberId);
                  if (mitzva) openReminderModal(mitzva);
                }}
                onSendAllReminders={() => {
                  const firstUnpaid = mitzvotWithPurchasers.find(m => m.payment_status !== 'paid' && m.purchaser_id);
                  if (firstUnpaid) openReminderModal(firstUnpaid);
                }}
              />
            </div>
          </div>
        </main>
      )}

      {/* Desktop Members Page */}
      {!isMobile && activeTab === "members" && (
        <MembersPage currentUser={user} />
      )}

      {/* Desktop Mitzvot Page */}
      {!isMobile && activeTab === "mitzvot" && (
        <MitzvotPage />
      )}

      {/* Desktop Archive Page */}
      {!isMobile && activeTab === "archive" && (
        <ArchivePage
          onSendReminder={(memberId) => {
            // Find member's mitzva to send reminder
            const memberMitzvot = mitzvotWithPurchasers.filter(m => m.purchaser_id === memberId);
            if (memberMitzvot.length > 0) {
              openReminderModal(memberMitzvot[0]);
            }
          }}
          onEditPurchase={(memberId) => {
            const memberMitzvot = mitzvotWithPurchasers.filter(m => m.purchaser_id === memberId);
            if (memberMitzvot.length > 0) {
              startEditPurchase(memberMitzvot[0]);
            }
          }}
        />
      )}

      {/* Desktop Print Labels Page */}
      {!isMobile && activeTab === "print" && (
        <PrintLabelsPage
          onPrint={executePrint}
          loading={bulkActionLoading}
        />
      )}

      {/* Mobile Content - Old Design */}
      {isMobile && (
      <div>
      {/* Main Scanning Section */}
      <div
        style={{
          background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
          borderRadius: "16px",
          padding: "30px",
          color: "white",
          marginBottom: "30px",
        }}
      >
        <h1 style={{ marginBottom: "20px", textAlign: "center", color: "#D4AF37" }}>{t("dashboard.scanMitzvot")}</h1>

        {!currentMember ? (
          // Step 1: Scan Member
          <div style={{ textAlign: "center" }}>
            {scanMode === "member" ? (
              <div style={{ background: "white", borderRadius: "12px", padding: "20px", position: "relative" }}>
                {/* Header with title and error message */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  marginBottom: "10px",
                  minHeight: "28px",
                }}>
                  {/* Camera icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <h4 style={{ margin: 0, color: "#1E5AA8" }}>
                    {t("dashboard.scanMember")}
                  </h4>

                  {/* Inline error message with retry */}
                  {scanError && scanError.type === "member" && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      background: "#fff3cd",
                      border: "1px solid #ffc107",
                      borderRadius: "16px",
                      fontSize: "0.8rem",
                      color: "#856404",
                    }}>
                      <span style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {scanError.message}
                      </span>
                      <button
                        onClick={() => {
                          setScanError(null);
                          setScanResetTrigger(t => t + 1);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "22px",
                          height: "22px",
                          background: "#1E5AA8",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        title={t("common.tryAgain")}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 4v6h-6"/>
                          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                <QRScanner
                  onScan={handleMemberScan}
                  onClose={() => { setScanMode(null); setScanError(null); }}
                  stopOnScan={false}
                  resetTrigger={scanResetTrigger}
                  showCameraSelector={true}
                />
                <ManualQRInput onSubmit={handleMemberScan} />
              </div>
            ) : (
              <>
                <p style={{ fontSize: "1.2rem", marginBottom: "20px" }}>
                  {t("dashboard.startScanMember")}
                </p>
                <button
                  onClick={() => setScanMode("member")}
                  style={{
                    padding: "20px 40px",
                    fontSize: "1.3rem",
                    background: "white",
                    color: "#1E5AA8",
                    border: "none",
                    borderRadius: "12px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                  }}
                >
                  {t("dashboard.scanMember")}
                </button>
              </>
            )}
          </div>
        ) : (
          // Step 2: Member loaded - side-by-side scanner and cart
          <div>
            {/* Member Header */}
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "20px",
              flexWrap: "wrap",
              gap: "15px"
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.8rem" }}>
                  {currentMember.first_name} {currentMember.last_name}
                </h2>
                {(currentMember.phone || currentMember.email) && (
                  <p style={{ margin: "5px 0 0 0", opacity: 0.8, fontSize: "0.9rem" }}>
                    {currentMember.phone && <span>{currentMember.phone}</span>}
                    {currentMember.phone && currentMember.email && " • "}
                    {currentMember.email && <span>{currentMember.email}</span>}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={resetMember}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(255,255,255,0.2)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.4)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {t("dashboard.changeMember")}
                </button>
                <button
                  onClick={resetMember}
                  style={{
                    padding: "8px 16px",
                    background: "rgba(255,255,255,0.2)",
                    color: "#ff6b6b",
                    border: "1px solid rgba(255,107,107,0.6)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                  }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>

            {/* Three-column layout on desktop, vertical on mobile: Scanner + Cart + Message Preview */}
            <div style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: "15px",
              minHeight: isMobile ? "auto" : "400px",
            }}>
              {/* Left side: QR Scanner - Always visible */}
              <div style={{
                background: "white",
                borderRadius: "12px",
                padding: "15px",
                position: "relative",
                flex: isMobile ? "none" : 1,
              }}>
                {/* Header with title and error message */}
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  marginBottom: "10px",
                  minHeight: "28px",
                }}>
                  {/* Camera icon */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <h4 style={{ margin: 0, color: "#1E5AA8" }}>
                    {t("dashboard.scanMitzva")}
                  </h4>

                  {/* Inline error message with retry */}
                  {scanError && scanError.type === "mitzva" && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      background: "#fff3cd",
                      border: "1px solid #ffc107",
                      borderRadius: "16px",
                      fontSize: "0.8rem",
                      color: "#856404",
                    }}>
                      <span style={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {scanError.message}
                      </span>
                      <button
                        onClick={() => {
                          setScanError(null);
                          setScanResetTrigger(t => t + 1);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "22px",
                          height: "22px",
                          background: "#1E5AA8",
                          color: "white",
                          border: "none",
                          borderRadius: "50%",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        title={t("common.tryAgain")}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 4v6h-6"/>
                          <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* QR Scanner - always visible */}
                <QRScanner
                  onScan={handleMitzvaScan}
                  onClose={() => { setScanError(null); }}
                  stopOnScan={false}
                  resetTrigger={scanResetTrigger}
                  hideCloseButton={true}
                  showCameraSelector={true}
                />
                <ManualQRInput onSubmit={handleMitzvaScan} />
              </div>

              {/* Middle: Cart list */}
              <div style={{
                background: "white",
                borderRadius: "12px",
                padding: "15px",
                display: "flex",
                flexDirection: "column",
                flex: isMobile ? "none" : 1,
              }}>
                <h4 style={{ margin: "0 0 10px 0", color: "#1E5AA8" }}>
                  {t("dashboard.cartItems")} ({cart.length})
                </h4>

                {/* Cart items list */}
                <div style={{ flex: 1, overflowY: "auto", marginBottom: "15px" }}>
                  {cart.length === 0 ? (
                    <div style={{
                      textAlign: "center",
                      padding: "40px 20px",
                      color: "#999",
                      fontSize: "0.9rem"
                    }}>
                      {t("dashboard.messages.noItemsInCart")}
                      <br />
                      <span style={{ fontSize: "0.8rem" }}>סרוק מצווה כדי להתחיל</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {cart.map((item, index) => (
                        <div
                          key={item.mitzva.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "10px 12px",
                            background: item.price === 0 ? "#fff3cd" : "#f8f9fa",
                            borderRadius: "8px",
                            border: item.price === 0 ? "2px solid #ffc107" : "1px solid #e0e0e0",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{
                              background: item.price === 0 ? "#ffc107" : "#4FA8D9",
                              color: item.price === 0 ? "#856404" : "white",
                              width: "22px",
                              height: "22px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.75rem",
                              fontWeight: "bold",
                            }}>
                              {index + 1}
                            </span>
                            <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#333" }}>{item.mitzva.name}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {/* Show input field if price is 0 OR if editing */}
                            {item.price === 0 || editingCartItemId === item.mitzva.id ? (
                              <>
                                <input
                                  type="number"
                                  value={editingCartItemId === item.mitzva.id ? editingCartPrice : ""}
                                  onChange={(e) => setEditingCartPrice(e.target.value)}
                                  onFocus={() => {
                                    if (editingCartItemId !== item.mitzva.id) {
                                      setEditingCartItemId(item.mitzva.id);
                                      setEditingCartPrice("");
                                    }
                                  }}
                                  autoFocus={item.price === 0}
                                  placeholder="₪"
                                  style={{
                                    width: "70px",
                                    padding: "6px 8px",
                                    fontSize: "1rem",
                                    borderRadius: "6px",
                                    border: "2px solid #ffc107",
                                    textAlign: "center",
                                    fontWeight: "bold",
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const newPrice = parseFloat(editingCartPrice) || 0;
                                      if (newPrice > 0) {
                                        updateCartItemPrice(item.mitzva.id, newPrice);
                                      }
                                    }
                                    if (e.key === "Escape") {
                                      cancelEditCartItem();
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    const newPrice = parseFloat(editingCartPrice) || 0;
                                    if (newPrice > 0) {
                                      updateCartItemPrice(item.mitzva.id, newPrice);
                                    }
                                  }}
                                  style={{
                                    padding: "6px 10px",
                                    background: "#28a745",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "0.9rem",
                                    fontWeight: "bold",
                                  }}
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => removeFromCart(item.mitzva.id)}
                                  style={{
                                    padding: "6px 10px",
                                    background: "#dc3545",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "6px",
                                    cursor: "pointer",
                                    fontSize: "0.9rem",
                                  }}
                                >
                                  ✕
                                </button>
                              </>
                            ) : (
                              <>
                                <span
                                  onClick={() => startEditCartItem(item.mitzva.id, item.price)}
                                  style={{
                                    color: "#1E5AA8",
                                    fontWeight: "bold",
                                    fontSize: "1rem",
                                    cursor: "pointer",
                                    padding: "4px 8px",
                                    borderRadius: "6px",
                                    background: "#f0ebe3",
                                  }}
                                  title="לחץ לעריכה"
                                >
                                  {formatPrice(item.price)}
                                </span>
                                <button
                                  onClick={() => removeFromCart(item.mitzva.id)}
                                  style={{
                                    padding: "4px 8px",
                                    background: "transparent",
                                    color: "#dc3545",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    fontSize: "0.8rem",
                                  }}
                                >
                                  ✕
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Total and finish button */}
                {cart.length > 0 && (
                  <div style={{ borderTop: "2px solid #4FA8D9", paddingTop: "15px" }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}>
                      <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#333" }}>{t("dashboard.totalToPay")}</span>
                      <span style={{ fontSize: "1.3rem", fontWeight: "bold", color: "#1E5AA8" }}>
                        {formatPrice(getCartTotal())}
                      </span>
                    </div>

                    <button
                      onClick={finishAndSend}
                      style={{
                        width: "100%",
                        padding: "12px",
                        fontSize: "1.1rem",
                        background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                        color: "white",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: "bold",
                        boxShadow: "0 2px 6px rgba(139, 115, 85, 0.3)",
                        marginBottom: "8px",
                      }}
                    >
                      {t("dashboard.messagePreview.sendAndSave")}
                    </button>

                    {/* Save as Draft button */}
                    <button
                      onClick={saveAsDraft}
                      disabled={savingDraft}
                      style={{
                        width: "100%",
                        padding: "10px",
                        fontSize: "0.95rem",
                        background: "white",
                        color: "#1E5AA8",
                        border: "2px solid #4FA8D9",
                        borderRadius: "8px",
                        cursor: savingDraft ? "wait" : "pointer",
                        fontWeight: "bold",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        opacity: savingDraft ? 0.7 : 1,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      {savingDraft ? "שומר..." : "שמור כטיוטה (להמשיך אח\"כ)"}
                    </button>
                  </div>
                )}
              </div>

              {/* Right side: Message Preview */}
              <div style={{
                background: "white",
                borderRadius: "12px",
                padding: isMobile ? "20px" : "15px",
                display: "flex",
                flexDirection: "column",
                flex: isMobile ? "none" : 1,
                minHeight: isMobile ? "300px" : "auto",
              }}>
                <h4 style={{ margin: "0 0 10px 0", color: "#1E5AA8" }}>
                  {t("dashboard.messagePreview.title")}
                </h4>

                {/* Member notification preferences */}
                {currentMember?.notification_preferences && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "10px",
                    padding: "8px 12px",
                    background: "#f0f7ff",
                    borderRadius: "8px",
                    fontSize: "0.85rem",
                    flexWrap: "wrap",
                  }}>
                    <span style={{ color: "#163D75", fontSize: "0.8rem" }}>{t("dashboard.notificationWillBeSent")}</span>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {currentMember.notification_preferences.includes("whatsapp") && (
                        <span style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                          color: "white",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          boxShadow: "0 1px 3px rgba(139, 115, 85, 0.2)",
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                          </svg>
                          {t("dashboard.whatsapp")}
                        </span>
                      )}
                      {currentMember.notification_preferences.includes("sms") && (
                        <span style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                          color: "white",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          boxShadow: "0 1px 3px rgba(139, 115, 85, 0.2)",
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                          </svg>
                          {t("dashboard.sms")}
                        </span>
                      )}
                      {currentMember.notification_preferences.includes("email") && (
                        <span style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "4px 10px",
                          background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                          color: "white",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: "500",
                          boxShadow: "0 1px 3px rgba(139, 115, 85, 0.2)",
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                          </svg>
                          {t("common.email")}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {cart.length === 0 ? (
                  <div style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: "0.9rem",
                    textAlign: "center",
                    padding: "20px",
                  }}>
                    {t("dashboard.messagePreview.scanToPreview")}
                  </div>
                ) : (
                  <>
                    <textarea
                      value={editableMessage || generatePaymentMessage()}
                      onChange={(e) => setEditableMessage(e.target.value)}
                      style={{
                        flex: 1,
                        width: "100%",
                        padding: "12px",
                        fontSize: "0.9rem",
                        fontFamily: "inherit",
                        borderRadius: "8px",
                        border: "1px solid #d4c4a8",
                        resize: "none",
                        direction: "rtl",
                        lineHeight: "1.6",
                        background: "#fafafa",
                        minHeight: isMobile ? "200px" : "150px",
                      }}
                    />
                    <div style={{
                      marginTop: "10px",
                      fontSize: "0.8rem",
                      color: "#666",
                      textAlign: "center",
                    }}>
                      {t("dashboard.messagePreview.editMessage")}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats - only on mobile */}
        <div className="stats-container">
          <div className="stat-card">
            <div className="stat-value">{stats?.totalMembers || 0}</div>
            <div className="stat-label">{t("dashboard.stats.members")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalMitzvot || 0}</div>
            <div className="stat-label">{t("dashboard.stats.mitzvot")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.totalLinks || 0}</div>
            <div className="stat-label">{t("dashboard.stats.soldThisWeek")}</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats?.unlinkedMitzvot || 0}</div>
            <div className="stat-label">{t("dashboard.stats.availableThisWeek")}</div>
          </div>
        </div>

      {/* Purchase List - always visible */}
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          padding: "30px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          marginTop: "30px",
        }}
      >
          {/* Header with view toggle */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
            flexWrap: "wrap",
            gap: "15px"
          }}>
            <h2 style={{ margin: 0 }}>{t("dashboard.purchases.title")}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                display: "flex",
                background: "#f0f0f0",
                borderRadius: "8px",
                padding: "4px"
              }}>
                <button
                  onClick={() => setViewMode("mitzvot")}
                  style={{
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: viewMode === "mitzvot" ? "bold" : "normal",
                    background: viewMode === "mitzvot" ? "#1E5AA8" : "transparent",
                    color: viewMode === "mitzvot" ? "white" : "#333",
                    transition: "all 0.2s ease"
                  }}
                >
                  {t("dashboard.purchases.byMitzva")}
                </button>
                <button
                  onClick={() => setViewMode("members")}
                  style={{
                    padding: "8px 16px",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: viewMode === "members" ? "bold" : "normal",
                    background: viewMode === "members" ? "#1E5AA8" : "transparent",
                    color: viewMode === "members" ? "white" : "#333",
                    transition: "all 0.2s ease"
                  }}
                >
                  {t("dashboard.purchases.byMember")}
                </button>
              </div>
              {/* Edit Mode Toggle Button */}
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                title={isEditMode ? "חזור לתצוגה רגילה" : "מצב עריכה"}
                style={{
                  padding: "8px 14px",
                  border: isEditMode ? "2px solid #1E5AA8" : "2px solid #4FA8D9",
                  borderRadius: "8px",
                  cursor: "pointer",
                  background: isEditMode
                    ? "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)"
                    : "linear-gradient(135deg, #f0f7ff 0%, #ede4d8 100%)",
                  color: isEditMode ? "white" : "#163D75",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "all 0.2s ease",
                  fontWeight: "500",
                  fontSize: "0.9rem"
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                {isEditMode ? "סגור עריכה" : "עריכה"}
              </button>
            </div>
          </div>

          {/* Edit Mode Actions Bar */}
          {isEditMode && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "15px 20px",
              background: viewMode === "mitzvot" ? "#f5f0eb" : "#f0f7ff",
              borderRadius: "12px",
              marginBottom: "20px",
              flexWrap: "wrap"
            }}>
              {/* Add New Button + Multi-select toggle on same row */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <button
                  onClick={() => viewMode === "mitzvot" ? setShowCreateMitzvaModal(true) : setShowCreateMemberModal(true)}
                  style={{
                    padding: "10px 20px",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    background: viewMode === "mitzvot" ? "#1E5AA8" : "#4FA8D9",
                    color: "white",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  {viewMode === "mitzvot" ? t("mitzvot.addNew") : t("members.addNew")}
                </button>

                {/* Multi-select toggle */}
                <button
                  onClick={() => {
                    if (isSelectionMode) {
                      setEditModeSelectedIds(new Set());
                      setIsSelectionMode(false);
                    } else {
                      setIsSelectionMode(true);
                    }
                  }}
                  style={{
                    padding: "10px 16px",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    background: isSelectionMode ? "#6c757d" : "#1E5AA8",
                    color: "white",
                    fontWeight: "500"
                  }}
                >
                  {isSelectionMode ? t("common.cancelSelection") : t("common.multiSelect")}
                </button>
              </div>

              {/* Bulk actions when in selection mode */}
              {isSelectionMode && (
                <>
                  <span style={{ color: viewMode === "mitzvot" ? "#1E5AA8" : "#1E5AA8", fontWeight: "bold" }}>
                    {t("common.selected")}: {editModeSelectedIds.size}
                  </span>
                  <button
                    onClick={() => {
                      const items = viewMode === "mitzvot" ? mitzvotWithPurchasers : allMembersForView;
                      setEditModeSelectedIds(new Set(items.map(item => item.id)));
                    }}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      cursor: "pointer",
                      background: "white",
                      fontSize: "0.85rem"
                    }}
                  >
                    {t("common.selectAll")}
                  </button>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={handleBulkPrint}
                    disabled={editModeSelectedIds.size === 0 || bulkActionLoading}
                    style={{
                      padding: "8px 15px",
                      border: "none",
                      borderRadius: "6px",
                      cursor: editModeSelectedIds.size === 0 ? "not-allowed" : "pointer",
                      background: editModeSelectedIds.size === 0 ? "#ccc" : viewMode === "mitzvot" ? "#1E5AA8" : "#1E5AA8",
                      color: "white",
                      fontSize: "0.85rem"
                    }}
                  >
                    🖨️ {t("common.print")} ({editModeSelectedIds.size})
                  </button>
                  <button
                    onClick={handleBulkDownload}
                    disabled={editModeSelectedIds.size === 0 || bulkActionLoading}
                    style={{
                      padding: "8px 15px",
                      border: "none",
                      borderRadius: "6px",
                      cursor: editModeSelectedIds.size === 0 ? "not-allowed" : "pointer",
                      background: editModeSelectedIds.size === 0 ? "#ccc" : "#6c757d",
                      color: "white",
                      fontSize: "0.85rem"
                    }}
                  >
                    {bulkActionLoading ? t("common.downloading") : `🖼️ ${t("common.download")} (${editModeSelectedIds.size})`}
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={editModeSelectedIds.size === 0 || bulkActionLoading}
                    style={{
                      padding: "8px 15px",
                      border: "none",
                      borderRadius: "6px",
                      cursor: editModeSelectedIds.size === 0 ? "not-allowed" : "pointer",
                      background: editModeSelectedIds.size === 0 ? "#ccc" : "#dc3545",
                      color: "white",
                      fontSize: "0.85rem"
                    }}
                  >
                    🗑️ {t("common.delete")} ({editModeSelectedIds.size})
                  </button>
                </>
              )}
            </div>
          )}

          {/* Mitzvot View */}
          {viewMode === "mitzvot" && (
            <div>
              {/* Edit Mode - Show weekly purchased mitzvot with QR cards (same style as MitzvaManager) */}
              {isEditMode ? (
                mitzvotWithPurchasers.length === 0 ? (
                  <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>
                    {t("dashboard.purchases.noMitzvot")}
                  </p>
                ) : (
                  <div className="cards-grid">
                    {mitzvotWithPurchasers.map((mitzva: MitzvaWithPurchaser, index: number) => (
                      <div
                        key={mitzva.id}
                        className="card ticket"
                        onClick={isSelectionMode ? () => toggleEditModeSelection(mitzva.id) : undefined}
                        style={{
                          padding: "20px",
                          position: "relative",
                          border: isSelectionMode && editModeSelectedIds.has(mitzva.id) ? "2px solid #1E5AA8" : undefined,
                          background: isSelectionMode && editModeSelectedIds.has(mitzva.id) ? "#faf7f4" : undefined,
                          cursor: isSelectionMode ? "pointer" : undefined
                        }}
                      >
                        {/* Serial number badge */}
                        <div style={{
                          position: "absolute",
                          top: "10px",
                          right: "10px",
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
                          color: "#E3F2FD",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          fontSize: "18px",
                          fontFamily: "'David Libre', 'Frank Ruhl Libre', 'Times New Roman', serif",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                          border: "2px solid #4FA8D9"
                        }}>
                          {index + 1}
                        </div>

                        {/* Selection checkbox */}
                        {isSelectionMode && (
                          <div style={{
                            position: "absolute",
                            top: "10px",
                            left: "10px",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            border: editModeSelectedIds.has(mitzva.id) ? "none" : "2px solid #ccc",
                            background: editModeSelectedIds.has(mitzva.id) ? "#1E5AA8" : "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "14px"
                          }}>
                            {editModeSelectedIds.has(mitzva.id) && "✓"}
                          </div>
                        )}

                        {/* Main content area */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "15px" }}>
                          {/* Mitzva info - center with large font */}
                          <div style={{ flex: 1, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <h3 style={{
                              fontSize: "1.8rem",
                              color: "#163D75",
                              margin: "0",
                              fontWeight: "bold"
                            }}>
                              {mitzva.name}
                            </h3>
                          </div>

                          {/* QR code - small on side */}
                          <div style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            paddingRight: "15px",
                            borderRight: "1px solid #e0e0e0"
                          }}>
                            <QRGenerator value={mitzva.code} size={60} />
                            <span style={{
                              fontSize: "0.6rem",
                              color: "#999",
                              marginTop: "5px",
                              maxWidth: "70px",
                              overflow: "hidden",
                              textOverflow: "ellipsis"
                            }}>
                              {mitzva.code.substring(0, 8)}...
                            </span>
                          </div>
                        </div>

                        {/* Action buttons - hidden in selection mode */}
                        {!isSelectionMode && (
                          <div style={{
                            display: "flex",
                            gap: "6px",
                            marginTop: "15px",
                            justifyContent: "center",
                            flexWrap: "nowrap",
                            paddingTop: "12px",
                            borderTop: "1px solid #eee"
                          }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => openEditMitzvaModal(mitzva)}
                              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              className="btn"
                              onClick={() => handleEditModePrint(mitzva, true)}
                              style={{ padding: "6px 10px", fontSize: "0.8rem", background: "#1E5AA8", color: "white" }}
                            >
                              🖨️
                            </button>
                            <button
                              className="btn"
                              onClick={() => handleEditModeDownload(mitzva, true)}
                              disabled={downloadingId === mitzva.id}
                              style={{
                                padding: "6px 10px",
                                fontSize: "0.8rem",
                                background: downloadingId === mitzva.id ? "#28a745" : "#6c757d",
                                color: "white",
                                transition: "all 0.3s ease",
                                opacity: downloadingId === mitzva.id ? 0.8 : 1
                              }}
                            >
                              {downloadingId === mitzva.id ? "..." : "🖼️"}
                            </button>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleEditModeDelete(mitzva.id, true)}
                              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
              /* Normal mode - Show purchases */
              mitzvotWithPurchasers.length === 0 ? (
                <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>
                  {t("dashboard.purchases.noMitzvot")}
                </p>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "15px"
                }}>
                  {mitzvotWithPurchasers.map((mitzva) => (
                    <div
                      key={mitzva.id}
                      style={{
                        padding: "20px 15px",
                        borderRadius: "12px",
                        border: mitzva.purchaser_id ? "2px solid #4FA8D9" : "2px solid #e0e0e0",
                        background: mitzva.purchaser_id ? "#fdfbf7" : "#fafafa",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        textAlign: "center",
                        position: "relative",
                        minHeight: "140px"
                      }}
                    >
                      {/* Action buttons - top corners */}
                      {mitzva.purchaser_id && (
                        <>
                          {/* Left side: Delete & Edit */}
                          <div style={{
                            position: "absolute",
                            top: "8px",
                            left: "8px",
                            display: "flex",
                            gap: "4px"
                          }}>
                            <button
                              onClick={() => confirmDeletePurchase(mitzva)}
                              title={t("common.delete")}
                              style={{
                                padding: "4px 6px",
                                background: "transparent",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                color: "#ccc",
                                transition: "color 0.2s ease"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = "#dc3545"}
                              onMouseLeave={(e) => e.currentTarget.style.color = "#ccc"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => startEditPurchase(mitzva)}
                              title={t("common.edit")}
                              style={{
                                padding: "4px 6px",
                                background: "transparent",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                color: "#ccc",
                                transition: "color 0.2s ease"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = "#4FA8D9"}
                              onMouseLeave={(e) => e.currentTarget.style.color = "#ccc"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                          </div>

                          {/* Right side: Payment & Reminder */}
                          <div style={{
                            position: "absolute",
                            top: "8px",
                            right: "8px",
                            display: "flex",
                            gap: "4px"
                          }}>
                            {/* Payment status toggle */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePaymentStatus(mitzva);
                              }}
                              title={mitzva.payment_status === 'paid' ? t("dashboard.payment.markUnpaid") : t("dashboard.payment.markPaid")}
                              style={{
                                padding: "4px 6px",
                                background: "transparent",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "0.7rem",
                                color: mitzva.payment_status === 'paid' ? "#4CAF50" : "#ccc",
                                transition: "color 0.2s ease"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.color = mitzva.payment_status === 'paid' ? "#45a049" : "#4CAF50"}
                              onMouseLeave={(e) => e.currentTarget.style.color = mitzva.payment_status === 'paid' ? "#4CAF50" : "#ccc"}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                              </svg>
                            </button>

                            {/* Send reminder - only if unpaid and has phone or email */}
                            {mitzva.payment_status !== 'paid' && (mitzva.purchaser_phone || mitzva.purchaser_email) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openReminderModal(mitzva);
                                }}
                                title={t("dashboard.payment.sendReminder")}
                                style={{
                                  padding: "4px 8px",
                                  background: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
                                  border: "none",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  fontSize: "0.7rem",
                                  color: "white",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  transition: "transform 0.2s ease, box-shadow 0.2s ease"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = "scale(1.05)";
                                  e.currentTarget.style.boxShadow = "0 2px 8px rgba(37, 211, 102, 0.4)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = "scale(1)";
                                  e.currentTarget.style.boxShadow = "none";
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        </>
                      )}

                      {/* Mitzva name - centered and prominent */}
                      <h4 style={{
                        margin: "8px 0 12px 0",
                        fontSize: "1.2rem",
                        fontWeight: "bold",
                        color: "#163D75",
                        lineHeight: "1.3"
                      }}>
                        {mitzva.name}
                      </h4>

                      {/* Price */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        marginBottom: "8px"
                      }}>
                        <span style={{
                          fontWeight: "bold",
                          color: mitzva.purchaser_id ? "#1E5AA8" : "#aaa",
                          fontSize: "1.1rem"
                        }}>
                          {formatPrice(mitzva.bid_price || 0)}
                        </span>
                        <span style={{
                          fontSize: "0.75rem",
                          color: "#999"
                        }}>₪</span>
                      </div>

                      {/* Member details */}
                      {mitzva.purchaser_name ? (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "2px"
                        }}>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            color: "#1E5AA8",
                            fontSize: "0.9rem"
                          }}>
                            <span style={{ color: "#1E5AA8" }}>✓</span>
                            <span>{mitzva.purchaser_name}</span>
                          </div>
                          {mitzva.purchaser_phone && (
                            <span style={{
                              fontSize: "0.75rem",
                              color: "#999",
                              direction: "ltr"
                            }}>
                              {mitzva.purchaser_phone}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#bbb", fontSize: "0.85rem" }}>{t("common.available")}</span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Members View - shows all members as tiles, purchasers at top */}
          {viewMode === "members" && (
            <div>
              {/* Edit Mode - Show ALL members with QR cards (same style as MemberManager) */}
              {isEditMode ? (
                allMembersForView.length === 0 ? (
                  <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>
                    {t("dashboard.purchases.noMembers")}
                  </p>
                ) : (
                  <div className="cards-grid">
                    {allMembersForView.map((member) => (
                      <div
                        key={member.id}
                        className="card envelope"
                        onClick={isSelectionMode ? () => toggleEditModeSelection(member.id) : undefined}
                        style={{
                          padding: "20px",
                          position: "relative",
                          border: isSelectionMode && editModeSelectedIds.has(member.id) ? "2px solid #4FA8D9" : undefined,
                          background: isSelectionMode && editModeSelectedIds.has(member.id) ? "#fdfbf7" : undefined,
                          cursor: isSelectionMode ? "pointer" : undefined
                        }}
                      >
                        {/* Selection checkbox */}
                        {isSelectionMode && (
                          <div style={{
                            position: "absolute",
                            top: "10px",
                            left: "10px",
                            width: "24px",
                            height: "24px",
                            borderRadius: "50%",
                            border: editModeSelectedIds.has(member.id) ? "none" : "2px solid #ccc",
                            background: editModeSelectedIds.has(member.id) ? "#4FA8D9" : "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontWeight: "bold",
                            fontSize: "14px"
                          }}>
                            {editModeSelectedIds.has(member.id) && "✓"}
                          </div>
                        )}

                        {/* Main content area */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          {/* User info - left side (RTL so appears on right) */}
                          <div style={{ flex: 1, textAlign: "center" }}>
                            <h3 style={{
                              fontSize: "1.5rem",
                              color: "#333",
                              margin: "0 0 12px 0",
                              fontWeight: "bold",
                              lineHeight: "1.3"
                            }}>
                              {member.first_name} {member.last_name}
                            </h3>

                            {/* Contact details */}
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "6px",
                              alignItems: "center",
                              marginBottom: "10px"
                            }}>
                              {member.phone && (
                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  color: "#555",
                                  fontSize: "0.9rem"
                                }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                  <span dir="ltr">{member.phone}</span>
                                </div>
                              )}
                              {member.email && (
                                <div style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  color: "#555",
                                  fontSize: "0.85rem"
                                }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M22 7l-10 6L2 7"></path></svg>
                                  <span dir="ltr" style={{ wordBreak: "break-all" }}>{member.email}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* QR code - on the side */}
                          <div style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            marginRight: "15px",
                            paddingRight: "15px",
                            borderRight: "1px solid #e0e0e0"
                          }}>
                            <QRGenerator value={member.code} size={55} />
                            <span style={{
                              fontSize: "0.65rem",
                              color: "#999",
                              marginTop: "4px",
                              maxWidth: "60px",
                              overflow: "hidden",
                              textOverflow: "ellipsis"
                            }}>
                              {member.code.substring(0, 8)}...
                            </span>
                          </div>
                        </div>

                        {/* Action buttons - hidden in selection mode */}
                        {!isSelectionMode && (
                          <div style={{
                            display: "flex",
                            gap: "6px",
                            marginTop: "15px",
                            justifyContent: "center",
                            flexWrap: "wrap",
                            paddingTop: "12px",
                            borderTop: "1px solid #eee"
                          }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                setDetailsMember({ ...member, mitzvot_count: 0, total_price: 0 });
                                setShowMemberDetailsModal(true);
                              }}
                              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                            >
                              {t("common.details")}
                            </button>
                            <button
                              className="btn btn-primary"
                              onClick={() => openEditMemberModal(member)}
                              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                            >
                              {t("common.edit")}
                            </button>
                            <button
                              className="btn"
                              onClick={() => handleEditModePrint(member, false)}
                              style={{ padding: "6px 10px", fontSize: "0.8rem", background: "#1E5AA8", color: "white" }}
                            >
                              🖨️
                            </button>
                            <button
                              className="btn"
                              onClick={() => { setTestTargetMember(member); setTestSelectedPosition(1); setShowTestModal(true); }}
                              style={{ padding: "6px 10px", fontSize: "0.8rem", background: "#28a745", color: "white" }}
                              title="TEST - New 4x8 Grid"
                            >
                              🏷️
                            </button>
                            <button
                              className="btn"
                              onClick={() => handleEditModeDownload(member, false)}
                              disabled={downloadingId === member.id}
                              style={{
                                padding: "6px 10px",
                                fontSize: "0.8rem",
                                background: downloadingId === member.id ? "#28a745" : "#6c757d",
                                color: "white",
                                transition: "all 0.3s ease",
                                opacity: downloadingId === member.id ? 0.8 : 1
                              }}
                            >
                              {downloadingId === member.id ? "..." : "🖼️"}
                            </button>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleEditModeDelete(member.id, false)}
                              style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
              /* Normal mode - Show all members with purchasers at top */
              allMembersForView.length === 0 ? (
                <p style={{ color: "#888", textAlign: "center", padding: "40px 0" }}>
                  {t("dashboard.purchases.noMembers")}
                </p>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "15px"
                }}>
                  {/* Sort: members with purchases first, then others alphabetically */}
                  {[...allMembersForView]
                    .sort((a, b) => {
                      const aPurchased = membersWithPurchases.find(m => m.id === a.id);
                      const bPurchased = membersWithPurchases.find(m => m.id === b.id);
                      // Purchasers first
                      if (aPurchased && !bPurchased) return -1;
                      if (!aPurchased && bPurchased) return 1;
                      // Then alphabetically
                      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'he');
                    })
                    .map((member) => {
                      const purchaseInfo = membersWithPurchases.find(m => m.id === member.id);
                      const hasPurchases = !!purchaseInfo;
                      const isExpanded = expandedMemberId === member.id;

                      return (
                        <div
                          key={member.id}
                          onClick={() => hasPurchases && toggleExpandMember(member.id)}
                          style={{
                            padding: "20px 15px",
                            borderRadius: "12px",
                            border: hasPurchases ? "2px solid #4FA8D9" : "2px solid #e0e0e0",
                            background: hasPurchases ? "#fdfbf7" : "#fafafa",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            textAlign: "center",
                            position: "relative",
                            minHeight: "140px",
                            cursor: hasPurchases ? "pointer" : "default",
                            transition: "all 0.2s ease",
                            opacity: hasPurchases ? 1 : 0.7
                          }}
                        >
                          {/* Member avatar */}
                          <div style={{
                            width: "50px",
                            height: "50px",
                            borderRadius: "50%",
                            background: hasPurchases
                              ? "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)"
                              : "#e0e0e0",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: hasPurchases ? "white" : "#888",
                            fontWeight: "bold",
                            fontSize: "1.3rem",
                            marginBottom: "10px"
                          }}>
                            {member.first_name.charAt(0)}
                          </div>

                          {/* Member name */}
                          <h4 style={{
                            margin: "0 0 8px 0",
                            fontSize: "1.1rem",
                            fontWeight: "bold",
                            color: hasPurchases ? "#163D75" : "#666",
                            lineHeight: "1.3"
                          }}>
                            {member.first_name} {member.last_name}
                          </h4>

                          {/* Purchase info or no purchases */}
                          {hasPurchases ? (
                            <div style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "4px"
                            }}>
                              <span style={{
                                fontWeight: "bold",
                                color: "#1E5AA8",
                                fontSize: "1.1rem"
                              }}>
                                {formatPrice(purchaseInfo.total_price)}
                              </span>
                              <span style={{
                                color: "#1E5AA8",
                                fontSize: "0.85rem"
                              }}>
                                {purchaseInfo.mitzvot_count} {t("nav.mitzvot")}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: "#bbb", fontSize: "0.85rem" }}>
                              {t("dashboard.purchases.noPurchasesYet")}
                            </span>
                          )}

                          {/* Expand indicator for purchasers */}
                          {hasPurchases && (
                            <span style={{
                              position: "absolute",
                              bottom: "8px",
                              left: "50%",
                              transform: `translateX(-50%) ${isExpanded ? "rotate(180deg)" : "rotate(0)"}`,
                              transition: "transform 0.2s ease",
                              color: "#4FA8D9",
                              fontSize: "0.8rem"
                            }}>
                              ▼
                            </span>
                          )}

                          {/* Expanded mitzvot list - shown inside the card */}
                          {isExpanded && memberMitzvot.length > 0 && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                marginTop: "15px",
                                paddingTop: "15px",
                                borderTop: "1px solid #d4c4a8",
                                width: "100%",
                                textAlign: "right"
                              }}
                            >
                              <h5 style={{ margin: "0 0 10px 0", color: "#1E5AA8", fontSize: "0.9rem" }}>
                                {t("members.details.purchasedMitzvot")}
                              </h5>
                              <div style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px"
                              }}>
                                {memberMitzvot.map((mitzva) => (
                                  <div
                                    key={mitzva.id}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      padding: "8px 12px",
                                      background: "white",
                                      borderRadius: "6px",
                                      border: "1px solid #e0e0e0",
                                      fontSize: "0.85rem"
                                    }}
                                  >
                                    <span style={{ fontWeight: "500" }}>{mitzva.name}</span>
                                    <span style={{ color: "#1E5AA8", fontWeight: "bold" }}>{formatPrice(mitzva.bid_price)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          )}
        </div>

      {/* Edit Purchase Modal */}
      {editingPurchase && (
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
          onClick={() => setEditingPurchase(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "30px",
              maxWidth: "450px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: "20px", textAlign: "center", color: "#1E5AA8" }}>
              {t("dashboard.editPurchase.title")}
            </h2>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold", color: "#1E5AA8" }}>
                {t("dashboard.editPurchase.mitzva")}
              </label>
              <div style={{
                padding: "12px",
                background: "#f5f5f5",
                borderRadius: "8px",
                fontWeight: "bold",
                color: "#333"
              }}>
                {editingPurchase.name}
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold", color: "#1E5AA8" }}>
                {t("dashboard.editPurchase.member")}
              </label>
              <select
                value={editMemberId || ""}
                onChange={(e) => setEditMemberId(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "2px solid #4FA8D9",
                  fontSize: "1rem",
                  color: "#333",
                }}
              >
                {allMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "25px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold", color: "#1E5AA8" }}>
                {t("dashboard.editPurchase.price")}
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="number"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "8px",
                    border: "2px solid #4FA8D9",
                    fontSize: "1.1rem",
                    textAlign: "center",
                  }}
                />
                <span style={{ color: "#1E5AA8", fontWeight: "bold" }}>₪</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* Save and Send Email button */}
              <button
                onClick={saveEditPurchaseAndSend}
                style={{
                  padding: "12px 20px",
                  background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                שמור ושלח מייל
              </button>

              <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                <button
                  onClick={saveEditPurchase}
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "1rem",
                  }}
                >
                  {t("common.save")}
                </button>
                <button
                  onClick={() => setEditingPurchase(null)}
                  style={{
                    flex: 1,
                    padding: "12px 20px",
                    background: "#6c757d",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: "1rem",
                  }}
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingPurchase && (
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
          onClick={() => setDeletingPurchase(null)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "30px",
              maxWidth: "400px",
              width: "90%",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Warning Icon */}
            <div
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                fontSize: "28px",
              }}
            >
              🗑️
            </div>

            <h2 style={{ marginBottom: "15px", color: "#1E5AA8", fontSize: "1.4rem" }}>
              {t("dashboard.deletePurchase.title")}
            </h2>

            <p style={{ marginBottom: "10px", color: "#666", fontSize: "1rem" }}>
              {t("dashboard.deletePurchase.confirm")}
            </p>

            <p style={{
              marginBottom: "25px",
              color: "#1E5AA8",
              fontSize: "1.2rem",
              fontWeight: "bold",
              padding: "10px",
              background: "#f0f7ff",
              borderRadius: "8px",
            }}>
              {deletingPurchase.name}
            </p>

            <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
              <button
                onClick={deletePurchase}
                style={{
                  padding: "12px 30px",
                  background: "linear-gradient(135deg, #dc3545 0%, #c82333 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem",
                }}
              >
                {t("common.delete")}
              </button>
              <button
                onClick={() => setDeletingPurchase(null)}
                style={{
                  padding: "12px 30px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem",
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {reminderMitzva && (
        <ReminderModal
          mitzva={reminderMitzva}
          onClose={() => setReminderMitzva(null)}
          onSend={sendPaymentReminder}
        />
      )}

      {/* Create Member Modal */}
      {showCreateMemberModal && (
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
          onClick={() => setShowCreateMemberModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "30px",
              maxWidth: "450px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 20px 0", color: "#1E5AA8" }}>
              {t("members.create.title")}
            </h2>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.firstName")}
              </label>
              <input
                type="text"
                value={memberFirstName}
                onChange={(e) => setMemberFirstName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem"
                }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.lastName")}
              </label>
              <input
                type="text"
                value={memberLastName}
                onChange={(e) => setMemberLastName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem"
                }}
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.phone")}
              </label>
              <input
                type="tel"
                value={memberPhone}
                onChange={(e) => setMemberPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  direction: "ltr"
                }}
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.email")}
              </label>
              <input
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  direction: "ltr"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={handleCreateMember}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem"
                }}
              >
                {t("members.create.submit")}
              </button>
              <button
                onClick={() => { setShowCreateMemberModal(false); resetMemberForm(); }}
                style={{
                  padding: "12px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditMemberModal && editModeMember && (
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
          onClick={() => setShowEditMemberModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "30px",
              maxWidth: "450px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 20px 0", color: "#1E5AA8" }}>
              {t("members.edit.title")}
            </h2>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.firstName")}
              </label>
              <input
                type="text"
                value={memberFirstName}
                onChange={(e) => setMemberFirstName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem"
                }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.lastName")}
              </label>
              <input
                type="text"
                value={memberLastName}
                onChange={(e) => setMemberLastName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem"
                }}
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.phone")}
              </label>
              <input
                type="tel"
                value={memberPhone}
                onChange={(e) => setMemberPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  direction: "ltr"
                }}
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("members.create.email")}
              </label>
              <input
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  direction: "ltr"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={handleUpdateMember}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem"
                }}
              >
                {t("common.saveChanges")}
              </button>
              <button
                onClick={() => { setShowEditMemberModal(false); setEditModeMember(null); resetMemberForm(); }}
                style={{
                  padding: "12px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Mitzva Modal */}
      {showCreateMitzvaModal && (
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
          onClick={() => setShowCreateMitzvaModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "30px",
              maxWidth: "450px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 20px 0", color: "#1E5AA8" }}>
              {t("mitzvot.create.title")}
            </h2>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("mitzvot.create.name")}:
              </label>
              <input
                type="text"
                value={mitzvaName}
                onChange={(e) => setMitzvaName(e.target.value)}
                placeholder={t("mitzvot.create.namePlaceholder")}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem"
                }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("mitzvot.create.notes")}:
              </label>
              <textarea
                value={mitzvaNotes}
                onChange={(e) => setMitzvaNotes(e.target.value)}
                placeholder={t("mitzvot.create.notesPlaceholder")}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  resize: "vertical"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={handleCreateMitzva}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem"
                }}
              >
                {t("mitzvot.create.submit")}
              </button>
              <button
                onClick={() => { setShowCreateMitzvaModal(false); resetMitzvaForm(); }}
                style={{
                  padding: "12px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mitzva Modal */}
      {showEditMitzvaModal && editModeMitzva && (
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
          onClick={() => setShowEditMitzvaModal(false)}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "30px",
              maxWidth: "450px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: "0 0 20px 0", color: "#1E5AA8" }}>
              {t("mitzvot.edit.title")}
            </h2>
            <div style={{
              background: "#fff3cd",
              padding: "10px 15px",
              borderRadius: "8px",
              marginBottom: "15px",
              fontSize: "0.9rem",
              color: "#856404"
            }}>
              {t("mitzvot.edit.qrCode")}: {editModeMitzva.code}
              <br />
              <small>{t("mitzvot.edit.codeFixed")}</small>
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("mitzvot.create.name")}:
              </label>
              <input
                type="text"
                value={mitzvaName}
                onChange={(e) => setMitzvaName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem"
                }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: "15px" }}>
              <label style={{ display: "block", marginBottom: "5px", fontWeight: "500" }}>
                {t("mitzvot.create.notes")}:
              </label>
              <textarea
                value={mitzvaNotes}
                onChange={(e) => setMitzvaNotes(e.target.value)}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "8px",
                  fontSize: "1rem",
                  resize: "vertical"
                }}
              />
            </div>

            {/* Holiday settings */}
            <div style={{
              marginBottom: "15px",
              padding: "15px",
              background: "#faf7f4",
              borderRadius: "12px",
              border: "1px solid #e8dfd4"
            }}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  fontWeight: "500"
                }}>
                  <div
                    onClick={() => setMitzvaAvailableOnHolidays(!mitzvaAvailableOnHolidays)}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "6px",
                      border: mitzvaAvailableOnHolidays ? "none" : "2px solid #4FA8D9",
                      background: mitzvaAvailableOnHolidays ? "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)" : "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      flexShrink: 0
                    }}
                  >
                    {mitzvaAvailableOnHolidays && (
                      <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                    )}
                  </div>
                  {t("mitzvot.create.availableOnHolidays")}
                </label>
                <p style={{ margin: "5px 0 0 34px", fontSize: "0.85rem", color: "#1E5AA8" }}>
                  {t("mitzvot.create.availableOnHolidaysHelp")}
                </p>
              </div>
              <div>
                <label style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  fontWeight: "500"
                }}>
                  <div
                    onClick={() => setMitzvaHolidaysOnly(!mitzvaHolidaysOnly)}
                    style={{
                      width: "22px",
                      height: "22px",
                      borderRadius: "6px",
                      border: mitzvaHolidaysOnly ? "none" : "2px solid #4FA8D9",
                      background: mitzvaHolidaysOnly ? "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)" : "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      flexShrink: 0
                    }}
                  >
                    {mitzvaHolidaysOnly && (
                      <span style={{ color: "white", fontSize: "14px", fontWeight: "bold" }}>✓</span>
                    )}
                  </div>
                  {t("mitzvot.create.holidaysOnly")}
                </label>
                <p style={{ margin: "5px 0 0 34px", fontSize: "0.85rem", color: "#1E5AA8" }}>
                  {t("mitzvot.create.holidaysOnlyHelp")}
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={handleUpdateMitzva}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem"
                }}
              >
                {t("common.saveChanges")}
              </button>
              <button
                onClick={() => { setShowEditMitzvaModal(false); setEditModeMitzva(null); resetMitzvaForm(); }}
                style={{
                  padding: "12px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Member Details Modal */}
      {showMemberDetailsModal && detailsMember && (
        <div
          onClick={() => { setShowMemberDetailsModal(false); setDetailsMember(null); }}
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
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ margin: 0, color: "#1E5AA8" }}>{t("members.details.title")}</h2>
              <button
                onClick={() => { setShowMemberDetailsModal(false); setDetailsMember(null); }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: "#999"
                }}
              >
                ×
              </button>
            </div>

            {/* Main content with side QR */}
            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
              {/* User info - main section */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <h2 style={{
                  margin: "0 0 15px 0",
                  fontSize: "1.8rem",
                  color: "#333",
                  fontWeight: "bold"
                }}>
                  {detailsMember.first_name} {detailsMember.last_name}
                </h2>

                {/* Contact details with icons */}
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  alignItems: "center",
                  marginBottom: "15px"
                }}>
                  {detailsMember.phone && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#555",
                      fontSize: "1rem"
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                      <span dir="ltr">{detailsMember.phone}</span>
                    </div>
                  )}
                  {detailsMember.email && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      color: "#555",
                      fontSize: "0.95rem"
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E5AA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M22 7l-10 6L2 7"></path></svg>
                      <span dir="ltr">{detailsMember.email}</span>
                    </div>
                  )}
                </div>

                {/* Notes if exists */}
                {detailsMember.notes && (
                  <div style={{
                    background: "#f0f7ff",
                    padding: "10px 15px",
                    borderRadius: "8px",
                    marginTop: "10px",
                    textAlign: "right"
                  }}>
                    <span style={{ color: "#1E5AA8", fontWeight: "bold" }}>{t("common.notes")}: </span>
                    <span style={{ color: "#666" }}>{detailsMember.notes}</span>
                  </div>
                )}
              </div>

              {/* QR code - on the side */}
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "15px",
                background: "#f8f9fa",
                borderRadius: "12px",
                minWidth: "100px"
              }}>
                <QRGenerator value={detailsMember.code} size={70} />
                <span style={{
                  fontSize: "0.7rem",
                  color: "#999",
                  marginTop: "8px",
                  textAlign: "center",
                  wordBreak: "break-all",
                  maxWidth: "80px"
                }}>
                  {detailsMember.code}
                </span>
              </div>
            </div>

            {/* Purchased Mitzvot for this week */}
            {(() => {
              // Get mitzvot purchased by this member from mitzvotWithPurchasers
              const memberMitzvotList = mitzvotWithPurchasers.filter(
                (m: MitzvaWithPurchaser) => m.purchaser_id === detailsMember.id
              );
              return memberMitzvotList.length > 0 && (
                <div style={{
                  marginTop: "20px",
                  paddingTop: "15px",
                  borderTop: "1px solid #eee"
                }}>
                  <h4 style={{
                    color: "#1E5AA8",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <span>🎫</span>
                    {t("members.details.purchasedMitzvot")} ({memberMitzvotList.length})
                  </h4>
                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    maxHeight: "200px",
                    overflowY: "auto"
                  }}>
                    {memberMitzvotList.map((mitzva: MitzvaWithPurchaser) => (
                      <div
                        key={mitzva.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "8px 12px",
                          background: "#f8f9fa",
                          borderRadius: "6px",
                          borderRight: "3px solid #4FA8D9"
                        }}
                      >
                        <span style={{ fontWeight: "500" }}>{mitzva.name}</span>
                        {mitzva.bid_price && (
                          <span style={{ color: "#28a745", fontSize: "0.85rem" }}>
                            ₪{mitzva.bid_price}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div style={{
              display: "flex",
              gap: "10px",
              marginTop: "20px",
              justifyContent: "center",
              flexWrap: "wrap"
            }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowMemberDetailsModal(false);
                  openEditMemberModal(detailsMember);
                }}
                style={{ padding: "8px 16px" }}
              >
                {t("common.edit")}
              </button>
              <button
                className="btn"
                onClick={() => handleEditModePrint(detailsMember, false)}
                style={{ padding: "8px 16px", background: "#1E5AA8", color: "white" }}
              >
                🖨️ {t("common.print")}
              </button>
              <button
                className="btn"
                onClick={() => { setShowMemberDetailsModal(false); setDetailsMember(null); }}
                style={{ padding: "8px 16px", background: "#6c757d", color: "white" }}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Position Selector Modal */}
      {showPrintPositionModal && printTargetMember && (
        <div
          onClick={() => { setShowPrintPositionModal(false); setPrintTargetMember(null); }}
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
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "25px",
              maxWidth: "650px",
              width: "95%",
              maxHeight: "95vh",
              overflowY: "auto",
            }}
            onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h2 style={{ margin: 0, color: "#1E5AA8" }}>{t("members.stickerPrint.title")}</h2>
              <button
                onClick={() => { setShowPrintPositionModal(false); setPrintTargetMember(null); }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: "#999"
                }}
              >
                ×
              </button>
            </div>

            {/* Position grid - 4x8 representing A4 portrait with 32 stickers (Galilyon) */}
            {/* Preview shown inside selected cell */}
            <LabelPositionSelector
              selectedPosition={selectedPrintPosition}
              onPositionSelect={setSelectedPrintPosition}
              title={t("members.stickerPrint.description")}
              previewData={{
                name: `${printTargetMember.first_name} ${printTargetMember.last_name}`,
                isMitzva: false,
              }}
            />

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => printMemberSticker(selectedPrintPosition)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #1E5AA8 0%, #163D75 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                🖨️ {t("members.stickerPrint.print")}
              </button>
              <button
                onClick={() => { setShowPrintPositionModal(false); setPrintTargetMember(null); }}
                style={{
                  padding: "12px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {t("members.stickerPrint.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEST MODAL - Separate modal to verify new component loads */}
      {showTestModal && testTargetMember && (
        <div
          onClick={() => { setShowTestModal(false); setTestTargetMember(null); }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,100,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div
            style={{
              background: "#e8ffe8",
              borderRadius: "16px",
              padding: "25px",
              maxWidth: "500px",
              width: "90%",
              border: "4px solid #28a745",
            }}
            onClick={(e: { stopPropagation: () => void }) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h2 style={{ margin: 0, color: "#28a745" }}>🧪 TEST MODAL - גריד 4×8 חדש</h2>
              <button
                onClick={() => { setShowTestModal(false); setTestTargetMember(null); }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  color: "#28a745"
                }}
              >
                ×
              </button>
            </div>

            {/* Member preview */}
            <div style={{
              textAlign: "center",
              padding: "15px",
              background: "#d4edda",
              borderRadius: "10px",
              marginBottom: "20px",
              border: "2px dashed #28a745"
            }}>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#155724" }}>
                {testTargetMember.first_name} {testTargetMember.last_name}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#28a745", marginTop: "5px" }}>
                🔧 אם אתה רואה את זה, הקובץ התעדכן!
              </div>
            </div>

            {/* New LabelPositionSelector with 4x8 grid */}
            <LabelPositionSelector
              selectedPosition={testSelectedPosition}
              onPositionSelect={setTestSelectedPosition}
              title="בחר מיקום בגריד 4×8 (32 מדבקות)"
            />

            {/* Close button */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => printMemberSticker(testSelectedPosition)}
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "linear-gradient(135deg, #28a745 0%, #1e7e34 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "1rem",
                }}
              >
                🖨️ הדפס (TEST)
              </button>
              <button
                onClick={() => { setShowTestModal(false); setTestTargetMember(null); }}
                style={{
                  padding: "12px 20px",
                  background: "#6c757d",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
      )}
      {/* End Mobile Content */}

      {/* Desktop Scanning Modal */}
      {showScanningModal && (
        <ScanningModal
          isOpen={showScanningModal}
          onClose={() => setShowScanningModal(false)}
          members={allMembers}
          mitzvot={allMitzvotForEdit}
          onSave={handleScanningModalSave}
          synagogueName={user?.synagogue_name}
        />
      )}

      {/* Unified Print Preview Modal */}
      {showPrintModal && printItems.length > 0 && (
        <PrintPreviewModal
          items={printItems}
          isMitzva={printIsMitzva}
          onClose={() => setShowPrintModal(false)}
          onPrint={executePrint}
          onLoadAll={loadAllForPrint}
          loading={bulkActionLoading}
        />
      )}
    </div>
  );
}

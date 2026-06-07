import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Member,
  Mitzva,
  getMitzvotWithLinksForMember,
  MitzvaWithLink,
  MitzvaWithPurchaser
} from "../../database";
import {
  linkTicketToMemberSync,
  unlinkTicketSync,
  updateLinkBidPriceSync
} from "../../hooks/useSync";
import { apiGetEmailTemplate, getStoredUser } from "../../services/apiService";
import { QRScanner } from "../QRScanner";
import "./ScanningModal.css";

// Icons
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);

const SaveIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
  </svg>
);

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm7-9h-2.59l-1.83-2H9.42L7.59 6H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
  </svg>
);

const CameraSwitchIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
    <path d="M12 17c1.65 0 3-1.35 3-3h-2c0 .55-.45 1-1 1s-1-.45-1-1h-2c0 1.65 1.35 3 3 3z" transform="rotate(180 12 14)"/>
  </svg>
);

export interface CartItem {
  mitzva: Mitzva;
  price: number;
  link_id?: number; // Database link ID for persistent storage
}

interface ScanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  mitzvot: MitzvaWithPurchaser[]; // Now includes purchaser info to filter already-assigned mitzvot
  onSave: (memberId: number, items: CartItem[], sendMessage: boolean, customMessage?: string, customSubject?: string) => Promise<void>;
  onPriceChange?: () => void; // Called when price is updated in DB
  initialMember?: Member | null;
  initialCart?: CartItem[];
  synagogueName?: string;
  weekNumber: number;
  year: number;
  parashaName?: string;
  shabbatDate?: string;
}

export function ScanningModal({
  isOpen,
  onClose,
  members,
  mitzvot,
  onSave,
  onPriceChange,
  initialMember,
  initialCart,
  weekNumber,
  year,
  parashaName,
  shabbatDate,
}: ScanningModalProps) {
  // State
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualMemberCode, setManualMemberCode] = useState("");
  const [manualMemberName, setManualMemberName] = useState("");
  const [manualMitzvaCode, setManualMitzvaCode] = useState("");
  const [manualMitzvaName, setManualMitzvaName] = useState("");
  const [previewMember, setPreviewMember] = useState<Member | null>(null);
  const [previewMitzva, setPreviewMitzva] = useState<MitzvaWithPurchaser | null>(null);
  const [memberSearchResults, setMemberSearchResults] = useState<Member[]>([]);
  const [mitzvaSearchResults, setMitzvaSearchResults] = useState<MitzvaWithPurchaser[]>([]);
  const [memberSearchMode, setMemberSearchMode] = useState<'code' | 'name'>('code');
  const [mitzvaSearchMode, setMitzvaSearchMode] = useState<'code' | 'name'>('code');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState(0);
  const [cameraPermission, setCameraPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [showMessagePreview, setShowMessagePreview] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [useFrontCamera, setUseFrontCamera] = useState(false);
  const [showManualInputMobile, setShowManualInputMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  // Detect landscape mode (don't reset manual input mode - let user switch freely)
  useEffect(() => {
    const checkLandscape = () => {
      const landscape = window.matchMedia('(orientation: landscape) and (pointer: coarse)').matches;
      setIsLandscape(landscape);
      // Don't reset showManualInputMobile - allow user to stay in their chosen mode
    };

    checkLandscape();
    window.addEventListener('resize', checkLandscape);
    window.addEventListener('orientationchange', checkLandscape);

    return () => {
      window.removeEventListener('resize', checkLandscape);
      window.removeEventListener('orientationchange', checkLandscape);
    };
  }, []);

  // Refs to avoid stale closures in callbacks
  const cartRef = useRef<CartItem[]>([]);
  const selectedMemberRef = useRef<Member | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedRef = useRef(false);
  const priceUpdateTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Keep refs in sync with state
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    selectedMemberRef.current = selectedMember;
  }, [selectedMember]);

  // Check if user already granted permission before (just check localStorage, don't request camera)
  useEffect(() => {
    const savedPermission = localStorage.getItem('camera_permission_granted');
    if (savedPermission === 'true') {
      setCameraPermission('granted');
    }
  }, []);

  // Handle permission grant - first grant via Tauri API, then request camera
  const handleGrantPermission = useCallback(async () => {
    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('getUserMedia not supported');
        setCameraPermission('denied');
        setError('ממשק המצלמה אינו זמין במערכת');
        return;
      }

      // First, try to grant permission via Tauri API (this sets WebView2 permission)
      try {
        await invoke('reset_camera_permissions');
        console.log('Camera permission granted via Tauri API');
      } catch (e) {
        console.log('Could not grant via Tauri API, trying getUserMedia directly:', e);
      }

      // Now request camera - should work after Tauri granted permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      // Permission granted - stop the test stream immediately
      stream.getTracks().forEach(track => track.stop());

      // Now set state to granted so QRScanner can use the camera
      setCameraPermission('granted');
      localStorage.setItem('camera_permission_granted', 'true');
      setError(null);
    } catch (err) {
      console.error('Camera permission denied:', err);
      setCameraPermission('denied');
      localStorage.removeItem('camera_permission_granted');

      // Provide more specific error messages
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('גישה למצלמה נדחתה. לחץ על "אפס הרשאות" ונסה שוב.');
        } else if (err.name === 'NotFoundError') {
          setError('לא נמצאה מצלמה במחשב.');
        } else if (err.name === 'NotReadableError') {
          setError('המצלמה בשימוש על ידי תוכנה אחרת.');
        } else {
          setError(`שגיאת מצלמה: ${err.message}`);
        }
      }
    }
  }, []);

  // Reset camera permissions (Tauri only)
  const handleResetPermissions = useCallback(async () => {
    try {
      const result = await invoke('reset_camera_permissions');
      console.log('Reset permissions result:', result);
      localStorage.removeItem('camera_permission_granted');
      setCameraPermission('pending');
      setError(null);
      setSuccessMessage(String(result));
    } catch (err) {
      console.error('Failed to reset permissions:', err);
      // Show error but still try to reset state
      localStorage.removeItem('camera_permission_granted');
      setCameraPermission('pending');
      setError(String(err));
    }
  }, []);

  // Initialize once when modal opens
  useEffect(() => {
    const initializeModal = async () => {
      if (isOpen && !hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setSelectedMember(initialMember || null);
        selectedMemberRef.current = initialMember || null;
        setManualMemberCode("");
        setManualMemberName("");
        setManualMitzvaCode("");
        setManualMitzvaName("");
        setMemberSearchResults([]);
        setMitzvaSearchResults([]);
        setMemberSearchMode('code');
        setMitzvaSearchMode('code');
        setError(null);
        setSuccessMessage(null);
        setScannerKey(0);

        // If initialMember is provided, load their purchases from database
        if (initialMember) {
          try {
            console.log('Loading cart for member:', initialMember.id, 'week:', weekNumber, 'year:', year);
            const mitzvotWithLinks = await getMitzvotWithLinksForMember(initialMember.id, weekNumber, year);
            console.log('Loaded mitzvot from DB:', mitzvotWithLinks);
            const cartItems: CartItem[] = mitzvotWithLinks.map((m: MitzvaWithLink) => ({
              mitzva: m,
              price: m.bid_price || m.price || 0,
              link_id: m.link_id
            }));
            console.log('Cart items created:', cartItems);
            setCart(cartItems);
            cartRef.current = cartItems;
          } catch (err) {
            console.error('Error loading cart from database:', err);
            setCart(initialCart || []);
            cartRef.current = initialCart || [];
          }
        } else {
          setCart(initialCart || []);
          cartRef.current = initialCart || [];
        }
      }
    };

    initializeModal();

    // Reset the initialized flag when modal closes
    if (!isOpen) {
      hasInitializedRef.current = false;
    }

    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
      // Clear all price update timers
      priceUpdateTimersRef.current.forEach(timer => clearTimeout(timer));
      priceUpdateTimersRef.current.clear();
    };
  }, [isOpen, initialMember, initialCart, weekNumber, year]);

  // Load cart from database for a member
  const loadCartFromDatabase = useCallback(async (memberId: number) => {
    try {
      const mitzvotWithLinks = await getMitzvotWithLinksForMember(memberId, weekNumber, year);
      const cartItems: CartItem[] = mitzvotWithLinks.map((m: MitzvaWithLink) => ({
        mitzva: m,
        price: m.bid_price || m.price || 0,
        link_id: m.link_id
      }));
      setCart(cartItems);
      cartRef.current = cartItems;
    } catch (err) {
      console.error('Error loading cart from database:', err);
    }
  }, [weekNumber, year]);

  // Show message with auto-clear
  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (messageTimerRef.current) {
      clearTimeout(messageTimerRef.current);
    }

    if (type === 'success') {
      setSuccessMessage(text);
      setError(null);
    } else {
      setError(text);
      setSuccessMessage(null);
    }

    messageTimerRef.current = setTimeout(() => {
      setSuccessMessage(null);
      setError(null);
    }, 3000);
  }, []);

  // Handle QR scan - process both member and mitzva codes
  const handleScan = useCallback(async (code: string) => {
    // Try to find member first
    const member = members.find(m => m.code === code);
    if (member) {
      setSelectedMember(member);
      selectedMemberRef.current = member;
      // Load existing cart items from database
      await loadCartFromDatabase(member.id);
      showMessage('success', `נמצא: ${member.first_name} ${member.last_name}`);
      setScannerKey(k => k + 1);
      return;
    }

    // Try to find mitzva
    const mitzva = mitzvot.find(m => m.code === code);
    if (mitzva) {
      if (!selectedMemberRef.current) {
        showMessage('error', "יש לסרוק מתפלל קודם");
        setScannerKey(k => k + 1);
        return;
      }
      if (cartRef.current.some(c => c.mitzva.id === mitzva.id)) {
        showMessage('error', "מצווה זו כבר בסל");
        setScannerKey(k => k + 1);
        return;
      }
      // Check if mitzva is already purchased by another member
      if (mitzva.purchaser_id !== null && mitzva.purchaser_id !== selectedMemberRef.current.id) {
        showMessage('error', `מצווה זו כבר נרכשה ע"י ${mitzva.purchaser_name || 'מתפלל אחר'}`);
        setScannerKey(k => k + 1);
        return;
      }
      // Save to database immediately
      try {
        const linkId = await linkTicketToMemberSync(
          selectedMemberRef.current.id,
          mitzva.id,
          weekNumber,
          year,
          mitzva.price || 0
        );
        const newItem = { mitzva, price: mitzva.price || 0, link_id: linkId };
        setCart(prev => {
          const newCart = [...prev, newItem];
          cartRef.current = newCart;
          return newCart;
        });
        showMessage('success', `נוסף: ${mitzva.name}`);
      } catch (err) {
        console.error('Error saving to database:', err);
        showMessage('error', "שגיאה בשמירה למסד נתונים");
      }
      setScannerKey(k => k + 1);
      return;
    }

    showMessage('error', "לא נמצא קוד זה");
    setScannerKey(k => k + 1);
  }, [members, mitzvot, showMessage, loadCartFromDatabase, weekNumber, year]);

  // Helper to get display code (simple number if possible)
  const getDisplayCode = (code: string, id: number): string => {
    // If code starts with a digit, it's a simple code
    if (/^\d/.test(code)) {
      return code;
    }
    // Otherwise show the ID
    return String(id);
  };

  // Preview member as user types (code or name based on search mode)
  useEffect(() => {
    if (memberSearchMode === 'code') {
      if (manualMemberCode.trim()) {
        // Search by code or by ID
        const searchCode = manualMemberCode.trim();
        const member = members.find(m =>
          m.code === searchCode || String(m.id) === searchCode
        );
        setPreviewMember(member || null);
        setMemberSearchResults(member ? [member] : []);
        if (member) {
          setManualMemberName(`${member.first_name} ${member.last_name}`);
        }
      } else {
        setPreviewMember(null);
        setMemberSearchResults([]);
        setManualMemberName("");
      }
    } else {
      // Search by name - return all matches
      if (manualMemberName.trim()) {
        const searchTerm = manualMemberName.trim().toLowerCase();
        const matchingMembers = members.filter(m =>
          `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchTerm) ||
          m.first_name.toLowerCase().includes(searchTerm) ||
          m.last_name.toLowerCase().includes(searchTerm)
        );
        setMemberSearchResults(matchingMembers);
        // If only one match, auto-select it
        if (matchingMembers.length === 1) {
          setPreviewMember(matchingMembers[0]);
          setManualMemberCode(getDisplayCode(matchingMembers[0].code, matchingMembers[0].id));
        } else {
          setPreviewMember(null);
          setManualMemberCode("");
        }
      } else {
        setPreviewMember(null);
        setMemberSearchResults([]);
        setManualMemberCode("");
      }
    }
  }, [manualMemberCode, manualMemberName, members, memberSearchMode]);

  // Preview mitzva as user types (code or name based on search mode)
  useEffect(() => {
    if (mitzvaSearchMode === 'code') {
      if (manualMitzvaCode.trim()) {
        // Search by code or by ID
        const searchCode = manualMitzvaCode.trim();
        const mitzva = mitzvot.find(m =>
          m.code === searchCode || String(m.id) === searchCode
        );
        setPreviewMitzva(mitzva || null);
        setMitzvaSearchResults(mitzva ? [mitzva] : []);
        if (mitzva) {
          setManualMitzvaName(mitzva.name);
        }
      } else {
        setPreviewMitzva(null);
        setMitzvaSearchResults([]);
        setManualMitzvaName("");
      }
    } else {
      // Search by name - return all matches
      if (manualMitzvaName.trim()) {
        const searchTerm = manualMitzvaName.trim().toLowerCase();
        const matchingMitzvot = mitzvot.filter(m =>
          m.name.toLowerCase().includes(searchTerm)
        );
        setMitzvaSearchResults(matchingMitzvot);
        // If only one match, auto-select it
        if (matchingMitzvot.length === 1) {
          setPreviewMitzva(matchingMitzvot[0]);
          setManualMitzvaCode(getDisplayCode(matchingMitzvot[0].code, matchingMitzvot[0].id));
        } else {
          setPreviewMitzva(null);
          setManualMitzvaCode("");
        }
      } else {
        setPreviewMitzva(null);
        setMitzvaSearchResults([]);
        setManualMitzvaCode("");
      }
    }
  }, [manualMitzvaCode, manualMitzvaName, mitzvot, mitzvaSearchMode]);

  // Select a specific member from search results
  const selectMemberFromResults = useCallback(async (member: Member) => {
    setSelectedMember(member);
    selectedMemberRef.current = member;
    setManualMemberCode("");
    setManualMemberName("");
    setPreviewMember(null);
    setMemberSearchResults([]);
    // Load existing cart items from database
    await loadCartFromDatabase(member.id);
    showMessage('success', `נבחר: ${member.first_name} ${member.last_name}`);
  }, [showMessage, loadCartFromDatabase]);

  // Handle manual member selection (works with both code and name search)
  const handleManualMemberSelect = useCallback(() => {
    if (!previewMember) return;
    selectMemberFromResults(previewMember);
  }, [previewMember, selectMemberFromResults]);

  // Select a specific mitzva from search results
  const selectMitzvaFromResults = useCallback(async (mitzva: MitzvaWithPurchaser) => {
    if (!selectedMemberRef.current) {
      showMessage('error', "יש לבחור מתפלל קודם");
      return;
    }
    if (cartRef.current.some(c => c.mitzva.id === mitzva.id)) {
      showMessage('error', "מצווה זו כבר בסל");
      return;
    }
    // Check if mitzva is already purchased by another member
    if (mitzva.purchaser_id !== null && mitzva.purchaser_id !== selectedMemberRef.current.id) {
      showMessage('error', `מצווה זו כבר נרכשה ע"י ${mitzva.purchaser_name || 'מתפלל אחר'}`);
      return;
    }
    // Save to database immediately
    try {
      const linkId = await linkTicketToMemberSync(
        selectedMemberRef.current.id,
        mitzva.id,
        weekNumber,
        year,
        mitzva.price || 0
      );
      const newItem = { mitzva, price: mitzva.price || 0, link_id: linkId };
      setCart(prev => {
        const newCart = [...prev, newItem];
        cartRef.current = newCart;
        return newCart;
      });
      setManualMitzvaCode("");
      setManualMitzvaName("");
      setPreviewMitzva(null);
      setMitzvaSearchResults([]);
      showMessage('success', `נוסף: ${mitzva.name}`);
    } catch (err) {
      console.error('Error saving to database:', err);
      showMessage('error', "שגיאה בשמירה למסד נתונים");
    }
  }, [showMessage, weekNumber, year]);

  // Handle manual mitzva selection (works with both code and name search)
  const handleManualMitzvaSelect = useCallback(() => {
    if (!previewMitzva) return;
    selectMitzvaFromResults(previewMitzva);
  }, [previewMitzva, selectMitzvaFromResults]);

  // Available mitzvot (not in cart AND not already purchased by another member this week)
  const availableMitzvot = mitzvot.filter(m => {
    // If already in this member's cart, don't show in quick add
    if (cart.some(c => c.mitzva.id === m.id)) {
      return false;
    }
    // If purchased by another member (not the selected member), don't show
    if (m.purchaser_id !== null && m.purchaser_id !== selectedMember?.id) {
      return false;
    }
    return true;
  });

  // Calculate total
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  // Get member initials
  const getInitials = (member: Member) => {
    return `${member.first_name.charAt(0)}${member.last_name.charAt(0)}`;
  };

  // Remove from cart
  const removeFromCart = async (mitzvaId: number) => {
    const item = cartRef.current.find(c => c.mitzva.id === mitzvaId);
    if (item?.link_id) {
      try {
        await unlinkTicketSync(item.link_id);
      } catch (err) {
        console.error('Error removing from database:', err);
        showMessage('error', "שגיאה במחיקה ממסד נתונים");
        return;
      }
    }
    setCart(prev => {
      const newCart = prev.filter(c => c.mitzva.id !== mitzvaId);
      cartRef.current = newCart;
      return newCart;
    });
  };

  // Update price - immediate UI update, debounced DB save
  const updatePrice = (mitzvaId: number, price: number) => {
    console.log('updatePrice called:', { mitzvaId, price });

    // Find link_id before updating cart (to capture it for the timeout)
    const currentItem = cartRef.current.find(c => c.mitzva.id === mitzvaId);
    const linkId = currentItem?.link_id;
    console.log('Current item link_id:', linkId);

    // Update UI immediately
    setCart(prev => {
      const newCart = prev.map(c =>
        c.mitzva.id === mitzvaId ? { ...c, price } : c
      );
      cartRef.current = newCart;
      return newCart;
    });

    // Debounce database save (300ms delay)
    const existingTimer = priceUpdateTimersRef.current.get(mitzvaId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      console.log('Timer fired - saving price to DB:', { mitzvaId, price, linkId });
      if (linkId) {
        try {
          await updateLinkBidPriceSync(linkId, price);
          console.log('Price saved successfully:', linkId, price);
          // Notify parent to refresh the table
          onPriceChange?.();
        } catch (err) {
          console.error('Error updating price in database:', err);
        }
      } else {
        console.warn('No link_id found for mitzva:', mitzvaId);
      }
      priceUpdateTimersRef.current.delete(mitzvaId);
    }, 300);

    priceUpdateTimersRef.current.set(mitzvaId, timer);
  };

  // Clear member
  const clearMember = () => {
    setSelectedMember(null);
    selectedMemberRef.current = null;
    setCart([]);
    cartRef.current = [];
  };

  // Add mitzva to cart
  const addToCart = async (mitzva: Mitzva) => {
    if (!selectedMemberRef.current) return;

    try {
      const linkId = await linkTicketToMemberSync(
        selectedMemberRef.current.id,
        mitzva.id,
        weekNumber,
        year,
        mitzva.price || 0
      );
      const newItem = { mitzva, price: mitzva.price || 0, link_id: linkId };
      setCart(prev => {
        const newCart = [...prev, newItem];
        cartRef.current = newCart;
        return newCart;
      });
    } catch (err) {
      console.error('Error saving to database:', err);
      showMessage('error', "שגיאה בשמירה למסד נתונים");
    }
  };

  // Generate default message content
  const generateMessageContent = useCallback(() => {
    if (!selectedMember || cart.length === 0) return "";

    const mitzvotList = cart.map(item => `• ${item.mitzva.name} - ₪${item.price}`).join('\n');
    const memberName = `${selectedMember.first_name} ${selectedMember.last_name}`;

    return `שלום ${memberName},

תודה רבה על רכישת המצוות!

${mitzvotList}

סה"כ: ₪${total}

שבת שלום!`;
  }, [selectedMember, cart, total]);

  // Handle save - show preview if sendMessage is true
  const handleSave = async (sendMessage: boolean) => {
    if (!selectedMember || cart.length === 0) return;

    if (sendMessage) {
      // Fetch template from server and open message preview modal
      setLoadingTemplate(true);
      setShowMessagePreview(true);

      const user = getStoredUser();
      const synagogueName = user?.synagogue_name || 'בית הכנסת';
      const memberName = `${selectedMember.first_name} ${selectedMember.last_name}`;
      const mitzvotList = cart.map(item => `• ${item.mitzva.name} - ₪${item.price}`).join('\n');
      const totalAmount = cart.reduce((sum, item) => sum + item.price, 0);

      try {
        const result = await apiGetEmailTemplate('scan_confirmation');

        // Get template text - prefer text_template, fallback to extracting from html_template
        let templateText = result.template?.text_template;

        // If text_template is empty but html_template exists, extract text from HTML
        if ((!templateText || templateText.trim() === '') && result.template?.html_template) {
          templateText = result.template.html_template
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
        }

        if (result.success && templateText && templateText.trim() !== '') {
          // Use server template - replace all variables
          let text = templateText;
          text = text.replace(/\{member_name\}/g, memberName);
          text = text.replace(/\{member_first_name\}/g, selectedMember.first_name);
          text = text.replace(/\{member_last_name\}/g, selectedMember.last_name);
          text = text.replace(/\{synagogue_name\}/g, synagogueName);
          text = text.replace(/\{mitzvot_list\}/g, mitzvotList);
          text = text.replace(/\{mitzvot_text\}/g, mitzvotList);
          text = text.replace(/\{total_amount\}/g, `₪${totalAmount.toLocaleString()}`);
          text = text.replace(/\{date\}/g, new Date().toLocaleDateString('he-IL'));
          text = text.replace(/\{custom_message\}/g, '');

          // Shabbat/Parasha info
          const formattedShabbatDate = shabbatDate
            ? new Date(shabbatDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
            : new Date().toLocaleDateString('he-IL');
          text = text.replace(/\{shabbat_date\}/g, formattedShabbatDate);
          text = text.replace(/\{parasha_name\}/g, parashaName || '');

          // Clean up any empty lines
          text = text.replace(/\n\s*\n\s*\n/g, '\n\n');

          setMessageContent(text);

          // Set email subject from template
          if (result.template?.subject) {
            setEmailSubject(result.template.subject.replace(/\{synagogue_name\}/g, synagogueName));
          } else {
            setEmailSubject(`סיכום רכישה - ${synagogueName}`);
          }
        } else {
          // Use default message
          setMessageContent(generateMessageContent());
          setEmailSubject(`סיכום רכישה - ${synagogueName}`);
        }
      } catch {
        // Use default message on error
        setMessageContent(generateMessageContent());
        setEmailSubject(`סיכום רכישה - ${synagogueName}`);
      }

      setLoadingTemplate(false);
    } else {
      // Save without sending message
      setSaving(true);
      try {
        await onSave(selectedMember.id, cart, false);
        onClose();
      } catch (err) {
        showMessage('error', err instanceof Error ? err.message : "שגיאה בשמירה");
      } finally {
        setSaving(false);
      }
    }
  };

  // Send message after preview approval
  const handleSendMessage = async () => {
    if (!selectedMember || cart.length === 0) return;

    setSendingMessage(true);
    try {
      await onSave(selectedMember.id, cart, true, messageContent, emailSubject);
      // Reset modal for next scan
      setShowMessagePreview(false);
      setSelectedMember(null);
      selectedMemberRef.current = null;
      setCart([]);
      cartRef.current = [];
      setMessageContent("");
      setEmailSubject("");
      showMessage('success', 'ההודעה נשלחה בהצלחה!');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : "שגיאה בשליחת ההודעה");
    } finally {
      setSendingMessage(false);
    }
  };

  // Close message preview - save without sending and go back to scanning
  const handleCloseMessagePreview = async () => {
    setShowMessagePreview(false);
    // Save the purchases without sending message when user closes preview
    if (selectedMember && cart.length > 0) {
      try {
        await onSave(selectedMember.id, cart, false);
        // Reset cart after save
        setSelectedMember(null);
        selectedMemberRef.current = null;
        setCart([]);
        showMessage('success', 'הרכישות נשמרו');
      } catch (err) {
        showMessage('error', err instanceof Error ? err.message : "שגיאה בשמירה");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="scanning-modal-overlay" onClick={onClose}>
      <div className="scanning-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="scanning-modal-header">
          <button
            className="scanning-modal-title clickable"
            onClick={() => setShowManualInputMobile(prev => !prev)}
          >
            <span>{showManualInputMobile ? 'הזנה ידנית' : 'סריקת QR'}</span>
            <svg className="title-switch-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"/>
            </svg>
          </button>

          {/* Camera Permission in Header */}
          {cameraPermission === 'pending' && (
            <div className="header-permission-request">
              <CameraIcon />
              <span>יש לאשר גישה למצלמה</span>
              <button className="header-permission-btn allow" onClick={handleGrantPermission}>
                אפשר
              </button>
            </div>
          )}

          {/* Permission denied state */}
          {cameraPermission === 'denied' && (
            <div className="header-permission-request denied">
              <CameraIcon />
              <span>{error || 'הגישה למצלמה נדחתה'}</span>
              <button className="header-permission-btn allow" onClick={handleGrantPermission}>
                נסה שוב
              </button>
              <button className="header-permission-btn reset" onClick={handleResetPermissions}>
                אפס הרשאות
              </button>
            </div>
          )}

          <button className="scanning-modal-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="scanning-modal-content">
          {/* Left Side - Scanner or Manual Input */}
          <div className="scanner-section">
            {/* Scanner Card - shown when in QR mode (not manual input mode) */}
            {!showManualInputMobile && (
              <div className="scanner-card">
                <div className="scanner-viewport">
                  {/* Scanner frame with animation */}
                  <div className="scanner-frame">
                    <div className="scanner-line"></div>
                  </div>

                  {/* Camera switch button - floating on scanner */}
                  <button
                    className="scanner-camera-switch"
                    onClick={() => {
                      setUseFrontCamera(prev => !prev);
                      setScannerKey(k => k + 1);
                    }}
                    title={useFrontCamera ? 'מצלמה אחורית' : 'מצלמה קדמית'}
                  >
                    <CameraSwitchIcon />
                  </button>

                  {/* Manual input button - floating on scanner (mobile only) */}
                  <button
                    className="scanner-manual-input-btn"
                    onClick={() => setShowManualInputMobile(true)}
                    title="הזנה ידנית"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                  </button>

                  {/* Real QR Scanner behind the frame */}
                  <div className="scanner-video-container">
                    <QRScanner
                      key={scannerKey}
                      onScan={handleScan}
                      autoStart={cameraPermission === 'granted'}
                      resetTrigger={scannerKey}
                      hideErrorMessage={true}
                      hideCloseButton={true}
                      hideCameraButton={true}
                      useFrontCamera={useFrontCamera}
                      onError={() => setCameraPermission('denied')}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Mobile Manual Input View - replaces scanner in manual mode (portrait only) */}
            {showManualInputMobile && !isLandscape && (
              <div className="mobile-manual-input-view">
                <div className="mobile-input-columns">
                  {/* Member Input Column - shown when no member selected */}
                  {!selectedMember && (
                    <div className="mobile-input-column">
                      <h3 className="mobile-input-title">בחירת מתפלל</h3>
                      <input
                        type="text"
                        className="mobile-input-field"
                        placeholder="שם מתפלל..."
                        value={manualMemberName}
                        onChange={e => setManualMemberName(e.target.value)}
                        onFocus={() => setMemberSearchMode('name')}
                      />
                      <input
                        type="text"
                        className="mobile-input-field"
                        placeholder="קוד מתפלל..."
                        value={manualMemberCode}
                        onChange={e => setManualMemberCode(e.target.value)}
                        onFocus={() => setMemberSearchMode('code')}
                      />
                      {/* Search results */}
                      {memberSearchResults.length > 0 && (
                        <div className="mobile-search-results">
                          {memberSearchResults.slice(0, 6).map(member => (
                            <button
                              key={member.id}
                              className="mobile-search-result-item"
                              onClick={() => selectMemberFromResults(member)}
                            >
                              <span className="result-code">{getDisplayCode(member.code, member.id)}</span>
                              <span className="result-name">{member.first_name} {member.last_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {previewMember && memberSearchResults.length <= 1 && (
                        <div className="mobile-preview found">
                          ✓ {previewMember.first_name} {previewMember.last_name}
                        </div>
                      )}
                      <button
                        className="mobile-select-btn"
                        onClick={handleManualMemberSelect}
                        disabled={!previewMember}
                      >
                        בחר מתפלל
                      </button>
                    </div>
                  )}

                  {/* Mitzva Input Column - shown when member is selected */}
                  {selectedMember && (
                    <div className="mobile-input-column">
                      <h3 className="mobile-input-title">בחירת מצווה</h3>
                      <input
                        type="text"
                        className="mobile-input-field"
                        placeholder="שם מצווה..."
                        value={manualMitzvaName}
                        onChange={e => setManualMitzvaName(e.target.value)}
                        onFocus={() => setMitzvaSearchMode('name')}
                      />
                      <input
                        type="text"
                        className="mobile-input-field"
                        placeholder="קוד מצווה..."
                        value={manualMitzvaCode}
                        onChange={e => setManualMitzvaCode(e.target.value)}
                        onFocus={() => setMitzvaSearchMode('code')}
                      />
                      {/* Search results */}
                      {mitzvaSearchResults.length > 0 && (
                        <div className="mobile-search-results">
                          {mitzvaSearchResults.slice(0, 6).map(mitzva => (
                            <button
                              key={mitzva.id}
                              className="mobile-search-result-item"
                              onClick={() => selectMitzvaFromResults(mitzva)}
                            >
                              <span className="result-code">{getDisplayCode(mitzva.code, mitzva.id)}</span>
                              <span className="result-name">{mitzva.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {previewMitzva && mitzvaSearchResults.length <= 1 && (
                        <div className="mobile-preview found">
                          ✓ {previewMitzva.name}
                        </div>
                      )}
                      <button
                        className="mobile-select-btn"
                        onClick={handleManualMitzvaSelect}
                        disabled={!previewMitzva}
                      >
                        הוסף לסל
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Manual Input - Two columns - Desktop OR landscape manual mode */}
            {(!isLandscape || showManualInputMobile) && (
            <div className="manual-input-card">
              <h3 className="input-title">או הזן ידנית:</h3>
              <div className="input-columns">
                {/* Member Input */}
                <div className="input-column">
                  <label className="input-label">שם מתפלל:</label>
                  <input
                    type="text"
                    className="code-input-small name-input"
                    placeholder="הקלד שם..."
                    value={manualMemberName}
                    onChange={e => setManualMemberName(e.target.value)}
                    onFocus={() => setMemberSearchMode('name')}
                    onKeyDown={e => e.key === "Enter" && handleManualMemberSelect()}
                  />
                  <label className="input-label">קוד מתפלל:</label>
                  <input
                    type="text"
                    className="code-input-small"
                    placeholder="1, 2, 3..."
                    value={manualMemberCode}
                    onChange={e => setManualMemberCode(e.target.value)}
                    onFocus={() => setMemberSearchMode('code')}
                    onKeyDown={e => e.key === "Enter" && handleManualMemberSelect()}
                  />
                  {/* Show search results list when multiple matches */}
                  {memberSearchResults.length > 1 ? (
                    <div className="search-results-list">
                      {memberSearchResults.slice(0, 5).map(member => (
                        <button
                          key={member.id}
                          className="search-result-item"
                          onClick={() => selectMemberFromResults(member)}
                        >
                          <span className="result-code">{getDisplayCode(member.code, member.id)}</span>
                          <span className="result-name">{member.first_name} {member.last_name}</span>
                        </button>
                      ))}
                      {memberSearchResults.length > 5 && (
                        <div className="search-results-more">
                          +{memberSearchResults.length - 5} נוספים...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`preview-name ${previewMember ? 'found' : (manualMemberCode.trim() || manualMemberName.trim()) ? 'not-found' : ''}`}>
                      {previewMember
                        ? `✓ ${previewMember.first_name} ${previewMember.last_name}`
                        : (manualMemberCode.trim() || manualMemberName.trim()) ? 'לא נמצא' : '\u00A0'}
                    </div>
                  )}
                  <button
                    className="input-btn-small input-btn-full"
                    onClick={handleManualMemberSelect}
                    disabled={!previewMember}
                  >
                    בחר
                  </button>
                </div>

                {/* Divider */}
                <div className="input-column-divider"></div>

                {/* Mitzva Input */}
                <div className="input-column">
                  <label className="input-label">שם מצווה:</label>
                  <input
                    type="text"
                    className="code-input-small name-input"
                    placeholder="הקלד שם..."
                    value={manualMitzvaName}
                    onChange={e => setManualMitzvaName(e.target.value)}
                    onFocus={() => setMitzvaSearchMode('name')}
                    onKeyDown={e => e.key === "Enter" && handleManualMitzvaSelect()}
                    disabled={!selectedMember}
                  />
                  <label className="input-label">קוד מצווה:</label>
                  <input
                    type="text"
                    className="code-input-small"
                    placeholder="1, 2, 3..."
                    value={manualMitzvaCode}
                    onChange={e => setManualMitzvaCode(e.target.value)}
                    onFocus={() => setMitzvaSearchMode('code')}
                    onKeyDown={e => e.key === "Enter" && handleManualMitzvaSelect()}
                    disabled={!selectedMember}
                  />
                  {/* Show search results list when multiple matches */}
                  {mitzvaSearchResults.length > 1 ? (
                    <div className="search-results-list">
                      {mitzvaSearchResults.slice(0, 5).map(mitzva => (
                        <button
                          key={mitzva.id}
                          className="search-result-item"
                          onClick={() => selectMitzvaFromResults(mitzva)}
                        >
                          <span className="result-code">{getDisplayCode(mitzva.code, mitzva.id)}</span>
                          <span className="result-name">{mitzva.name}</span>
                        </button>
                      ))}
                      {mitzvaSearchResults.length > 5 && (
                        <div className="search-results-more">
                          +{mitzvaSearchResults.length - 5} נוספים...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`preview-name ${previewMitzva ? 'found' : (manualMitzvaCode.trim() || manualMitzvaName.trim()) ? 'not-found' : ''}`}>
                      {previewMitzva
                        ? `✓ ${previewMitzva.name}`
                        : (manualMitzvaCode.trim() || manualMitzvaName.trim()) ? 'לא נמצא' : '\u00A0'}
                    </div>
                  )}
                  <button
                    className="input-btn-small input-btn-full"
                    onClick={handleManualMitzvaSelect}
                    disabled={!previewMitzva || !selectedMember}
                  >
                    הוסף
                  </button>
                </div>
              </div>
            </div>
            )}

            {/* Status Messages - Fixed height container */}
            <div className="status-messages-container">
              {successMessage && !showMessagePreview && (
                <div className="status-message success">
                  {successMessage}
                </div>
              )}
              {error && cameraPermission === 'granted' && !showMessagePreview && (
                <div className="status-message error">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="modal-divider"></div>

          {/* Right Side - Cart */}
          <div className="cart-section">
            <div className="cart-header">
              <h2 className="cart-title">סל הרכישות</h2>

              {/* Member Card or Empty State */}
              {selectedMember ? (
                <div className="scanning-member-card">
                  <div className="scanning-member-avatar">
                    {getInitials(selectedMember)}
                  </div>
                  <div className="scanning-member-info">
                    <div className="scanning-member-name">
                      {selectedMember.first_name} {selectedMember.last_name}
                    </div>
                    {selectedMember.phone && (
                      <div className="scanning-member-phone">{selectedMember.phone}</div>
                    )}
                    <div className="scanning-member-code">קוד: {getDisplayCode(selectedMember.code, selectedMember.id)}</div>
                  </div>
                  <button className="scanning-member-clear" onClick={clearMember}>
                    ✕
                  </button>
                </div>
              ) : (
                <div className="member-empty">
                  <div className="member-empty-icon">📨</div>
                  <div className="member-empty-text">סרוק מעטפה לזיהוי מתפלל</div>
                </div>
              )}
            </div>

            {/* Cart Items */}
            <div className="cart-items">
              {/* Quick add mitzvot - only show when member is selected */}
              {selectedMember && availableMitzvot.length > 0 && (
                <div className="available-mitzvot">
                  <span className="available-label">הוסף מהירה:</span>
                  <div className="available-mitzvot-list">
                    {availableMitzvot.slice(0, 4).map(mitzva => (
                      <button
                        key={mitzva.id}
                        className="available-mitzva-chip"
                        onClick={() => addToCart(mitzva)}
                      >
                        + {mitzva.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <h4 className="cart-section-title">מצוות בסל ({cart.length})</h4>

              {cart.length === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">🛒</div>
                  <p>הסל ריק</p>
                  <span>{selectedMember ? "סרוק או הזן קוד מצווה" : "סרוק מתפלל קודם"}</span>
                </div>
              ) : (
                <div className="cart-items-list">
                  {cart.map(item => (
                    <div key={item.mitzva.id} className="cart-item">
                      <div className="cart-item-header">
                        <span className="cart-item-name">{item.mitzva.name}</span>
                        <button
                          className="cart-item-remove"
                          onClick={() => removeFromCart(item.mitzva.id)}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                      <div className="cart-item-price-row">
                        <span className="price-label">מחיר:</span>
                        <input
                          type="number"
                          className="price-input"
                          value={item.price}
                          onChange={e => updatePrice(item.mitzva.id, Number(e.target.value))}
                        />
                        <span className="price-currency">₪</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cart Footer */}
            <div className="cart-footer">
              <div className="cart-total">
                <span className="total-label">סה"כ לתשלום:</span>
                <span className="total-value">₪{total}</span>
              </div>
              <div className="cart-actions desktop-only">
                <button
                  className="cart-btn secondary"
                  onClick={onClose}
                  disabled={saving}
                >
                  ביטול
                </button>
                <button
                  className="cart-btn primary"
                  onClick={() => handleSave(true)}
                  disabled={saving || !selectedMember || cart.length === 0 || !selectedMember?.email}
                  title={!selectedMember?.email ? "למתפלל אין כתובת מייל" : ""}
                >
                  <SaveIcon />
                  שמור ושלח הודעה
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Action Button for Mobile */}
        <button
          className="mobile-fab"
          onClick={() => handleSave(true)}
          disabled={saving || !selectedMember || cart.length === 0 || !selectedMember?.email}
          title={!selectedMember?.email ? "למתפלל אין כתובת מייל" : "שמור ושלח"}
        >
          <SaveIcon />
        </button>

        {/* Message Preview Modal */}
        {showMessagePreview && (
          <div className="message-preview-overlay" onClick={handleCloseMessagePreview}>
            <div className="message-preview-modal" onClick={e => e.stopPropagation()}>
              <div className="message-preview-header">
                <h3>תצוגה מקדימה של ההודעה</h3>
                <button className="message-preview-close" onClick={handleCloseMessagePreview}>
                  <CloseIcon />
                </button>
              </div>

              {loadingTemplate ? (
                <div className="message-preview-loading">
                  <div className="loading-spinner"></div>
                  <p>טוען תבנית...</p>
                </div>
              ) : (
                <>
                  <div className="message-preview-recipient">
                    <span className="recipient-label">נשלח אל:</span>
                    <span className="recipient-email">{selectedMember?.email}</span>
                  </div>

                  <div className="message-preview-content">
                    <label className="message-label">תוכן ההודעה:</label>
                    <textarea
                      className="message-textarea"
                      value={messageContent}
                      onChange={e => setMessageContent(e.target.value)}
                      rows={12}
                      dir="rtl"
                    />
                  </div>

                  <div className="message-preview-actions">
                    <button
                      className="message-btn secondary"
                      onClick={handleCloseMessagePreview}
                      disabled={sendingMessage}
                    >
                      חזור
                    </button>
                    <button
                      className="message-btn primary"
                      onClick={handleSendMessage}
                      disabled={sendingMessage || !messageContent.trim()}
                    >
                      {sendingMessage ? 'שולח...' : 'שלח'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

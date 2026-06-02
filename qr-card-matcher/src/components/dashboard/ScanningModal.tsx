import { useState, useEffect, useRef, useCallback } from "react";
import { Member, Mitzva } from "../../database";
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

const FlashIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
  </svg>
);

const CameraIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 15c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm7-9h-2.59l-1.83-2H9.42L7.59 6H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z"/>
  </svg>
);

export interface CartItem {
  mitzva: Mitzva;
  price: number;
}

interface ScanningModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  mitzvot: Mitzva[];
  onSave: (memberId: number, items: CartItem[], sendMessage: boolean) => Promise<void>;
  initialMember?: Member | null;
  initialCart?: CartItem[];
  synagogueName?: string;
}

export function ScanningModal({
  isOpen,
  onClose,
  members,
  mitzvot,
  onSave,
  initialMember,
  initialCart,
}: ScanningModalProps) {
  // State
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [scannerKey, setScannerKey] = useState(0);

  // Refs to avoid stale closures in callbacks
  const cartRef = useRef<CartItem[]>([]);
  const selectedMemberRef = useRef<Member | null>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    selectedMemberRef.current = selectedMember;
  }, [selectedMember]);

  // Initialize once when modal opens
  useEffect(() => {
    if (isOpen && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setSelectedMember(initialMember || null);
      setCart(initialCart || []);
      setManualCode("");
      setError(null);
      setSuccessMessage(null);
      setScannerKey(0);
    }

    // Reset the initialized flag when modal closes
    if (!isOpen) {
      hasInitializedRef.current = false;
    }

    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, [isOpen, initialMember, initialCart]);

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
  const handleScan = useCallback((code: string) => {
    // Try to find member first
    const member = members.find(m => m.code === code);
    if (member) {
      setSelectedMember(member);
      selectedMemberRef.current = member;
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
      } else {
        const newItem = { mitzva, price: mitzva.price || 0 };
        setCart(prev => {
          const newCart = [...prev, newItem];
          cartRef.current = newCart;
          return newCart;
        });
        showMessage('success', `נוסף: ${mitzva.name}`);
      }
      setScannerKey(k => k + 1);
      return;
    }

    showMessage('error', "לא נמצא קוד זה");
    setScannerKey(k => k + 1);
  }, [members, mitzvot, showMessage]);

  // Handle manual code input
  const handleManualCode = useCallback(() => {
    if (!manualCode.trim()) return;

    const code = manualCode.trim();

    // Try to find member
    const member = members.find(m => m.code === code);
    if (member) {
      setSelectedMember(member);
      selectedMemberRef.current = member;
      setManualCode("");
      showMessage('success', `נמצא: ${member.first_name} ${member.last_name}`);
      return;
    }

    // Try to find mitzva
    const mitzva = mitzvot.find(m => m.code === code);
    if (mitzva) {
      if (!selectedMemberRef.current) {
        showMessage('error', "יש לסרוק/להזין מתפלל קודם");
        return;
      }
      if (cartRef.current.some(c => c.mitzva.id === mitzva.id)) {
        showMessage('error', "מצווה זו כבר בסל");
      } else {
        const newItem = { mitzva, price: mitzva.price || 0 };
        setCart(prev => {
          const newCart = [...prev, newItem];
          cartRef.current = newCart;
          return newCart;
        });
        setManualCode("");
        showMessage('success', `נוסף: ${mitzva.name}`);
      }
      return;
    }

    showMessage('error', "לא נמצא קוד זה");
  }, [manualCode, members, mitzvot, showMessage]);

  // Available mitzvot (not in cart)
  const availableMitzvot = mitzvot.filter(m =>
    !cart.some(c => c.mitzva.id === m.id)
  );

  // Calculate total
  const total = cart.reduce((sum, item) => sum + item.price, 0);

  // Get member initials
  const getInitials = (member: Member) => {
    return `${member.first_name.charAt(0)}${member.last_name.charAt(0)}`;
  };

  // Remove from cart
  const removeFromCart = (mitzvaId: number) => {
    setCart(prev => {
      const newCart = prev.filter(c => c.mitzva.id !== mitzvaId);
      cartRef.current = newCart;
      return newCart;
    });
  };

  // Update price
  const updatePrice = (mitzvaId: number, price: number) => {
    setCart(prev => {
      const newCart = prev.map(c =>
        c.mitzva.id === mitzvaId ? { ...c, price } : c
      );
      cartRef.current = newCart;
      return newCart;
    });
  };

  // Clear member
  const clearMember = () => {
    setSelectedMember(null);
    selectedMemberRef.current = null;
    setCart([]);
    cartRef.current = [];
  };

  // Add mitzva to cart
  const addToCart = (mitzva: Mitzva) => {
    const newItem = { mitzva, price: mitzva.price || 0 };
    setCart(prev => {
      const newCart = [...prev, newItem];
      cartRef.current = newCart;
      return newCart;
    });
  };

  // Save
  const handleSave = async (sendMessage: boolean) => {
    if (!selectedMember || cart.length === 0) return;

    setSaving(true);
    try {
      await onSave(selectedMember.id, cart, sendMessage);
      onClose();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="scanning-modal-overlay" onClick={onClose}>
      <div className="scanning-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="scanning-modal-header">
          <div className="scanning-modal-title">
            <span>סריקת QR</span>
          </div>
          <button className="scanning-modal-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="scanning-modal-content">
          {/* Left Side - Scanner */}
          <div className="scanner-section">
            <div className="section-header">
              <h2 className="section-title">סריקת QR</h2>
              <p className="section-subtitle">סרוק מעטפה או כרטיס מצווה</p>
            </div>

            {/* Scanner Card - Always visible */}
            <div className="scanner-card">
              <div className="scanner-viewport">
                {/* Scanner frame with animation */}
                <div className="scanner-frame">
                  <div className="scanner-line"></div>
                </div>
                <div className="scanner-hint">מקם את ה-QR במסגרת</div>

                {/* Real QR Scanner behind the frame */}
                <div className="scanner-video-container">
                  <QRScanner
                    key={scannerKey}
                    onScan={handleScan}
                    autoStart={true}
                    resetTrigger={scannerKey}
                  />
                </div>
              </div>
              <div className="scanner-controls">
                <button className="scanner-btn secondary">
                  <FlashIcon />
                  פנס
                </button>
                <button className="scanner-btn secondary">
                  <CameraIcon />
                  החלף מצלמה
                </button>
              </div>
            </div>

            {/* Manual Input */}
            <div className="manual-input-card">
              <h3 className="input-title">או הזן קוד ידנית:</h3>
              <div className="input-group">
                <input
                  type="text"
                  className="code-input"
                  placeholder={selectedMember ? "קוד מצווה (1, 2, 3...)" : "קוד מתפלל (1, 2, 3...)"}
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleManualCode()}
                />
                <button
                  className="input-btn"
                  onClick={handleManualCode}
                  disabled={!manualCode.trim()}
                >
                  הוסף
                </button>
              </div>
            </div>

            {/* Status Messages */}
            {successMessage && (
              <div className="status-message success">
                {successMessage}
              </div>
            )}
            {error && (
              <div className="status-message error">
                {error}
              </div>
            )}
          </div>

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
                    {selectedMember.code && (
                      <div className="scanning-member-code">קוד: {selectedMember.code}</div>
                    )}
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
            </div>

            {/* Cart Footer */}
            <div className="cart-footer">
              <div className="cart-total">
                <span className="total-label">סה"כ לתשלום:</span>
                <span className="total-value">₪{total}</span>
              </div>
              <div className="cart-actions">
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
      </div>
    </div>
  );
}

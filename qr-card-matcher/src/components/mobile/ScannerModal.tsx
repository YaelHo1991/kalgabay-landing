/**
 * ScannerModal - QR Scanner modal with cart functionality
 * Matches prototype design
 */

import { useState } from 'react';

interface ScannerModalProps {
  onClose: () => void;
}

// Mock cart data
const mockCartItems = [
  { id: 1, name: 'עליה שלישי', price: 250 },
  { id: 2, name: 'פתיחה', price: 180 },
];

export default function ScannerModal({ onClose }: ScannerModalProps) {
  const [scannedMember] = useState({
    name: 'יוסי כהן',
    initials: 'יכ',
    phone: '050-123-4567'
  });
  const [cartItems, setCartItems] = useState(mockCartItems);

  const updatePrice = (id: number, price: number) => {
    setCartItems(prev =>
      prev.map(item => item.id === id ? { ...item, price } : item)
    );
  };

  const total = cartItems.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="scanner-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="scanner-modal-header">
          <h2 className="scanner-modal-title">סריקת QR</h2>
          <button className="scanner-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Scanner Viewport */}
        <div className="scanner-viewport">
          <div className="scanner-frame"></div>
          <div className="scanner-hint">מקם את ה-QR במסגרת</div>
        </div>

        {/* Scanned Member Card */}
        <div className="scanner-member-card">
          <div className="scanner-member-info">
            <div className="scanner-member-avatar">{scannedMember.initials}</div>
            <div>
              <div className="scanner-member-name">{scannedMember.name}</div>
              <div className="scanner-member-phone">{scannedMember.phone}</div>
            </div>
          </div>
        </div>

        {/* Cart */}
        <div className="scanner-cart">
          <div className="scanner-cart-title">סל הרכישות ({cartItems.length})</div>
          {cartItems.map((item) => (
            <div key={item.id} className="scanner-cart-item">
              <span className="scanner-cart-item-name">{item.name}</span>
              <div className="scanner-cart-item-price">
                <input
                  type="number"
                  className="price-input"
                  value={item.price}
                  onChange={(e) => updatePrice(item.id, parseInt(e.target.value) || 0)}
                />
                <span>₪</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="scanner-footer">
          <div className="scanner-total">
            <span className="scanner-total-label">סה"כ לתשלום:</span>
            <span className="scanner-total-value">₪{total}</span>
          </div>
          <div className="scanner-actions">
            <button className="scanner-btn secondary" onClick={onClose}>
              ביטול
            </button>
            <button className="scanner-btn primary">
              <svg viewBox="0 0 24 24"><path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4z"/></svg>
              שמור ושלח
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

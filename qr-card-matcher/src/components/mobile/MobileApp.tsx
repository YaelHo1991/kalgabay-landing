/**
 * MobileApp - Main entry point for mobile (Android/iOS) version
 * Matches the prototype design from prototypes/mobile/android-v1.html
 *
 * On landscape orientation or tablets, shows the desktop layout
 */

import { useState, useEffect, useCallback } from 'react';
import BottomNav from './BottomNav';
import MobileLoginPage from './MobileLoginPage';
import HomeScreen from './screens/HomeScreen';
import MembersScreen from './screens/MembersScreen';
import MitzvotScreen from './screens/MitzvotScreen';
import PrintLabelsScreen from './screens/PrintLabelsScreen';
import ArchiveScreen from './screens/ArchiveScreen';
import { ScanningModal, CartItem } from '../dashboard/ScanningModal';
import { ReminderPreviewModal } from '../dashboard/ReminderPreviewModal';
import { Dashboard } from '../Dashboard';
import OAuthWebView from './OAuthWebView';
import {
  Member,
  getAllMembers,
  ensureCurrentWeekExists,
  getMembersWithPurchaseDetails,
  getMitzvotWithPurchasers,
  MemberWithPurchaseDetails,
  MitzvaWithPurchaser,
  Week,
} from '../../database';
import { updateMemberPaymentStatusSync } from '../../hooks/useSync';
import './MobileApp.css';

// Screen types
type Screen = 'home' | 'members' | 'mitzvot' | 'print' | 'archive';

interface MobileAppProps {
  user: {
    id: number;
    email: string;
    synagogue_name?: string;
    contact_name?: string;
  } | null;
  onLoginSuccess: (user: any) => void;
  onLogout: () => void;
  gmailConnected?: boolean;
  gmailEmail?: string | null;
  onConnectGmail?: () => void;
}

export default function MobileApp({ user, onLoginSuccess, onLogout, gmailConnected, gmailEmail, onConnectGmail }: MobileAppProps) {
  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [showScanner, setShowScanner] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showOAuthWebView, setShowOAuthWebView] = useState(false);
  const [localGmailConnected, setLocalGmailConnected] = useState(gmailConnected || false);
  const [localGmailEmail, setLocalGmailEmail] = useState(gmailEmail || null);

  // Data for ScanningModal
  const [members, setMembers] = useState<Member[]>([]);
  const [mitzvotWithPurchasers, setMitzvotWithPurchasers] = useState<MitzvaWithPurchaser[]>([]);
  const [currentWeek, setCurrentWeek] = useState<Week | null>(null);
  const [membersWithPurchases, setMembersWithPurchases] = useState<MemberWithPurchaseDetails[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // State for editing member
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // State for ReminderPreviewModal
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderMember, setReminderMember] = useState<{
    id: number;
    firstName: string;
    lastName: string;
    amount: number;
    email?: string;
    phone?: string;
  } | null>(null);

  // Update local state when props change
  useEffect(() => {
    setLocalGmailConnected(gmailConnected || false);
    setLocalGmailEmail(gmailEmail || null);
  }, [gmailConnected, gmailEmail]);

  // Handle Gmail connection for mobile
  const handleConnectGmail = useCallback(async () => {
    // On mobile, show the OAuth WebView
    setShowOAuthWebView(true);
  }, []);

  // Handle OAuth success
  const handleOAuthSuccess = useCallback((email: string) => {
    console.log('OAuth success:', email);
    setShowOAuthWebView(false);
    setLocalGmailConnected(true);
    setLocalGmailEmail(email);
  }, []);

  // Handle OAuth error
  const handleOAuthError = useCallback((error: string) => {
    console.error('OAuth error:', error);
    setShowOAuthWebView(false);
    alert(error);
  }, []);

  // Handle OAuth cancel
  const handleOAuthCancel = useCallback(() => {
    setShowOAuthWebView(false);
  }, []);

  // Load data for scanner
  const loadData = useCallback(async () => {
    try {
      const [membersData, weekData] = await Promise.all([
        getAllMembers(),
        ensureCurrentWeekExists()
      ]);
      setMembers(membersData);
      setCurrentWeek(weekData);

      // Load members with purchases and mitzvot with purchasers for the current week
      if (weekData) {
        const [purchases, mitzvotData] = await Promise.all([
          getMembersWithPurchaseDetails(weekData.week_number, weekData.year),
          getMitzvotWithPurchasers(weekData.week_number, weekData.year)
        ]);
        setMembersWithPurchases(purchases);
        setMitzvotWithPurchasers(mitzvotData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Handle save from scanner
  const handleScannerSave = useCallback(async (
    _memberId: number,
    _items: CartItem[],
    _sendMessage: boolean,
    _customMessage?: string,
    _customSubject?: string
  ) => {
    // Items are already saved to database by ScanningModal
    // Just reload data to reflect changes
    await loadData();
    // Clear editing member after save
    setEditingMember(null);
  }, [loadData]);

  // Handle send reminder - opens ReminderPreviewModal
  const handleSendReminder = useCallback((memberId: number) => {
    const memberWithPurchases = membersWithPurchases.find(m => m.id === memberId);
    if (memberWithPurchases) {
      const unpaidAmount = memberWithPurchases.purchases
        .filter(p => p.payment_status === 'unpaid')
        .reduce((sum, p) => sum + (p.bid_price || 0), 0);

      setReminderMember({
        id: memberWithPurchases.id,
        firstName: memberWithPurchases.first_name,
        lastName: memberWithPurchases.last_name,
        amount: unpaidAmount,
        email: memberWithPurchases.email || undefined,
        phone: memberWithPurchases.phone || undefined,
      });
      setShowReminderModal(true);
    }
  }, [membersWithPurchases]);

  // Handle edit purchase - opens ScanningModal with the member pre-selected
  const handleEditPurchase = useCallback((memberId: number) => {
    const member = membersWithPurchases.find(m => m.id === memberId);
    if (member) {
      // MemberWithPurchaseDetails extends Member, so we can use it directly
      setEditingMember(member);
      setShowScanner(true);
    }
  }, [membersWithPurchases]);

  // Handle mark as paid - toggles payment status
  const handleMarkAsPaid = useCallback(async (memberId: number) => {
    if (!currentWeek) return;

    const member = membersWithPurchases.find(m => m.id === memberId);
    if (!member) return;

    // Toggle status - if all paid, mark as unpaid, otherwise mark as paid
    const allPaid = member.purchases.every(p => p.payment_status === 'paid');
    const newStatus = allPaid ? 'unpaid' : 'paid';

    try {
      await updateMemberPaymentStatusSync(memberId, currentWeek.week_number, currentWeek.year, newStatus);
      // Reload data to reflect changes
      await loadData();
    } catch (error) {
      console.error('Error updating payment status:', error);
    }
  }, [currentWeek, membersWithPurchases, loadData]);

  // Detect landscape orientation or tablet (wide screen)
  useEffect(() => {
    const checkOrientation = () => {
      // Consider landscape if width > height or if screen is wide enough for desktop layout
      const isWideScreen = window.innerWidth > window.innerHeight || window.innerWidth >= 900;
      setIsLandscape(isWideScreen);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // CONDITIONAL RETURNS - after all hooks
  // Show mobile login if no user
  if (!user) {
    return <MobileLoginPage onLoginSuccess={onLoginSuccess} />;
  }

  // Show desktop layout for landscape/tablets
  // IMPORTANT: Use handleConnectGmail (which opens OAuthWebView) instead of onConnectGmail prop
  if (isLandscape) {
    return (
      <div className="mobile-app">
        <Dashboard
          onLogout={onLogout}
          gmailConnected={localGmailConnected}
          gmailEmail={localGmailEmail}
          onConnectGmail={handleConnectGmail}
        />
        {/* OAuth WebView for Gmail connection - also needed in landscape mode */}
        {showOAuthWebView && (
          <OAuthWebView
            allowedEmail={user?.email}
            onSuccess={handleOAuthSuccess}
            onError={handleOAuthError}
            onCancel={handleOAuthCancel}
          />
        )}
      </div>
    );
  }

  // renderScreen function
  const renderScreen = () => {
    switch (currentScreen) {
      case 'home':
        return (
          <HomeScreen
            user={user}
            onScan={() => setShowScanner(true)}
            onLogout={onLogout}
            gmailConnected={localGmailConnected}
            gmailEmail={localGmailEmail}
            onConnectGmail={handleConnectGmail}
            onSendReminder={handleSendReminder}
            onEditPurchase={handleEditPurchase}
            refreshTrigger={refreshTrigger}
          />
        );
      case 'members':
        return <MembersScreen currentUser={user} />;
      case 'mitzvot':
        return <MitzvotScreen />;
      case 'print':
        return <PrintLabelsScreen />;
      case 'archive':
        return <ArchiveScreen />;
      default:
        return (
          <HomeScreen
            user={user}
            onScan={() => setShowScanner(true)}
            onLogout={onLogout}
            gmailConnected={localGmailConnected}
            gmailEmail={localGmailEmail}
            onConnectGmail={handleConnectGmail}
            onSendReminder={handleSendReminder}
            onEditPurchase={handleEditPurchase}
            refreshTrigger={refreshTrigger}
          />
        );
    }
  };

  // Main mobile UI
  return (
    <div className="mobile-app">
      {/* Main Content */}
      <main className="mobile-content">
        {renderScreen()}
      </main>

      {/* Bottom Navigation */}
      <BottomNav
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
      />

      {/* Scanner Modal */}
      {showScanner && currentWeek && (
        <ScanningModal
          isOpen={showScanner}
          onClose={() => {
            setShowScanner(false);
            setEditingMember(null);
            loadData();
            setRefreshTrigger(prev => prev + 1); // Trigger HomeScreen refresh
          }}
          members={members}
          mitzvot={mitzvotWithPurchasers}
          onSave={handleScannerSave}
          onPriceChange={loadData}
          weekNumber={currentWeek.week_number}
          year={currentWeek.year}
          parashaName={currentWeek.parasha_name_he || undefined}
          shabbatDate={currentWeek.shabbat_date || undefined}
          initialMember={editingMember || undefined}
        />
      )}

      {/* Reminder Preview Modal */}
      {showReminderModal && reminderMember && (
        <ReminderPreviewModal
          isOpen={showReminderModal}
          onClose={() => {
            setShowReminderModal(false);
            setReminderMember(null);
          }}
          member={reminderMember}
        />
      )}

      {/* OAuth WebView for Gmail connection */}
      {showOAuthWebView && (
        <OAuthWebView
          allowedEmail={user?.email}
          onSuccess={handleOAuthSuccess}
          onError={handleOAuthError}
          onCancel={handleOAuthCancel}
        />
      )}
    </div>
  );
}

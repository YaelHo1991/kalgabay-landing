import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { initDatabase, ensureCurrentWeekExists, getSetting, Week, createOrUpdateWeek, getHebrewWeekNumber } from "./database";
import { isGmailConnected, connectGmailAccount, getGmailEmail, disconnectGmail, initGmailOAuthListener } from "./services/gmailService";
import { ApiUser, getStoredUser, apiLogout, apiGetCurrentUser, isLoggedIn } from "./services/apiService";
import { Dashboard } from "./components/Dashboard";
import { SyncSettings } from "./components/SyncSettings";
import { TitleBar } from "./components/TitleBar";
import { HebrewYearSidebar } from "./components/HebrewYearSidebar";
import LoginPage from "./components/LoginPage";
import { useSync } from "./hooks/useSync";
import MobileApp from "./components/mobile/MobileApp";
import { platform } from "@tauri-apps/plugin-os";

type Page = "dashboard";

function App() {
  const { t, i18n } = useTranslation();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [user, setUser] = useState<ApiUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncingFromCloud, setSyncingFromCloud] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showYearSidebar, setShowYearSidebar] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<Week | null>(null);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<string>("home");

  // Track which user we've synced for (to prevent multiple syncs and to re-sync on user change)
  const lastSyncedUid = useRef<number | null>(null);

  // Detect Android and Mobile
  // Use synchronous detection first to prevent crash loop, then verify with Tauri API
  useEffect(() => {
    // Immediate synchronous detection (prevents flash of wrong UI)
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroidUA = userAgent.includes('android') || userAgent.includes('wv'); // wv = WebView
    console.log('Initial platform detection, userAgent:', userAgent, 'isAndroid:', isAndroidUA);
    setIsAndroid(isAndroidUA);

    // Then verify with Tauri API (async, but won't cause crash if it fails)
    const verifyPlatform = async () => {
      try {
        const currentPlatform = await platform();
        console.log('Tauri platform API returned:', currentPlatform);
        if (currentPlatform === 'android') {
          setIsAndroid(true);
          // Initialize Gmail OAuth deep link listener for Android
          initGmailOAuthListener();
        }
      } catch (e) {
        console.log('Platform API not available, using userAgent detection');
        // If userAgent suggests Android, still init the listener
        if (isAndroidUA) {
          initGmailOAuthListener();
        }
      }
    };
    verifyPlatform();

    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Sync hook - will handle automatic syncing (pass user id as string)
  const { syncFromCloud } = useSync(user?.id?.toString());

  // Handle event selection from Hebrew Year Sidebar
  const handleEventSelect = async (event: { date: Date; name: string; type: string }) => {
    try {
      // Calculate week number and year from the event date
      const eventDate = new Date(event.date);
      const weekNumber = getHebrewWeekNumber(eventDate);
      const year = eventDate.getFullYear();
      const shabbatDateStr = eventDate.toISOString().split('T')[0];

      // Create or get the week in database
      const week = await createOrUpdateWeek(
        weekNumber,
        year,
        event.type === "parasha" ? event.name.replace("פרשת ", "") : undefined,
        undefined,
        undefined,
        shabbatDateStr
      );

      // If it's a holiday, update with holiday name
      if (event.type === "holiday") {
        // Week created, now set holiday info if needed
      }

      setSelectedWeek(week);
      setRefreshKey(k => k + 1);
    } catch (error) {
      console.error("Error selecting event:", error);
    }
  };

  // Called when data is synced from cloud
  const handleDataChanged = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  // Check Gmail connection status - runs when user changes
  useEffect(() => {
    const checkGmailStatus = () => {
      const connected = isGmailConnected();
      const storedGmailEmail = getGmailEmail();

      // If Gmail is connected, verify it matches the logged-in user
      if (connected && user && storedGmailEmail) {
        const gmailLower = storedGmailEmail.toLowerCase().trim();
        const userLower = user.email.toLowerCase().trim();

        if (gmailLower !== userLower) {
          // Gmail from different user - disconnect it
          console.log('Gmail mismatch detected, disconnecting old Gmail:', storedGmailEmail, 'vs user:', user.email);
          disconnectGmail();
          setGmailConnected(false);
          setGmailEmail(null);
          return;
        }
      }

      setGmailConnected(connected);
      if (connected) {
        setGmailEmail(storedGmailEmail);
      }
    };
    checkGmailStatus();
    // Check periodically in case token expires
    const interval = setInterval(checkGmailStatus, 60000);
    return () => clearInterval(interval);
  }, [user]); // Re-run when user changes

  // Handle Gmail connection - only allows connection with the licensed email
  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    console.log('Starting Gmail connection for user:', user?.email);
    try {
      // Pass the licensed email to restrict connection to only that email
      const result = await connectGmailAccount(user?.email);
      console.log('Gmail connection result:', result);
      if (result.success) {
        setGmailConnected(true);
        setGmailEmail(result.email || null);
        console.log('Gmail connected successfully:', result.email);
      } else if (result.error) {
        console.error('Gmail connection failed:', result.error);
        alert(result.error);
      }
    } catch (error) {
      console.error('Gmail connection error:', error);
      alert('שגיאה בחיבור Gmail');
    } finally {
      setConnectingGmail(false);
    }
  };

  // Check authentication status using API service
  useEffect(() => {
    const checkAuth = async () => {
      setAuthLoading(true);

      if (isLoggedIn()) {
        // Try to get user from storage first
        const storedUser = getStoredUser();
        if (storedUser) {
          setUser(storedUser);
        }

        // Verify with server and refresh user data
        try {
          const serverUser = await apiGetCurrentUser();
          if (serverUser) {
            setUser(serverUser);
          } else {
            // Token invalid, clear user
            setUser(null);
          }
        } catch (err) {
          console.error("Error verifying user:", err);
          // Keep stored user if server check fails
        }
      } else {
        setUser(null);
      }

      setAuthLoading(false);
    };

    checkAuth();
  }, []);

  // Sync from cloud when user logs in and database is ready
  useEffect(() => {
    const doInitialSync = async () => {
      // Only sync if we have a user, db is ready, not already syncing, and we haven't synced for this user yet
      if (user && dbReady && !syncingFromCloud && lastSyncedUid.current !== user.id) {
        console.log('Starting initial sync from cloud for user:', user.id);
        setSyncingFromCloud(true);
        lastSyncedUid.current = user.id; // Mark that we're syncing for this user
        try {
          const success = await syncFromCloud();
          console.log('Initial sync completed, success:', success);
          // Refresh the UI after sync
          setRefreshKey(k => k + 1);
        } catch (err) {
          console.error('Initial sync failed:', err);
          // Reset the ref so sync can be retried
          lastSyncedUid.current = null;
        } finally {
          setSyncingFromCloud(false);
        }
      }
    };
    doInitialSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dbReady, syncFromCloud]); // Run when user, dbReady, or syncFromCloud changes

  // Initialize local database and load saved language
  useEffect(() => {
    const init = async () => {
      try {
        await initDatabase();

        // Load saved language from database
        const savedLang = await getSetting("app_language");
        if (savedLang && savedLang !== i18n.language) {
          i18n.changeLanguage(savedLang);
        }

        setDbReady(true);

        // Run ensureCurrentWeekExists in background - don't block app initialization
        // This fetches parasha info from Sefaria API which can be slow/fail on mobile
        ensureCurrentWeekExists().catch(err => {
          console.warn("Background week initialization failed:", err);
        });
      } catch (err) {
        console.error("Database initialization error:", err);
        setError(t("app.dbError"));
      }
    };
    init();
  }, []);

  // Handle logout
  const handleLogout = async () => {
    try {
      await apiLogout();
      // Disconnect Gmail on logout to prevent old user's Gmail being used by new user
      disconnectGmail();
      setGmailConnected(false);
      setGmailEmail(null);
      setUser(null);
      lastSyncedUid.current = null; // Reset so next login will sync
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  // Handle login success - set user and trigger sync
  // IMPORTANT: This hook must be defined BEFORE any conditional returns
  const handleLoginSuccess = useCallback(async (loggedInUser: ApiUser) => {
    setUser(loggedInUser);

    // Immediately start syncing from cloud after login
    if (dbReady) {
      console.log('Starting immediate sync after login for user:', loggedInUser.id);
      setSyncingFromCloud(true);
      lastSyncedUid.current = loggedInUser.id;
      try {
        const success = await syncFromCloud();
        console.log('Post-login sync completed, success:', success);
      } catch (err) {
        console.error('Post-login sync failed:', err);
        lastSyncedUid.current = null;
      } finally {
        setSyncingFromCloud(false);
        setRefreshKey(k => k + 1);
      }
    }
  }, [dbReady, syncFromCloud]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <h2 style={{ color: "#dc3545" }}>{error}</h2>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  // Show loading while checking auth or syncing
  if (authLoading || !dbReady || syncingFromCloud) {
    let loadingMessage = t("app.initDb");
    if (authLoading) {
      loadingMessage = "בודק התחברות...";
    } else if (syncingFromCloud) {
      loadingMessage = "מסנכרן נתונים מהענן...";
    }

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div
          style={{
            width: "50px",
            height: "50px",
            border: "4px solid #e0e0e0",
            borderTopColor: "#4FA8D9",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
        <p>{loadingMessage}</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Show Mobile UI for Android (handles both login and main app)
  // NOTE: Do NOT use key={refreshKey} here - it causes infinite remount loops on Android
  // MobileApp handles its own data refreshing internally
  if (isAndroid) {
    return (
      <MobileApp
        user={user}
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        gmailConnected={gmailConnected}
        gmailEmail={gmailEmail}
        onConnectGmail={handleConnectGmail}
      />
    );
  }

  // Desktop: Show login page if not authenticated
  if (!user) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case "dashboard":
        return (
          <Dashboard
            key={refreshKey}
            initialWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            onLogout={handleLogout}
            onOpenWeekSelector={() => setShowYearSidebar(true)}
            gmailConnected={gmailConnected}
            gmailEmail={gmailEmail}
            onConnectGmail={handleConnectGmail}
            onTabChange={setDashboardTab}
          />
        );
      default:
        return (
          <Dashboard
            key={refreshKey}
            initialWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            onLogout={handleLogout}
            onOpenWeekSelector={() => setShowYearSidebar(true)}
            gmailConnected={gmailConnected}
            gmailEmail={gmailEmail}
            onConnectGmail={handleConnectGmail}
            onTabChange={setDashboardTab}
          />
        );
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TitleBar title="קלגבאי" />

      {/* User Info Bar - Only show on mobile/Android */}
      {isMobile && (
      <div style={{
        background: "linear-gradient(135deg, #4FA8D9 0%, #1E5AA8 100%)",
        color: "white",
        padding: isAndroid ? "8px 12px" : "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: isAndroid ? "0.8rem" : "0.9rem",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        ...(isAndroid ? {
          position: "fixed" as const,
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1001,
          minHeight: "44px"
        } : {})
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>
            {user.synagogue_name || "בית הכנסת"}
          </span>
          <span style={{ opacity: 0.9 }}>|</span>
          <span>{user.contact_name || user.email}</span>
          {/* Gmail Status Indicator */}
          <button
            onClick={gmailConnected ? undefined : handleConnectGmail}
            disabled={connectingGmail}
            title={gmailConnected
              ? `Gmail מחובר: ${gmailEmail}`
              : "לחץ לחיבור Gmail לשליחת מיילים"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: gmailConnected ? "rgba(76, 175, 80, 0.3)" : "rgba(255, 152, 0, 0.3)",
              border: "none",
              borderRadius: "12px",
              padding: "4px 10px",
              cursor: gmailConnected ? "default" : "pointer",
              color: "white",
              fontSize: "0.8rem",
              transition: "all 0.2s"
            }}
          >
            <span style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: gmailConnected ? "#4CAF50" : "#FF9800",
              boxShadow: gmailConnected ? "0 0 6px #4CAF50" : "0 0 6px #FF9800"
            }} />
            {connectingGmail ? "מתחבר..." : gmailConnected ? "Gmail" : "חבר Gmail"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "white",
              padding: "6px 12px",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.85rem",
              transition: "background 0.2s"
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.3)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          >
            התנתק
          </button>
        </div>
      </div>
      )}

      <main style={{ flex: 1, paddingTop: isAndroid ? "65px" : (isMobile ? "20px" : "0") }}>
        {renderPage()}
      </main>

      {showSyncSettings && (
        <SyncSettings
          onClose={() => setShowSyncSettings(false)}
          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setShowSyncSettings(false);
            handleDataChanged();
          }}
        />
      )}

      {/* Hebrew Year Calendar Button - only shown on home tab */}
      {dashboardTab === "home" && (
        <button
          onClick={() => setShowYearSidebar(true)}
          title="לוח שנה עברי"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 998,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            border: "none",
            background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)", // blue-500 to blue-700
            color: "white",
            cursor: "pointer",
            boxShadow: "0 4px 15px rgba(37, 99, 235, 0.4)", // blue-600 shadow
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(37, 99, 235, 0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 15px rgba(37, 99, 235, 0.4)";
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </button>
      )}

      {/* Hebrew Year Sidebar */}
      <HebrewYearSidebar
        isOpen={showYearSidebar}
        onClose={() => setShowYearSidebar(false)}
        onEventSelect={handleEventSelect}
        selectedWeek={selectedWeek}
      />
    </div>
  );
}

export default App;

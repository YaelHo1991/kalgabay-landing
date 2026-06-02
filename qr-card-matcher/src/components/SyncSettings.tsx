import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  apiLogin,
  apiLogout,
  ApiUser,
  getStoredUser,
  isLoggedIn,
  apiGetCurrentUser,
} from "../services/apiService";
import { getSetting, setSetting } from "../database";
import { getEmailConfig, saveEmailConfig, testEmailConfig } from "../services/emailService";
import { disconnectGmail } from "../services/gmailService";
import "./SyncSettings.css";

const LANGUAGE_KEY = "app_language";
const SYNAGOGUE_NAME_KEY = "synagogue_name";
const EMAIL_TEMPLATE_KEY = "email_template";

interface SyncSettingsProps {
  onClose: () => void;
  onLoginSuccess: (user: ApiUser) => void;
}

type Tab = "account" | "email" | "language";

export function SyncSettings({ onClose, onLoginSuccess }: SyncSettingsProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [canClose, setCanClose] = useState(false);

  // Prevent immediate close from the click that opened the modal
  useEffect(() => {
    const timer = setTimeout(() => setCanClose(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Auth state
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Language state
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language);
  const [synagogueName, setSynagogueName] = useState("");

  // Email template state
  const [emailTemplate, setEmailTemplate] = useState("");

  // Resend API state
  const [resendApiKey, setResendApiKey] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedLang = await getSetting(LANGUAGE_KEY);
        if (savedLang) {
          setSelectedLanguage(savedLang);
        }
        const savedSynagogue = await getSetting(SYNAGOGUE_NAME_KEY);
        if (savedSynagogue) {
          setSynagogueName(savedSynagogue);
        }
        const savedEmailTemplate = await getSetting(EMAIL_TEMPLATE_KEY);
        if (savedEmailTemplate) {
          setEmailTemplate(savedEmailTemplate);
        }
        // Load Resend config
        const emailConfig = await getEmailConfig();
        if (emailConfig?.apiKey) {
          setResendApiKey(emailConfig.apiKey);
        }
      } catch (error) {
        console.error("Error loading settings:", error);
      }
    };

    loadSettings();
  }, []);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      if (isLoggedIn()) {
        // Try to get user from storage first
        const storedUser = getStoredUser();
        if (storedUser) {
          setCurrentUser(storedUser);
          // Update local synagogue name from server
          if (storedUser.synagogue_name && !await getSetting(SYNAGOGUE_NAME_KEY)) {
            await setSetting(SYNAGOGUE_NAME_KEY, storedUser.synagogue_name);
            setSynagogueName(storedUser.synagogue_name);
          }
        }
        // Verify with server
        try {
          const serverUser = await apiGetCurrentUser();
          if (serverUser) {
            setCurrentUser(serverUser);
          } else {
            setCurrentUser(null);
          }
        } catch (error) {
          console.error("Error loading user data:", error);
        }
      }
      setAuthLoading(false);
    };

    checkAuth();
  }, []);

  // Handle login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setMessage({ type: "error", text: "נא למלא אימייל וסיסמה" });
      return;
    }

    setLoginLoading(true);
    setMessage(null);

    try {
      const result = await apiLogin(loginEmail.trim(), loginPassword.trim());

      if (result.success && result.user) {
        setMessage({ type: "success", text: "התחברת בהצלחה!" });
        setCurrentUser(result.user);
        onLoginSuccess(result.user);
      } else {
        setMessage({ type: "error", text: result.error || "שגיאה בהתחברות" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "שגיאה בהתחברות";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await apiLogout();
      // Also disconnect Gmail when logging out
      // Gmail connection is per-user, so it should be cleared
      disconnectGmail();
      setCurrentUser(null);
      setMessage({ type: "success", text: "התנתקת בהצלחה" });
    } catch (error) {
      setMessage({ type: "error", text: "שגיאה בהתנתקות" });
    }
  };

  const handleLanguageChange = async (lang: string) => {
    setSelectedLanguage(lang);
    i18n.changeLanguage(lang);
    try {
      await setSetting(LANGUAGE_KEY, lang);
    } catch (error) {
      console.error("Error saving language:", error);
    }
  };

  const saveSynagogueName = async () => {
    try {
      await setSetting(SYNAGOGUE_NAME_KEY, synagogueName);
      setMessage({ type: "success", text: t("settings.language.saved") });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error saving synagogue name:", error);
      setMessage({ type: "error", text: "Error saving settings" });
    }
  };

  const saveEmailTemplate = async () => {
    try {
      await setSetting(EMAIL_TEMPLATE_KEY, emailTemplate);
      setMessage({ type: "success", text: t("settings.email.saved") });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error saving email template:", error);
      setMessage({ type: "error", text: "Error saving settings" });
    }
  };

  // Save Resend API key
  const saveResendApiKey = async () => {
    try {
      await saveEmailConfig({ apiKey: resendApiKey });
      setMessage({ type: "success", text: "מפתח API נשמר בהצלחה" });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error saving Resend API key:", error);
      setMessage({ type: "error", text: "שגיאה בשמירת מפתח API" });
    }
  };

  // Test email configuration
  const handleTestEmail = async () => {
    if (!testEmail || !resendApiKey) {
      setMessage({ type: "error", text: "נא למלא את מפתח ה-API ואת כתובת המייל לבדיקה" });
      return;
    }

    setTestingEmail(true);
    try {
      // Save the API key first
      await saveEmailConfig({ apiKey: resendApiKey });

      // Send test email
      const result = await testEmailConfig(testEmail);
      if (result.success) {
        setMessage({ type: "success", text: "מייל בדיקה נשלח בהצלחה! בדוק את תיבת הדואר" });
      } else {
        setMessage({ type: "error", text: result.error || "שגיאה בשליחת מייל הבדיקה" });
      }
    } catch (error) {
      console.error("Error testing email:", error);
      setMessage({ type: "error", text: "שגיאה בשליחת מייל הבדיקה" });
    } finally {
      setTestingEmail(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleOverlayClick = () => {
    if (canClose) {
      onClose();
    }
  };

  // Check subscription status
  const getSubscriptionStatus = () => {
    if (!currentUser) return null;

    const expiresAt = currentUser.status === 'trial'
      ? new Date(currentUser.trial_ends_at)
      : currentUser.subscription_expires_at
        ? new Date(currentUser.subscription_expires_at)
        : null;

    if (!expiresAt) return null;

    const now = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      return { status: 'expired', text: 'המנוי פג תוקף', color: '#dc3545' };
    } else if (currentUser.status === 'trial') {
      return { status: 'trial', text: `תקופת ניסיון - נותרו ${daysLeft} ימים`, color: '#ff9800' };
    } else {
      return { status: 'active', text: `מנוי פעיל - נותרו ${daysLeft} ימים`, color: '#4CAF50' };
    }
  };

  const subscriptionStatus = getSubscriptionStatus();

  return (
    <div className="sync-overlay" onClick={handleOverlayClick}>
      <div className="sync-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sync-header">
          <h2>הגדרות</h2>
          <button className="sync-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === "account" ? "active" : ""}`}
            onClick={() => { setActiveTab("account"); setMessage(null); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
            חשבון
          </button>
          <button
            className={`settings-tab ${activeTab === "email" ? "active" : ""}`}
            onClick={() => { setActiveTab("email"); setMessage(null); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
            </svg>
            {t("settings.tabs.email")}
          </button>
          <button
            className={`settings-tab ${activeTab === "language" ? "active" : ""}`}
            onClick={() => { setActiveTab("language"); setMessage(null); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
            </svg>
            {t("settings.tabs.language")}
          </button>
        </div>

        <div className="sync-content">
          {message && (
            <div className={`sync-message ${message.type}`}>
              {message.text}
            </div>
          )}

          {activeTab === "account" && (
            <>
              {authLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>טוען...</div>
              ) : currentUser ? (
                /* Logged in state */
                <div>
                  <div className="sync-info" style={{ background: '#e8f5e9', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#4CAF50">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <h3 style={{ color: '#2e7d32' }}>מחובר</h3>
                    <p style={{ textAlign: 'center', color: '#666', marginTop: '10px', direction: 'ltr' }}>
                      {currentUser.email}
                    </p>
                    <div style={{ marginTop: '15px', textAlign: 'center' }}>
                      <p style={{ fontWeight: 'bold', color: '#333' }}>{currentUser.synagogue_name}</p>
                      <p style={{ color: '#666', fontSize: '0.9rem' }}>{currentUser.contact_name}</p>
                    </div>
                  </div>

                  {/* Subscription Status */}
                  {subscriptionStatus && (
                    <div style={{
                      background: subscriptionStatus.status === 'expired' ? '#ffebee' : subscriptionStatus.status === 'trial' ? '#fff3cd' : '#e8f5e9',
                      padding: '15px',
                      borderRadius: '8px',
                      marginBottom: '20px',
                      textAlign: 'center',
                      color: subscriptionStatus.color,
                      fontWeight: 'bold'
                    }}>
                      {subscriptionStatus.text}
                    </div>
                  )}

                  <div style={{
                    background: '#f0f7ff',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    fontSize: '0.9rem',
                    color: '#1a5276'
                  }}>
                    <strong>סנכרון אוטומטי:</strong> הנתונים שלך מסתנכרנים אוטומטית עם הענן.
                  </div>

                  <button
                    type="button"
                    className="sync-button secondary"
                    onClick={handleLogout}
                    style={{ width: '100%', padding: '15px' }}
                  >
                    התנתק
                  </button>
                </div>
              ) : (
                /* Login form */
                <>
                  <div className="sync-info">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="#4FA8D9">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                    </svg>
                    <h3>התחברות</h3>
                    <p style={{ textAlign: 'center', color: '#666', marginTop: '10px' }}>
                      הכנס את פרטי ההתחברות שהגדרת בעת ההרשמה
                    </p>
                  </div>

                  <form onSubmit={handleLogin} className="sync-form" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div className="sync-input-group">
                      <label>אימייל:</label>
                      <input
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        dir="ltr"
                        disabled={loginLoading}
                      />
                    </div>

                    <div className="sync-input-group">
                      <label>סיסמה:</label>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="••••••••"
                        dir="ltr"
                        disabled={loginLoading}
                      />
                    </div>

                    <button
                      type="submit"
                      className="sync-button primary"
                      disabled={loginLoading}
                      style={{ padding: '18px', fontSize: '1.1rem' }}
                    >
                      {loginLoading ? "מתחבר..." : "התחבר"}
                    </button>
                  </form>

                  <div style={{
                    marginTop: '20px',
                    padding: '15px',
                    background: '#f0f0f0',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#666',
                    textAlign: 'center'
                  }}>
                    עדיין לא נרשמת?{' '}
                    <a
                      href="https://yaelho1991.github.io/kalgabay-landing/#register"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#4FA8D9', fontWeight: 'bold' }}
                    >
                      הירשם באתר
                    </a>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "email" && (
            <>
              {/* Resend API Configuration */}
              <div className="email-template-info">
                <h3>הגדרת שליחת מיילים (Resend)</h3>
                <p style={{ color: '#666', marginTop: '10px' }}>
                  הזן את מפתח ה-API מ-Resend כדי לשלוח מיילים ישירות מהאפליקציה
                </p>
              </div>

              <div className="sync-form">
                <div className="sync-input-group">
                  <label>מפתח API של Resend</label>
                  <input
                    type="password"
                    value={resendApiKey}
                    onChange={(e) => setResendApiKey(e.target.value)}
                    placeholder="re_xxxxxxxxx..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0d5c8',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      direction: 'ltr'
                    }}
                  />
                  <small style={{ color: '#888', marginTop: '8px', display: 'block' }}>
                    ניתן להשיג מפתח API ב-<a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#1E5AA8' }}>resend.com</a>
                  </small>
                </div>

                <div className="sync-input-group" style={{ marginTop: '15px' }}>
                  <label>בדיקת שליחה</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="כתובת מייל לבדיקה"
                      style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #e0d5c8',
                        fontSize: '0.9rem',
                        direction: 'ltr'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleTestEmail}
                      disabled={testingEmail || !resendApiKey}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: testingEmail ? '#ccc' : '#4FA8D9',
                        color: 'white',
                        cursor: testingEmail || !resendApiKey ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {testingEmail ? 'שולח...' : 'שלח בדיקה'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className="sync-button primary"
                  onClick={saveResendApiKey}
                  disabled={!resendApiKey}
                  style={{ marginTop: '20px' }}
                >
                  שמור מפתח API
                </button>
              </div>

              {/* Email Template */}
              <div className="email-template-info" style={{ marginTop: '30px', borderTop: '1px solid #e0d5c8', paddingTop: '20px' }}>
                <h3>{t("settings.email.title")}</h3>
                <p style={{ color: '#666', marginTop: '10px' }}>
                  {t("settings.email.description")}
                </p>
              </div>

              <div className="sync-form">
                <div className="sync-input-group">
                  <label>{t("settings.email.templateLabel")}</label>
                  <textarea
                    value={emailTemplate}
                    onChange={(e) => setEmailTemplate(e.target.value)}
                    placeholder={t("settings.email.templatePlaceholder")}
                    dir={selectedLanguage === 'he' ? 'rtl' : 'ltr'}
                    rows={6}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #e0d5c8',
                      fontFamily: 'inherit',
                      fontSize: '1rem',
                      resize: 'vertical',
                      minHeight: '120px'
                    }}
                  />
                  <small style={{ color: '#888', marginTop: '8px', display: 'block' }}>
                    {t("settings.email.templateHint")}
                  </small>
                </div>

                <button
                  type="button"
                  className="sync-button primary"
                  onClick={saveEmailTemplate}
                  style={{ marginTop: '20px' }}
                >
                  {t("common.save")}
                </button>
              </div>
            </>
          )}

          {activeTab === "language" && (
            <>
              <div className="email-template-info">
                <h3>{t("settings.language.title")}</h3>
              </div>

              <div className="sync-form">
                <div className="sync-input-group">
                  <label>{t("settings.language.selectLanguage")}</label>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('he')}
                      style={{
                        flex: 1,
                        padding: '15px 20px',
                        borderRadius: '10px',
                        border: selectedLanguage === 'he' ? '2px solid #4FA8D9' : '2px solid #e0e0e0',
                        background: selectedLanguage === 'he' ? '#fdfbf7' : 'white',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        fontWeight: selectedLanguage === 'he' ? 'bold' : 'normal',
                        color: '#333',
                        fontFamily: 'inherit'
                      }}
                    >
                      {t("settings.language.hebrew")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('en')}
                      style={{
                        flex: 1,
                        padding: '15px 20px',
                        borderRadius: '10px',
                        border: selectedLanguage === 'en' ? '2px solid #4FA8D9' : '2px solid #e0e0e0',
                        background: selectedLanguage === 'en' ? '#fdfbf7' : 'white',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        fontWeight: selectedLanguage === 'en' ? 'bold' : 'normal',
                        color: '#333',
                        fontFamily: 'inherit'
                      }}
                    >
                      {t("settings.language.english")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLanguageChange('fr')}
                      style={{
                        flex: 1,
                        padding: '15px 20px',
                        borderRadius: '10px',
                        border: selectedLanguage === 'fr' ? '2px solid #4FA8D9' : '2px solid #e0e0e0',
                        background: selectedLanguage === 'fr' ? '#fdfbf7' : 'white',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        fontWeight: selectedLanguage === 'fr' ? 'bold' : 'normal',
                        color: '#333',
                        fontFamily: 'inherit'
                      }}
                    >
                      {t("settings.language.french")}
                    </button>
                  </div>
                </div>

                <div className="sync-input-group" style={{ marginTop: '25px' }}>
                  <label>{t("settings.language.synagogueName")}</label>
                  <input
                    type="text"
                    value={synagogueName}
                    onChange={(e) => setSynagogueName(e.target.value)}
                    placeholder={t("common.synagogue")}
                    dir={selectedLanguage === 'he' ? 'rtl' : 'ltr'}
                  />
                  <small>{t("settings.language.synagogueNameHint")}</small>
                </div>

                <button
                  type="button"
                  className="sync-button primary"
                  onClick={saveSynagogueName}
                  style={{ marginTop: '20px' }}
                >
                  {t("common.save")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Export async function to get synagogue name from database
export async function getSynagogueName(): Promise<string> {
  try {
    const name = await getSetting(SYNAGOGUE_NAME_KEY);
    return name || "";
  } catch {
    return "";
  }
}

// Export async function to get email template from database
export async function getEmailTemplate(): Promise<string> {
  try {
    const template = await getSetting(EMAIL_TEMPLATE_KEY);
    return template || "";
  } catch {
    return "";
  }
}

// Gmail config interface and getter for email sending
const GMAIL_CONFIG_KEY = "gmail_config";

interface GmailConfig {
  senderEmail: string;
  senderName: string;
  appPassword: string;
}

export async function getGmailConfig(): Promise<GmailConfig | null> {
  try {
    const savedConfig = await getSetting(GMAIL_CONFIG_KEY);
    if (savedConfig) {
      const config = JSON.parse(savedConfig);
      if (config.senderEmail && config.appPassword) {
        return config;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Export the GmailConfig type
export type { GmailConfig };

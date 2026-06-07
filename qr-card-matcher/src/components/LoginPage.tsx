import { useState, useEffect, useCallback } from 'react';
import { apiLogin, apiForgotPassword, ApiUser } from '../services/apiService';
import './LoginPage.css';

// Storage keys for remember me
const STORAGE_KEY_EMAIL = 'kalgabay_remembered_email';
const STORAGE_KEY_PASSWORD = 'kalgabay_remembered_password';
const STORAGE_KEY_REMEMBER = 'kalgabay_remember_me';

// Persistent storage using Tauri Store (works on Android) with localStorage fallback
let storeInstance: Awaited<ReturnType<typeof import('@tauri-apps/plugin-store').load>> | null = null;

async function getStore() {
  if (storeInstance) return storeInstance;

  try {
    const { load } = await import('@tauri-apps/plugin-store');
    storeInstance = await load('credentials.json');
    console.log('[RememberMe] Tauri Store loaded successfully');
    return storeInstance;
  } catch (error) {
    console.warn('[RememberMe] Tauri Store not available, using localStorage fallback:', error);
    return null;
  }
}

async function persistentGet(key: string): Promise<string | null> {
  try {
    const store = await getStore();
    if (store) {
      const value = await store.get<string>(key);
      console.log(`[RememberMe] GET ${key} from Tauri Store:`, value ? '(has value)' : '(empty)');
      return value ?? null;
    }
  } catch (error) {
    console.warn(`[RememberMe] Error getting ${key} from Tauri Store:`, error);
  }
  const localValue = localStorage.getItem(key);
  console.log(`[RememberMe] GET ${key} from localStorage:`, localValue ? '(has value)' : '(empty)');
  return localValue;
}

async function persistentSet(key: string, value: string): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.set(key, value);
      await store.save();
      console.log(`[RememberMe] SET ${key} to Tauri Store: success`);
      return;
    }
  } catch (error) {
    console.warn(`[RememberMe] Error setting ${key} to Tauri Store:`, error);
  }
  localStorage.setItem(key, value);
  console.log(`[RememberMe] SET ${key} to localStorage: success`);
}

async function persistentRemove(key: string): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.delete(key);
      await store.save();
      console.log(`[RememberMe] REMOVE ${key} from Tauri Store: success`);
      return;
    }
  } catch (error) {
    console.warn(`[RememberMe] Error removing ${key} from Tauri Store:`, error);
  }
  localStorage.removeItem(key);
  console.log(`[RememberMe] REMOVE ${key} from localStorage: success`);
}

interface LoginPageProps {
  onLoginSuccess?: (user: ApiUser) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  // Load remembered credentials on mount
  const loadSavedCredentials = useCallback(async () => {
    try {
      const remembered = await persistentGet(STORAGE_KEY_REMEMBER);
      if (remembered === 'true') {
        const savedEmail = await persistentGet(STORAGE_KEY_EMAIL);
        const savedPassword = await persistentGet(STORAGE_KEY_PASSWORD);
        if (savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
        if (savedPassword) {
          setPassword(savedPassword);
        }
      }
    } catch (error) {
      console.error('Error loading saved credentials:', error);
    }
  }, []);

  useEffect(() => {
    loadSavedCredentials();
  }, [loadSavedCredentials]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ type: 'error', text: 'נא להזין כתובת אימייל' });
      return;
    }

    if (!password.trim()) {
      setMessage({ type: 'error', text: 'נא להזין סיסמה' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await apiLogin(email.trim(), password.trim());

      if (result.success && result.user) {
        // Save or clear remembered credentials based on checkbox
        if (rememberMe) {
          await persistentSet(STORAGE_KEY_EMAIL, email.trim());
          await persistentSet(STORAGE_KEY_PASSWORD, password.trim());
          await persistentSet(STORAGE_KEY_REMEMBER, 'true');
        } else {
          await persistentRemove(STORAGE_KEY_EMAIL);
          await persistentRemove(STORAGE_KEY_PASSWORD);
          await persistentRemove(STORAGE_KEY_REMEMBER);
        }

        setMessage({ type: 'success', text: 'מתחבר...' });
        onLoginSuccess?.(result.user);
      } else {
        setMessage({ type: 'error', text: result.error || 'שגיאה בהתחברות' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'שגיאה בהתחברות';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!forgotEmail.trim()) {
      setMessage({ type: 'error', text: 'נא להזין כתובת אימייל' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await apiForgotPassword(forgotEmail.trim());

      if (result.success) {
        setMessage({ type: 'success', text: 'סיסמה חדשה נשלחה למייל שלך!' });
        setForgotEmail('');
        // Return to login form after 3 seconds
        setTimeout(() => {
          setShowForgotPassword(false);
          setMessage(null);
        }, 3000);
      } else {
        setMessage({ type: 'error', text: result.error || 'שגיאה בשליחת הסיסמה' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'שגיאה בשליחת הסיסמה';
      setMessage({ type: 'error', text: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🏛️ קלגבאי</h1>
          <p>{showForgotPassword ? 'שחזור סיסמה' : 'התחבר כדי לסנכרן את הנתונים בין כל המכשירים שלך'}</p>
        </div>

        {!showForgotPassword ? (
          <>
            <form onSubmit={handlePasswordLogin} className="login-form">
              <div className="input-group">
                <label htmlFor="email">כתובת אימייל</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={loading}
                  autoComplete="email"
                  dir="ltr"
                />
              </div>

              <div className="input-group">
                <label htmlFor="password">סיסמה</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  autoComplete="current-password"
                  dir="ltr"
                />
              </div>

              <div className="remember-me">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={loading}
                  />
                  <span className="checkbox-custom">{rememberMe && "✓"}</span>
                  <span>זכור אותי</span>
                </label>
              </div>

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'מתחבר...' : 'התחבר'}
              </button>
            </form>

            <div className="login-info">
              <h3>התחברות עם סיסמה</h3>
              <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                הזן את האימייל והסיסמה שקיבלת במייל בעת ההרשמה.
              </p>
              <p style={{ color: '#888', fontSize: '13px', marginTop: '10px' }}>
                שכחת סיסמה?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(true);
                    setMessage(null);
                    setForgotEmail(email);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3B82F6',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 'inherit',
                    textDecoration: 'underline'
                  }}
                >
                  שחזר סיסמה
                </button>
              </p>
              <p style={{ color: '#888', fontSize: '13px', marginTop: '6px' }}>
                עדיין לא נרשמת?{' '}
                <a
                  href="https://yanshouf.com/#register"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#3B82F6' }}
                >
                  הירשם כאן
                </a>
              </p>
              {message && (
                <p className={`message-text ${message.type}`}>
                  {message.text}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <form onSubmit={handleForgotPassword} className="login-form">
              <div className="input-group">
                <label htmlFor="forgot-email">כתובת אימייל</label>
                <input
                  type="email"
                  id="forgot-email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={loading}
                  autoComplete="email"
                  dir="ltr"
                />
              </div>

              <button type="submit" className="login-button" disabled={loading}>
                {loading ? 'שולח...' : 'שלח סיסמה חדשה'}
              </button>
            </form>

            <div className="login-info">
              <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
                הזן את כתובת האימייל שלך ונשלח לך סיסמה חדשה.
              </p>
              <p style={{ color: '#888', fontSize: '13px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setMessage(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#3B82F6',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 'inherit',
                    textDecoration: 'underline'
                  }}
                >
                  חזרה להתחברות
                </button>
              </p>
              {message && (
                <p className={`message-text ${message.type}`}>
                  {message.text}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

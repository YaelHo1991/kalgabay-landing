/**
 * MobileLoginPage - Simple login page optimized for mobile
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiLogin } from '../../services/apiService';
import './MobileLoginPage.css';

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
    console.log('[RememberMe-Mobile] Tauri Store loaded successfully');
    return storeInstance;
  } catch (error) {
    console.warn('[RememberMe-Mobile] Tauri Store not available, using localStorage fallback:', error);
    return null;
  }
}

async function persistentGet(key: string): Promise<string | null> {
  try {
    const store = await getStore();
    if (store) {
      const value = await store.get<string>(key);
      console.log(`[RememberMe-Mobile] GET ${key} from Tauri Store:`, value ? '(has value)' : '(empty)');
      return value ?? null;
    }
  } catch (error) {
    console.warn(`[RememberMe-Mobile] Error getting ${key} from Tauri Store:`, error);
  }
  const localValue = localStorage.getItem(key);
  console.log(`[RememberMe-Mobile] GET ${key} from localStorage:`, localValue ? '(has value)' : '(empty)');
  return localValue;
}

async function persistentSet(key: string, value: string): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.set(key, value);
      await store.save();
      console.log(`[RememberMe-Mobile] SET ${key} to Tauri Store: success`);
      return;
    }
  } catch (error) {
    console.warn(`[RememberMe-Mobile] Error setting ${key} to Tauri Store:`, error);
  }
  localStorage.setItem(key, value);
  console.log(`[RememberMe-Mobile] SET ${key} to localStorage: success`);
}

async function persistentRemove(key: string): Promise<void> {
  try {
    const store = await getStore();
    if (store) {
      await store.delete(key);
      await store.save();
      console.log(`[RememberMe-Mobile] REMOVE ${key} from Tauri Store: success`);
      return;
    }
  } catch (error) {
    console.warn(`[RememberMe-Mobile] Error removing ${key} from Tauri Store:`, error);
  }
  localStorage.removeItem(key);
  console.log(`[RememberMe-Mobile] REMOVE ${key} from localStorage: success`);
}

interface MobileLoginPageProps {
  onLoginSuccess: (user: any) => void;
}

export default function MobileLoginPage({ onLoginSuccess }: MobileLoginPageProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

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
      console.error('[RememberMe-Mobile] Error loading saved credentials:', error);
    }
  }, []);

  useEffect(() => {
    loadSavedCredentials();
  }, [loadSavedCredentials]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
        onLoginSuccess(result.user);
      } else {
        setError(result.error || t('login.error'));
      }
    } catch (err) {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mobile-login">
      <div className="mobile-login-header">
        <div className="mobile-login-logo">🏛️</div>
        <h1>קלגבאי</h1>
        <p>התחבר כדי לסנכרן את הנתונים<br/>בין כל המכשירים שלך</p>
      </div>

      <form className="mobile-login-form" onSubmit={handleSubmit}>
        <div className="mobile-input-group">
          <label>כתובת אימייל</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
            autoComplete="email"
            dir="ltr"
          />
        </div>

        <div className="mobile-input-group">
          <label>סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete="current-password"
            dir="ltr"
          />
        </div>

        <div
          className="mobile-remember-me"
          onClick={() => setRememberMe(!rememberMe)}
        >
          <div style={{
            width: 22,
            height: 22,
            border: `2px solid ${rememberMe ? '#3B82F6' : '#D1D5DB'}`,
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: rememberMe ? '#3B82F6' : 'white',
            flexShrink: 0,
            transition: 'all 0.15s',
            color: rememberMe ? 'white' : 'transparent',
            fontSize: '12px',
            fontWeight: 'bold',
          }}>
            ✓
          </div>
          <span>זכור אותי</span>
        </div>

        {error && <div className="mobile-login-error">{error}</div>}

        <button
          type="submit"
          className="mobile-login-button"
          disabled={loading || !email || !password}
        >
          {loading ? 'מתחבר...' : 'התחבר'}
        </button>

        <div className="mobile-login-links">
          <a href="#">שכחת סיסמה?</a>
        </div>
      </form>
    </div>
  );
}

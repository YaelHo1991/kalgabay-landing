import { useState, useEffect } from 'react';
import { apiLogin, ApiUser } from '../services/apiService';
import './LoginPage.css';

// Storage keys for remember me
const STORAGE_KEY_EMAIL = 'kalgabay_remembered_email';
const STORAGE_KEY_REMEMBER = 'kalgabay_remember_me';

interface LoginPageProps {
  onLoginSuccess?: (user: ApiUser) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load remembered email on mount
  useEffect(() => {
    const remembered = localStorage.getItem(STORAGE_KEY_REMEMBER) === 'true';
    if (remembered) {
      const savedEmail = localStorage.getItem(STORAGE_KEY_EMAIL);
      if (savedEmail) {
        setEmail(savedEmail);
        setRememberMe(true);
      }
    }
  }, []);

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
        // Save or clear remembered email based on checkbox
        if (rememberMe) {
          localStorage.setItem(STORAGE_KEY_EMAIL, email.trim());
          localStorage.setItem(STORAGE_KEY_REMEMBER, 'true');
        } else {
          localStorage.removeItem(STORAGE_KEY_EMAIL);
          localStorage.removeItem(STORAGE_KEY_REMEMBER);
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

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>🏛️ קלגבאי</h1>
          <p>התחבר כדי לסנכרן את הנתונים בין כל המכשירים שלך</p>
        </div>

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
              <span className="checkbox-custom"></span>
              <span>זכור אותי</span>
            </label>
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="login-info">
          <h3>התחברות עם סיסמה</h3>
          <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
            הזן את האימייל והסיסמה שקיבלת במייל בעת ההרשמה.
          </p>
          <p style={{ color: '#888', fontSize: '13px', marginTop: '10px' }}>
            עדיין לא נרשמת?{' '}
            <a
              href="https://yanshouf.com/#register"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4FA8D9' }}
            >
              הירשם כאן
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

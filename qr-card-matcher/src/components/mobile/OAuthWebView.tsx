/**
 * OAuth WebView Component for Android
 * Opens Google OAuth in external browser via Tauri shell plugin
 * The Rust backend handles the OAuth callback via TCP listener
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface OAuthWebViewProps {
  allowedEmail?: string;
  onSuccess: (email: string) => void;
  onError: (error: string) => void;
  onCancel: () => void;
}

interface OAuthResult {
  access_token: string;
  refresh_token: string | null;
  id_token: string | null;
  expires_in: number | null;
  email: string | null;
  name: string | null;
}

export function OAuthWebView({ allowedEmail, onSuccess, onError, onCancel }: OAuthWebViewProps) {
  const [processing, setProcessing] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // Start OAuth flow using Rust backend (same as desktop)
  const startOAuth = async () => {
    if (processing) return;

    setProcessing(true);
    setWaiting(true);

    try {
      console.log('Starting OAuth flow for email:', allowedEmail);

      // Use the same Rust OAuth flow as desktop
      // This opens the browser and waits for the callback
      const result = await invoke<OAuthResult>('start_google_oauth', {
        loginHint: allowedEmail || null
      });

      console.log('OAuth result:', result);

      if (result.access_token) {
        // Validate email if allowedEmail is specified
        if (allowedEmail && result.email) {
          const connectedEmail = result.email.toLowerCase().trim();
          const requiredEmail = allowedEmail.toLowerCase().trim();

          if (connectedEmail !== requiredEmail) {
            onError(`יש להתחבר עם המייל הרשום ברישיון: ${allowedEmail}`);
            return;
          }
        }

        // Save tokens to localStorage
        const expiresIn = result.expires_in || 3600;
        const expiryTime = Date.now() + (expiresIn * 1000);

        localStorage.setItem('gmail_access_token', result.access_token);
        localStorage.setItem('gmail_token_expiry', String(expiryTime));

        if (result.refresh_token) {
          localStorage.setItem('gmail_refresh_token', result.refresh_token);
        }

        if (result.email) {
          localStorage.setItem('gmail_user_email', result.email);
        }

        if (result.name) {
          localStorage.setItem('gmail_user_name', result.name);
        }

        onSuccess(result.email || '');
      } else {
        onError('לא התקבל אישור לגישה ל-Gmail');
      }
    } catch (error: unknown) {
      console.error('OAuth error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle user cancellation
      if (errorMessage.includes('No authorization code received') ||
          errorMessage.includes('cancelled') ||
          errorMessage.includes('canceled')) {
        onCancel();
        return;
      }

      onError('שגיאה בחיבור Gmail: ' + errorMessage);
    } finally {
      setProcessing(false);
      setWaiting(false);
    }
  };

  // Auto-start OAuth when component mounts
  useEffect(() => {
    // Small delay to ensure UI is ready
    const timer = setTimeout(() => {
      startOAuth();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '30px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        direction: 'rtl'
      }}>
        <h2 style={{ marginBottom: '20px', color: '#1E5AA8' }}>התחברות ל-Gmail</h2>

        {waiting && (
          <div style={{ padding: '20px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #e0e0e0',
              borderTopColor: '#4FA8D9',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 15px'
            }} />
            <p style={{ color: '#666', marginBottom: '10px' }}>
              ממתין להתחברות בדפדפן...
            </p>
            <p style={{ color: '#999', fontSize: '14px' }}>
              לאחר ההתחברות בדפדפן, חזור לאפליקציה
            </p>
          </div>
        )}

        {!waiting && !processing && (
          <>
            <p style={{ marginBottom: '20px', color: '#666' }}>
              לחץ על הכפתור כדי להתחבר עם חשבון Google שלך
            </p>

            <button
              onClick={startOAuth}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                padding: '14px 20px',
                backgroundColor: 'white',
                border: '2px solid #dadce0',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 500,
                color: '#3c4043',
                cursor: 'pointer',
                marginBottom: '15px',
                transition: 'all 0.2s'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              התחבר עם Google
            </button>
          </>
        )}

        <button
          onClick={onCancel}
          disabled={processing}
          style={{
            padding: '10px 20px',
            backgroundColor: 'transparent',
            border: 'none',
            color: processing ? '#ccc' : '#666',
            cursor: processing ? 'default' : 'pointer',
            fontSize: '14px'
          }}
        >
          ביטול
        </button>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default OAuthWebView;

/**
 * Gmail Service
 * ==============================================
 * Handles Gmail OAuth and token management
 * Uses Rust/Tauri for OAuth flow, stores tokens in localStorage
 * NO Firebase dependency
 */

import { invoke } from '@tauri-apps/api/core';

// LocalStorage keys for Gmail tokens
const GMAIL_ACCESS_TOKEN_KEY = 'gmail_access_token';
const GMAIL_REFRESH_TOKEN_KEY = 'gmail_refresh_token';
const GMAIL_TOKEN_EXPIRY_KEY = 'gmail_token_expiry';
const GMAIL_USER_EMAIL_KEY = 'gmail_user_email';
const GMAIL_USER_NAME_KEY = 'gmail_user_name';

// Type for Rust OAuth result
interface RustOAuthResult {
  access_token: string;
  refresh_token: string | null;
  id_token: string | null;
  expires_in: number | null;
  email: string | null;
  name: string | null;
}

/**
 * Connect Gmail account using Rust OAuth flow (opens system browser)
 * @param allowedEmail - If provided, only this email will be accepted for connection.
 *                       Also used as login_hint to pre-select the account in Google's chooser.
 */
export async function connectGmailAccount(allowedEmail?: string): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    // Use Rust OAuth flow - opens system browser and returns tokens
    // Pass allowedEmail as login_hint to pre-select the correct account
    const result = await invoke<RustOAuthResult>('start_google_oauth', {
      loginHint: allowedEmail || null
    });

    if (result.access_token) {
      // Validate email if allowedEmail is specified
      if (allowedEmail && result.email) {
        const connectedEmail = result.email.toLowerCase().trim();
        const requiredEmail = allowedEmail.toLowerCase().trim();

        if (connectedEmail !== requiredEmail) {
          // Wrong email - don't save tokens and return error
          return {
            success: false,
            error: `יש להתחבר עם המייל הרשום ברישיון: ${allowedEmail}`
          };
        }
      }

      // Calculate expiry time (tokens typically last 1 hour)
      const expiresIn = result.expires_in || 3600;
      const expiryTime = Date.now() + (expiresIn * 1000);

      // Save tokens
      localStorage.setItem(GMAIL_ACCESS_TOKEN_KEY, result.access_token);
      localStorage.setItem(GMAIL_TOKEN_EXPIRY_KEY, String(expiryTime));

      if (result.refresh_token) {
        localStorage.setItem(GMAIL_REFRESH_TOKEN_KEY, result.refresh_token);
      }

      if (result.email) {
        localStorage.setItem(GMAIL_USER_EMAIL_KEY, result.email);
      }

      if (result.name) {
        localStorage.setItem(GMAIL_USER_NAME_KEY, result.name);
      }

      return {
        success: true,
        email: result.email || ''
      };
    }

    return {
      success: false,
      error: 'לא התקבל אישור לגישה ל-Gmail'
    };
  } catch (error: unknown) {
    console.error('Gmail connection error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Handle user cancellation
    if (errorMessage.includes('No authorization code received') ||
        errorMessage.includes('cancelled') ||
        errorMessage.includes('canceled')) {
      return {
        success: false,
        error: 'ההתחברות בוטלה. אנא נסה שוב.'
      };
    }

    return {
      success: false,
      error: 'שגיאה בחיבור Gmail: ' + errorMessage
    };
  }
}

/**
 * Check if Gmail is connected (has valid token or can refresh)
 */
export function isGmailConnected(): boolean {
  const token = localStorage.getItem(GMAIL_ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(GMAIL_REFRESH_TOKEN_KEY);

  // Connected if we have either a valid access token or a refresh token
  return !!(token || refreshToken);
}

/**
 * Check if access token is expired
 */
function isTokenExpired(): boolean {
  const expiry = localStorage.getItem(GMAIL_TOKEN_EXPIRY_KEY);
  if (!expiry) return true;

  // Consider expired if less than 5 minutes remaining
  return Date.now() >= (parseInt(expiry) - 5 * 60 * 1000);
}

/**
 * Refresh the access token using refresh token
 */
async function refreshGmailToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(GMAIL_REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const result = await invoke<RustOAuthResult>('refresh_google_token', {
      refreshToken: refreshToken
    });

    if (result.access_token) {
      // Calculate expiry time
      const expiresIn = result.expires_in || 3600;
      const expiryTime = Date.now() + (expiresIn * 1000);

      // Update stored tokens
      localStorage.setItem(GMAIL_ACCESS_TOKEN_KEY, result.access_token);
      localStorage.setItem(GMAIL_TOKEN_EXPIRY_KEY, String(expiryTime));

      return result.access_token;
    }

    return null;
  } catch (error) {
    console.error('Failed to refresh Gmail token:', error);
    // Clear tokens on refresh failure - user needs to re-authenticate
    disconnectGmail();
    return null;
  }
}

/**
 * Get Gmail access token (refreshes if needed)
 */
export async function getGmailAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(GMAIL_ACCESS_TOKEN_KEY);

  if (!token) return null;

  // If token is not expired, return it
  if (!isTokenExpired()) {
    return token;
  }

  // Try to refresh the token
  return await refreshGmailToken();
}

/**
 * Synchronous version for checking - doesn't refresh
 */
export function getGmailAccessTokenSync(): string | null {
  if (isTokenExpired()) return null;
  return localStorage.getItem(GMAIL_ACCESS_TOKEN_KEY);
}

/**
 * Get connected Gmail email
 */
export function getGmailEmail(): string | null {
  return localStorage.getItem(GMAIL_USER_EMAIL_KEY);
}

/**
 * Get connected Gmail user name
 */
export function getGmailUserName(): string | null {
  return localStorage.getItem(GMAIL_USER_NAME_KEY);
}

/**
 * Disconnect Gmail - clears all stored tokens
 */
export function disconnectGmail(): void {
  localStorage.removeItem(GMAIL_ACCESS_TOKEN_KEY);
  localStorage.removeItem(GMAIL_REFRESH_TOKEN_KEY);
  localStorage.removeItem(GMAIL_TOKEN_EXPIRY_KEY);
  localStorage.removeItem(GMAIL_USER_EMAIL_KEY);
  localStorage.removeItem(GMAIL_USER_NAME_KEY);
}

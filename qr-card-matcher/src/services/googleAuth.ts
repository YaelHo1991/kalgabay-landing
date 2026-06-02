import { invoke } from '@tauri-apps/api/core';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  REFRESH_TOKEN: 'google_refresh_token',
  TOKEN_EXPIRY: 'google_token_expiry',
  USER_EMAIL: 'google_user_email',
  USER_NAME: 'google_user_name',
};

export interface GoogleUser {
  email: string;
  name: string;
  accessToken: string;
}

export interface OAuthResult {
  access_token: string;
  refresh_token: string | null;
  id_token: string | null;
  expires_in: number | null;
  email: string | null;
  name: string | null;
}

// Detect if running on mobile (Android/iOS)
function isMobile(): boolean {
  // Check if we're running on Android or iOS via Tauri
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('android') || userAgent.includes('iphone') || userAgent.includes('ipad');
}

// Check if user is logged in
export function isLoggedIn(): boolean {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  return !!(accessToken || refreshToken);
}

// Get current user info
export function getCurrentUser(): GoogleUser | null {
  const email = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
  const name = localStorage.getItem(STORAGE_KEYS.USER_NAME);
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

  if (!email || !accessToken) {
    return null;
  }

  return { email, name: name || email, accessToken };
}

// Save OAuth result to local storage
function saveOAuthResult(result: OAuthResult): GoogleUser {
  localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, result.access_token);

  if (result.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, result.refresh_token);
  }

  if (result.expires_in) {
    const expiry = Date.now() + (result.expires_in * 1000);
    localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiry.toString());
  }

  if (result.email) {
    localStorage.setItem(STORAGE_KEYS.USER_EMAIL, result.email);
  }

  if (result.name) {
    localStorage.setItem(STORAGE_KEYS.USER_NAME, result.name);
  }

  return {
    email: result.email || '',
    name: result.name || result.email || '',
    accessToken: result.access_token,
  };
}

// Pending OAuth resolve/reject callbacks for mobile flow
let pendingOAuthResolve: ((user: GoogleUser) => void) | null = null;
let pendingOAuthReject: ((error: Error) => void) | null = null;

// Initialize deep link listener for mobile OAuth callback
export async function initOAuthDeepLinkListener(): Promise<void> {
  if (!isMobile()) return;

  try {
    await onOpenUrl((urls) => {
      for (const url of urls) {
        handleDeepLink(url);
      }
    });
  } catch (error) {
    console.error('Failed to initialize deep link listener:', error);
  }
}

// Handle deep link callback
async function handleDeepLink(url: string): Promise<void> {
  // Expected format: qrcardmatcher://oauth/callback?code=xxx
  if (!url.includes('oauth/callback')) return;

  const urlObj = new URL(url);
  const code = urlObj.searchParams.get('code');
  const error = urlObj.searchParams.get('error');

  if (error) {
    if (pendingOAuthReject) {
      pendingOAuthReject(new Error(`OAuth error: ${error}`));
      pendingOAuthResolve = null;
      pendingOAuthReject = null;
    }
    return;
  }

  if (!code) {
    if (pendingOAuthReject) {
      pendingOAuthReject(new Error('No authorization code received'));
      pendingOAuthResolve = null;
      pendingOAuthReject = null;
    }
    return;
  }

  try {
    // Exchange code for tokens
    const result = await invoke<OAuthResult>('exchange_google_code', { code, isMobile: true });
    const user = saveOAuthResult(result);

    if (pendingOAuthResolve) {
      pendingOAuthResolve(user);
      pendingOAuthResolve = null;
      pendingOAuthReject = null;
    }
  } catch (err) {
    if (pendingOAuthReject) {
      pendingOAuthReject(err instanceof Error ? err : new Error(String(err)));
      pendingOAuthResolve = null;
      pendingOAuthReject = null;
    }
  }
}

// Start Google OAuth flow
export async function signInWithGoogle(): Promise<GoogleUser> {
  if (isMobile()) {
    // Mobile flow: Open browser with deep link callback
    return signInWithGoogleMobile();
  }

  // Desktop flow: Use local server callback
  try {
    const result = await invoke<OAuthResult>('start_google_oauth');
    return saveOAuthResult(result);
  } catch (error) {
    console.error('Google sign-in failed:', error);
    throw new Error(`התחברות נכשלה: ${error}`);
  }
}

// Mobile-specific OAuth flow - opens external browser, user copies URL back
async function signInWithGoogleMobile(): Promise<GoogleUser> {
  // Open external browser with OAuth URL
  // This is the only reliable way on Android due to Google's WebView restrictions
  const authUrl = await invoke<string>('get_google_auth_url_mobile');
  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(authUrl);

  // User needs to copy the URL from the browser after login
  throw new Error('NEEDS_CODE_INPUT');
}

// Check for pending OAuth result on mobile (call on app startup)
// No longer uses Firebase - OAuth is handled via Rust/Tauri
export async function checkMobileAuthRedirect(): Promise<GoogleUser | null> {
  // Check if we have stored credentials from a previous session
  const email = localStorage.getItem(STORAGE_KEYS.USER_EMAIL);
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const name = localStorage.getItem(STORAGE_KEYS.USER_NAME);

  if (email && accessToken) {
    return {
      email,
      name: name || email,
      accessToken
    };
  }

  return null;
}

// Helper to extract code from URL - can be used by the UI
export function extractCodeFromUrl(url: string): string | null {
  try {
    // Handle both full URL and just the query part
    const urlObj = new URL(url.startsWith('http') ? url : `http://dummy${url}`);
    return urlObj.searchParams.get('code');
  } catch {
    // Try to extract manually if URL parsing fails
    const match = url.match(/code=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

// Exchange manually entered code for tokens (mobile flow)
export async function exchangeCodeForTokens(code: string): Promise<GoogleUser> {
  try {
    const result = await invoke<OAuthResult>('exchange_google_code', { code, isMobile: true });
    return saveOAuthResult(result);
  } catch (error) {
    console.error('Code exchange failed:', error);
    throw new Error(`החלפת הקוד נכשלה: ${error}`);
  }
}

// Sign out
export function signOut(): void {
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
  localStorage.removeItem(STORAGE_KEYS.USER_NAME);
}

// Get valid access token (refresh if needed)
export async function getValidAccessToken(): Promise<string> {
  const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
  const expiryStr = localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);

  if (!accessToken && !refreshToken) {
    throw new Error('לא מחובר - יש להתחבר עם Google');
  }

  // Check if token is still valid (with 5 minute buffer)
  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    const fiveMinutes = 5 * 60 * 1000;

    if (Date.now() < expiry - fiveMinutes && accessToken) {
      return accessToken;
    }
  }

  // Need to refresh
  if (!refreshToken) {
    throw new Error('הטוקן פג תוקף - יש להתחבר מחדש');
  }

  try {
    const result = await invoke<OAuthResult>('refresh_google_token', {
      refreshToken: refreshToken,
    });

    // Save new access token
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, result.access_token);

    if (result.expires_in) {
      const expiry = Date.now() + (result.expires_in * 1000);
      localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiry.toString());
    }

    return result.access_token;
  } catch (error) {
    console.error('Token refresh failed:', error);
    // Clear invalid tokens
    signOut();
    throw new Error('הטוקן פג תוקף - יש להתחבר מחדש');
  }
}

// Send email using Gmail API
export async function sendEmailWithGmail(
  toEmail: string,
  toName: string,
  subject: string,
  body: string
): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    throw new Error('לא מחובר - יש להתחבר עם Google');
  }

  const accessToken = await getValidAccessToken();

  await invoke('send_email_gmail', {
    accessToken,
    toEmail,
    toName,
    subject,
    body,
    fromEmail: user.email,
    fromName: user.name,
  });
}

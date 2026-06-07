/**
 * API Service for connecting to the YanShouf server
 */

const API_BASE_URL = 'https://yanshouf.com/api';
const DEFAULT_TIMEOUT_MS = 15000; // 15 second timeout for API calls

/**
 * Fetch with timeout - prevents hanging requests on mobile
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  }
}

// Storage keys
const AUTH_TOKEN_KEY = 'api_auth_token';
const AUTH_USER_KEY = 'api_auth_user';

export interface ApiUser {
  id: number;
  email: string;
  synagogue_name: string;
  contact_name: string;
  phone: string;
  status: string;
  trial_ends_at: string;
  subscription_expires_at?: string;
  last_sync_at?: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: ApiUser;
  error?: string;
}

export interface SyncData {
  members: Array<{
    id: number;
    code: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    notification_preferences: string | null;
    created_at: string;
    updated_at: string;
  }>;
  tickets: Array<{
    id: number;
    code: string;
    name: string;
    price: number;
    notes: string | null;
    available_on_holidays: number;
    holidays_only: number;
    created_at: string;
  }>;
  links: Array<{
    id: number;
    member_id: number;
    ticket_id: number;
    week_number: number;
    year: number;
    bid_price: number;
    payment_status: string;
    reminder_sent_at: string | null;
    linked_at: string;
  }>;
  weeks: Array<{
    id: number;
    week_number: number;
    year: number;
    parasha_name_he: string | null;
    parasha_name_en: string | null;
    parasha_ref: string | null;
    shabbat_date: string | null;
    is_current: number;
    event_type: string | null;
    holiday_name_he: string | null;
    holiday_name_en: string | null;
    created_at: string;
  }>;
  drafts: Array<{
    id: string;
    data: unknown;
    createdAt: string;
    createdOnDevice: string;
  }>;
  lastSyncAt: string | null;
  serverTime: string;
}

/**
 * Login with email and password
 */
export async function apiLogin(email: string, password: string): Promise<LoginResponse> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth.php?action=login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (data.success && data.token) {
      // Save token and user data
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));

      return {
        success: true,
        token: data.token,
        user: data.user,
      };
    }

    return {
      success: false,
      error: data.error || 'שגיאה בהתחברות',
    };
  } catch (error) {
    console.error('API Login error:', error);
    return {
      success: false,
      error: 'שגיאת תקשורת. בדוק את חיבור האינטרנט.',
    };
  }
}

/**
 * Forgot password - send reset email
 */
export async function apiForgotPassword(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth.php?action=forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (data.success) {
      return { success: true };
    }

    return {
      success: false,
      error: data.error || 'שגיאה בשליחת הסיסמה',
    };
  } catch (error) {
    console.error('Forgot password error:', error);
    return {
      success: false,
      error: 'שגיאת תקשורת. בדוק את חיבור האינטרנט.',
    };
  }
}

/**
 * Logout - invalidate token
 */
export async function apiLogout(): Promise<void> {
  const token = getAuthToken();

  if (token) {
    try {
      await fetchWithTimeout(`${API_BASE_URL}/auth.php?action=logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // Clear local storage
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

/**
 * Get current auth token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Get current user from storage
 */
export function getStoredUser(): ApiUser | null {
  const userJson = localStorage.getItem(AUTH_USER_KEY);
  if (userJson) {
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  return !!getAuthToken();
}

/**
 * Get current user info from server
 */
export async function apiGetCurrentUser(): Promise<ApiUser | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth.php?action=me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.success && data.user) {
      // Update stored user
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
      return data.user;
    }

    // Token might be invalid
    if (response.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }

    return null;
  } catch (error) {
    console.error('Get user error:', error);
    return null;
  }
}

/**
 * Download sync data from server
 */
export async function apiDownloadData(): Promise<{ success: boolean; data?: SyncData; error?: string }> {
  const token = getAuthToken();
  if (!token) {
    return { success: false, error: 'לא מחובר' };
  }

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/sync.php`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }, 30000); // 30 second timeout for sync operations

    const result = await response.json();

    if (result.success && result.data) {
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error || 'שגיאה בהורדת נתונים' };
  } catch (error) {
    console.error('Download data error:', error);
    return { success: false, error: 'שגיאת תקשורת' };
  }
}

/**
 * Upload sync data to server
 */
export async function apiUploadData(data: {
  members?: Array<unknown>;
  tickets?: Array<unknown>;
  links?: Array<unknown>;
  weeks?: Array<unknown>;
  drafts?: Array<unknown>;
}): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const token = getAuthToken();
  if (!token) {
    return { success: false, error: 'לא מחובר' };
  }

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/sync.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    }, 30000); // 30 second timeout for sync operations

    const result = await response.json();
    console.log('[apiUploadData] Server response:', JSON.stringify(result.result));

    if (result.success) {
      return { success: true, result: result.result };
    }

    return { success: false, error: result.error || 'שגיאה בהעלאת נתונים' };
  } catch (error) {
    console.error('Upload data error:', error);
    return { success: false, error: 'שגיאת תקשורת' };
  }
}

/**
 * Refresh token
 */
export async function apiRefreshToken(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/auth.php?action=refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.success && data.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Refresh token error:', error);
    return false;
  }
}

// ============================================
// CRUD Operations - Server-First Architecture
// ============================================

// Types for CRUD operations
export interface ApiMember {
  id: number;
  code: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  notification_preferences: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiTicket {
  id: number;
  code: string;
  name: string;
  price: number;
  notes: string | null;
  available_on_holidays: number;
  holidays_only: number;
  created_at: string;
}

export interface ApiLink {
  id: number;
  code: string;
  member_id: number;
  ticket_id: number;
  date: string;
  price_paid: number;
  notes: string | null;
  member_first_name?: string;
  member_last_name?: string;
  ticket_name?: string;
  created_at: string;
}

// Generic API request helper
async function apiRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = getAuthToken();
  if (!token) {
    return { success: false, error: 'לא מחובר' };
  }

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetchWithTimeout(`${API_BASE_URL}/${endpoint}`, options);

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API request error (${endpoint}): HTTP ${response.status}`, errorText);
      return { success: false, error: `שגיאת שרת (${response.status})` };
    }

    const text = await response.text();
    if (!text) {
      return { success: false, error: 'תגובה ריקה מהשרת' };
    }

    const result = JSON.parse(text);

    if (result.success) {
      return { success: true, data: result };
    }

    return { success: false, error: result.error || 'שגיאה בביצוע הפעולה' };
  } catch (error) {
    console.error(`API request error (${endpoint}):`, error);
    return { success: false, error: 'שגיאת תקשורת' };
  }
}

// ============================================
// Members CRUD
// ============================================

export async function apiListMembers(): Promise<{ success: boolean; members?: ApiMember[]; error?: string }> {
  const result = await apiRequest<{ members: ApiMember[] }>('members.php?action=list');
  if (result.success && result.data) {
    return { success: true, members: result.data.members };
  }
  return { success: false, error: result.error };
}

export async function apiGetMember(id: number): Promise<{ success: boolean; member?: ApiMember; error?: string }> {
  const result = await apiRequest<{ member: ApiMember }>(`members.php?action=get&id=${id}`);
  if (result.success && result.data) {
    return { success: true, member: result.data.member };
  }
  return { success: false, error: result.error };
}

export async function apiCreateMember(data: {
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  notification_preferences?: string;
  code?: string; // Optional manual code
}): Promise<{ success: boolean; member?: ApiMember; error?: string }> {
  const result = await apiRequest<{ member: ApiMember }>('members.php', 'POST', data);
  if (result.success && result.data) {
    return { success: true, member: result.data.member };
  }
  return { success: false, error: result.error };
}

export async function apiUpdateMember(id: number, data: {
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  notification_preferences?: string;
}): Promise<{ success: boolean; member?: ApiMember; error?: string }> {
  const result = await apiRequest<{ member: ApiMember }>(`members.php?id=${id}`, 'PUT', data);
  if (result.success && result.data) {
    return { success: true, member: result.data.member };
  }
  return { success: false, error: result.error };
}

export async function apiDeleteMember(id: number): Promise<{ success: boolean; error?: string }> {
  const result = await apiRequest<{ message: string }>(`members.php?id=${id}`, 'DELETE');
  return { success: result.success, error: result.error };
}

// ============================================
// Tickets CRUD
// ============================================

export async function apiListTickets(): Promise<{ success: boolean; tickets?: ApiTicket[]; error?: string }> {
  const result = await apiRequest<{ tickets: ApiTicket[] }>('tickets.php?action=list');
  if (result.success && result.data) {
    return { success: true, tickets: result.data.tickets };
  }
  return { success: false, error: result.error };
}

export async function apiGetTicket(id: number): Promise<{ success: boolean; ticket?: ApiTicket; error?: string }> {
  const result = await apiRequest<{ ticket: ApiTicket }>(`tickets.php?action=get&id=${id}`);
  if (result.success && result.data) {
    return { success: true, ticket: result.data.ticket };
  }
  return { success: false, error: result.error };
}

export async function apiCreateTicket(data: {
  name: string;
  price?: number;
  notes?: string;
  available_on_holidays?: boolean;
  holidays_only?: boolean;
  code?: string; // Optional manual code
}): Promise<{ success: boolean; ticket?: ApiTicket; error?: string }> {
  const result = await apiRequest<{ ticket: ApiTicket }>('tickets.php', 'POST', {
    ...data,
    available_on_holidays: data.available_on_holidays ? 1 : 0,
    holidays_only: data.holidays_only ? 1 : 0,
  });
  if (result.success && result.data) {
    return { success: true, ticket: result.data.ticket };
  }
  return { success: false, error: result.error };
}

export async function apiUpdateTicket(id: number, data: {
  name: string;
  price?: number;
  notes?: string;
  available_on_holidays?: boolean;
  holidays_only?: boolean;
}): Promise<{ success: boolean; ticket?: ApiTicket; error?: string }> {
  const result = await apiRequest<{ ticket: ApiTicket }>(`tickets.php?id=${id}`, 'PUT', {
    ...data,
    available_on_holidays: data.available_on_holidays ? 1 : 0,
    holidays_only: data.holidays_only ? 1 : 0,
  });
  if (result.success && result.data) {
    return { success: true, ticket: result.data.ticket };
  }
  return { success: false, error: result.error };
}

export async function apiDeleteTicket(id: number): Promise<{ success: boolean; error?: string }> {
  const result = await apiRequest<{ message: string }>(`tickets.php?id=${id}`, 'DELETE');
  return { success: result.success, error: result.error };
}

// ============================================
// Links CRUD
// ============================================

export async function apiListLinks(): Promise<{ success: boolean; links?: ApiLink[]; error?: string }> {
  const result = await apiRequest<{ links: ApiLink[] }>('links.php?action=list');
  if (result.success && result.data) {
    return { success: true, links: result.data.links };
  }
  return { success: false, error: result.error };
}

export async function apiGetLink(id: number): Promise<{ success: boolean; link?: ApiLink; error?: string }> {
  const result = await apiRequest<{ link: ApiLink }>(`links.php?action=get&id=${id}`);
  if (result.success && result.data) {
    return { success: true, link: result.data.link };
  }
  return { success: false, error: result.error };
}

export async function apiGetLinksByMember(memberId: number): Promise<{ success: boolean; links?: ApiLink[]; error?: string }> {
  const result = await apiRequest<{ links: ApiLink[] }>(`links.php?action=by-member&member_id=${memberId}`);
  if (result.success && result.data) {
    return { success: true, links: result.data.links };
  }
  return { success: false, error: result.error };
}

export async function apiGetLinksByTicket(ticketId: number): Promise<{ success: boolean; links?: ApiLink[]; error?: string }> {
  const result = await apiRequest<{ links: ApiLink[] }>(`links.php?action=by-ticket&ticket_id=${ticketId}`);
  if (result.success && result.data) {
    return { success: true, links: result.data.links };
  }
  return { success: false, error: result.error };
}

export async function apiCreateLink(data: {
  member_id: number;
  ticket_id: number;
  date?: string;
  price_paid?: number;
  notes?: string;
}): Promise<{ success: boolean; link?: ApiLink; error?: string }> {
  const result = await apiRequest<{ link: ApiLink }>('links.php', 'POST', data);
  if (result.success && result.data) {
    return { success: true, link: result.data.link };
  }
  return { success: false, error: result.error };
}

export async function apiUpdateLink(id: number, data: {
  member_id: number;
  ticket_id: number;
  date?: string;
  price_paid?: number;
  notes?: string;
}): Promise<{ success: boolean; link?: ApiLink; error?: string }> {
  const result = await apiRequest<{ link: ApiLink }>(`links.php?id=${id}`, 'PUT', data);
  if (result.success && result.data) {
    return { success: true, link: result.data.link };
  }
  return { success: false, error: result.error };
}

export async function apiDeleteLink(id: number): Promise<{ success: boolean; error?: string }> {
  const result = await apiRequest<{ message: string }>(`links.php?id=${id}`, 'DELETE');
  return { success: result.success, error: result.error };
}

// ============================================
// Email Templates
// ============================================

export interface EmailTemplate {
  template_key: string;
  name: string;
  subject: string;
  html_template: string;
  text_template: string | null;
  variables: string | null;
}

export async function apiGetEmailTemplates(): Promise<{ success: boolean; templates?: Record<string, EmailTemplate>; error?: string }> {
  const result = await apiRequest<{ templates: Record<string, EmailTemplate> }>('email-templates.php');
  if (result.success && result.data) {
    return { success: true, templates: result.data.templates };
  }
  return { success: false, error: result.error };
}

export async function apiGetEmailTemplate(key: string): Promise<{ success: boolean; template?: EmailTemplate; error?: string }> {
  const result = await apiRequest<{ template: EmailTemplate }>(`email-templates.php?key=${key}`);
  if (result.success && result.data) {
    return { success: true, template: result.data.template };
  }
  return { success: false, error: result.error };
}

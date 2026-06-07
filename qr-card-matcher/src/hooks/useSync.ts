import { useCallback, useRef, useState } from 'react';
import {
  apiDownloadData,
  apiUploadData,
  isLoggedIn as apiIsLoggedIn,
  SyncData,
  // Server-First CRUD functions
  apiCreateMember,
  apiUpdateMember,
  apiDeleteMember,
  apiCreateTicket,
  apiUpdateTicket,
  apiDeleteTicket,
  ApiMember,
  ApiTicket,
} from '../services/apiService';
import * as db from '../database';

// This hook manages synchronization between local SQLite and YanShouf server API
// Strategy: HYBRID - Server-first for members/tickets, Local-first for links
// - Members/Tickets: Server first, then update local cache
// - Links: Local first, then sync to server in background (more responsive UX)
// - This prevents duplicates when multiple devices are connected

export function useSync(userId?: string) {
  const isSyncing = useRef(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Get current user ID
  const getUserId = useCallback((): string | null => {
    if (userId) return userId;
    return apiIsLoggedIn() ? 'logged-in' : null;
  }, [userId]);

  // Export local data to sync format for API upload
  const exportLocalData = useCallback(async () => {
    const database = await db.getDb();

    // Get all members
    const members = await database.select<db.Member[]>("SELECT * FROM members");

    // Get all tickets
    const tickets = await database.select<db.Mitzva[]>("SELECT * FROM tickets");

    // Get all weeks
    const weeks = await database.select<db.Week[]>("SELECT * FROM weeks");

    // Get all links with member and ticket codes
    const links = await database.select<{
      member_code: string;
      ticket_code: string;
      week_number: number;
      year: number;
      bid_price: number;
      linked_at: string;
      payment_status: string;
      reminder_sent_at: string | null;
    }[]>(
      `SELECT m.code as member_code, t.code as ticket_code,
              l.week_number, l.year, l.bid_price, l.linked_at,
              COALESCE(l.payment_status, 'unpaid') as payment_status, l.reminder_sent_at
       FROM links l
       INNER JOIN members m ON l.member_id = m.id
       INNER JOIN tickets t ON l.ticket_id = t.id`
    );

    return {
      members: members.map(m => ({
        code: m.code,
        first_name: m.first_name,
        last_name: m.last_name,
        phone: m.phone,
        email: m.email,
        notes: m.notes,
        notification_preferences: m.notification_preferences,
        created_at: m.created_at,
        updated_at: m.updated_at
      })),
      tickets: tickets.map(t => ({
        code: t.code,
        name: t.name,
        price: t.price,
        notes: t.notes,
        created_at: t.created_at,
        available_on_holidays: t.available_on_holidays,
        holidays_only: t.holidays_only
      })),
      links: links.map(l => ({
        member_code: l.member_code,
        ticket_code: l.ticket_code,
        week_number: l.week_number,
        year: l.year,
        bid_price: l.bid_price,
        linked_at: l.linked_at,
        payment_status: l.payment_status,
        reminder_sent_at: l.reminder_sent_at
      })),
      weeks: weeks.map(w => ({
        week_number: w.week_number,
        year: w.year,
        parasha_name_he: w.parasha_name_he,
        parasha_name_en: w.parasha_name_en,
        parasha_ref: w.parasha_ref,
        shabbat_date: w.shabbat_date,
        is_current: w.is_current,
        event_type: w.event_type,
        holiday_name_he: w.holiday_name_he,
        holiday_name_en: w.holiday_name_en
      }))
    };
  }, []);

  // Clear all local data (used when switching users)
  const clearLocalData = useCallback(async () => {
    const database = await db.getDb();
    console.log('Clearing local data before import...');

    // Delete in correct order due to foreign keys
    await database.execute("DELETE FROM links");
    await database.execute("DELETE FROM members");
    await database.execute("DELETE FROM tickets");
    // Keep weeks as they're shared/calendar data

    console.log('Local data cleared');
  }, []);

  // Import cloud data to local database
  const importCloudData = useCallback(async (data: SyncData, clearFirst: boolean = false) => {
    const database = await db.getDb();

    // Clear local data if requested (for user switch)
    if (clearFirst) {
      await clearLocalData();
    }

    // Import members - use INSERT OR REPLACE with server ID to keep IDs consistent
    for (const member of data.members || []) {
      // Always use INSERT OR REPLACE to ensure server ID is preserved
      await database.execute(
        `INSERT OR REPLACE INTO members (id, code, first_name, last_name, phone, email, notes, notification_preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          member.id, member.code, member.first_name, member.last_name,
          member.phone, member.email, member.notes,
          member.notification_preferences, member.created_at, member.updated_at
        ]
      );
    }

    // Import tickets - use INSERT OR REPLACE with server ID to keep IDs consistent
    for (const ticket of data.tickets || []) {
      await database.execute(
        `INSERT OR REPLACE INTO tickets (id, code, name, price, notes, created_at, available_on_holidays, holidays_only)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          ticket.id, ticket.code, ticket.name, ticket.price,
          ticket.notes, ticket.created_at,
          ticket.available_on_holidays ?? 1, ticket.holidays_only ?? 0
        ]
      );
    }

    // Import weeks
    for (const week of data.weeks || []) {
      const existing = await db.getWeek(week.week_number, week.year);
      if (!existing) {
        await database.execute(
          `INSERT INTO weeks (week_number, year, parasha_name_he, parasha_name_en, parasha_ref, shabbat_date, is_current, event_type, holiday_name_he, holiday_name_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            week.week_number, week.year,
            week.parasha_name_he, week.parasha_name_en,
            week.parasha_ref, week.shabbat_date,
            week.is_current, week.event_type,
            week.holiday_name_he, week.holiday_name_en
          ]
        );
      }
    }

    // Import links - server returns member_id and ticket_id directly
    // Since we import members/tickets with their original IDs from server,
    // we can use member_id and ticket_id directly
    // Use INSERT OR REPLACE to update existing links (e.g., when bid_price changes)
    const bidPrices = data.links?.map(l => `id:${l.id}=>₪${l.bid_price}|${l.payment_status}`).join(', ');
    console.log('[importCloudData] Links bid_prices|status:', bidPrices);
    for (const link of data.links || []) {
      await database.execute(
        `INSERT OR REPLACE INTO links (id, member_id, ticket_id, week_number, year, bid_price, payment_status, reminder_sent_at, linked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          link.id,
          link.member_id,
          link.ticket_id,
          link.week_number,
          link.year,
          link.bid_price || 0,
          link.payment_status || 'unpaid',
          link.reminder_sent_at,
          link.linked_at
        ]
      );
    }

    console.log(`Imported ${data.links?.length || 0} links from cloud`);
  }, [clearLocalData]);

  // Sync all data from cloud to local
  const syncFromCloud = useCallback(async (clearLocalFirst: boolean = true): Promise<boolean> => {
    const uid = getUserId();
    if (!uid) {
      console.log('User not logged in, skipping cloud sync');
      return false;
    }

    if (isSyncing.current) {
      console.log('Sync already in progress, skipping');
      return false;
    }

    try {
      isSyncing.current = true;
      setSyncStatus('syncing');
      setLastSyncError(null);
      console.log('Starting sync from cloud...');

      const result = await apiDownloadData();

      if (result.success && result.data) {
        console.log('Cloud data received:', {
          members: result.data.members?.length || 0,
          tickets: result.data.tickets?.length || 0,
          links: result.data.links?.length || 0,
          weeks: result.data.weeks?.length || 0,
          lastSyncAt: result.data.lastSyncAt
        });

        // Clear local data and import cloud data
        // This ensures user sees only their data, not leftover from previous user
        await importCloudData(result.data, clearLocalFirst);
        setLastSyncTime(result.data.serverTime);
        console.log('Sync from cloud completed successfully');
      } else {
        // No cloud data or error - clear local data for clean start
        if (clearLocalFirst) {
          console.log('No cloud data found or error, clearing local data for new user');
          await clearLocalData();
        }
        if (result.error) {
          console.error('Sync error:', result.error);
        }
      }

      setSyncStatus('success');
      return true;
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      setLastSyncError(error instanceof Error ? error.message : 'Unknown error');
      return false;
    } finally {
      isSyncing.current = false;
    }
  }, [getUserId, importCloudData, clearLocalData]);

  // Sync all data from local to cloud
  const syncToCloud = useCallback(async (): Promise<boolean> => {
    const uid = getUserId();
    if (!uid) {
      console.log('User not logged in, skipping cloud upload');
      return false;
    }

    if (isSyncing.current) return false;

    try {
      isSyncing.current = true;
      setSyncStatus('syncing');
      setLastSyncError(null);
      console.log('Starting sync to cloud...');

      const localData = await exportLocalData();
      const result = await apiUploadData(localData);

      if (result.success) {
        setLastSyncTime(new Date().toISOString());
        console.log('Sync to cloud completed');
        setSyncStatus('success');
        return true;
      } else {
        console.error('Sync to cloud failed:', result.error);
        setSyncStatus('error');
        setLastSyncError(result.error || 'Unknown error');
        return false;
      }
    } catch (error) {
      console.error('Sync to cloud error:', error);
      setSyncStatus('error');
      setLastSyncError(error instanceof Error ? error.message : 'Unknown error');
      return false;
    } finally {
      isSyncing.current = false;
    }
  }, [getUserId, exportLocalData]);

  // Full sync: download from cloud, then upload local
  const fullSync = useCallback(async (): Promise<boolean> => {
    const downloadSuccess = await syncFromCloud();
    if (downloadSuccess) {
      return await syncToCloud();
    }
    // Even if download found nothing, still upload
    return await syncToCloud();
  }, [syncFromCloud, syncToCloud]);

  // NOTE: Initial sync is now handled by App.tsx to ensure proper ordering
  // The App.tsx calls syncFromCloud() immediately after login and waits for it to complete
  // before rendering the dashboard. This ensures data is available right away.
  // Real-time sync via WebSocket is not implemented yet - using periodic sync instead.

  return {
    syncFromCloud,
    syncToCloud,
    fullSync,
    syncStatus,
    lastSyncError,
    lastSyncTime,
    isLoggedIn: !!getUserId()
  };
}

// Helper to sync to cloud without blocking
async function syncToCloudSafe(operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    // Log but don't throw - cloud sync is optional
    console.log('Cloud sync error (non-blocking):', error instanceof Error ? error.message : 'Unknown error');
  }
}

// Upload current local data to cloud (for use in wrapper functions)
async function uploadCurrentData() {
  if (!apiIsLoggedIn()) {
    console.log('Cloud sync skipped: user not logged in');
    return;
  }
  console.log('[uploadCurrentData] Starting sync to cloud...');

  const database = await db.getDb();

  // Get all members
  const members = await database.select<db.Member[]>("SELECT * FROM members");

  // Get all tickets
  const tickets = await database.select<db.Mitzva[]>("SELECT * FROM tickets");

  // Get all weeks
  const weeks = await database.select<db.Week[]>("SELECT * FROM weeks");

  // Get all links with member and ticket codes
  const links = await database.select<{
    member_code: string;
    ticket_code: string;
    week_number: number;
    year: number;
    bid_price: number;
    linked_at: string;
    payment_status: string;
    reminder_sent_at: string | null;
  }[]>(
    `SELECT m.code as member_code, t.code as ticket_code,
            l.week_number, l.year, l.bid_price, l.linked_at,
            COALESCE(l.payment_status, 'unpaid') as payment_status, l.reminder_sent_at
     FROM links l
     INNER JOIN members m ON l.member_id = m.id
     INNER JOIN tickets t ON l.ticket_id = t.id`
  );

  const linkDetails = links.map(l => `${l.member_code}/${l.ticket_code}=>₪${l.bid_price}|${l.payment_status}`).join(', ');
  console.log(`[uploadCurrentData] Uploading: ${members.length} members, ${tickets.length} tickets, ${links.length} links, ${weeks.length} weeks`);
  console.log(`[uploadCurrentData] Link details being sent: ${linkDetails}`);

  const result = await apiUploadData({
    members: members.map(m => ({
      code: m.code,
      first_name: m.first_name,
      last_name: m.last_name,
      phone: m.phone,
      email: m.email,
      notes: m.notes,
      notification_preferences: m.notification_preferences,
      created_at: m.created_at,
      updated_at: m.updated_at
    })),
    tickets: tickets.map(t => ({
      code: t.code,
      name: t.name,
      price: t.price,
      notes: t.notes,
      created_at: t.created_at,
      available_on_holidays: t.available_on_holidays,
      holidays_only: t.holidays_only
    })),
    links: links.map(l => ({
      member_code: l.member_code,
      ticket_code: l.ticket_code,
      week_number: l.week_number,
      year: l.year,
      bid_price: l.bid_price,
      linked_at: l.linked_at,
      payment_status: l.payment_status,
      reminder_sent_at: l.reminder_sent_at
    })),
    weeks: weeks.map(w => ({
      week_number: w.week_number,
      year: w.year,
      parasha_name_he: w.parasha_name_he,
      parasha_name_en: w.parasha_name_en,
      parasha_ref: w.parasha_ref,
      shabbat_date: w.shabbat_date,
      is_current: w.is_current,
      event_type: w.event_type,
      holiday_name_he: w.holiday_name_he,
      holiday_name_en: w.holiday_name_en
    }))
  });

  if (result.success) {
    console.log('[uploadCurrentData] Sync to cloud completed successfully');
  } else {
    console.error('[uploadCurrentData] Sync to cloud failed:', result.error);
  }
}

// ============================================
// SERVER-FIRST CRUD Operations
// ============================================
// Strategy:
// 1. Send request to server
// 2. If server succeeds, update local cache with server response
// 3. If server fails, throw error (no local-only fallback)

// Helper to convert server member to local format
function serverMemberToLocal(serverMember: ApiMember): db.Member {
  return {
    id: serverMember.id,
    code: serverMember.code,
    first_name: serverMember.first_name,
    last_name: serverMember.last_name,
    phone: serverMember.phone,
    email: serverMember.email,
    notes: serverMember.notes,
    notification_preferences: serverMember.notification_preferences,
    created_at: serverMember.created_at,
    updated_at: serverMember.updated_at,
  };
}

// Helper to convert server ticket to local format
function serverTicketToLocal(serverTicket: ApiTicket): db.Mitzva {
  return {
    id: serverTicket.id,
    code: serverTicket.code,
    name: serverTicket.name,
    price: serverTicket.price,
    notes: serverTicket.notes,
    available_on_holidays: serverTicket.available_on_holidays,
    holidays_only: serverTicket.holidays_only,
    created_at: serverTicket.created_at,
  };
}

// Member CRUD - Server First
export async function createMemberSync(
  firstName: string,
  lastName: string,
  phone?: string,
  email?: string,
  notes?: string,
  notificationPreferences?: string,
  manualCode?: string
): Promise<db.Member> {
  if (!apiIsLoggedIn()) {
    throw new Error('לא מחובר - יש להתחבר כדי להוסיף מתפללים');
  }

  // 1. Create on server first
  const result = await apiCreateMember({
    first_name: firstName,
    last_name: lastName,
    phone: phone || undefined,
    email: email || undefined,
    notes: notes || undefined,
    notification_preferences: notificationPreferences || undefined,
    code: manualCode || undefined,
  });

  if (!result.success || !result.member) {
    throw new Error(result.error || 'שגיאה ביצירת מתפלל');
  }

  // 2. Server succeeded - now update local cache
  const localMember = serverMemberToLocal(result.member);
  const database = await db.getDb();

  // Insert or replace in local DB
  await database.execute(
    `INSERT OR REPLACE INTO members (id, code, first_name, last_name, phone, email, notes, notification_preferences, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      localMember.id, localMember.code, localMember.first_name, localMember.last_name,
      localMember.phone, localMember.email, localMember.notes, localMember.notification_preferences,
      localMember.created_at, localMember.updated_at
    ]
  );

  return localMember;
}

export async function updateMemberSync(
  id: number,
  firstName: string,
  lastName: string,
  phone?: string,
  email?: string,
  notes?: string,
  notificationPreferences?: string
): Promise<db.Member> {
  if (!apiIsLoggedIn()) {
    throw new Error('לא מחובר - יש להתחבר כדי לעדכן מתפללים');
  }

  // 1. Update on server first
  const result = await apiUpdateMember(id, {
    first_name: firstName,
    last_name: lastName,
    phone: phone || undefined,
    email: email || undefined,
    notes: notes || undefined,
    notification_preferences: notificationPreferences || undefined,
  });

  if (!result.success || !result.member) {
    throw new Error(result.error || 'שגיאה בעדכון מתפלל');
  }

  // 2. Server succeeded - now update local cache
  const localMember = serverMemberToLocal(result.member);
  const database = await db.getDb();

  await database.execute(
    `UPDATE members SET first_name = $1, last_name = $2, phone = $3, email = $4,
     notes = $5, notification_preferences = $6, updated_at = $7 WHERE id = $8`,
    [
      localMember.first_name, localMember.last_name, localMember.phone, localMember.email,
      localMember.notes, localMember.notification_preferences, localMember.updated_at, localMember.id
    ]
  );

  return localMember;
}

export async function deleteMemberSync(id: number): Promise<void> {
  if (!apiIsLoggedIn()) {
    throw new Error('לא מחובר - יש להתחבר כדי למחוק מתפללים');
  }

  // 1. Delete on server first
  const result = await apiDeleteMember(id);

  if (!result.success) {
    throw new Error(result.error || 'שגיאה במחיקת מתפלל');
  }

  // 2. Server succeeded - now delete from local cache
  const database = await db.getDb();
  await database.execute("DELETE FROM links WHERE member_id = $1", [id]);
  await database.execute("DELETE FROM members WHERE id = $1", [id]);
}

// Mitzva/Ticket CRUD - Server First
export async function createMitzvaSync(
  name: string,
  price: number = 0,
  notes?: string,
  availableOnHolidays: boolean = true,
  holidaysOnly: boolean = false,
  manualCode?: string
): Promise<db.Mitzva> {
  if (!apiIsLoggedIn()) {
    throw new Error('לא מחובר - יש להתחבר כדי להוסיף מצוות');
  }

  // 1. Create on server first
  const result = await apiCreateTicket({
    name,
    price,
    notes: notes || undefined,
    available_on_holidays: availableOnHolidays,
    holidays_only: holidaysOnly,
    code: manualCode || undefined,
  });

  if (!result.success || !result.ticket) {
    throw new Error(result.error || 'שגיאה ביצירת מצווה');
  }

  // 2. Server succeeded - now update local cache
  const localMitzva = serverTicketToLocal(result.ticket);
  const database = await db.getDb();

  await database.execute(
    `INSERT OR REPLACE INTO tickets (id, code, name, price, notes, available_on_holidays, holidays_only, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      localMitzva.id, localMitzva.code, localMitzva.name, localMitzva.price,
      localMitzva.notes, localMitzva.available_on_holidays, localMitzva.holidays_only, localMitzva.created_at
    ]
  );

  return localMitzva;
}

export async function updateMitzvaSync(
  id: number,
  name: string,
  price: number = 0,
  notes?: string,
  availableOnHolidays: boolean = true,
  holidaysOnly: boolean = false
): Promise<db.Mitzva> {
  if (!apiIsLoggedIn()) {
    throw new Error('לא מחובר - יש להתחבר כדי לעדכן מצוות');
  }

  // 1. Update on server first
  const result = await apiUpdateTicket(id, {
    name,
    price,
    notes: notes || undefined,
    available_on_holidays: availableOnHolidays,
    holidays_only: holidaysOnly,
  });

  if (!result.success || !result.ticket) {
    throw new Error(result.error || 'שגיאה בעדכון מצווה');
  }

  // 2. Server succeeded - now update local cache
  const localMitzva = serverTicketToLocal(result.ticket);
  const database = await db.getDb();

  await database.execute(
    `UPDATE tickets SET name = $1, price = $2, notes = $3,
     available_on_holidays = $4, holidays_only = $5 WHERE id = $6`,
    [localMitzva.name, localMitzva.price, localMitzva.notes,
     localMitzva.available_on_holidays, localMitzva.holidays_only, localMitzva.id]
  );

  return localMitzva;
}

export async function deleteMitzvaSync(id: number): Promise<void> {
  if (!apiIsLoggedIn()) {
    throw new Error('לא מחובר - יש להתחבר כדי למחוק מצוות');
  }

  // 1. Delete on server first
  const result = await apiDeleteTicket(id);

  if (!result.success) {
    throw new Error(result.error || 'שגיאה במחיקת מצווה');
  }

  // 2. Server succeeded - now delete from local cache
  const database = await db.getDb();
  await database.execute("DELETE FROM links WHERE ticket_id = $1", [id]);
  await database.execute("DELETE FROM tickets WHERE id = $1", [id]);
}

// Link functions - Local First with background sync
// Save locally first, then sync to server in background
export async function linkTicketToMemberSync(
  memberId: number,
  ticketId: number,
  weekNumber: number,
  year: number,
  bidPrice?: number
): Promise<number> {
  // 1. Save locally first (always works)
  const linkId = await db.linkTicketToMember(memberId, ticketId, weekNumber, year, bidPrice);

  // 2. Sync to server in background (non-blocking)
  if (apiIsLoggedIn()) {
    syncToCloudSafe(uploadCurrentData);
  }

  return linkId;
}

export async function unlinkTicketSync(linkId: number): Promise<void> {
  // 1. Delete locally first
  await db.unlinkTicket(linkId);

  // 2. Sync to server in background (non-blocking)
  if (apiIsLoggedIn()) {
    syncToCloudSafe(uploadCurrentData);
  }
}

export async function updateLinkBidPriceSync(linkId: number, bidPrice: number): Promise<void> {
  console.log(`[updateLinkBidPriceSync] Updating link ${linkId} with price ${bidPrice}`);

  // Update locally first
  await db.updateLinkBidPrice(linkId, bidPrice);
  console.log(`[updateLinkBidPriceSync] Local DB updated`);

  // Sync to cloud (blocking to ensure data is uploaded before any refresh)
  if (apiIsLoggedIn()) {
    try {
      await uploadCurrentData();
      console.log(`[updateLinkBidPriceSync] Cloud sync completed`);
    } catch (error) {
      console.error('[updateLinkBidPriceSync] Cloud sync failed:', error);
    }
  }
}

export async function updateLinkPaymentStatusSync(linkId: number, status: db.PaymentStatus): Promise<void> {
  console.log(`[updateLinkPaymentStatusSync] Updating link ${linkId} with status ${status}`);

  // Update locally first
  await db.updateLinkPaymentStatus(linkId, status);
  console.log(`[updateLinkPaymentStatusSync] Local DB updated`);

  // Sync to cloud (blocking to ensure data is uploaded before any refresh)
  if (apiIsLoggedIn()) {
    try {
      await uploadCurrentData();
      console.log(`[updateLinkPaymentStatusSync] Cloud sync completed`);
    } catch (error) {
      console.error('[updateLinkPaymentStatusSync] Cloud sync failed:', error);
    }
  }
}

export async function updateLinkMemberSync(linkId: number, newMemberId: number): Promise<void> {
  // For now, update locally only - TODO: Implement server-side link update
  await db.updateLinkMember(linkId, newMemberId);

  // Background sync (non-blocking)
  syncToCloudSafe(uploadCurrentData);
}

export async function updateMemberPaymentStatusSync(
  memberId: number,
  weekNumber: number,
  year: number,
  status: db.PaymentStatus
): Promise<void> {
  console.log(`[updateMemberPaymentStatusSync] Updating member ${memberId} links for week ${weekNumber}/${year} with status ${status}`);

  // Update locally first
  await db.updateMemberPaymentStatus(memberId, weekNumber, year, status);
  console.log(`[updateMemberPaymentStatusSync] Local DB updated`);

  // Sync to cloud (blocking to ensure data is uploaded before any refresh)
  if (apiIsLoggedIn()) {
    try {
      await uploadCurrentData();
      console.log(`[updateMemberPaymentStatusSync] Cloud sync completed`);
    } catch (error) {
      console.error('[updateMemberPaymentStatusSync] Cloud sync failed:', error);
    }
  }
}

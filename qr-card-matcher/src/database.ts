import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

// Helper function to get ISO week number
export function getHebrewWeekNumber(date: Date = new Date()): number {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const jan1 = new Date(target.getFullYear(), 0, 1);
  const diff = target.getTime() - jan1.getTime();
  return Math.ceil((diff / 86400000 + 1) / 7);
}

// Get next Shabbat date
export function getNextShabbat(date: Date = new Date()): Date {
  const shabbat = new Date(date);
  const dayOfWeek = shabbat.getDay();
  const daysUntilShabbat = dayOfWeek === 6 ? 0 : (6 - dayOfWeek);
  shabbat.setDate(shabbat.getDate() + daysUntilShabbat);
  shabbat.setHours(0, 0, 0, 0);
  return shabbat;
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  db = await Database.load("sqlite:qrcards.db");

  // Drop old tables if they exist (migration from envelopes to members)
  // Check if old 'envelopes' table exists
  const oldTables = await db.select<{name: string}[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='envelopes'"
  );

  if (oldTables.length > 0) {
    // Old schema exists, drop all tables and recreate
    await db.execute("DROP TABLE IF EXISTS links");
    await db.execute("DROP TABLE IF EXISTS envelopes");
    await db.execute("DROP TABLE IF EXISTS tickets");
  }

  // Create tables - מתפללים (members)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      notes TEXT,
      notification_preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add notification_preferences column if it doesn't exist (migration for existing databases)
  // Note: PRAGMA table_info returns objects with cid, name, type, notnull, dflt_value, pk
  const membersColumns = await db.select<{ cid: number; name: string; type: string }[]>(
    "PRAGMA table_info(members)"
  );
  const hasNotificationPrefs = membersColumns.some((col) => col.name === 'notification_preferences');
  if (!hasNotificationPrefs) {
    await db.execute("ALTER TABLE members ADD COLUMN notification_preferences TEXT");
  }

  // Check if tickets table has old schema (no name/price columns) - migrate to mitzvot
  const ticketsInfo = await db.select<{name: string}[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tickets'"
  );

  if (ticketsInfo.length > 0) {
    const ticketColumns = await db.select<{name: string}[]>(
      "PRAGMA table_info(tickets)"
    );
    const hasNameColumn = ticketColumns.some((col: {name: string}) => col.name === 'name');
    if (!hasNameColumn) {
      // Old schema - drop and recreate
      await db.execute("DROP TABLE IF EXISTS links");
      await db.execute("DROP TABLE IF EXISTS tickets");
    }
  }

  // מצוות (Mitzvot)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      price REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      available_on_holidays INTEGER DEFAULT 1,
      holidays_only INTEGER DEFAULT 0
    )
  `);

  // Add holiday columns if they don't exist (migration for existing databases)
  try {
    await db.execute(`ALTER TABLE tickets ADD COLUMN available_on_holidays INTEGER DEFAULT 1`);
  } catch (e) {
    // Column already exists
  }
  try {
    await db.execute(`ALTER TABLE tickets ADD COLUMN holidays_only INTEGER DEFAULT 0`);
  } catch (e) {
    // Column already exists
  }

  // Check if links table has old schema (envelope_id instead of member_id)
  const linksInfo = await db.select<{name: string}[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='links'"
  );

  if (linksInfo.length > 0) {
    // Check if it has the old envelope_id column
    const columns = await db.select<{name: string}[]>(
      "PRAGMA table_info(links)"
    );
    const hasEnvelopeId = columns.some((col: {name: string}) => col.name === 'envelope_id');
    if (hasEnvelopeId) {
      await db.execute("DROP TABLE links");
    }
  }

  // שבועות עם פרשת השבוע
  await db.execute(`
    CREATE TABLE IF NOT EXISTS weeks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      parasha_name_he TEXT,
      parasha_name_en TEXT,
      parasha_ref TEXT,
      shabbat_date TEXT,
      is_current INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(week_number, year)
    )
  `);

  // Settings table for app configuration
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // First, clean up any leftover links_new table from failed migrations
  await db.execute("DROP TABLE IF EXISTS links_new");

  // Check if links table needs migration to new constraint (per-week uniqueness)
  const linksExists = await db.select<{name: string}[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='links'"
  );

  if (linksExists.length > 0) {
    // Check if week_number column exists
    const columns = await db.select<{name: string}[]>(
      "PRAGMA table_info(links)"
    );
    const hasWeekNumber = columns.some((col: {name: string}) => col.name === 'week_number');

    if (!hasWeekNumber) {
      // Old schema without week_number - need full migration
      await db.execute(`
        CREATE TABLE links_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          member_id INTEGER NOT NULL,
          ticket_id INTEGER NOT NULL,
          linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          week_number INTEGER NOT NULL,
          year INTEGER NOT NULL,
          FOREIGN KEY (member_id) REFERENCES members(id),
          FOREIGN KEY (ticket_id) REFERENCES tickets(id),
          UNIQUE(member_id, ticket_id, week_number, year)
        )
      `);

      // Migrate existing data - use current week/year for old records
      const currentWeek = getHebrewWeekNumber();
      const currentYear = new Date().getFullYear();
      await db.execute(
        `INSERT OR IGNORE INTO links_new (id, member_id, ticket_id, linked_at, week_number, year)
         SELECT id, member_id, ticket_id, linked_at, $1, $2
         FROM links`,
        [currentWeek, currentYear]
      );

      await db.execute("DROP TABLE links");
      await db.execute("ALTER TABLE links_new RENAME TO links");
    }
  } else {
    // Create fresh links table with new schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        member_id INTEGER NOT NULL,
        ticket_id INTEGER NOT NULL,
        linked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        week_number INTEGER NOT NULL,
        year INTEGER NOT NULL,
        bid_price REAL DEFAULT 0,
        FOREIGN KEY (member_id) REFERENCES members(id),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id),
        UNIQUE(member_id, ticket_id, week_number, year)
      )
    `);
  }

  // Migration: Add bid_price column to links table if it doesn't exist
  const linkColumns = await db.select<{ name: string }[]>("PRAGMA table_info(links)");
  const hasBidPrice = linkColumns.some((col) => col.name === "bid_price");
  if (!hasBidPrice) {
    await db.execute("ALTER TABLE links ADD COLUMN bid_price REAL DEFAULT 0");
  }

  // Migration: Add payment_status column to links table if it doesn't exist
  const hasPaymentStatus = linkColumns.some((col) => col.name === "payment_status");
  if (!hasPaymentStatus) {
    await db.execute("ALTER TABLE links ADD COLUMN payment_status TEXT DEFAULT 'unpaid'");
  }

  // Migration: Add reminder_sent_at column to links table if it doesn't exist
  const hasReminderSentAt = linkColumns.some((col) => col.name === "reminder_sent_at");
  if (!hasReminderSentAt) {
    await db.execute("ALTER TABLE links ADD COLUMN reminder_sent_at DATETIME");
  }

  // Migration: Add holiday-related columns to weeks table
  const weekColumns = await db.select<{ name: string }[]>("PRAGMA table_info(weeks)");
  const hasEventType = weekColumns.some((col) => col.name === "event_type");
  if (!hasEventType) {
    await db.execute("ALTER TABLE weeks ADD COLUMN event_type TEXT DEFAULT 'shabbat'");
    await db.execute("ALTER TABLE weeks ADD COLUMN holiday_name_he TEXT");
    await db.execute("ALTER TABLE weeks ADD COLUMN holiday_name_en TEXT");
  }

  return db;
}

export async function getDb(): Promise<Database> {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// Member (מתפלל) functions
export interface Member {
  id: number;
  code: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  notification_preferences: string | null; // comma-separated: "email,whatsapp,sms"
  created_at: string;
  updated_at: string;
}

function generateMemberCode(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MBR-${timestamp}-${random}`;
}

export async function createMember(
  firstName: string,
  lastName: string,
  phone?: string,
  email?: string,
  notes?: string,
  notificationPreferences?: string
): Promise<Member> {
  const database = await getDb();
  const code = generateMemberCode();

  await database.execute(
    `INSERT INTO members (code, first_name, last_name, phone, email, notes, notification_preferences)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [code, firstName, lastName, phone || null, email || null, notes || null, notificationPreferences || null]
  );

  const [member] = await database.select<Member[]>(
    "SELECT * FROM members WHERE code = $1",
    [code]
  );

  return member;
}

export async function updateMember(
  id: number,
  firstName: string,
  lastName: string,
  phone?: string,
  email?: string,
  notes?: string,
  notificationPreferences?: string
): Promise<Member | null> {
  const database = await getDb();

  await database.execute(
    `UPDATE members
     SET first_name = $1, last_name = $2, phone = $3, email = $4, notes = $5, notification_preferences = $6, updated_at = CURRENT_TIMESTAMP
     WHERE id = $7`,
    [firstName, lastName, phone || null, email || null, notes || null, notificationPreferences || null, id]
  );

  const [member] = await database.select<Member[]>(
    "SELECT * FROM members WHERE id = $1",
    [id]
  );

  return member || null;
}

export async function getAllMembers(): Promise<Member[]> {
  const database = await getDb();
  return database.select<Member[]>("SELECT * FROM members ORDER BY last_name, first_name");
}

// Get all members with purchase count in a single efficient query
export interface MemberWithStats extends Member {
  purchase_count: number;
}

export async function getAllMembersWithStats(): Promise<MemberWithStats[]> {
  const database = await getDb();
  return database.select<MemberWithStats[]>(`
    SELECT m.*, COALESCE(COUNT(l.id), 0) as purchase_count
    FROM members m
    LEFT JOIN links l ON m.id = l.member_id
    GROUP BY m.id
    ORDER BY m.last_name, m.first_name
  `);
}

export async function getMemberByCode(code: string): Promise<Member | null> {
  const database = await getDb();
  const results = await database.select<Member[]>(
    "SELECT * FROM members WHERE code = $1",
    [code]
  );
  return results[0] || null;
}

export async function getMemberById(id: number): Promise<Member | null> {
  const database = await getDb();
  const results = await database.select<Member[]>(
    "SELECT * FROM members WHERE id = $1",
    [id]
  );
  return results[0] || null;
}

export async function deleteMember(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM links WHERE member_id = $1", [id]);
  await database.execute("DELETE FROM members WHERE id = $1", [id]);
}

export async function searchMembers(query: string): Promise<Member[]> {
  const database = await getDb();
  const searchPattern = `%${query}%`;
  return database.select<Member[]>(
    `SELECT * FROM members
     WHERE first_name LIKE $1 OR last_name LIKE $1 OR phone LIKE $1 OR code LIKE $1
     ORDER BY last_name, first_name`,
    [searchPattern]
  );
}

// Search members with stats in a single efficient query
export async function searchMembersWithStats(query: string): Promise<MemberWithStats[]> {
  const database = await getDb();
  const searchPattern = `%${query}%`;
  return database.select<MemberWithStats[]>(
    `SELECT m.*, COALESCE(COUNT(l.id), 0) as purchase_count
     FROM members m
     LEFT JOIN links l ON m.id = l.member_id
     WHERE m.first_name LIKE $1 OR m.last_name LIKE $1 OR m.phone LIKE $1 OR m.code LIKE $1
     GROUP BY m.id
     ORDER BY m.last_name, m.first_name`,
    [searchPattern]
  );
}

// Mitzva (מצווה) functions - stored in tickets table
export interface Mitzva {
  id: number;
  code: string;
  name: string;
  price: number;
  created_at: string;
  notes: string | null;
  available_on_holidays: number; // 1 = available on holidays, 0 = not available
  holidays_only: number; // 1 = only for holidays, 0 = available all year
}

// Alias for backward compatibility
export type Ticket = Mitzva;

function generateMitzvaCode(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `MTZ-${timestamp}-${random}`;
}

export async function createMitzva(
  name: string,
  price: number = 0,
  notes?: string,
  availableOnHolidays: boolean = true,
  holidaysOnly: boolean = false
): Promise<Mitzva> {
  const database = await getDb();
  const code = generateMitzvaCode();

  await database.execute(
    "INSERT INTO tickets (code, name, price, notes, available_on_holidays, holidays_only) VALUES ($1, $2, $3, $4, $5, $6)",
    [code, name, price, notes || null, availableOnHolidays ? 1 : 0, holidaysOnly ? 1 : 0]
  );

  const [mitzva] = await database.select<Mitzva[]>(
    "SELECT * FROM tickets WHERE code = $1",
    [code]
  );

  return mitzva;
}

export async function updateMitzva(
  id: number,
  name: string,
  price: number = 0,
  notes?: string,
  availableOnHolidays: boolean = true,
  holidaysOnly: boolean = false
): Promise<Mitzva | null> {
  const database = await getDb();

  await database.execute(
    "UPDATE tickets SET name = $1, price = $2, notes = $3, available_on_holidays = $4, holidays_only = $5 WHERE id = $6",
    [name, price, notes || null, availableOnHolidays ? 1 : 0, holidaysOnly ? 1 : 0, id]
  );

  const [mitzva] = await database.select<Mitzva[]>(
    "SELECT * FROM tickets WHERE id = $1",
    [id]
  );

  return mitzva || null;
}

export async function getAllMitzvot(): Promise<Mitzva[]> {
  const database = await getDb();
  return database.select<Mitzva[]>("SELECT * FROM tickets ORDER BY name");
}

// Alias for backward compatibility
export const getAllTickets = getAllMitzvot;

// Get next available simple code for mitzvot (1, 2, 3...)
export async function getNextAvailableMitzvaCode(): Promise<string> {
  const database = await getDb();
  // Get all existing numeric codes
  const results = await database.select<{code: string}[]>(
    "SELECT code FROM tickets WHERE code GLOB '[0-9]*' ORDER BY CAST(code AS INTEGER)"
  );

  // Find the first available number starting from 1
  const usedNumbers = new Set(
    results
      .map(r => parseInt(r.code, 10))
      .filter(n => !isNaN(n) && n > 0)
  );

  let nextCode = 1;
  while (usedNumbers.has(nextCode)) {
    nextCode++;
  }

  return String(nextCode);
}

// Get next available simple code for members (1, 2, 3...)
export async function getNextAvailableMemberCode(): Promise<string> {
  const database = await getDb();
  // Get all existing numeric codes
  const results = await database.select<{code: string}[]>(
    "SELECT code FROM members WHERE code GLOB '[0-9]*' ORDER BY CAST(code AS INTEGER)"
  );

  // Find the first available number starting from 1
  const usedNumbers = new Set(
    results
      .map(r => parseInt(r.code, 10))
      .filter(n => !isNaN(n) && n > 0)
  );

  let nextCode = 1;
  while (usedNumbers.has(nextCode)) {
    nextCode++;
  }

  return String(nextCode);
}

export async function getMitzvaByCode(code: string): Promise<Mitzva | null> {
  const database = await getDb();
  const results = await database.select<Mitzva[]>(
    "SELECT * FROM tickets WHERE code = $1",
    [code]
  );
  return results[0] || null;
}

// Alias for backward compatibility
export const getTicketByCode = getMitzvaByCode;

export async function deleteMitzva(id: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM links WHERE ticket_id = $1", [id]);
  await database.execute("DELETE FROM tickets WHERE id = $1", [id]);
}

// Alias for backward compatibility
export const deleteTicket = deleteMitzva;

// Payment status type
export type PaymentStatus = 'unpaid' | 'paid';

// Link functions
export interface Link {
  id: number;
  member_id: number;
  ticket_id: number;
  linked_at: string;
  week_number: number | null;
  year: number | null;
  bid_price: number;
  payment_status: PaymentStatus;
  reminder_sent_at: string | null;
}

export interface LinkWithDetails extends Link {
  member_code: string;
  member_name: string;
  ticket_code: string;
}

export async function linkTicketToMember(
  memberId: number,
  ticketId: number,
  weekNumber?: number,
  year?: number,
  bidPrice?: number
): Promise<number> {
  const database = await getDb();
  const currentYear = year || new Date().getFullYear();
  const result = await database.execute(
    "INSERT INTO links (member_id, ticket_id, week_number, year, bid_price) VALUES ($1, $2, $3, $4, $5)",
    [memberId, ticketId, weekNumber || null, currentYear, bidPrice || 0]
  );
  return result.lastInsertId ?? 0;
}

export async function linkTicketToMemberByCode(
  memberCode: string,
  ticketCode: string,
  weekNumber?: number
): Promise<number | null> {
  const member = await getMemberByCode(memberCode);
  const ticket = await getTicketByCode(ticketCode);

  if (!member || !ticket) {
    return null;
  }

  return linkTicketToMember(member.id, ticket.id, weekNumber);
}

export async function getTicketsForMember(memberId: number): Promise<Ticket[]> {
  const database = await getDb();
  return database.select<Ticket[]>(
    `SELECT t.* FROM tickets t
     INNER JOIN links l ON t.id = l.ticket_id
     WHERE l.member_id = $1
     ORDER BY l.linked_at DESC`,
    [memberId]
  );
}

export async function getMemberForTicket(ticketId: number): Promise<Member | null> {
  const database = await getDb();
  const results = await database.select<Member[]>(
    `SELECT m.* FROM members m
     INNER JOIN links l ON m.id = l.member_id
     WHERE l.ticket_id = $1`,
    [ticketId]
  );
  return results[0] || null;
}

export async function getAllLinks(): Promise<LinkWithDetails[]> {
  const database = await getDb();
  return database.select<LinkWithDetails[]>(
    `SELECT l.*, m.code as member_code, (m.first_name || ' ' || m.last_name) as member_name, t.code as ticket_code
     FROM links l
     INNER JOIN members m ON l.member_id = m.id
     INNER JOIN tickets t ON l.ticket_id = t.id
     ORDER BY l.linked_at DESC`
  );
}

export async function unlinkTicket(linkId: number): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM links WHERE id = $1", [linkId]);
}

// Update a link's bid price
export async function updateLinkBidPrice(linkId: number, bidPrice: number): Promise<void> {
  const database = await getDb();
  await database.execute("UPDATE links SET bid_price = $1 WHERE id = $2", [bidPrice, linkId]);
}

// Update a link's member (change who purchased)
export async function updateLinkMember(linkId: number, newMemberId: number): Promise<void> {
  const database = await getDb();
  await database.execute("UPDATE links SET member_id = $1 WHERE id = $2", [newMemberId, linkId]);
}

// Update a link's payment status
export async function updateLinkPaymentStatus(linkId: number, status: PaymentStatus): Promise<void> {
  const database = await getDb();
  await database.execute("UPDATE links SET payment_status = $1 WHERE id = $2", [status, linkId]);
}

// Update reminder sent timestamp
export async function updateLinkReminderSent(linkId: number): Promise<void> {
  const database = await getDb();
  await database.execute("UPDATE links SET reminder_sent_at = CURRENT_TIMESTAMP WHERE id = $1", [linkId]);
}

// Get link by ID
export async function getLinkById(linkId: number): Promise<Link | null> {
  const database = await getDb();
  const results = await database.select<Link[]>(
    "SELECT * FROM links WHERE id = $1",
    [linkId]
  );
  return results[0] || null;
}

export async function isTicketLinked(ticketId: number): Promise<boolean> {
  const database = await getDb();
  const results = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM links WHERE ticket_id = $1",
    [ticketId]
  );
  return results[0].count > 0;
}

// Statistics
export interface Stats {
  totalMembers: number;
  totalMitzvot: number;
  totalLinks: number;
  unlinkedMitzvot: number;
  // Aliases for backward compatibility
  totalTickets: number;
  unlinkedTickets: number;
}

export async function getStats(): Promise<Stats> {
  const database = await getDb();

  const [memberCount] = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM members"
  );
  const [mitzvaCount] = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM tickets"
  );
  const [linkCount] = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM links"
  );
  const [unlinkedCount] = await database.select<{count: number}[]>(
    `SELECT COUNT(*) as count FROM tickets t
     WHERE NOT EXISTS (SELECT 1 FROM links l WHERE l.ticket_id = t.id)`
  );

  return {
    totalMembers: memberCount.count,
    totalMitzvot: mitzvaCount.count,
    totalLinks: linkCount.count,
    unlinkedMitzvot: unlinkedCount.count,
    // Aliases
    totalTickets: mitzvaCount.count,
    unlinkedTickets: unlinkedCount.count,
  };
}

// Week (שבוע) interface and functions
export interface Week {
  id: number;
  week_number: number;
  year: number;
  parasha_name_he: string | null;
  parasha_name_en: string | null;
  parasha_ref: string | null;
  shabbat_date: string | null;
  is_current: number;
  created_at: string;
  // New fields for holidays
  event_type: "shabbat" | "holiday" | null; // shabbat = פרשת שבוע, holiday = חג
  holiday_name_he: string | null;
  holiday_name_en: string | null;
}

// Fetch parasha and holiday info from Sefaria API
export interface SefariaEventInfo {
  parasha?: {
    nameHe: string;
    nameEn: string;
    ref: string;
  };
  holiday?: {
    nameHe: string;
    nameEn: string;
  };
}

export async function fetchEventInfoFromSefaria(date?: Date): Promise<SefariaEventInfo | null> {
  try {
    const targetDate = date || getNextShabbat();
    const dateStr = targetDate.toISOString().split('T')[0];

    const response = await fetch(`https://www.sefaria.org/api/calendars?date=${dateStr}`);
    if (!response.ok) return null;

    const data = await response.json();
    const result: SefariaEventInfo = {};

    // Get parasha
    const parasha = data.calendar_items?.find(
      (item: { title: { en: string } }) => item.title.en === "Parashat Hashavua"
    );
    if (parasha) {
      result.parasha = {
        nameHe: parasha.displayValue.he,
        nameEn: parasha.displayValue.en,
        ref: parasha.ref
      };
    }

    // Check for holidays (Yom Tov, Chag)
    const holidayItem = data.calendar_items?.find(
      (item: { title: { en: string } }) =>
        item.title.en === "Holiday" ||
        item.title.en.includes("Yom Tov") ||
        item.title.en.includes("Chag")
    );
    if (holidayItem) {
      result.holiday = {
        nameHe: holidayItem.displayValue.he,
        nameEn: holidayItem.displayValue.en
      };
    }

    return result;
  } catch (error) {
    console.error("Error fetching event info:", error);
    return null;
  }
}

// Legacy function for backward compatibility
export async function fetchParashaFromSefaria(date?: Date): Promise<{
  nameHe: string;
  nameEn: string;
  ref: string;
} | null> {
  const eventInfo = await fetchEventInfoFromSefaria(date);
  return eventInfo?.parasha || null;
}

// Create or update week
export async function createOrUpdateWeek(
  weekNumber: number,
  year: number,
  parashaHe?: string,
  parashaEn?: string,
  parashaRef?: string,
  shabbatDate?: string
): Promise<Week> {
  const database = await getDb();

  // Try to get existing week
  const existing = await database.select<Week[]>(
    "SELECT * FROM weeks WHERE week_number = $1 AND year = $2",
    [weekNumber, year]
  );

  if (existing.length > 0) {
    // Update if parasha info provided
    if (parashaHe || parashaEn || parashaRef || shabbatDate) {
      await database.execute(
        `UPDATE weeks SET
          parasha_name_he = COALESCE($1, parasha_name_he),
          parasha_name_en = COALESCE($2, parasha_name_en),
          parasha_ref = COALESCE($3, parasha_ref),
          shabbat_date = COALESCE($4, shabbat_date)
         WHERE week_number = $5 AND year = $6`,
        [parashaHe || null, parashaEn || null, parashaRef || null, shabbatDate || null, weekNumber, year]
      );
    }
    const [updated] = await database.select<Week[]>(
      "SELECT * FROM weeks WHERE week_number = $1 AND year = $2",
      [weekNumber, year]
    );
    return updated;
  }

  // Insert new week
  await database.execute(
    `INSERT INTO weeks (week_number, year, parasha_name_he, parasha_name_en, parasha_ref, shabbat_date)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [weekNumber, year, parashaHe || null, parashaEn || null, parashaRef || null, shabbatDate || null]
  );

  const [week] = await database.select<Week[]>(
    "SELECT * FROM weeks WHERE week_number = $1 AND year = $2",
    [weekNumber, year]
  );

  return week;
}

// Get all weeks for a year
export async function getWeeksByYear(year: number): Promise<Week[]> {
  const database = await getDb();
  return database.select<Week[]>(
    "SELECT * FROM weeks WHERE year = $1 ORDER BY week_number DESC",
    [year]
  );
}

// Get all weeks/events that have purchases (for archive)
export async function getWeeksWithPurchases(): Promise<Week[]> {
  const database = await getDb();
  return database.select<Week[]>(
    `SELECT DISTINCT w.*
     FROM weeks w
     INNER JOIN links l ON w.week_number = l.week_number AND w.year = l.year
     ORDER BY w.year DESC, w.week_number DESC`
  );
}

// Get display name for a week (parasha or holiday name)
export function getWeekDisplayName(week: Week): string {
  if (week.holiday_name_he) {
    return week.holiday_name_he;
  }
  if (week.parasha_name_he) {
    return `פרשת ${week.parasha_name_he}`;
  }
  return `שבוע ${week.week_number}`;
}

// Get current week
export async function getCurrentWeek(): Promise<Week | null> {
  const database = await getDb();
  const [week] = await database.select<Week[]>(
    "SELECT * FROM weeks WHERE is_current = 1 LIMIT 1"
  );
  return week || null;
}

// Set current week
export async function setCurrentWeek(weekNumber: number, year: number): Promise<void> {
  const database = await getDb();
  await database.execute("UPDATE weeks SET is_current = 0");
  await database.execute(
    "UPDATE weeks SET is_current = 1 WHERE week_number = $1 AND year = $2",
    [weekNumber, year]
  );
}

// Ensure current week exists (auto-create on app load)
// Week is defined by the upcoming Shabbat (from Shabbat to Friday)
export async function ensureCurrentWeekExists(): Promise<Week> {
  const now = new Date();
  const shabbat = getNextShabbat(now);
  // Use the Shabbat date to determine week number (so the week stays consistent from Shabbat to Friday)
  const weekNumber = getHebrewWeekNumber(shabbat);
  const year = shabbat.getFullYear();
  const shabbatDateStr = shabbat.toISOString().split('T')[0];

  // Check if week exists
  const database = await getDb();
  const existing = await database.select<Week[]>(
    "SELECT * FROM weeks WHERE week_number = $1 AND year = $2",
    [weekNumber, year]
  );

  let week: Week;

  if (existing.length > 0 && existing[0].parasha_name_he) {
    // Week exists with parasha, just set as current
    week = existing[0];
  } else {
    // Try to fetch parasha info
    const parasha = await fetchParashaFromSefaria(shabbat);

    week = await createOrUpdateWeek(
      weekNumber,
      year,
      parasha?.nameHe,
      parasha?.nameEn,
      parasha?.ref,
      shabbatDateStr
    );
  }

  // Set as current
  await setCurrentWeek(weekNumber, year);

  return week;
}

// Get week by week_number and year
export async function getWeek(weekNumber: number, year: number): Promise<Week | null> {
  const database = await getDb();
  const [week] = await database.select<Week[]>(
    "SELECT * FROM weeks WHERE week_number = $1 AND year = $2",
    [weekNumber, year]
  );
  return week || null;
}

// Check if ticket is linked for specific week
export async function isTicketLinkedForWeek(
  ticketId: number,
  weekNumber: number,
  year: number
): Promise<boolean> {
  const database = await getDb();
  const results = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM links WHERE ticket_id = $1 AND week_number = $2 AND year = $3",
    [ticketId, weekNumber, year]
  );
  return results[0].count > 0;
}

// Get links filtered by week
export interface LinkWithMitzvaDetails extends Link {
  member_code: string;
  member_name: string;
  ticket_code: string;
  mitzva_name: string;
  mitzva_price: number;
}

export async function getLinksByWeek(weekNumber: number, year: number): Promise<LinkWithMitzvaDetails[]> {
  const database = await getDb();
  return database.select<LinkWithMitzvaDetails[]>(
    `SELECT l.*, m.code as member_code,
            (m.first_name || ' ' || m.last_name) as member_name,
            t.code as ticket_code, t.name as mitzva_name, t.price as mitzva_price
     FROM links l
     INNER JOIN members m ON l.member_id = m.id
     INNER JOIN tickets t ON l.ticket_id = t.id
     WHERE l.week_number = $1 AND l.year = $2
     ORDER BY l.linked_at DESC`,
    [weekNumber, year]
  );
}

// Get stats filtered by week
export async function getStatsByWeek(weekNumber: number, year: number): Promise<Stats> {
  const database = await getDb();

  const [memberCount] = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM members"
  );
  const [mitzvaCount] = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM tickets"
  );
  const [linkCount] = await database.select<{count: number}[]>(
    "SELECT COUNT(*) as count FROM links WHERE week_number = $1 AND year = $2",
    [weekNumber, year]
  );
  const [unlinkedCount] = await database.select<{count: number}[]>(
    `SELECT COUNT(*) as count FROM tickets t
     WHERE NOT EXISTS (
       SELECT 1 FROM links l
       WHERE l.ticket_id = t.id AND l.week_number = $1 AND l.year = $2
     )`,
    [weekNumber, year]
  );

  return {
    totalMembers: memberCount.count,
    totalMitzvot: mitzvaCount.count,
    totalLinks: linkCount.count,
    unlinkedMitzvot: unlinkedCount.count,
    totalTickets: mitzvaCount.count,
    unlinkedTickets: unlinkedCount.count,
  };
}

// Get mitzvot for member in specific week
export async function getMitzvotForMemberInWeek(
  memberId: number,
  weekNumber: number,
  year: number
): Promise<Mitzva[]> {
  const database = await getDb();
  return database.select<Mitzva[]>(
    `SELECT t.* FROM tickets t
     INNER JOIN links l ON t.id = l.ticket_id
     WHERE l.member_id = $1 AND l.week_number = $2 AND l.year = $3
     ORDER BY l.linked_at DESC`,
    [memberId, weekNumber, year]
  );
}

// Settings functions
export async function getSetting(key: string): Promise<string | null> {
  const database = await getDb();
  const results = await database.select<{value: string}[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return results[0]?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
}

export async function deleteSetting(key: string): Promise<void> {
  const database = await getDb();
  await database.execute("DELETE FROM settings WHERE key = $1", [key]);
}

// Get all mitzvot with their purchaser for a specific week
export interface MitzvaWithPurchaser extends Mitzva {
  purchaser_id: number | null;
  purchaser_name: string | null;
  purchaser_phone: string | null;
  purchaser_email: string | null;
  bid_price: number | null;
  link_id: number | null; // ID of the link for editing/deleting
  payment_status: PaymentStatus | null;
  reminder_sent_at: string | null;
}

export async function getMitzvotWithPurchasers(
  weekNumber: number,
  year: number
): Promise<MitzvaWithPurchaser[]> {
  const database = await getDb();
  return database.select<MitzvaWithPurchaser[]>(
    `SELECT t.*,
            m.id as purchaser_id,
            (m.first_name || ' ' || m.last_name) as purchaser_name,
            m.phone as purchaser_phone,
            m.email as purchaser_email,
            l.bid_price,
            l.id as link_id,
            l.payment_status,
            l.reminder_sent_at
     FROM tickets t
     LEFT JOIN links l ON t.id = l.ticket_id AND l.week_number = $1 AND l.year = $2
     LEFT JOIN members m ON l.member_id = m.id
     ORDER BY t.name`,
    [weekNumber, year]
  );
}

// Get all members with their purchased mitzvot count for a specific week
export interface MemberWithPurchases extends Member {
  mitzvot_count: number;
  total_price: number;
}

export async function getMembersWithPurchases(
  weekNumber: number,
  year: number
): Promise<MemberWithPurchases[]> {
  const database = await getDb();
  return database.select<MemberWithPurchases[]>(
    `SELECT m.*,
            COUNT(l.id) as mitzvot_count,
            COALESCE(SUM(l.bid_price), 0) as total_price
     FROM members m
     LEFT JOIN links l ON m.id = l.member_id AND l.week_number = $1 AND l.year = $2
     GROUP BY m.id
     HAVING mitzvot_count > 0
     ORDER BY m.last_name, m.first_name`,
    [weekNumber, year]
  );
}

// Mitzva with bid price for display
export interface MitzvaWithBidPrice extends Mitzva {
  bid_price: number;
}

// Get mitzvot with bid prices for a specific member in a week
export async function getMitzvotWithBidPriceForMember(
  memberId: number,
  weekNumber: number,
  year: number
): Promise<MitzvaWithBidPrice[]> {
  const database = await getDb();
  return database.select<MitzvaWithBidPrice[]>(
    `SELECT t.*, l.bid_price
     FROM tickets t
     INNER JOIN links l ON t.id = l.ticket_id
     WHERE l.member_id = $1 AND l.week_number = $2 AND l.year = $3
     ORDER BY l.linked_at DESC`,
    [memberId, weekNumber, year]
  );
}

// Purchased mitzva with parasha info for display in member details
export interface PurchasedMitzvaWithParasha {
  id: number;
  name: string;
  code: string;
  bid_price: number;
  week_number: number;
  year: number;
  parasha_name_he: string | null;
  holiday_name_he: string | null;
  linked_at: string;
}

// Get all mitzvot purchased by a member (across all weeks) with parasha info
export async function getPurchasedMitzvotForMember(
  memberId: number
): Promise<PurchasedMitzvaWithParasha[]> {
  const database = await getDb();
  return database.select<PurchasedMitzvaWithParasha[]>(
    `SELECT t.id, t.name, t.code, l.bid_price, l.week_number, l.year, l.linked_at,
            w.parasha_name_he, w.holiday_name_he
     FROM tickets t
     INNER JOIN links l ON t.id = l.ticket_id
     LEFT JOIN weeks w ON l.week_number = w.week_number AND l.year = w.year
     WHERE l.member_id = $1
     ORDER BY l.linked_at DESC`,
    [memberId]
  );
}

// ============== Report Export Functions ==============

// Report data for a single member
export interface MemberReportData {
  member_id: number;
  member_name: string;
  phone: string | null;
  purchases: {
    parasha_name: string;
    mitzva_name: string;
    bid_price: number;
    payment_status: string;
    purchase_date: string;
    week_number: number;
    year: number;
  }[];
  total_paid: number;
  total_unpaid: number;
  total_all: number;
}

// Get full report data for all members across all weeks
export async function getFullReportData(): Promise<MemberReportData[]> {
  const database = await getDb();

  // Get all purchases with member, mitzva, and week info
  const allPurchases = await database.select<{
    member_id: number;
    member_name: string;
    phone: string | null;
    mitzva_name: string;
    bid_price: number;
    payment_status: string;
    linked_at: string;
    week_number: number;
    year: number;
    parasha_name_he: string | null;
    holiday_name_he: string | null;
  }[]>(
    `SELECT
      m.id as member_id,
      (m.first_name || ' ' || m.last_name) as member_name,
      m.phone,
      t.name as mitzva_name,
      l.bid_price,
      COALESCE(l.payment_status, 'unpaid') as payment_status,
      l.linked_at,
      l.week_number,
      l.year,
      w.parasha_name_he,
      w.holiday_name_he
    FROM links l
    INNER JOIN members m ON l.member_id = m.id
    INNER JOIN tickets t ON l.ticket_id = t.id
    LEFT JOIN weeks w ON l.week_number = w.week_number AND l.year = w.year
    ORDER BY m.last_name, m.first_name, l.year DESC, l.week_number DESC`
  );

  // Group by member
  const memberMap = new Map<number, MemberReportData>();

  for (const purchase of allPurchases) {
    if (!memberMap.has(purchase.member_id)) {
      memberMap.set(purchase.member_id, {
        member_id: purchase.member_id,
        member_name: purchase.member_name,
        phone: purchase.phone,
        purchases: [],
        total_paid: 0,
        total_unpaid: 0,
        total_all: 0,
      });
    }

    const member = memberMap.get(purchase.member_id)!;
    const parashaName = purchase.holiday_name_he || purchase.parasha_name_he || `שבוע ${purchase.week_number}`;

    member.purchases.push({
      parasha_name: parashaName,
      mitzva_name: purchase.mitzva_name,
      bid_price: purchase.bid_price || 0,
      payment_status: purchase.payment_status,
      purchase_date: purchase.linked_at,
      week_number: purchase.week_number,
      year: purchase.year,
    });

    if (purchase.payment_status === 'paid') {
      member.total_paid += purchase.bid_price || 0;
    } else {
      member.total_unpaid += purchase.bid_price || 0;
    }
    member.total_all += purchase.bid_price || 0;
  }

  return Array.from(memberMap.values());
}

// Generate CSV report
export async function generateCSVReport(): Promise<string> {
  const reportData = await getFullReportData();

  const lines: string[] = [];

  // Header
  lines.push('שם מתפלל,טלפון,פרשה,מצווה,סכום,סטטוס תשלום,תאריך רכישה');

  for (const member of reportData) {
    for (const purchase of member.purchases) {
      lines.push([
        member.member_name,
        member.phone || '',
        purchase.parasha_name,
        purchase.mitzva_name,
        purchase.bid_price.toString(),
        purchase.payment_status === 'paid' ? 'שולם' : 'לא שולם',
        new Date(purchase.purchase_date).toLocaleDateString('he-IL'),
      ].join(','));
    }
  }

  // Add summary
  lines.push('');
  lines.push('סיכום לפי מתפלל:');
  lines.push('שם מתפלל,טלפון,סה"כ שולם,סה"כ לא שולם,סה"כ');

  for (const member of reportData) {
    lines.push([
      member.member_name,
      member.phone || '',
      member.total_paid.toString(),
      member.total_unpaid.toString(),
      member.total_all.toString(),
    ].join(','));
  }

  return lines.join('\n');
}

// ============== Sync Export/Import Functions ==============

// Sync data structure (moved from supabase)
export interface SyncData {
  members: Array<{
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
    code: string;
    name: string;
    price: number;
    notes: string | null;
    created_at: string;
  }>;
  links: Array<{
    member_code: string;
    ticket_code: string;
    week_number: number;
    year: number;
    bid_price: number;
    linked_at: string;
  }>;
  weeks: Array<{
    week_number: number;
    year: number;
    parasha_name_he: string | null;
    parasha_name_en: string | null;
    parasha_ref: string | null;
    shabbat_date: string | null;
    is_current: number;
    event_type?: string | null;
    holiday_name_he?: string | null;
    holiday_name_en?: string | null;
  }>;
  exportedAt: string;
}

export interface MergeResult {
  membersAdded: number;
  membersUpdated: number;
  ticketsAdded: number;
  ticketsUpdated: number;
  linksAdded: number;
  weeksAdded: number;
}

// Export all data from local database
export async function exportAllData(): Promise<SyncData> {
  const database = await getDb();

  // Get all members
  const members = await database.select<Member[]>("SELECT * FROM members");

  // Get all tickets
  const tickets = await database.select<Mitzva[]>("SELECT * FROM tickets");

  // Get all weeks
  const weeks = await database.select<Week[]>("SELECT * FROM weeks");

  // Get all links with member and ticket codes
  const links = await database.select<{
    member_code: string;
    ticket_code: string;
    week_number: number;
    year: number;
    bid_price: number;
    linked_at: string;
  }[]>(
    `SELECT m.code as member_code, t.code as ticket_code,
            l.week_number, l.year, l.bid_price, l.linked_at
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
      created_at: t.created_at
    })),
    links,
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
    })),
    exportedAt: new Date().toISOString()
  };
}

// Import and merge data into local database
export async function importAndMergeData(data: SyncData): Promise<MergeResult> {
  const database = await getDb();

  const result: MergeResult = {
    membersAdded: 0,
    membersUpdated: 0,
    ticketsAdded: 0,
    ticketsUpdated: 0,
    linksAdded: 0,
    weeksAdded: 0
  };

  // Import members
  for (const importedMember of data.members) {
    const existing = await getMemberByCode(importedMember.code);

    if (existing) {
      // Compare updated_at - update if imported is newer
      const existingDate = new Date(existing.updated_at);
      const importedDate = new Date(importedMember.updated_at);

      if (importedDate > existingDate) {
        await database.execute(
          `UPDATE members SET
            first_name = $1, last_name = $2, phone = $3, email = $4,
            notes = $5, notification_preferences = $6, updated_at = $7
           WHERE code = $8`,
          [
            importedMember.first_name, importedMember.last_name,
            importedMember.phone, importedMember.email,
            importedMember.notes, importedMember.notification_preferences,
            importedMember.updated_at, importedMember.code
          ]
        );
        result.membersUpdated++;
      }
    } else {
      // Insert new member
      await database.execute(
        `INSERT INTO members (code, first_name, last_name, phone, email, notes, notification_preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          importedMember.code, importedMember.first_name, importedMember.last_name,
          importedMember.phone, importedMember.email, importedMember.notes,
          importedMember.notification_preferences, importedMember.created_at, importedMember.updated_at
        ]
      );
      result.membersAdded++;
    }
  }

  // Import tickets
  for (const importedTicket of data.tickets) {
    const existing = await getMitzvaByCode(importedTicket.code);

    if (existing) {
      // Compare created_at - update if imported is newer
      const existingDate = new Date(existing.created_at);
      const importedDate = new Date(importedTicket.created_at);

      if (importedDate > existingDate) {
        await database.execute(
          `UPDATE tickets SET name = $1, price = $2, notes = $3 WHERE code = $4`,
          [importedTicket.name, importedTicket.price, importedTicket.notes, importedTicket.code]
        );
        result.ticketsUpdated++;
      }
    } else {
      // Insert new ticket
      await database.execute(
        `INSERT INTO tickets (code, name, price, notes, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          importedTicket.code, importedTicket.name, importedTicket.price,
          importedTicket.notes, importedTicket.created_at
        ]
      );
      result.ticketsAdded++;
    }
  }

  // Import weeks
  for (const importedWeek of data.weeks) {
    const existing = await getWeek(importedWeek.week_number, importedWeek.year);

    if (!existing) {
      await database.execute(
        `INSERT INTO weeks (week_number, year, parasha_name_he, parasha_name_en, parasha_ref, shabbat_date, is_current, event_type, holiday_name_he, holiday_name_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          importedWeek.week_number, importedWeek.year,
          importedWeek.parasha_name_he, importedWeek.parasha_name_en,
          importedWeek.parasha_ref, importedWeek.shabbat_date,
          importedWeek.is_current, importedWeek.event_type,
          importedWeek.holiday_name_he, importedWeek.holiday_name_en
        ]
      );
      result.weeksAdded++;
    }
  }

  // Import links
  for (const importedLink of data.links) {
    // Find member and ticket by code
    const member = await getMemberByCode(importedLink.member_code);
    const ticket = await getMitzvaByCode(importedLink.ticket_code);

    if (member && ticket) {
      // Check if link already exists
      const existingLink = await database.select<{id: number}[]>(
        `SELECT id FROM links WHERE member_id = $1 AND ticket_id = $2 AND week_number = $3 AND year = $4`,
        [member.id, ticket.id, importedLink.week_number, importedLink.year]
      );

      if (existingLink.length === 0) {
        await database.execute(
          `INSERT INTO links (member_id, ticket_id, week_number, year, bid_price, linked_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            member.id, ticket.id, importedLink.week_number, importedLink.year,
            importedLink.bid_price, importedLink.linked_at
          ]
        );
        result.linksAdded++;
      }
    }
  }

  return result;
}

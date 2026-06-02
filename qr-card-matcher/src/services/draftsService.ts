/**
 * Drafts Service
 * ==============================================
 * Manages scan drafts locally using localStorage
 * Drafts allow users to save incomplete scans and continue later
 */

const DRAFTS_STORAGE_KEY = 'scan_drafts';

// Draft type for pending scans
export interface ScanDraft {
  id: string;
  member: {
    id: number;
    code: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  cart: Array<{
    mitzva: {
      id: number;
      code: string;
      name: string;
      price: number;
    };
    price: number;
  }>;
  week: {
    week_number: number;
    year: number;
    parasha_name_he: string | null;
    shabbat_date: string | null;
  };
  message: string;
  createdAt: string;
  createdOnDevice: string;
  userId: string; // To scope drafts per user
}

// Get all drafts from localStorage
function getAllDrafts(): ScanDraft[] {
  try {
    const draftsJson = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!draftsJson) return [];
    return JSON.parse(draftsJson) as ScanDraft[];
  } catch (error) {
    console.error('Error reading drafts from localStorage:', error);
    return [];
  }
}

// Save all drafts to localStorage
function saveAllDrafts(drafts: ScanDraft[]): void {
  try {
    localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.error('Error saving drafts to localStorage:', error);
  }
}

/**
 * Get drafts for a specific user
 */
export function getDrafts(userId: string): ScanDraft[] {
  const allDrafts = getAllDrafts();
  return allDrafts.filter(draft => draft.userId === userId);
}

/**
 * Save a draft
 */
export async function saveDraft(userId: string, draft: Omit<ScanDraft, 'userId'>): Promise<void> {
  const allDrafts = getAllDrafts();
  const draftWithUser: ScanDraft = {
    ...draft,
    userId
  };

  // Check if draft already exists (by id)
  const existingIndex = allDrafts.findIndex(d => d.id === draft.id);
  if (existingIndex >= 0) {
    allDrafts[existingIndex] = draftWithUser;
  } else {
    allDrafts.push(draftWithUser);
  }

  saveAllDrafts(allDrafts);

  // Notify subscribers
  notifySubscribers(userId);
}

/**
 * Delete a draft
 */
export async function deleteDraft(userId: string, draftId: string): Promise<void> {
  const allDrafts = getAllDrafts();
  const filteredDrafts = allDrafts.filter(d => !(d.id === draftId && d.userId === userId));
  saveAllDrafts(filteredDrafts);

  // Notify subscribers
  notifySubscribers(userId);
}

// Subscribers management
type DraftsCallback = (drafts: ScanDraft[]) => void;
const subscribers: Map<string, Set<DraftsCallback>> = new Map();

/**
 * Subscribe to drafts changes for a user
 * Returns unsubscribe function
 */
export function subscribeToDrafts(userId: string, callback: DraftsCallback): () => void {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }

  subscribers.get(userId)!.add(callback);

  // Immediately call with current drafts
  const currentDrafts = getDrafts(userId);
  callback(currentDrafts);

  // Return unsubscribe function
  return () => {
    const userSubscribers = subscribers.get(userId);
    if (userSubscribers) {
      userSubscribers.delete(callback);
      if (userSubscribers.size === 0) {
        subscribers.delete(userId);
      }
    }
  };
}

// Notify all subscribers for a user
function notifySubscribers(userId: string): void {
  const userSubscribers = subscribers.get(userId);
  if (userSubscribers) {
    const drafts = getDrafts(userId);
    userSubscribers.forEach(callback => callback(drafts));
  }
}

/**
 * Clear all drafts for a user
 */
export function clearUserDrafts(userId: string): void {
  const allDrafts = getAllDrafts();
  const filteredDrafts = allDrafts.filter(d => d.userId !== userId);
  saveAllDrafts(filteredDrafts);
  notifySubscribers(userId);
}

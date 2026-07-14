const isWeb = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const QUEUE_KEY = 'rr21go_sync_queue';
const ENTRIES_KEY = 'rr21go_local_entries';
const WEIGHTS_KEY = 'rr21go_local_weights';
const API_BASE = 'http://localhost:3000/api';

export interface QueueItem {
  id: string; // client-generated UUID/idempotency key
  action: 'INSERT_ENTRY' | 'DELETE_ENTRY' | 'UPSERT_WEIGHT';
  payload: any;
  createdAt: number;
}

// In-memory cache for native/web fallback
let memoryQueue: QueueItem[] = [];
let memoryEntries: any[] = [];
let memoryWeights: any[] = [];

// Helper functions for storage abstraction
const storage = {
  get(key: string): string | null {
    if (isWeb) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return null;
  },
  set(key: string, value: string): void {
    if (isWeb) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    }
  }
};

// Initialize caches from local storage
function initStore() {
  try {
    const q = storage.get(QUEUE_KEY);
    if (q) memoryQueue = JSON.parse(q);

    const e = storage.get(ENTRIES_KEY);
    if (e) memoryEntries = JSON.parse(e);

    const w = storage.get(WEIGHTS_KEY);
    if (w) memoryWeights = JSON.parse(w);
  } catch (err) {
    console.error('Failed to initialize local store:', err);
  }
}

initStore();

const saveQueue = () => storage.set(QUEUE_KEY, JSON.stringify(memoryQueue));
const saveEntries = () => storage.set(ENTRIES_KEY, JSON.stringify(memoryEntries));
const saveWeights = () => storage.set(WEIGHTS_KEY, JSON.stringify(memoryWeights));

export const LocalStore = {
  // Sync Queue management
  getQueue(): QueueItem[] {
    return [...memoryQueue].sort((a, b) => a.createdAt - b.createdAt);
  },

  enqueue(action: QueueItem['action'], payload: any): string {
    const id = payload.clientId || payload.id || `client_${Math.random().toString(36).substring(7)}`;
    const item: QueueItem = {
      id,
      action,
      payload,
      createdAt: Date.now(),
    };
    memoryQueue.push(item);
    saveQueue();
    return id;
  },

  dequeue(id: string): void {
    memoryQueue = memoryQueue.filter(item => item.id !== id);
    saveQueue();
  },

  // Local entries cache
  getLocalEntries(date: string): any[] {
    return memoryEntries.filter(e => e.loggedFor === date);
  },

  addLocalEntry(entry: any): void {
    memoryEntries.unshift(entry);
    saveEntries();
  },

  deleteLocalEntry(id: string): void {
    memoryEntries = memoryEntries.filter(e => e.id !== id);
    saveEntries();
  },

  setLocalEntries(entriesList: any[]): void {
    memoryEntries = entriesList;
    saveEntries();
  },

  // Local weights cache
  getLocalWeights(): any[] {
    return memoryWeights;
  },

  addLocalWeight(weight: any): void {
    // Check if weight already logged on same day
    const idx = memoryWeights.findIndex(w => w.date === weight.date);
    if (idx !== -1) {
      memoryWeights[idx] = { ...memoryWeights[idx], ...weight };
    } else {
      memoryWeights.unshift(weight);
    }
    saveWeights();
  },

  deleteLocalWeight(id: string): void {
    memoryWeights = memoryWeights.filter(w => w.id !== id);
    saveWeights();
  },

  setLocalWeights(weightsList: any[]): void {
    memoryWeights = weightsList;
    saveWeights();
  },

  // Clear all caches
  clearAll(): void {
    memoryQueue = [];
    memoryEntries = [];
    memoryWeights = [];
    saveQueue();
    saveEntries();
    saveWeights();
  }
};

/**
 * Replays all pending queue actions to the server.
 * Operates with network idempotency (ON CONFLICT DO NOTHING / DELETE checks).
 */
export async function syncOfflineQueue(authSubject: string): Promise<boolean> {
  const queue = LocalStore.getQueue();
  if (queue.length === 0) return true;

  console.log(`[Sync] Starting sync for ${queue.length} pending items...`);

  for (const item of queue) {
    try {
      let url = `${API_BASE}`;
      let method = 'POST';
      let body: string | undefined;

      if (item.action === 'INSERT_ENTRY') {
        url += '/entries';
        body = JSON.stringify(item.payload);
      } else if (item.action === 'DELETE_ENTRY') {
        url += `/entries/${item.payload.id}`;
        method = 'DELETE';
      } else if (item.action === 'UPSERT_WEIGHT') {
        url += '/weight';
        body = JSON.stringify(item.payload);
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authSubject}`,
        },
        body,
      });

      // If success (200/201/204) or client conflict/item deleted (404/409), dequeue item safely
      if (res.status === 200 || res.status === 201 || res.status === 204 || res.status === 409 || res.status === 404) {
        LocalStore.dequeue(item.id);
        console.log(`[Sync] Successfully synced item ${item.id} (${item.action})`);
      } else {
        console.warn(`[Sync] Server returned error ${res.status} for item ${item.id}. Will retry later.`);
        return false; // Stop processing queue on server-side error
      }
    } catch (err) {
      console.error(`[Sync] Network connection failed during sync replay for item ${item.id}:`, err);
      return false; // Stop sync loop if connection fails
    }
  }

  console.log('[Sync] All pending items successfully synchronized.');
  return true;
}

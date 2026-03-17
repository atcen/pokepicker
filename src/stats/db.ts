import type { SortResult } from '../types';

// Statistics using IndexedDB for persistence
// (sql.js requires SharedArrayBuffer which needs COOP/COEP headers in production)
// We use a simple IndexedDB-based stats store for cross-session tracking.

interface StatEntry {
  id?: number;
  timestamp: number;
  sessionId: string;
  rankedIds: number[];
  batchSize: number;
}

interface ChoiceEntry {
  winnerId: number;
  loserId: number;
  count: number;
}

const DB_NAME = 'pokepicker-stats';
const DB_VERSION = 1;
let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('sortResults')) {
        const sortStore = database.createObjectStore('sortResults', {
          keyPath: 'id',
          autoIncrement: true,
        });
        sortStore.createIndex('timestamp', 'timestamp');
        sortStore.createIndex('sessionId', 'sessionId');
      }

      if (!database.objectStoreNames.contains('choices')) {
        const choicesStore = database.createObjectStore('choices', {
          keyPath: ['winnerId', 'loserId'],
        });
        choicesStore.createIndex('winnerId', 'winnerId');
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function recordSortResult(
  result: SortResult,
  sessionId: string
): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction(['sortResults', 'choices'], 'readwrite');

    // Record the full sort result
    const sortStore = tx.objectStore('sortResults');
    const entry: StatEntry = {
      timestamp: result.timestamp,
      sessionId,
      rankedIds: result.rankedIds,
      batchSize: result.rankedIds.length,
    };
    sortStore.add(entry);

    // Record pairwise choices
    const choicesStore = tx.objectStore('choices');
    for (let i = 0; i < result.rankedIds.length; i++) {
      for (let j = i + 1; j < result.rankedIds.length; j++) {
        const winnerId = result.rankedIds[i];
        const loserId = result.rankedIds[j];

        // Update or create choice entry
        const key = [winnerId, loserId];
        const getReq = choicesStore.get(key);

        getReq.onsuccess = () => {
          const existing = getReq.result as ChoiceEntry | undefined;
          if (existing) {
            choicesStore.put({ winnerId, loserId, count: existing.count + 1 });
          } else {
            choicesStore.add({ winnerId, loserId, count: 1 });
          }
        };
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Stats recording failed:', e);
  }
}

export async function getTopChoices(limit = 20): Promise<ChoiceEntry[]> {
  try {
    const database = await openDB();
    const tx = database.transaction('choices', 'readonly');
    const store = tx.objectStore('choices');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result as ChoiceEntry[];
        all.sort((a, b) => b.count - a.count);
        resolve(all.slice(0, limit));
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function getTotalInteractions(): Promise<number> {
  try {
    const database = await openDB();
    const tx = database.transaction('sortResults', 'readonly');
    const store = tx.objectStore('sortResults');

    return new Promise((resolve, reject) => {
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return 0;
  }
}

export async function getMostChosen(limit = 10): Promise<number[]> {
  try {
    const entries = await getTopChoices(100);
    const winCounts = new Map<number, number>();

    for (const e of entries) {
      winCounts.set(e.winnerId, (winCounts.get(e.winnerId) ?? 0) + e.count);
    }

    return Array.from(winCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  } catch {
    return [];
  }
}

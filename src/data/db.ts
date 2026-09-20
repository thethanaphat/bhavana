import { defaultSettings, type Settings } from './models';

const DATABASE_NAME = 'mindful-practice';
const DATABASE_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not available'));
  }

  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('practiceSessions')) {
        const store = db.createObjectStore('practiceSessions', { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt');
        store.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('chantSessions')) {
        const store = db.createObjectStore('chantSessions', { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt');
        store.createIndex('prayerId', 'prayerId');
      }
      if (!db.objectStoreNames.contains('activeSession')) {
        db.createObjectStore('activeSession', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('legacyBaseline')) {
        db.createObjectStore('legacyBaseline', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('customPrayers')) {
        db.createObjectStore('customPrayers', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('Unable to open IndexedDB'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('IndexedDB upgrade is blocked by another tab'));
    };
  });

  return databasePromise;
}

export async function loadSettings(): Promise<Settings> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const request = tx.objectStore('settings').get('main');
    request.onsuccess = () => {
      const stored = request.result as Settings | undefined;
      const defaults = defaultSettings();
      resolve(stored ? {
        ...defaults,
        ...stored,
        sitting: { ...defaults.sitting, ...stored.sitting },
        walking: { ...defaults.walking, ...stored.walking },
      } : defaults);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to read settings'));
  });
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(settings);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Unable to save settings'));
    tx.onabort = () => reject(tx.error ?? new Error('Unable to save settings'));
  });
}

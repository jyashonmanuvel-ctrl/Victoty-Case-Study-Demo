/* storage.js
   Thin promise-based wrapper around IndexedDB.
   v2: bills now use an internal auto-increment key (_id) so the
   user-facing Bill Number can be left blank without breaking storage.

   Robustness: if another tab has an older version of this app open,
   IndexedDB's upgrade can "block" indefinitely. We time that out so the
   app always falls back to in-memory mode instead of hanging forever.
*/
window.VP = window.VP || {};

VP.storage = (function () {
  const DB_NAME = 'VictorPrintersDB';
  const DB_VERSION = 2;
  const STORE_CUSTOMERS = 'customers';
  const STORE_BILLS = 'bills';
  const OPEN_TIMEOUT_MS = 4000;

  let dbPromise = null;

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB is not available in this browser/context.'));
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('IndexedDB open timed out — it may be blocked by another open tab of this app.'));
      }, OPEN_TIMEOUT_MS);

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
          db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
        }
        // Bills store changed shape between versions — rebuild it cleanly.
        if (db.objectStoreNames.contains(STORE_BILLS)) {
          db.deleteObjectStore(STORE_BILLS);
        }
        db.createObjectStore(STORE_BILLS, { keyPath: '_id', autoIncrement: true });
      };

      req.onblocked = () => {
        // Another tab has an older version open. We don't hang — the timeout above
        // will fire and the app falls back to in-memory mode with a banner.
        console.warn('IndexedDB upgrade blocked by another open tab. Close other tabs of this app and reload for full autosave.');
      };

      req.onsuccess = (e) => {
        const db = e.target.result;
        if (settled) { db.close(); return; } // timed out already; don't leak the connection
        settled = true;
        clearTimeout(timer);
        // If a future tab needs to upgrade the schema, let it — close gracefully.
        db.onversionchange = () => { db.close(); };
        resolve(db);
      };

      req.onerror = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e.target.error);
      };
    });
    return dbPromise;
  }

  async function getStore(storeName, mode) {
    const db = await openDatabase();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function getAll(storeName) {
    return getStore(storeName, 'readonly').then(store => new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  }

  /** Returns the resolved key (needed for autoIncrement bills). */
  function put(storeName, obj) {
    return getStore(storeName, 'readwrite').then(store => new Promise((resolve, reject) => {
      const req = store.put(obj);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function remove(storeName, key) {
    return getStore(storeName, 'readwrite').then(store => new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  function clear(storeName) {
    return getStore(storeName, 'readwrite').then(store => new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  /** Replace every record in a store. For bills, omit _id so autoIncrement reassigns keys. */
  async function replaceAll(storeName, records) {
    await clear(storeName);
    const store = await getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      if (!records.length) return resolve();
      let done = 0;
      records.forEach(rec => {
        const req = store.put(rec);
        req.onsuccess = () => { done++; if (done === records.length) resolve(); };
        req.onerror = () => reject(req.error);
      });
    });
  }

  async function isAvailable() {
    try { await openDatabase(); return true; }
    catch (e) { return false; }
  }

  return {
    STORE_CUSTOMERS, STORE_BILLS,
    openDatabase, getAll, put, remove, clear, replaceAll, isAvailable
  };
})();

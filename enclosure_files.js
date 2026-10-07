// The teacher's enclosure files, kept in this browser (IndexedDB) per session. The record only lists them.

const DB_NAME = 'acrUtility-files';
const STORE = 'files';
export const FULL_MESSAGE = 'This browser has no room left for the file. Remove some files or use another device.';
export const NO_STORE_MESSAGE = 'This browser cannot keep files (private window?).';

export function newFileId(crypto = globalThis.crypto) {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return [...a].map(b => (b % 36).toString(36)).join('');
}

export const isQuotaError = err => Boolean(err) && (err.name === 'QuotaExceededError' || err.code === 22);

export function createFileStore({ indexedDB = globalThis.indexedDB } = {}) {
  let opening = null;
  const open = () => (opening ??= new Promise((resolve, reject) => {
    if (!indexedDB) { reject(new Error('IndexedDB is not available')); return; }
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const key = (session, id) => `${session || ''}|${id}`;
  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      let out;
      req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error || req.error);
      t.onabort = () => reject(t.error || req.error);
    });
  }
  return {
    async available() {
      try { await open(); return true; } catch { opening = null; return false; }
    },
    put: rec => tx('readwrite', s => s.put(rec, key(rec.session, rec.id))),
    get: (session, id) => tx('readonly', s => s.get(key(session, id))),
    remove: (session, id) => tx('readwrite', s => s.delete(key(session, id))),
    async ids(session) {
      const prefix = `${session || ''}|`;
      const keys = await tx('readonly', s => s.getAllKeys());
      return keys.filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length));
    },
  };
}

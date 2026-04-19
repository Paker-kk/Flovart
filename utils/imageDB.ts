/**
 * IndexedDB image store — localStorage 仅存引用 ID, 真正的 base64 存这里.
 *
 * 设计:
 * - DB: flovart-images, Store: images, keyPath 外置 (out-of-line key)
 * - 值: 纯 base64 dataUrl string
 * - 所有 API 均 async, 但 IndexedDB 在同源下极快 (~1-10 ms)
 *
 * 引用协议: localStorage 中以 idb: 开头的字符串表示 IndexedDB 引用,
 * 例如 "idb:board:abc123" → IDB key "board:abc123"
 */

const DB_NAME = 'flovart-images';
const STORE_NAME = 'images';
const DB_VERSION = 1;

/** 引用前缀 — 出现在 localStorage JSON 值中 */
export const IDB_PREFIX = 'idb:';

export const isIdbRef = (s: string | undefined | null): s is string =>
    typeof s === 'string' && s.startsWith(IDB_PREFIX);

export const isDataUrl = (s: string | undefined | null): s is string =>
    typeof s === 'string' && s.startsWith('data:');

export const toIdbRef = (key: string): string => `${IDB_PREFIX}${key}`;

export const fromIdbRef = (ref: string): string => ref.slice(IDB_PREFIX.length);

// ──── singleton connection ────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
            dbPromise = null; // allow retry
            reject(req.error);
        };
    });
    return dbPromise;
}

// ──── public API ────

/** Store a single image */
export async function putImage(key: string, dataUrl: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(dataUrl, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Batch-store multiple images in one transaction */
export async function putImages(entries: { key: string; data: string }[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const { key, data } of entries) store.put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Retrieve a single image */
export async function getImage(key: string): Promise<string | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve((req.result as string) ?? null);
        req.onerror = () => reject(req.error);
    });
}

/** Batch-retrieve multiple images in one transaction */
export async function getImages(keys: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (keys.length === 0) return results;
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        let done = 0;
        for (const key of keys) {
            const req = store.get(key);
            req.onsuccess = () => {
                if (typeof req.result === 'string') results.set(key, req.result);
                if (++done === keys.length) resolve(results);
            };
            req.onerror = () => {
                if (++done === keys.length) resolve(results);
            };
        }
    });
}

/** Delete images by keys */
export async function deleteImages(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const key of keys) store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** List all keys in the store (for GC / debug) */
export async function getAllKeys(): Promise<string[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAllKeys();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
    });
}

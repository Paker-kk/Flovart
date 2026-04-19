/**
 * API Key 加密存储工具
 * 使用 AES-GCM 加密 API Key，避免明文存储在 localStorage 中。
 * 密钥派生自一个随机生成的设备指纹，存储在 sessionStorage 或 localStorage。
 */

const VAULT_STORAGE_KEY = 'userApiKeys.v1.vault';
const VAULT_SALT_KEY = 'vault.salt';
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

async function getOrCreateSalt(): Promise<Uint8Array> {
    const existing = localStorage.getItem(VAULT_SALT_KEY);
    if (existing) {
        return Uint8Array.from(atob(existing), c => c.charCodeAt(0));
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(VAULT_SALT_KEY, btoa(String.fromCharCode(...salt)));
    return salt;
}

/**
 * 派生加密密钥。
 * 使用固定的设备标识 + 随机 salt 通过 PBKDF2 派生。
 * 这不是密码级安全（因为 passphrase 可被读取），但确保 localStorage
 * 中的 key 不再是可直接复制使用的明文。
 */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
    // 使用 origin + userAgent 作为伪设备指纹
    const passphrase = `${location.origin}::${navigator.userAgent}`;
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        ENCODER.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

export async function encryptKeys(data: unknown): Promise<string> {
    const salt = await getOrCreateSalt();
    const key = await deriveKey(salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = ENCODER.encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    // Pack as: iv (12 bytes) + ciphertext
    const packed = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertext), iv.length);
    return btoa(String.fromCharCode(...packed));
}

export async function decryptKeys<T = unknown>(encoded: string): Promise<T | null> {
    try {
        const salt = await getOrCreateSalt();
        const key = await deriveKey(salt);
        const packed = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const iv = packed.slice(0, 12);
        const ciphertext = packed.slice(12);
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
        return JSON.parse(DECODER.decode(plaintext)) as T;
    } catch {
        return null;
    }
}

/**
 * 持久化 API Key（加密后写入 localStorage）。
 * 同时保留一份明文副本在 sessionStorage 用于快速读取，
 * sessionStorage 在浏览器关闭后自动清除。
 */
export async function saveKeysEncrypted(keys: unknown): Promise<void> {
    const encrypted = await encryptKeys(keys);
    try {
        localStorage.setItem(VAULT_STORAGE_KEY, encrypted);
    } catch (err) {
        console.error('[Storage] Failed to save encrypted keys', err);
    }
}

/**
 * 读取并解密 API Key。
 * 优先尝试加密格式，如果失败则尝试旧的明文格式做兼容迁移。
 */
export async function loadKeysDecrypted<T = unknown>(): Promise<T | null> {
    // 尝试加密格式
    const vault = localStorage.getItem(VAULT_STORAGE_KEY);
    if (vault) {
        const result = await decryptKeys<T>(vault);
        if (result !== null) return result;
    }
    // Fallback: 读取旧的明文格式
    const legacy = localStorage.getItem('userApiKeys.v1');
    if (legacy) {
        try {
            return JSON.parse(legacy) as T;
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * 清除所有 API Key 数据（用于退出时清除）。
 */
export function clearAllKeyData(): void {
    localStorage.removeItem(VAULT_STORAGE_KEY);
    localStorage.removeItem('userApiKeys.v1');
    localStorage.removeItem(VAULT_SALT_KEY);
}

/**
 * 迁移旧的明文存储到加密存储，并删除旧条目。
 */
export async function migrateLegacyKeys(): Promise<void> {
    const legacy = localStorage.getItem('userApiKeys.v1');
    if (!legacy) return;
    try {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed) && parsed.length > 0) {
            await saveKeysEncrypted(parsed);
        }
        localStorage.removeItem('userApiKeys.v1');
    } catch {
        // 旧数据损坏，直接删除
        localStorage.removeItem('userApiKeys.v1');
    }
}

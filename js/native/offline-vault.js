import { scope } from './components.js';
// Only explicitly chosen copies. No service worker or automatic API caching.
const database = 'sq-workspace-selected-copies-v1';
function open() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(database, 2);
        request.onupgradeneeded = () => {
            for (const name of ['keys', 'copies', 'metadata'])
                if (!request.result.objectStoreNames.contains(name))
                    request.result.createObjectStore(name);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function transaction(store, mode, operation) {
    const db = await open();
    try {
        return await new Promise((resolve, reject) => { const tx = db.transaction(store, mode), request = operation(tx.objectStore(store)); let result; request.onsuccess = () => result = request.result; tx.oncomplete = () => resolve(result); tx.onabort = () => reject(tx.error || Error('Stockage local interrompu.')); tx.onerror = () => reject(tx.error); });
    }
    finally {
        db.close();
    }
}
async function updateCopies(operation) {
    const db = await open();
    try {
        await new Promise((resolve, reject) => { const tx = db.transaction(['copies', 'metadata'], 'readwrite'); operation(tx.objectStore('copies'), tx.objectStore('metadata')); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || Error('Stockage local interrompu.')); tx.onerror = () => reject(tx.error); });
    }
    finally {
        db.close();
    }
}
export class LocalVault {
    constructor() { this.owner = scope(); }
    check() {
        if (!this.owner || scope() !== this.owner)
            throw Error('Le compte actif a changé.');
    }
    async key() {
        this.check();
        let key = await transaction('keys', 'readonly', s => s.get(this.owner));
        if (!key) {
            key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            await transaction('keys', 'readwrite', s => s.add(key, this.owner)).catch(async (error) => {
                const existing = await transaction('keys', 'readonly', s => s.get(this.owner));
                if (!existing)
                    throw error;
                key = existing;
            });
        }
        this.check();
        return key;
    }
    async seal(id, value) {
        const key = await this.key(), bytes = new TextEncoder().encode(JSON.stringify(value));
        if (bytes.byteLength > 36 * 1024 * 1024)
            throw Error('La copie dépasse la taille autorisée.');
        const iv = crypto.getRandomValues(new Uint8Array(12)), cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(this.owner + ':' + id) }, key, bytes);
        this.check();
        return { iv, cipher };
    }
    async unseal(id, item) { const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: item.iv, additionalData: new TextEncoder().encode(this.owner + ':' + id) }, await this.key(), item.cipher); this.check(); return JSON.parse(new TextDecoder().decode(clear)); }
    async put(id, value, days = 30) { this.check(); const encrypted = await this.seal(id, value), metadata = { ...value }; delete metadata.bytes; delete metadata.rows; const small = await this.seal(id + ':meta', metadata), expiresAt = Date.now() + days * 86400000, key = this.owner + ':' + id; this.check(); await updateCopies((copies, index) => { copies.put({ owner: this.owner, id, expiresAt, ...encrypted }, key); index.put({ owner: this.owner, id, expiresAt, ...small }, key); }); }
    async get(id) {
        this.check();
        const item = await transaction('copies', 'readonly', s => s.get(this.owner + ':' + id));
        if (!item)
            return null;
        if (item.expiresAt <= Date.now()) {
            await this.remove(id);
            return null;
        }
        return this.unseal(id, item);
    }
    async list() {
        this.check();
        const all = await transaction('metadata', 'readonly', s => s.getAll()), result = [];
        for (const item of all.filter(v => v.owner === this.owner)) {
            if (item.expiresAt <= Date.now())
                await this.remove(item.id);
            else
                result.push({ ...await this.unseal(item.id + ':meta', item), id: item.id, expiresAt: item.expiresAt });
        }
        return result;
    }
    async remove(id) { this.check(); const key = this.owner + ':' + id; await updateCopies((copies, index) => { copies.delete(key); index.delete(key); }); }
}
export function encodeBytes(buffer) {
    const bytes = new Uint8Array(buffer);
    let encoded = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
        encoded += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(encoded);
}
export function decodeBytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

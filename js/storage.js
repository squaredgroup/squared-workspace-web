// Storage may be disabled in private mode. Only non-sensitive preferences persist.
const memory = { local: new Map(), session: new Map() };
export function storage(kind = "session") {
  const fallback = memory[kind];
  const backend = () => { try { return window[`${kind}Storage`]; } catch { return null; } };
  return {
    get(key) { try { return backend()?.getItem(key) ?? fallback.get(key) ?? null; } catch { return fallback.get(key) ?? null; } },
    set(key, value) { fallback.set(key, String(value)); try { backend()?.setItem(key, String(value)); } catch { /* tab-memory fallback */ } },
    remove(key) { fallback.delete(key); try { backend()?.removeItem(key); } catch { /* storage unavailable */ } },
    json(key, initial = {}) { try { const value = JSON.parse(this.get(key) || "null"); return value && typeof value === "object" && !Array.isArray(value) ? value : initial; } catch { return initial; } }
  };
}

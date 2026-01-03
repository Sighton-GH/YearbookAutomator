export type LicenseValidateResponse = {
  valid: boolean;
  license_type?: "personal" | "commercial" | null;
  expires_at?: number | null;
  reason?: string | null;
};

export const LICENSE_STORAGE_KEY = "ymga_license_key";
export const DEVICE_ID_STORAGE_KEY = "ymga_device_id";

export function getStoredLicenseKey(): string | null {
  try {
    const v = localStorage.getItem(LICENSE_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredLicenseKey(key: string | null): void {
  try {
    if (!key || !key.trim()) localStorage.removeItem(LICENSE_STORAGE_KEY);
    else localStorage.setItem(LICENSE_STORAGE_KEY, key.trim());
  } catch {
    // ignore
  }
}

function _randomId(): string {
  // Prefer UUID when available.
  const c: any = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  // Fallback: random string.
  const buf = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(buf);
  else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const created = _randomId();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // If localStorage is unavailable, still return an in-memory id.
    return _randomId();
  }
}

export async function validateLicenseKey(key: string): Promise<LicenseValidateResponse> {
  const deviceId = getOrCreateDeviceId();
  const resp = await fetch("/api/licensing/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
    body: JSON.stringify({ key })
  });
  if (!resp.ok) {
    return { valid: false, reason: `http_${resp.status}` };
  }
  return (await resp.json()) as LicenseValidateResponse;
}

export async function requestFreePersonalKey(): Promise<string> {
  const deviceId = getOrCreateDeviceId();
  const resp = await fetch("/api/licensing/free-key", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Id": deviceId },
    body: JSON.stringify({ accepted_non_commercial_terms: true })
  });
  if (!resp.ok) throw new Error(`Failed to get free key (${resp.status})`);
  const data = (await resp.json()) as { key: string };
  return data.key;
}

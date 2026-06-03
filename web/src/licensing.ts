export type LicenseValidateResponse = {
  valid: boolean;
  license_type?: "personal" | "commercial" | null;
  expires_at?: number | null;
  unlock_all_steps?: boolean | null;
  reason?: string | null;
};

export const LICENSE_STORAGE_KEY = "ymga_license_key";
export const DEVICE_ID_STORAGE_KEY = "ymga_device_id";
export const LICENSE_CAPS_STORAGE_KEY = "ymga_license_caps";
export const CLIENT_SESSION_STORAGE_KEY = "ymga_client_session_id";

export type StoredLicenseCaps = {
  unlock_all_steps: boolean;
};

export function getStoredLicenseKey(): string | null {
  try {
    const v = localStorage.getItem(LICENSE_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function getStoredLicenseCaps(): StoredLicenseCaps {
  try {
    const raw = localStorage.getItem(LICENSE_CAPS_STORAGE_KEY);
    if (!raw) return { unlock_all_steps: false };
    const parsed = JSON.parse(raw) as Partial<StoredLicenseCaps> | null;
    return { unlock_all_steps: Boolean(parsed && parsed.unlock_all_steps) };
  } catch {
    return { unlock_all_steps: false };
  }
}

export function setStoredLicenseCaps(caps: StoredLicenseCaps | null): void {
  try {
    if (!caps) localStorage.removeItem(LICENSE_CAPS_STORAGE_KEY);
    else localStorage.setItem(LICENSE_CAPS_STORAGE_KEY, JSON.stringify({ unlock_all_steps: Boolean(caps.unlock_all_steps) }));
  } catch {
    // ignore
  }
}

export function getLicenseUnlockAllStepsEnabled(): boolean {
  const key = getStoredLicenseKey();
  if (!key) return false;
  return getStoredLicenseCaps().unlock_all_steps;
}

export function setStoredLicenseKey(key: string | null): void {
  try {
    if (!key || !key.trim()) {
      localStorage.removeItem(LICENSE_STORAGE_KEY);
      localStorage.removeItem(LICENSE_CAPS_STORAGE_KEY);
    } else {
      localStorage.setItem(LICENSE_STORAGE_KEY, key.trim());
    }
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

export function getOrCreateClientSessionId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (existing && existing.trim()) return existing.trim();
    const created = _randomId();
    sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
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
  const data = (await resp.json()) as LicenseValidateResponse;
  if (data && data.valid) {
    setStoredLicenseCaps({ unlock_all_steps: Boolean(data.unlock_all_steps) });
  } else {
    setStoredLicenseCaps({ unlock_all_steps: false });
  }
  return data;
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

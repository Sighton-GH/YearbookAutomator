// Plain-English messages for licence validation failures (P3-16).
// `reason` is what licensing.ts returns: "http_<status>" for non-2xx responses,
// or a server-provided reason string for a 200 with valid:false.

export const LICENSE_KEY_INVALID_MESSAGE = "This licence key isn't valid. Check it for typos and try again.";
export const LICENSE_SERVER_UNREACHABLE_MESSAGE =
  "Couldn't reach the licence server \u2014 check your connection and try again.";

export function licenseFailureMessage(reason?: string | null): string {
  const m = /^http_(\d{3})$/.exec(String(reason || ""));
  if (m) {
    const status = Number(m[1]);
    if (status >= 400 && status < 500) return LICENSE_KEY_INVALID_MESSAGE;
    return LICENSE_SERVER_UNREACHABLE_MESSAGE;
  }
  return LICENSE_KEY_INVALID_MESSAGE;
}

// A thrown error from fetch() (offline, DNS, CORS) is a connection problem, not a key problem.
export function licenseThrownMessage(_err: unknown): string {
  return LICENSE_SERVER_UNREACHABLE_MESSAGE;
}

export function formatLockCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Takeover failures -> plain text. Status is the HTTP status of POST /api/workspaces/takeover.
export function takeoverFailureMessage(status?: number | null): string {
  if (status === 401 || status === 403) {
    return "Taking over isn't available on this account. Ask the other person to release the session, or wait for it to expire.";
  }
  if (status === 400) {
    return "Taking over isn't enabled for this licence. Ask the other person to release the session, or wait for it to expire.";
  }
  return "Couldn't take over the session. Try again in a moment.";
}

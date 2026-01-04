export type ConfigFileV1<TSession> = {
  v: 1;
  kind: "ymga_config";
  created_at: string;
  session: TSession;
};

export type MissingAsset = { kind: "baby" | "mugshot"; filename: string };

export function safeIsoForFilename(d: Date): string {
  // YYYY-MM-DD_HHMMSS
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readTextFile(file: File): Promise<string> {
  return await file.text();
}

export function describeApiError(err: unknown, fallback: string): string {
  const anyErr: any = err;
  const detail = anyErr?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  const reason = anyErr?.response?.data?.reason;
  const hint = anyErr?.response?.data?.hint;
  if (typeof reason === "string" && reason.trim()) {
    const h = typeof hint === "string" && hint.trim() ? ` — ${hint}` : "";
    return `${fallback}: ${reason}${h}`;
  }
  if (anyErr?.message && String(anyErr.message).trim()) return String(anyErr.message);
  return fallback;
}

export function parseConfigText<TSession>(
  text: string,
  isSession: (x: unknown) => x is TSession,
): ConfigFileV1<TSession> {
  const parsed = JSON.parse(text);

  // Preferred shape: { v:1, kind:'ymga_config', created_at, session }
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as any).v === 1 &&
    (parsed as any).kind === "ymga_config" &&
    "session" in (parsed as any)
  ) {
    const session = (parsed as any).session;
    if (!isSession(session)) throw new Error("Invalid config: missing/invalid session payload");
    return {
      v: 1,
      kind: "ymga_config",
      created_at: typeof (parsed as any).created_at === "string" ? (parsed as any).created_at : new Date().toISOString(),
      session,
    };
  }

  // Back-compat: treat a raw PersistedSession-like object as the session.
  if (isSession(parsed)) {
    return {
      v: 1,
      kind: "ymga_config",
      created_at: new Date().toISOString(),
      session: parsed,
    };
  }

  throw new Error("Invalid config file (expected v=1 ymga_config)");
}

export async function readConfigFile<TSession>(
  file: File,
  isSession: (x: unknown) => x is TSession,
): Promise<ConfigFileV1<TSession>> {
  const text = await readTextFile(file);
  return parseConfigText(text, isSession);
}

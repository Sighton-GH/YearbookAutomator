import type { Area } from "react-easy-crop";
import type { BackgroundMode, PersonRecord, TemplateSlots } from "./api";
import type { Align, FontWeight, PlacementMode } from "./types";

export type TopStep = "template" | "roster" | "people" | "style" | "generate";
export type EditTab = "layout" | "people" | "style";

export const TOP_STEP_ORDER: TopStep[] = ["template", "roster", "people", "style", "generate"];

export type PersistedSessionV1 = {
  v: 1;
  renderConfirmed?: boolean;
  sessionId?: string;
  startedAtMs?: number;
  expiresAtMs?: number;
  activeStep: number | TopStep;
  editTab?: EditTab;
  workspaceId: string | null;
  templateId: string | null;
  skipQuotes?: boolean;
  skipBabyPhotos?: boolean;
  templateParse?: {
    mugshotColor?: string;
    babyColor?: string;
    nameColor?: string;
    quoteColor?: string;
    minArea?: number;
    tolerance?: number;
  };
  slots: TemplateSlots[];
  parsedSlots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
  portraitsIngest?: {
    namingPattern?: string;
    filenameColumn?: string | null;
    filenameCandidates?: import("./api").FilenameColumnCandidate[];
    advancedNameMatch?: boolean;
    allowInsecureUploads?: boolean;
  };
  people: PersonRecord[];
  peopleSwapMode?: "off" | "card" | "portrait";
  pendingPeopleAdjustments?: Record<number, import("./components/PersonInspector").PersonAdjustment>;
  originalPeople?: Array<Pick<PersonRecord, "index" | "mugshot_filename" | "baby_photo_filename">>;
  originalBabyPeople?: Array<Pick<PersonRecord, "index" | "mugshot_filename" | "baby_photo_filename">>;
  slotAssignments: Record<number, number>;
  placementMode?: PlacementMode;
  forceAlphabetical?: boolean;
  defaultQuote?: string;
  defaultQuotes?: string[];
  defaultQuotesRandomize?: boolean;
  defaultQuotesSeed?: number;
  defaultBabyFilename: string | null;
  babyIngest?: {
    advancedNameMatch?: boolean;
    partialNameMatch?: boolean;
    convertPdfs?: boolean;
    removeBackground?: boolean;
    backgroundMode?: BackgroundMode;
    allowInsecureUploads?: boolean;
  };
  babyEditHistory?: Array<{
    kind: "baby";
    person_index: number;
    input_filename: string;
    output_filename: string;
    crop_area_pixels: Area;
    export_size: { width: number; height: number };
    rotation_degrees?: number;
    used_background_preview?: { background_mode: BackgroundMode; force?: boolean } | null;
    created_at: string;
  }>;
  babyBackgroundColor?: string;
  centerBabyOnFace?: boolean;
  defaultMugshotFilename?: string | null;
  defaultMugshotFilenames?: string[];
  defaultMugshotRandomize?: boolean;
  defaultMugshotSeed?: number;
  lockedPeople?: number[];
  nameFontFamily: string;
  nameFontWeight: FontWeight;
  nameFontSize: number;
  nameAllCaps: boolean;
  nameAlign: Align;
  quoteFontFamily: string;
  quoteFontWeight: FontWeight;
  quoteFontSize: number;
  quoteAllCaps: boolean;
  quoteAlign: Align;
  /** F1 text controls (colour, spacing, outline, shadow, italic, fitting). Missing in old sessions = today's look. */
  textStyles?: import("./utils/textStyle").TextStylesSetting;
  peoplePerSpread: number;
  outputFormat?: "png" | "pdf" | "tiff";
  outputSize?: { width: number; height: number } | null;
  generationOutputs?: {
    previewPath?: string | null;
    outputPath?: string | null;
    outputPaths?: string[];
  };
};

export const isPersistedSessionV1 = (x: unknown): x is PersistedSessionV1 => {
  const anyX: any = x;
  if (!anyX || typeof anyX !== "object") return false;
  if (anyX.v !== 1) return false;
  if (!Array.isArray(anyX.slots)) return false;
  if (!Array.isArray(anyX.parsedSlots)) return false;
  if (!Array.isArray(anyX.people)) return false;
  return true;
};

export const SESSION_KEY = "ymga.session.v1";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

const readStorageItem = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  const storages: Storage[] = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    try {
      const raw = storage.getItem(key);
      if (raw) return raw;
    } catch {
      // ignore storage availability/privacy mode
    }
  }
  return null;
};

const writeStorageItem = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  const storages: Storage[] = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    try {
      storage.setItem(key, value);
      return;
    } catch {
      // try next storage
    }
  }
};

const removeStorageItem = (key: string): void => {
  if (typeof window === "undefined") return;
  const storages: Storage[] = [window.localStorage, window.sessionStorage];
  for (const storage of storages) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
  }
};

export function createSessionIdentity(nowMs = Date.now(), ttlMs = SESSION_TTL_MS): {
  sessionId: string;
  startedAtMs: number;
  expiresAtMs: number;
} {
  const rand = Math.random().toString(36).slice(2, 10);
  const safeTtlMs = Math.max(60_000, Math.floor(ttlMs));
  return {
    sessionId: `sess_${nowMs}_${rand}`,
    startedAtMs: nowMs,
    expiresAtMs: nowMs + safeTtlMs,
  };
}

export function ensureSessionTiming(session: PersistedSessionV1, nowMs = Date.now(), ttlMs = SESSION_TTL_MS): PersistedSessionV1 {
  const startedAtMs =
    typeof session.startedAtMs === "number" && Number.isFinite(session.startedAtMs)
      ? session.startedAtMs
      : nowMs;
  const safeTtlMs = Math.max(60_000, Math.floor(ttlMs));
  const expiresAtMs =
    typeof session.expiresAtMs === "number" && Number.isFinite(session.expiresAtMs)
      ? Math.min(session.expiresAtMs, startedAtMs + safeTtlMs)
      : (startedAtMs + safeTtlMs);
  const sessionId =
    typeof session.sessionId === "string" && session.sessionId.trim()
      ? session.sessionId
      : createSessionIdentity(startedAtMs).sessionId;
  return {
    ...session,
    sessionId,
    startedAtMs,
    expiresAtMs,
  };
}

export function getRemainingSessionMs(session: PersistedSessionV1, nowMs = Date.now()): number {
  const normalized = ensureSessionTiming(session, nowMs);
  return Math.max(0, normalized.expiresAtMs! - nowMs);
}

export function isSessionExpired(session: PersistedSessionV1, nowMs = Date.now()): boolean {
  return getRemainingSessionMs(session, nowMs) <= 0;
}

// Maps legacy step identifiers onto the current 5-step model so old saved sessions/configs and
// bookmarked `?step=` URLs keep working across two redesigns:
//   - 8-step numeric wizard (0-7)
//   - the interim 3-phase model ("import" | "edit" | "finalize")
const isTopStep = (x: unknown): x is TopStep =>
  TOP_STEP_ORDER.includes(x as TopStep);

export function migrateActiveStep(raw: number | TopStep | string | null | undefined): TopStep {
  if (isTopStep(raw)) return raw;
  // Interim 3-phase model.
  if (raw === "import") return "template";
  if (raw === "edit") return "people";
  if (raw === "finalize") return "generate";
  // Legacy 8-step numeric wizard.
  const n = typeof raw === "number" && Number.isFinite(raw) ? raw : Number(raw);
  if (!Number.isFinite(n)) return "template";
  if (n <= 1) return "template"; // template parse / review
  if (n === 2) return "roster"; // spreadsheet + portrait ingest
  if (n <= 5) return "people"; // mapping review / quotes / baby
  if (n === 6) return "style"; // styling
  return "generate"; // render / results
}

export function parseStepFromSearch(search: string): TopStep | null {
  try {
    const params = new URLSearchParams(search || "");
    const raw = (params.get("step") || "").trim().toLowerCase();
    if (!raw) return null;
    if (isTopStep(raw)) return raw;
    if (raw === "import" || raw === "edit" || raw === "finalize") return migrateActiveStep(raw);
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return migrateActiveStep(Math.floor(n));
  } catch {
    return null;
  }
}

export function tryLoadSession(ttlMs = SESSION_TTL_MS): PersistedSessionV1 | null {
  try {
    const raw = readStorageItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionV1;
    if (!parsed || parsed.v !== 1) return null;
    const withTiming = ensureSessionTiming(parsed, Date.now(), ttlMs);
    if (isSessionExpired(withTiming)) {
      clearSession();
      return null;
    }
    return withTiming;
  } catch {
    return null;
  }
}

export function trySaveSession(session: PersistedSessionV1, ttlMs = SESSION_TTL_MS) {
  try {
    const withTiming = ensureSessionTiming(session, Date.now(), ttlMs);
    writeStorageItem(SESSION_KEY, JSON.stringify(withTiming));
  } catch {
    // ignore quota / privacy mode
  }
}

export function clearSession() {
  try {
    removeStorageItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

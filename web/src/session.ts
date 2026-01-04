import type { Area } from "react-easy-crop";
import type { BackgroundMode, PersonRecord, TemplateSlots } from "./api";
import type { Align, FontWeight, PlacementMode } from "./types";

export type PersistedSessionV1 = {
  v: 1;
  activeStep: number;
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
  };
  slots: TemplateSlots[];
  parsedSlots: TemplateSlots[];
  templateSize: { width: number; height: number } | null;
  portraitsIngest?: {
    namingPattern?: string;
    advancedNameMatch?: boolean;
    allowInsecureUploads?: boolean;
  };
  people: PersonRecord[];
  slotAssignments: Record<number, number>;
  placementMode?: PlacementMode;
  forceAlphabetical?: boolean;
  defaultQuote: string;
  defaultBabyFilename: string | null;
  babyIngest?: {
    advancedNameMatch?: boolean;
    partialNameMatch?: boolean;
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
    used_background_preview?: { background_mode: BackgroundMode; force?: boolean } | null;
    created_at: string;
  }>;
  babyBackgroundColor?: string;
  centerBabyOnFace?: boolean;
  defaultMugshotFilename?: string | null;
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
  peoplePerSpread: number;
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

export function parseStepFromSearch(search: string): number | null {
  try {
    const params = new URLSearchParams(search || "");
    const raw = (params.get("step") || "").trim();
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const i = Math.floor(n);
    if (i < 0) return 0;
    if (i > 7) return 7;
    return i;
  } catch {
    return null;
  }
}

export function tryLoadSession(): PersistedSessionV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSessionV1;
    if (!parsed || parsed.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function trySaveSession(session: PersistedSessionV1) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore quota / privacy mode
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

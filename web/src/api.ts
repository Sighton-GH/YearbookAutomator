import axios from "axios";
import { getOrCreateDeviceId, getStoredLicenseKey } from "./licensing";

axios.interceptors.request.use((config) => {
  const key = getStoredLicenseKey();
  const deviceId = getOrCreateDeviceId();
  if (key) {
    config.headers = config.headers ?? {};
    config.headers["X-License-Key"] = key;
  }
  if (deviceId) {
    config.headers = config.headers ?? {};
    config.headers["X-Device-Id"] = deviceId;
  }
  return config;
});

export type Box = { x: number; y: number; width: number; height: number };
export type TemplateSlots = { mugshot: Box; baby_photo: Box; name: Box; quote: Box };
export type RawParseDebug = {
  mugshot_count: number;
  baby_count: number;
  name_count: number;
  quote_count: number;
  mugshots: Box[];
  baby_photos: Box[];
  names: Box[];
  quotes: Box[];
};
export type TemplateParseResponse = {
  template_id: string;
  width: number;
  height: number;
  slots: TemplateSlots[];
  raw_debug?: RawParseDebug | null;
};

export type PersonRecord = {
  index: number;
  first_name: string;
  last_name: string;
  mugshot_filename?: string | null;
  quote?: string | null;
  baby_photo_filename?: string | null;
};

export type BackgroundMode = "simple" | "complex" | "ultra_complex";

export type SpreadsheetPreview = {
  workspace_id: string;
  people: PersonRecord[];
  warnings?: string[];
};

export async function parseTemplate(
  annotated: File | null,
  clean: File | null,
  opts?: {
    workspaceId?: string;
    mugshotColor?: string;
    babyColor?: string;
    nameColor?: string;
    quoteColor?: string;
    minArea?: number;
  }
) {
  const form = new FormData();
  if (annotated) form.append("annotated_template", annotated);
  if (clean) form.append("clean_template", clean);
  if (opts?.workspaceId) form.append("workspace_id", opts.workspaceId);
  if (opts?.mugshotColor) form.append("mugshot_color", opts.mugshotColor);
  if (opts?.babyColor) form.append("baby_color", opts.babyColor);
  if (opts?.nameColor) form.append("name_color", opts.nameColor);
  if (opts?.quoteColor) form.append("quote_color", opts.quoteColor);
  if (opts?.minArea) form.append("min_area", String(opts.minArea));
  const { data } = await axios.post<TemplateParseResponse>("/api/templates/parse", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function ingestSpreadsheet(
  workspaceId: string,
  sheet?: File | null,
  mugshotsZip?: File | null,
  opts?: {
    namingPattern?: string;
    advancedNameMatch?: boolean;
    signal?: AbortSignal;
    onProgress?: (progressPct: number) => void;
  }
) {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  if (sheet) form.append("spreadsheet", sheet);
  if (mugshotsZip) form.append("mugshots_zip", mugshotsZip);
  if (opts?.namingPattern) form.append("naming_pattern", opts.namingPattern);
  if (opts?.advancedNameMatch) form.append("advanced_name_match", "true");
  const { data } = await axios.post<SpreadsheetPreview>("/api/mapping/ingest", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: opts?.signal,
    onUploadProgress: opts?.onProgress
      ? (evt) => {
          const total = evt.total ?? 0;
          if (!total) return;
          const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100)));
          opts.onProgress?.(pct);
        }
      : undefined,
  });
  return data;
}

export async function uploadImage(
  workspaceId: string,
  kind: "baby" | "mugshot",
  file: File,
  opts?: {
    removeBackground?: boolean;
    backgroundMode?: BackgroundMode;
    signal?: AbortSignal;
    onProgress?: (progressPct: number) => void;
  }
): Promise<string> {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  form.append("kind", kind);
  // Ensure every upload gets a unique filename to avoid overwriting server-side
  // and to defeat browser caching for <img src> previews.
  const uniqueFileName = (() => {
    const original = (file.name || `${kind}.png`).split(/[\\/]/).pop() || `${kind}.png`;
    const dot = original.lastIndexOf(".");
    const baseRaw = dot > 0 ? original.slice(0, dot) : original;
    const ext = dot > 0 ? original.slice(dot) : ".png";
    const safeBase = (baseRaw || kind).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 40) || kind;
    const rand = Math.random().toString(16).slice(2, 10);
    return `${safeBase}_${Date.now()}_${rand}${ext}`;
  })();
  const uploadFile = new File([file], uniqueFileName, {
    type: file.type || "application/octet-stream",
    lastModified: file.lastModified,
  });
  form.append("file", uploadFile);
  if (opts?.removeBackground) form.append("remove_background", "true");
  if (opts?.backgroundMode) form.append("background_mode", opts.backgroundMode);
  const { data } = await axios.post<{ filename: string }>("/api/mapping/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: opts?.signal,
    onUploadProgress: opts?.onProgress
      ? (evt) => {
          const total = evt.total ?? 0;
          if (!total) return;
          const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100)));
          opts.onProgress?.(pct);
        }
      : undefined,
  });
  return data.filename;
}

export async function uploadBabyZip(
  workspaceId: string,
  people: PersonRecord[],
  babyZip?: File | null,
  opts?: {
    advancedNameMatch?: boolean;
    partialNameMatch?: boolean;
    removeBackground?: boolean;
    backgroundMode?: BackgroundMode;
    signal?: AbortSignal;
    onProgress?: (progressPct: number) => void;
  }
) {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  form.append("people_json", JSON.stringify(people));
  if (babyZip) form.append("baby_zip", babyZip);
  if (opts?.advancedNameMatch) form.append("advanced_name_match", "true");
  if (opts?.partialNameMatch) form.append("partial_name_match", "true");
  if (opts?.removeBackground) form.append("remove_background", "true");
  if (opts?.backgroundMode) form.append("background_mode", opts.backgroundMode);
  const { data } = await axios.post<SpreadsheetPreview>("/api/mapping/upload-baby-zip", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: opts?.signal,
    onUploadProgress: opts?.onProgress
      ? (evt) => {
          const total = evt.total ?? 0;
          if (!total) return;
          const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100)));
          opts.onProgress?.(pct);
        }
      : undefined,
  });
  return data;
}

export async function uploadQuotesSpreadsheet(
  workspaceId: string,
  people: PersonRecord[],
  quotesSheet?: File | null,
  opts?: { advancedNameMatch?: boolean; signal?: AbortSignal; onProgress?: (progressPct: number) => void }
) {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  form.append("people_json", JSON.stringify(people));
  if (quotesSheet) form.append("quotes_spreadsheet", quotesSheet);
  if (opts?.advancedNameMatch) form.append("advanced_name_match", "true");
  const { data } = await axios.post<SpreadsheetPreview>("/api/mapping/upload-quotes-spreadsheet", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: opts?.signal,
    onUploadProgress: opts?.onProgress
      ? (evt) => {
          const total = evt.total ?? 0;
          if (!total) return;
          const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / total) * 100)));
          opts.onProgress?.(pct);
        }
      : undefined,
  });
  return data;
}

export async function applyMapping(
  workspaceId: string,
  people: PersonRecord[],
  decisions: { person_index: number; action: "keep" | "replace" | "shift" | "skip" | "remove"; replacement_mugshot?: string }[]
) {
  const { data } = await axios.post<SpreadsheetPreview>("/api/mapping/review", {
    workspace_id: workspaceId,
    people,
    decisions
  });
  return data;
}

export async function generateSpread(params: {
  workspace_id: string;
  template_id: string;
  slots: TemplateSlots[];
  people: PersonRecord[];
  count_usage?: boolean;
  auto_place?: boolean;
  placement_mode?: "left_then_right" | "simultaneous";
  force_alphabetical?: boolean;
  slot_assignments?: Record<number, number>;
  output_filename?: string;
  default_quote?: string;
  default_mugshot_filename?: string | null;
  default_baby_photo_filename?: string | null;
  font_family: string;
  font_weight: "normal" | "bold";
  all_caps: boolean;
  align: "left" | "center";
  name_font_family?: string;
  name_font_weight?: "normal" | "bold";
  name_font_size?: number;
  name_all_caps?: boolean;
  name_align?: "left" | "center";
  quote_font_family?: string;
  quote_font_weight?: "normal" | "bold";
  quote_font_size?: number;
  quote_all_caps?: boolean;
  quote_align?: "left" | "center";
  baby_background_color?: string | null;
  center_baby_on_face?: boolean;
}) {
  const { data } = await axios.post<{
    job_id: string;
    usage?: { remaining: number; limit: number; period: "month" | "lifetime" };
  }>("/api/generation/generate", params);
  return { jobId: data.job_id, usage: data.usage };
}

export async function generationStatus(jobId: string) {
  const { data } = await axios.get<{
    progress: number;
    status: string;
    output?: string | null;
    error?: string | null;
    updated_at?: number;
    workspace_id?: string;
  }>("/api/generation/status", { params: { job_id: jobId } });
  return data;
}

export async function listFonts(workspaceId?: string) {
  const { data } = await axios.get<{ system: { name: string; filename: string }[]; uploaded: { name: string; filename: string }[] }>(
    "/api/fonts/list",
    { params: workspaceId ? { workspace_id: workspaceId } : {} }
  );
  return data;
}

export async function uploadFont(workspaceId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  form.append("file", file);
  const { data } = await axios.post<{ filename: string }>("/api/fonts/upload", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data.filename;
}

export async function startRemoveBackgroundJob(params: {
  workspaceId: string;
  kind: "baby" | "mugshot";
  filename: string;
  backgroundMode: BackgroundMode;
}) {
  const form = new FormData();
  form.append("workspace_id", params.workspaceId);
  form.append("kind", params.kind);
  form.append("filename", params.filename);
  form.append("background_mode", params.backgroundMode);
  const { data } = await axios.post<{ job_id: string; output_filename: string }>("/api/mapping/remove-background", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function removeBackgroundStatus(jobId: string) {
  const { data } = await axios.get<{
    job_id: string;
    workspace_id: string;
    kind: string;
    mode: string;
    source_filename: string;
    output_filename: string;
    progress: number;
    status: string;
    message?: string | null;
    error?: string | null;
    eta_seconds?: number | null;
    updated_at?: number;
    already_removed?: boolean;
  }>("/api/mapping/remove-background-status", { params: { job_id: jobId } });
  return data;
}

export async function startRemoveBackgroundPreviewJob(params: {
  workspaceId: string;
  kind: "baby" | "mugshot";
  filename: string;
  backgroundMode: BackgroundMode;
  force?: boolean;
}) {
  const form = new FormData();
  form.append("workspace_id", params.workspaceId);
  form.append("kind", params.kind);
  form.append("filename", params.filename);
  form.append("background_mode", params.backgroundMode);
  if (params.force) form.append("force", "true");
  const { data } = await axios.post<{ job_id: string }>("/api/mapping/remove-background-preview", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function removeBackgroundPreviewStatus(jobId: string) {
  // Same payload shape as removeBackgroundStatus.
  return removeBackgroundStatus(jobId);
}

export async function fetchRemoveBackgroundPreviewResult(jobId: string): Promise<Blob> {
  const resp = await axios.get("/api/mapping/remove-background-preview-result", {
    params: { job_id: jobId },
    responseType: "blob"
  });
  return resp.data as Blob;
}

export async function touchWorkspace(workspaceId: string): Promise<void> {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  await axios.post("/api/workspaces/touch", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
}

export async function deleteWorkspace(workspaceId: string): Promise<boolean> {
  const { data } = await axios.delete<{ deleted: boolean }>(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
  return Boolean(data.deleted);
}

function addLicenseParams(params: URLSearchParams) {
  const key = getStoredLicenseKey();
  const deviceId = getOrCreateDeviceId();
  if (key) params.set("license_key", key);
  if (deviceId) params.set("device_id", deviceId);
}

export function assetUrl(workspaceId: string, kind: "mugshot" | "baby", filename: string) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    kind,
    filename
  });
  addLicenseParams(params);
  return `/api/mapping/asset?${params.toString()}`;
}

export function babyMaskUrl(workspaceId: string, box: Box) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    x: String(Math.round(box.x)),
    y: String(Math.round(box.y)),
    width: String(Math.round(box.width)),
    height: String(Math.round(box.height))
  });
  addLicenseParams(params);
  return `/api/mapping/baby-mask?${params.toString()}`;
}

export function templateCleanUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  addLicenseParams(params);
  return `/api/templates/clean?${params.toString()}`;
}

export function templateAnnotatedUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  addLicenseParams(params);
  return `/api/templates/annotated?${params.toString()}`;
}

export function generationDownloadUrl(
  workspaceId: string,
  filename: string,
  extra?: Record<string, string>
) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    filename
  });
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  addLicenseParams(params);
  return `/api/generation/download?${params.toString()}`;
}

export function generationDownloadAllUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  addLicenseParams(params);
  return `/api/generation/download-all?${params.toString()}`;
}

export function generationDownloadSpreadsheetUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  addLicenseParams(params);
  return `/api/generation/download-spreadsheet?${params.toString()}`;
}

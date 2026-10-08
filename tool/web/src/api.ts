import axios from "axios";
import { getOrCreateClientSessionId, getOrCreateDeviceId, getStoredLicenseKey } from "./licensing";

axios.interceptors.request.use((config) => {
  const key = getStoredLicenseKey();
  const deviceId = getOrCreateDeviceId();
  const clientSessionId = getOrCreateClientSessionId();
  if (key) {
    config.headers = config.headers ?? {};
    config.headers["X-License-Key"] = key;
  }
  if (deviceId) {
    config.headers = config.headers ?? {};
    config.headers["X-Device-Id"] = deviceId;
  }
  if (clientSessionId) {
    config.headers = config.headers ?? {};
    config.headers["X-Client-Session-Id"] = clientSessionId;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url;
    if (
      status === 401 &&
      typeof url === "string" &&
      url.startsWith("/api/") &&
      !url.startsWith("/api/licensing/")
    ) {
      try {
        window.dispatchEvent(
          new CustomEvent("ymga:license-invalid", {
            detail: { reason: error?.response?.data?.reason ?? null },
          })
        );
      } catch {
        // ignore dispatch failures (e.g. no window); error is still re-thrown below
      }
    }
    throw error;
  }
);

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
  dropped?: Record<string, Box[]>;
  invented?: Record<string, Box[]>;
  messages?: string[];
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
  quote_blank?: boolean;
  baby_photo_filename?: string | null;
  baby_background_removal_failed?: boolean;
};

export type BackgroundMode = "simple" | "complex" | "ultra_complex";

export type FilenameColumnCandidate = {
  column: string;
  listed: number;
  found: number;
  suggested: boolean;
};

export type SpreadsheetPreview = {
  workspace_id: string;
  people: PersonRecord[];
  warnings?: string[];
  /** F2.6 (partial: not yet used by the UI). Roster columns that look like portrait filenames. */
  filename_column_candidates?: FilenameColumnCandidate[];
};

export type FaceCenterResponse = {
  found: boolean;
  reason?: "unavailable" | "not_found" | null;
  center_x: number | null;
  center_y: number | null;
  face_width?: number | null;
  face_height?: number | null;
  detector?: "yunet" | "retinaface" | "haar" | null;
  detector_rotation_cw?: number | null;
  width: number;
  height: number;
};

export type AdminFeatureFlags = {
  enable_background_removal_ops?: boolean;
  enable_center_on_face_ops?: boolean;
  enable_heavy_generation_ops?: boolean;
  personal_workspace_timeout_seconds?: number;
  workspace_lock_timeout_seconds?: number;
  workspace_heartbeat_interval_seconds?: number;
  workspace_cleanup_interval_seconds?: number;
  auto_delete_expired_workspaces?: boolean;
  enable_admin_workspace_takeover?: boolean;
  commercial_workspace_key_mode?: "license_only" | "license_and_device";
  workspace_audit_retention_days?: number;
  enable_quotes_feature?: boolean;
  enable_baby_photos_feature?: boolean;
  enable_pdf_output?: boolean;
  enable_tiff_output?: boolean;
  enable_alphabetical_sort_option?: boolean;
  enable_advanced_name_matching?: boolean;
  enable_custom_font_upload?: boolean;
};

export type WorkspaceResolveResponse = {
  ok: boolean;
  workspace_id: string | null;
  license_type: "personal" | "commercial";
  created_new: boolean;
  recreated_after_expiry: boolean;
  state: "ready" | "expired_recreated";
  expires_at_ms: number | null;
  expiry_disabled: boolean;
};

export type WorkspaceStateResponse = {
  workspace_id: string;
  default_baby_filename: string | null;
  default_mugshot_filenames: string[];
  session_snapshot?: Record<string, unknown> | null;
  session_updated_at_ms?: number | null;
};

export type GenerationOutputsResponse = {
  workspace_id: string;
  preview: string | null;
  outputs: string[];
};

export async function getAdminFeatureFlags() {
  const { data } = await axios.get<AdminFeatureFlags>("/api/admin/settings/features");
  return data;
}

export async function parseTemplate(
  annotated: File | null,
  clean: File | null,
  opts?: {
    workspaceId?: string;
    mugshotColor?: string;
    babyColor?: string;
    nameColor?: string;
    quoteColor?: string;
    disableBabyPhotos?: boolean;
    disableQuotes?: boolean;
    minArea?: number;
    tolerance?: number;
    signal?: AbortSignal;
    onProgress?: (progressPct: number) => void;
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
  if (opts?.disableBabyPhotos) form.append("disable_baby_photos", "true");
  if (opts?.disableQuotes) form.append("disable_quotes", "true");
  if (opts?.minArea) form.append("min_area", String(opts.minArea));
  if (opts?.tolerance !== undefined) form.append("tolerance", String(opts.tolerance));
  const { data } = await axios.post<TemplateParseResponse>("/api/templates/parse", form, {
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

export async function detectFaceCenter(image: File | Blob) {
  const form = new FormData();
  const file = image instanceof File ? image : new File([image], "image.png", { type: image.type || "image/png" });
  form.append("image", file);
  const { data } = await axios.post<FaceCenterResponse>("/api/mapping/detect-face-center", form, {
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
    /** F2.6: roster column naming each student's portrait file. */
    filenameColumn?: string | null;
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
  if (opts?.filenameColumn) form.append("filename_column", opts.filenameColumn);
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

// Like uploadImage, but preserves the exact filename provided.
// Used for config import to restore references to specific filenames.
export async function uploadImageAs(
  workspaceId: string,
  kind: "baby" | "mugshot",
  file: File,
  desiredFilename: string,
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

  const safeName = (desiredFilename || file.name || `${kind}.png`).split(/[\\/]/).pop() || `${kind}.png`;
  const uploadFile = new File([file], safeName, {
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
    convertPdfs?: boolean;
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
  form.append("advanced_name_match", opts?.advancedNameMatch === false ? "false" : "true");
  form.append("partial_name_match", opts?.partialNameMatch ? "true" : "false");
  if (opts?.convertPdfs) form.append("convert_pdfs", "true");
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
  form.append("advanced_name_match", opts?.advancedNameMatch === false ? "false" : "true");
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
  decisions: { person_index: number; action: "keep" | "replace" | "shift" | "shift_up" | "skip" | "remove"; replacement_mugshot?: string }[]
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
  output_format?: "png" | "pdf" | "tiff";
  output_width?: number;
  output_height?: number;
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
    warnings?: string[];
    updated_at?: number;
    workspace_id?: string;
  }>("/api/generation/status", { params: { job_id: jobId } });
  return data;
}

export async function cancelGeneration(jobId: string, workspaceId: string): Promise<boolean> {
  const { data } = await axios.post<{ ok: boolean }>("/api/generation/cancel", {
    job_id: jobId,
    workspace_id: workspaceId,
  });
  return Boolean(data.ok);
}

export async function generationListOutputs(workspaceId: string): Promise<GenerationOutputsResponse> {
  const { data } = await axios.get<GenerationOutputsResponse>("/api/generation/outputs", {
    params: { workspace_id: workspaceId },
  });
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

export async function cleanupEditorImages(workspaceId: string, candidates: string[], protectedFilenames: string[]) {
  await axios.post("/api/mapping/editor-images-cleanup", {
    workspace_id: workspaceId, candidates, protected_filenames: protectedFilenames,
  });
}

export async function cancelRemoveBackgroundJob(jobId: string) {
  const form = new FormData();
  form.append("job_id", jobId);
  await axios.post("/api/mapping/remove-background-cancel", form);
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
    warnings?: string[];
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

export async function touchWorkspace(
  workspaceId: string,
  opts?: { sessionId?: string; startedAtMs?: number; expiresAtMs?: number }
): Promise<void> {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  if (opts?.sessionId) form.append("session_id", opts.sessionId);
  if (typeof opts?.startedAtMs === "number" && Number.isFinite(opts.startedAtMs)) {
    form.append("started_at_ms", String(Math.floor(opts.startedAtMs)));
  }
  if (typeof opts?.expiresAtMs === "number" && Number.isFinite(opts.expiresAtMs)) {
    form.append("expires_at_ms", String(Math.floor(opts.expiresAtMs)));
  }
  await axios.post("/api/workspaces/touch", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
}

export async function resolveWorkspace(sessionId?: string): Promise<WorkspaceResolveResponse> {
  const { data } = await axios.post<WorkspaceResolveResponse>("/api/workspaces/resolve", {
    session_id: sessionId || null,
  });
  return data;
}

export async function releaseWorkspace(workspaceId: string, sessionId?: string): Promise<void> {
  await axios.post("/api/workspaces/release", {
    workspace_id: workspaceId,
    session_id: sessionId || null,
  });
}

export async function takeoverWorkspace(workspaceId: string, sessionId?: string): Promise<void> {
  await axios.post("/api/workspaces/takeover", {
    workspace_id: workspaceId,
    session_id: sessionId || null,
  });
}

export async function getWorkspaceState(workspaceId: string): Promise<WorkspaceStateResponse> {
  const { data } = await axios.get<WorkspaceStateResponse>("/api/workspaces/state", {
    params: { workspace_id: workspaceId },
  });
  return data;
}

export async function setWorkspaceState(params: {
  workspaceId: string;
  defaultBabyFilename: string | null;
  defaultMugshotFilenames: string[];
  sessionSnapshot?: Record<string, unknown> | null;
  sessionUpdatedAtMs?: number | null;
}): Promise<WorkspaceStateResponse> {
  const { data } = await axios.post<WorkspaceStateResponse>("/api/workspaces/state", {
    workspace_id: params.workspaceId,
    default_baby_filename: params.defaultBabyFilename || null,
    default_mugshot_filenames: params.defaultMugshotFilenames,
    session_snapshot: params.sessionSnapshot || null,
    session_updated_at_ms: params.sessionUpdatedAtMs || null,
  });
  return data;
}

export async function deleteWorkspace(workspaceId: string): Promise<boolean> {
  const { data } = await axios.delete<{ deleted: boolean }>(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
  return Boolean(data.deleted);
}

export function assetUrl(workspaceId: string, kind: "mugshot" | "baby", filename: string) {
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    kind,
    filename
  });
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
  return `/api/mapping/baby-mask?${params.toString()}`;
}

export function templateCleanUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  return `/api/templates/clean?${params.toString()}`;
}

export function templateAnnotatedUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
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
  return `/api/generation/download?${params.toString()}`;
}

export function generationDownloadAllUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  return `/api/generation/download-all?${params.toString()}`;
}

export function generationDownloadSpreadsheetUrl(workspaceId: string) {
  const params = new URLSearchParams({ workspace_id: workspaceId });
  return `/api/generation/download-spreadsheet?${params.toString()}`;
}

export async function generationDownloadFile(url: string, filename: string): Promise<void> {
  const { downloadBlobFile } = await import("./utils/downloadFile");
  await downloadBlobFile(url, filename, async (downloadUrl) => {
    const { data } = await axios.get<Blob>(downloadUrl, { responseType: "blob" });
    return data;
  });
}

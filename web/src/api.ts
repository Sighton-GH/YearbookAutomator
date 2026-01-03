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
  opts?: { namingPattern?: string; advancedNameMatch?: boolean }
) {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  if (sheet) form.append("spreadsheet", sheet);
  if (mugshotsZip) form.append("mugshots_zip", mugshotsZip);
  if (opts?.namingPattern) form.append("naming_pattern", opts.namingPattern);
  if (opts?.advancedNameMatch) form.append("advanced_name_match", "true");
  const { data } = await axios.post<SpreadsheetPreview>("/api/mapping/ingest", form, {
    headers: { "Content-Type": "multipart/form-data" }
  });
  return data;
}

export async function uploadImage(
  workspaceId: string,
  kind: "baby" | "mugshot",
  file: File,
  opts?: { removeBackground?: boolean; backgroundMode?: "simple" | "complex"; signal?: AbortSignal }
): Promise<string> {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  form.append("kind", kind);
  form.append("file", file);
  if (opts?.removeBackground) form.append("remove_background", "true");
  if (opts?.backgroundMode) form.append("background_mode", opts.backgroundMode);
  const { data } = await axios.post<{ filename: string }>("/api/mapping/upload-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: opts?.signal
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
    backgroundMode?: "simple" | "complex";
    signal?: AbortSignal;
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
    signal: opts?.signal
  });
  return data;
}

export async function uploadQuotesSpreadsheet(
  workspaceId: string,
  people: PersonRecord[],
  quotesSheet?: File | null,
  opts?: { advancedNameMatch?: boolean; signal?: AbortSignal }
) {
  const form = new FormData();
  form.append("workspace_id", workspaceId);
  form.append("people_json", JSON.stringify(people));
  if (quotesSheet) form.append("quotes_spreadsheet", quotesSheet);
  if (opts?.advancedNameMatch) form.append("advanced_name_match", "true");
  const { data } = await axios.post<SpreadsheetPreview>("/api/mapping/upload-quotes-spreadsheet", form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: opts?.signal
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
}) {
  const { data } = await axios.post<{ job_id: string }>("/api/generation/generate", params);
  return data.job_id;
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

export function assetUrl(workspaceId: string, kind: "mugshot" | "baby", filename: string) {
  return `/api/mapping/asset?workspace_id=${workspaceId}&kind=${kind}&filename=${encodeURIComponent(filename)}`;
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
  return `/api/templates/clean?workspace_id=${encodeURIComponent(workspaceId)}`;
}

export function templateAnnotatedUrl(workspaceId: string) {
  return `/api/templates/annotated?workspace_id=${encodeURIComponent(workspaceId)}`;
}

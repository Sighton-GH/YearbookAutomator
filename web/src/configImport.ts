import type { MissingAsset } from "./configFile";

export type SessionLike = {
  skipBabyPhotos?: boolean;
  defaultBabyFilename?: string | null;
  defaultMugshotFilename?: string | null;
  defaultMugshotFilenames?: string[];
  people?: Array<{
    mugshot_filename?: string | null;
    baby_photo_filename?: string | null;
  }>;
  babyIngest?: {
    advancedNameMatch?: boolean;
    partialNameMatch?: boolean;
    convertPdfs?: boolean;
    removeBackground?: boolean;
    backgroundMode?: "simple" | "complex" | "ultra_complex";
    allowInsecureUploads?: boolean;
  };
  templateParse?: {
    mugshotColor?: string;
    babyColor?: string;
    nameColor?: string;
    quoteColor?: string;
    minArea?: number;
  };
  portraitsIngest?: {
    namingPattern?: string;
    advancedNameMatch?: boolean;
    allowInsecureUploads?: boolean;
  };
};

export function computeImportNeeds(session: SessionLike): { needsPortraits: boolean; needsBaby: boolean } {
  const peopleCount = session.people?.length ?? 0;
  const needsPortraits = peopleCount > 0;

  const needsBaby =
    !Boolean(session.skipBabyPhotos) &&
    (session.people ?? []).some((p) => Boolean(p.baby_photo_filename));

  return { needsPortraits, needsBaby };
}

export async function computeMissingAssets(
  session: SessionLike,
  ws: string,
  buildAssetUrl: (ws: string, kind: "baby" | "mugshot", filename: string) => string,
): Promise<MissingAsset | null> {
  const wanted: MissingAsset[] = [];
  const seen = new Set<string>();

  const add = (kind: "baby" | "mugshot", filename: string | null | undefined) => {
    const f = (filename || "").trim();
    if (!f) return;
    const key = `${kind}:${f}`;
    if (seen.has(key)) return;
    seen.add(key);
    wanted.push({ kind, filename: f });
  };

  for (const p of session.people ?? []) {
    add("mugshot", p.mugshot_filename ?? null);
    add("baby", p.baby_photo_filename ?? null);
  }

  if (Array.isArray(session.defaultMugshotFilenames)) {
    for (const f of session.defaultMugshotFilenames) add("mugshot", f ?? null);
  } else {
    add("mugshot", session.defaultMugshotFilename ?? null);
  }

  for (const it of wanted) {
    try {
      const url = buildAssetUrl(ws, it.kind, it.filename);
      const resp = await fetch(url, { method: "GET" });
      if (!resp.ok) return it;
    } catch {
      // If the check itself fails (offline/etc), don't block import here.
      return null;
    }
  }

  return null;
}

type ParseTemplateFn = (
  annotated: File,
  clean: File,
  opts?: {
    mugshotColor?: string;
    babyColor?: string;
    nameColor?: string;
    quoteColor?: string;
    minArea?: number;
  },
) => Promise<{ template_id: string }>;

type IngestSpreadsheetFn = (
  ws: string,
  spreadsheet: File,
  portraitsZip: File,
  opts?: {
    namingPattern?: string;
    advancedNameMatch?: boolean;
    allowInsecureUploads?: boolean;
    onProgress?: (pct: number) => void;
  },
) => Promise<unknown>;

type UploadBabyZipFn<S extends SessionLike> = (
  ws: string,
  people: NonNullable<S["people"]>,
  babyZip: File,
  opts?: {
    advancedNameMatch?: boolean;
    partialNameMatch?: boolean;
    convertPdfs?: boolean;
    removeBackground?: boolean;
    backgroundMode?: "simple" | "complex" | "ultra_complex";
    onProgress?: (pct: number) => void;
  },
) => Promise<unknown>;

type UploadImageAsFn = (
  ws: string,
  kind: "baby" | "mugshot",
  file: File,
  desiredFilename: string,
) => Promise<string>;

export async function importTemplate<S extends SessionLike>(args: {
  session: S;
  annotated: File;
  clean: File;
  parseTemplate: ParseTemplateFn;
  setStatus?: (s: string) => void;
}): Promise<string> {
  const { session, annotated, clean, parseTemplate, setStatus } = args;
  setStatus?.("Parsing template…");

  const resp = await parseTemplate(annotated, clean, {
    mugshotColor: session.templateParse?.mugshotColor || undefined,
    babyColor: session.templateParse?.babyColor || undefined,
    nameColor: session.templateParse?.nameColor || undefined,
    quoteColor: session.templateParse?.quoteColor || undefined,
    minArea: typeof session.templateParse?.minArea === "number" ? session.templateParse.minArea : undefined,
  });

  setStatus?.("Template parsed. Continue with portraits/spreadsheets if required.");
  return resp.template_id;
}

export async function importPortraits<S extends SessionLike>(args: {
  session: S;
  workspaceId: string;
  spreadsheet: File;
  portraitsZip: File;
  ingestSpreadsheet: IngestSpreadsheetFn;
  setStatus?: (s: string) => void;
}): Promise<void> {
  const { session, workspaceId, spreadsheet, portraitsZip, ingestSpreadsheet, setStatus } = args;
  setStatus?.("Uploading spreadsheet and portraits zip…");

  await ingestSpreadsheet(workspaceId, spreadsheet, portraitsZip, {
    namingPattern: session.portraitsIngest?.namingPattern || undefined,
    advancedNameMatch: Boolean(session.portraitsIngest?.advancedNameMatch),
    allowInsecureUploads: Boolean(session.portraitsIngest?.allowInsecureUploads),
    onProgress: (pct) => setStatus?.(`Uploading spreadsheet and portraits zip… ${Math.round(pct)}%`),
  });

  setStatus?.("Portraits uploaded. Continue with baby photos if required.");
}

export async function importBabyZip<S extends SessionLike>(args: {
  session: S;
  workspaceId: string;
  babyZip: File;
  uploadBabyZip: UploadBabyZipFn<S>;
  setStatus?: (s: string) => void;
}): Promise<void> {
  const { session, workspaceId, babyZip, uploadBabyZip, setStatus } = args;
  setStatus?.("Uploading baby photos zip…");

  await uploadBabyZip(workspaceId, (session.people ?? []) as NonNullable<S["people"]>, babyZip, {
    advancedNameMatch: Boolean(session.babyIngest?.advancedNameMatch ?? true),
    partialNameMatch: Boolean(session.babyIngest?.partialNameMatch ?? true),
    convertPdfs: Boolean(session.babyIngest?.convertPdfs ?? false),
    removeBackground: Boolean(session.babyIngest?.removeBackground ?? false),
    backgroundMode: (session.babyIngest?.backgroundMode as any) || undefined,
    onProgress: (pct) => setStatus?.(`Uploading baby photos zip… ${Math.round(pct)}%`),
  });

  setStatus?.("Baby photos uploaded. Checking for any missing referenced files…");
}

export async function uploadMissingAsset(args: {
  workspaceId: string;
  missing: MissingAsset;
  file: File;
  uploadImageAs: UploadImageAsFn;
  setStatus?: (s: string) => void;
}): Promise<void> {
  const { workspaceId, missing, file, uploadImageAs, setStatus } = args;
  setStatus?.(`Uploading missing ${missing.kind} file '${missing.filename}'…`);
  await uploadImageAs(workspaceId, missing.kind, file, missing.filename);
  setStatus?.("Checking for more missing referenced files…");
}

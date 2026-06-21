// Utility for building URLs that respect Vite's configured base path.
// Vite serves assets relative to `import.meta.env.BASE_URL` (also used for deployments under subpaths).

/**
 * Prefix a relative path with Vite's base URL.
 *
 * - Leaves absolute URLs (http/https) unchanged
 * - Leaves root-absolute paths ("/foo") unchanged
 * - Leaves data/blob URLs unchanged
 */
export function withBase(path: string): string {
  const trimmed = path.trim();

  // Absolute URLs or special schemes: return as-is
  if (/^(https?:)?\/\//i.test(trimmed) || /^(data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  // Root-absolute paths are already fine
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  const base = (import.meta as any).env?.BASE_URL ?? "/";

  // Ensure exactly one slash between base and path.
  const normalizedBase = String(base).endsWith("/") ? String(base) : `${base}/`;
  return `${normalizedBase}${trimmed}`;
}

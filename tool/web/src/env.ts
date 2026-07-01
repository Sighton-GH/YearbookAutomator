// The tool app is deployed separately from the marketing website, so the "back to
// main site" link and license-gate fallback need an absolute URL. Configure via `.env`.
export const WEBSITE_URL = (import.meta.env.VITE_WEBSITE_URL ?? "https://yearbook.sighton.ca").replace(/\/$/, "");

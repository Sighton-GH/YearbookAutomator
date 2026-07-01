// The website is a static site with no backend of its own; the tool (license entry,
// validation, and the actual stepper UI) lives entirely on its own deployment.
// Configure where that is via `.env`.
export const TOOL_URL = (import.meta.env.PUBLIC_TOOL_URL ?? "https://yearbooktool.sighton.ca").replace(/\/$/, "");

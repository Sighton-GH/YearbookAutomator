export function formatEtaSeconds(seconds: number): string {
  if (!Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.round(seconds));
  if (s < 5) return "<5s";
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins <= 0) return `${secs}s`;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${String(remMins).padStart(2, "0")}m`;
}

export function prefixServerMessage(message: unknown): string {
  const header = "Server Message: ";

  let body = String(message ?? "").trim();
  if (!body) return `${header}\n`;

  // Normalize/strip any existing (case-insensitive) "server message:" labels,
  // whether they appear at the start or on their own line.
  body = body.replace(/^\s*server message:\s*/i, "");
  body = body.replace(/(^|\n)\s*server message:\s*/gi, "$1");
  body = body.trim();

  return `${header}\n${body}`;
}

export function scrollPastTopBar() {
  if (typeof window === "undefined") return;
  const topBar = document.querySelector(".ss-topbar") as HTMLElement | null;
  const topBarHeight = topBar?.offsetHeight ?? 0;
  const offset = topBarHeight + 8;

  // In the /tool page, the app is below the cover section. Scroll to the current step
  // (not the top of the whole page), then offset past the navbar.
  const anchor =
    (document.querySelector(".mapping-layout") as HTMLElement | null) ||
    (document.querySelector(".mapping-step") as HTMLElement | null) ||
    (document.querySelector(".panel") as HTMLElement | null);

  if (!anchor) {
    window.scrollTo({ top: offset, behavior: "smooth" });
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const targetTop = Math.max(0, window.scrollY + rect.top - offset);
  window.scrollTo({ top: targetTop, behavior: "smooth" });
}

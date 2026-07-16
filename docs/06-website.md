# Website reference (`website/`)

A static Astro site with React islands for interactive pieces, deployed to Cloudflare Workers as pure static assets (no SSR adapter, no server-side code at all). It carries **no backend and no licensing logic** — see [`01-architecture.md`](01-architecture.md#cross-project-wiring) for how it links to the tool.

## Build & deploy config

- **`astro.config.mjs`** — minimal: just the `@astrojs/react` integration for island hydration. No `output`/`site`/`base`/adapter set, so Astro defaults to a pure static build.
- **`wrangler.jsonc`** — `name: "sighton-yearbook-website"`, `assets.directory: "./dist"`, `html_handling: "auto-trailing-slash"` (matches Astro's `about/index.html`-style output), `not_found_handling: "404-page"` (routes to `dist/404.html`), production custom domain `yearbook.sighton.ca`. No `main` script — this is a pure static-assets Worker.
- **`package.json`** scripts: `dev` (`astro dev`, `:4321`), `build` (`astro build` → `./dist`), `preview` (`astro preview`), `cf:dev` (`astro build && wrangler dev`, serves through the real `workerd` runtime on `:8788`), `deploy` (`astro build && wrangler deploy`).
- No test runner — like `tool/web`, there's no automated test suite for this project either.

## Pages

| File | Route | Renders | Hydration |
|---|---|---|---|
| `index.astro` | `/` | `<AboutPage />` | none |
| `about.astro` | `/about` | `<AboutPage />` | none |
| `how-to-use.astro` | `/how-to-use` | `<DocumentationPage />` | **`client:load`** — the only hydrated page-level island on the site |
| `pricing.astro` | `/pricing` | `<PricingPage />` | none |
| `license.astro` | `/license` | `<LicensePage />` | none |
| `privacy.astro` | `/privacy` | `<PrivacyPage />` | none |
| `404.astro` | (Astro's built-in 404 route) | inline markup, no imported component | none |

`index.astro` and `about.astro` render the **exact same** `AboutPage` component — `/` and `/about` are content-identical under different titles/routes, not two different landing experiences.

Every page's `<title>` follows `"{Page} — Sighton Yearbook Tools"` (em dash) except `index.astro`, which uses `"Sighton Yearbook Tools — Custom Flow Automator"` (brand-first, with the product tagline instead of a page name).

## Layout

`src/layouts/SiteLayout.astro` wraps every page: sets charset/viewport meta, a favicon (`/assets/Sighton_Logo.png`, used for both the regular and apple-touch-icon links — note `public/favicon.ico`/`favicon.svg` exist on disk but aren't referenced here), imports `styles/index.css` globally, and renders `<SiteTopBar client:load>` + `<main><slot/></main>` + `<SiteFooter>` (static, no hydration). It computes `currentPath` (trailing slash stripped) and passes it to `SiteTopBar` for active-nav-link highlighting.

## Components (`src/components/`)

All `.tsx` — there are no `.astro` components outside the layout/pages.

| File | Purpose |
|---|---|
| `SiteTopBar.tsx` | Sticky nav: logo + wordmark, primary nav (About/Tool/Documentation/Pricing), a menu popover (Privacy/License). Only client-interactive nav element on the site (open/close state + outside-click/Escape handling). |
| `SiteFooter.tsx` | Static footer: logo, `© {year} Sighton Yearbook Tools`, "Created by Sighton Media" (→ `sighton.ca`), Privacy/License links. No hooks. |
| `AboutPage.tsx` | Full marketing homepage: hero, animated "autoflow in action" demo panel, feature grids, "how it works" 4-step section, config save/load pitch, graduation-spread specialties. Purely presentational. |
| `PricingPage.tsx` | Two-tier pricing grid (Personal/Free vs. Commercial/Custom), FAQ list, a "How Workspaces & Workspace Sessions Work" explainer, bottom CTA. |
| `PrivacyPage.tsx` | Renders the privacy policy as HTML (effective date December 25, 2025). |
| `LicensePage.tsx` | Renders the software license text as HTML. |
| `DocumentationPage.tsx` | ~1,600 lines — the **end-user** documentation for the tool app itself (not this developer documentation). `useState`-driven sidebar TOC over 10 sections: Getting Started, Licensing & Sessions, Template Setup, Data Preparation, Workflow, Styling, Save/Load Config, Background Removal, Troubleshooting, Tips. This is the canonical place to point end users; keep it in sync with actual tool behavior when the pipeline changes. |

### Branding strings (verbatim, don't drift from these)

- Product tagline: **"Custom Flow Automator"**
- Company/site brand: **"Sighton Yearbook Tools"**
- Footer credit: **"Created by Sighton Media"** → `https://sighton.ca`
- Title pattern: `"{Page} — Sighton Yearbook Tools"` (em dash, not hyphen)

`tool/web`'s `index.html` title, `App.tsx`'s standalone header, and `ToolAppPage.tsx`'s topbar/footer must all match these same strings — they drifted to ad-hoc alternatives ("Yearbook Auto Flow" / "Sighton Innovations") once before, so don't reintroduce different names in either project.

### CTA wiring

`SiteTopBar`'s "Tool" link, `AboutPage`'s "Open the Tool" CTAs, and `PricingPage`'s "Get Started Free"/"Open the Tool" CTAs all point at `TOOL_URL`. The Commercial pricing tier's CTA is a `mailto:` link instead, not `TOOL_URL`.

## `src/lib/env.ts`

```ts
export const TOOL_URL = (import.meta.env.PUBLIC_TOOL_URL ?? "https://yearbooktool.sighton.ca").replace(/\/$/, "");
```

The single cross-project coupling point on this side — see [`01-architecture.md`](01-architecture.md#cross-project-wiring).

## Build-time vs. runtime env vars

**`PUBLIC_TOOL_URL` is a build-time value, not a runtime one.** Astro inlines `PUBLIC_*` env vars into the static JS/HTML when `npm run build` (or `npm run deploy`, which builds first) runs — there is no server reading env vars at request time, since this deploys as static assets with no adapter. Setting `PUBLIC_TOOL_URL` as a Cloudflare dashboard environment variable or via `wrangler secret` does **nothing** for this site. To change it: update `.env` (or wherever CI sources it) and rebuild/redeploy.

## Files duplicated from `tool/web`

Per `CLAUDE.md`'s convention note, a couple of files are intentionally copy-not-shared between the two projects, since they build and deploy independently:

- **`src/lib/baseUrl.ts`** — byte-for-byte identical to `tool/web/src/baseUrl.ts`. Same `withBase(path)` utility.
- **`src/styles/*.css`** — **not** kept identical; every shared-named file (`00-variables.css`, `02-shell.css`, `03-components.css`, `04-layout.css`, `05-tool.css`, `07-pages.css`, `index.css`) has diverged in content since the original copy, and the website's `styles/` is missing two files that only make sense for the tool app (`00-tokens.css`, `08-workspace.css`). Treat this as "originally forked from `tool/web`, now independent" rather than something that needs to be kept byte-identical — **but if you're deliberately changing shared visual language (brand colors, type scale, etc.), check whether the counterpart file in the other project needs the same change.**

## Static legal docs vs. rendered pages

`website/public/LICENSE` and `website/public/PRIVACY.md` are raw files served verbatim at `/LICENSE` and `/PRIVACY.md` (everything under `public/` is served at the site root). These contain essentially the same content as `LicensePage.tsx`/`PrivacyPage.tsx` render as HTML — i.e. there are two parallel copies of both legal documents that must be kept in sync by hand when either changes.

## Known content gaps

- `PricingPage.tsx`, `PrivacyPage.tsx`, and `LicensePage.tsx` all use a placeholder `mailto:your-contact@domain.com` — looks unfinished rather than intentional; worth fixing before pointing real customers at the pricing page.
- Several `AboutPage.tsx` image slots reference asset files that don't exist on disk yet (e.g. `assets/showcase-annotated-template.webp`, `assets/showcase-upload-interface.webp`) and currently render an inline dashed-border "IMAGE:" placeholder `<div>` instead — only `showcase-autoflow.svg` actually exists under `public/assets/`.

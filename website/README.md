# Sighton Yearbook Tools — Website

The marketing/info site for the Yearbook Grad Mugshot Automator: About, Documentation, Pricing, License, and Privacy pages. Built with [Astro](https://astro.build), using React components (`@astrojs/react`) for the pages/widgets that need interactivity.

This is a fully static site with no backend of its own, no API calls, and no license logic — it's meant to be deployed as-is to Cloudflare Workers (static assets, no adapter/SSR needed). The only thing it knows about the tool is one absolute URL: every "Tool" link/CTA points straight at wherever `tool/web` is deployed. License key entry, validation, and free-key requests all happen over there.

## Commands

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # outputs to ./dist
npm run preview   # preview the production build locally (Vite preview server)
npm run cf:dev    # build, then serve ./dist through the actual Workers runtime (http://localhost:8788)
npm run deploy    # build, then `wrangler deploy` to Cloudflare
```

## Configuration

Copy `.env.example` to `.env` and set:

- `PUBLIC_TOOL_URL` — absolute URL of the deployed tool web app (`tool/web`). Used by the "Tool" nav link and every "Open the Tool" / "Get Started Free" CTA.

**This is a build-time value, not a runtime one.** Astro inlines `PUBLIC_*` env vars into the static JS/HTML when you run `npm run build` (or `npm run deploy`, which builds first) — there is no server reading env vars at request time. Setting `PUBLIC_TOOL_URL` as a Cloudflare dashboard environment variable / `wrangler secret` does **nothing** for this site; update `.env` (or set it in whatever CI runs the build) and rebuild/redeploy instead.

## Deploying to Cloudflare Workers

This site deploys as static assets on a Worker — see [`wrangler.jsonc`](wrangler.jsonc) (`assets.directory: "./dist"`, no `main` script needed since there's no server-side code). One-time setup, then deploys:

```sh
npx wrangler login   # opens a browser to authenticate with your Cloudflare account
npm run deploy        # astro build && wrangler deploy
```

Notes:
- `wrangler.jsonc`'s `name` (`sighton-yearbook-website`) becomes the `*.workers.dev` subdomain on first deploy; add a custom domain afterwards from the Cloudflare dashboard (Workers & Pages → your worker → Settings → Domains & Routes) or via a `routes`/`workers_dev` entry in `wrangler.jsonc`.
- `html_handling: "auto-trailing-slash"` and `not_found_handling: "404-page"` match Astro's static output (`about/index.html`-style routes, plus a real `dist/404.html`) — don't change these unless you also change Astro's output shape.
- `npm run cf:dev` runs the actual `workerd` runtime locally (not just Vite), which is the most accurate pre-deploy check.

## Structure

- `src/pages/*.astro` — one file per route (`/`, `/about`, `/how-to-use`, `/pricing`, `/license`, `/privacy`, `404`).
- `src/layouts/SiteLayout.astro` — shared shell (top bar + footer) every page renders inside.
- `src/components/*.tsx` — React islands. Static pages (`AboutPage`, `PricingPage`, `PrivacyPage`, `LicensePage`) render with no `client:*` directive and ship zero JS; `DocumentationPage` has state and is hydrated with `client:load` on its `.astro` page.
- `src/lib/` — `env.ts` (the `TOOL_URL` constant), `baseUrl.ts` (copied from `tool/web`, adapted for a standalone static deployment).
- `src/styles/` — copied from `tool/web/src/styles`; the two projects deploy independently so styling isn't shared at build time.
- `wrangler.jsonc` — Cloudflare Workers static-assets config (see "Deploying" above).

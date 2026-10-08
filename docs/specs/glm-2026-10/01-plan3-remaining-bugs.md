# Spec sheet — Plan 3: remaining defects and usability fixes

Read `00-README-handoff.md` first (base commit, setup, data rule, gates, delivery). This sheet lists every defect that a full end-to-end audit found and that is **not** fixed at the base tag `glm-base-2026-10`. Each item says what is wrong today, what "fixed" means, and the test that proves it. Item IDs (`P3-xx`) go in commit subjects and `DELIVERY.md`.

Priority: **P1** = wrong output or lost work; **P2** = misleading or blocks users; **P3** = polish and accessibility. Do P1 before P2 before P3 if you must cut scope, and say what you cut in `DELIVERY.md`.

Global rules for this sheet:
- Fix behaviour, not just symptoms; add a backend test for every backend change and an e2e (Playwright) check for every user-visible frontend change that can be automated.
- Keep today's behaviour as the default wherever the item does not explicitly change it.
- Any new user-visible string: plain English, short, and says what the user can do next.

---

## P3-00 (P1, enabler) — Synthetic test data generator and Playwright e2e suite

**Why:** The frontend has no tests, and the only realistic test data is real students' data that must not be used. Everything else in this sheet and in Plan 2 needs repeatable fictional data and automated UI checks.

**Build:**
1. `scripts/make_synthetic_project.py` (Python 3.12, Pillow + OpenCV + pandas only — already dependencies). Usage: `python scripts/make_synthetic_project.py --out <dir> --students 40 [--seed 1]`. Produces:
   - `annotated.png` + `clean.png`: a two-page spread (e.g. 4000×2600) with N slots per spread (default 16: 2 pages × 2 columns × 4 rows). Annotated has solid guide boxes in the exact colours from the README (portrait, baby, name, quote; baby boxes optionally elliptical). Clean has a plain gradient background with the same dimensions.
   - `roster.csv` with headers `First Name,Last Name` and fictional names (seeded; include accents e.g. "José García", an apostrophe "O'Brien", a hyphen, a long name ≥ 32 chars, and one blank row).
   - `portraits.zip` with `001.jpg … NNN.jpg` (drawn placeholder "faces": a skin-tone ellipse + eyes on a coloured background, sized 600×800), plus one file with EXIF orientation 6, one `__MACOSX/._001.jpg`, and one corrupt `.jpg`.
   - `quotes.csv` with `First Name,Last Name,Quote` including: a one-word quote, a non-Latin quote (`永远年轻`), an emoji quote (`to the moon 🌙`), a URL, a `REJECTED` placeholder, and two students missing.
   - `baby.zip` with name-matched files (`<First> <Last>.png`) for about half the students, one of them a 2-page PDF.
2. `tool/web/e2e/` Playwright suite (`@playwright/test` dev dependency, `playwright.config.ts` with `webServer` entries for the backend and Vite dev server, isolated data dirs via the env vars in README §4, a licence created in `globalSetup`). Specs, at minimum:
   - `sample.spec.ts`: Help → "Load a sample project" succeeds and reaches People with 8 students.
   - `full-flow.spec.ts`: synthetic project (40 students → 3 spreads) through Template → Roster & Photos → People → Style → Generate → Render all; asserts 3 spreads listed and downloadable, no `console.error`, no HTTP ≥ 500.
   - One spec per user-visible P3 item below where automatable (named `p3-xx-*.spec.ts`).
3. `npm run e2e` script in `tool/web/package.json` (`playwright test`).

**Done when:** the generator is deterministic for a given seed; `npx playwright test` passes headless; README section in `CLAUDE.md` "Commands" mentions `npm run e2e` and the generator.

---

## P3-01 (P1) — Pre-render check: warn about default quotes, missing portraits and missing baby photos

**Today:** Generate shows tiny grey counts ("Missing portrait: 27", "Missing quote: 214" in `steps/FinalizeStep.tsx` ~line 108-119) and Render all starts immediately. Students without a quote silently get the default quote (state `defaultQuotes` in `App.tsx`, initial value `["404 quote not found"]`, edited in `steps/edit/PeopleTab.tsx` "Default quotes"). The owner wants to **keep** the default quote, but the user must be told.

**Change:**
- A "Before you render" panel on Generate listing, with counts and expandable name lists: students who will use the **default quote** (show the default text that will print), students with **no portrait** (will use the default portrait, or blank if none), students with **no baby photo** (when baby photos are enabled), and students whose quote was skipped as a placeholder/link (from the last quotes import warnings).
- Clicking "Render all" when any of those lists is non-empty opens a confirm dialog (existing `ConfirmDialog` component) summarising them: e.g. "12 students will get the default quote "404 quote not found". 3 students have no portrait. Render anyway?" with "Render anyway" / "Go back". A "Don't ask again for this project" checkbox stores a session flag.
- The People step shows the same default-quote count next to the "Default quotes" editor.
- Fix the "Missing quote" count so it counts students whose own quote is empty (today it shows 214 even when quotes were imported in some flows — verify against `people[*].quote`).

**Test:** e2e — synthetic project with 2 students lacking quotes → Render all → confirm dialog lists both names and the default quote text; "Go back" renders nothing; "Render anyway" renders.

---

## P3-02 (P1) — People-step staged adjustments survive step navigation

**Today:** Staged shift/replace/remove adjustments and swap mode live in `PeopleTab.tsx` local state (`adjustments`, `swapMode`, …). Leaving the People step unmounts the grid and silently discards them.

**Change:** Lift pending adjustments into `App` state (persisted in the session like other People state), or — if lifting is too invasive — block navigation with a confirm ("You have 3 unapplied changes. Apply them, discard them, or stay?"). Prefer lifting. Same rule for files the user picked but has not uploaded yet in `ImportStep` cards (warn on navigate).

**Test:** e2e — stage a shift, go to Style, come back → still staged (or the confirm appears).

---

## P3-03 (P1) — Generation warnings reach the user (face-centre misses, disabled features, font fallbacks)

**Today:**
- When "Center baby photo on face" is on and render-time face detection misses, `generator.py` silently centre-crops.
- When an admin disables a feature, the request is silently changed (`routes/generation.py`: `payload.center_baby_on_face = False`; `routes/mapping.py` baby ZIP: `remove_background = False`).
**Change:**
- Add `warnings: list[str]` to the generation job record (`services/progress.py` job dict + `/api/generation/status` payload) and to `api.ts` `generationStatus` type. The generator appends per-person messages ("Couldn't find a face in Ana Silva's baby photo, so it was centred instead."). Routes append "Centre-on-face is turned off by your administrator, so baby photos were centred normally." when they override a request.
- Baby-ZIP upload response already has `warnings`; add the admin-override message there too.
- Generate shows the warnings after a render (collapsible list, per spread for Render all).
**Test:** backend — render with a photo that has no face and centring on → status `warnings` names the student; admin-disabled centring → warning present. e2e — warning list visible after render.

---

## P3-04 (P1) — Baby-photo "Reset to original" works after reload and config import

**Today:** `originalBabyPeople` and `originalPeople` (`App.tsx`) are set only at ingest and never persisted, so after a reload or config import the reset buttons are disabled (`BabyPhotoEditor.tsx` `disabled={... || !originalBabyPeople}`; `PeopleTab.tsx` reset) and the apply-confirm text "you can reset to original" is false.

**Change:** Persist both baselines in `PersistedSessionV1` and config export/import (store only `index` + filenames, not whole records). On restore, if absent (old sessions), rebuild the baby baseline by walking `babyEditHistory` back to each chain's first input. Make the apply-confirm text conditional on a baseline existing.
**Test:** e2e — edit a baby photo, reload, Reset to original → original image restored.

---

## P3-05 (P1) — Baby editor preview matches the rendered cutout and the student's real slot

**Today:**
- The editor shows the slot mask as a translucent overlay (`styles/06-modals.css` ~101-110, `opacity: .35; mix-blend-mode: multiply`) over a rectangular photo, while the renderer clips with the mask as true alpha → faces near corners look fine in the editor but are cut off in print.
- `App.tsx` passes `babyMaskBox={slots.length > 0 ? slots[0].baby_photo : null}` — every student's editor, thumbnails and export size use slot 1's shape.

**Change:** Clip the editor crop area with the real mask (`mask-image` from `/api/mapping/baby-mask` for that slot) and show the template background colour/fill outside it. Resolve each student's baby slot from their actual placement (reuse the frontend placement helper in `utils/placement.ts` / `buildSlotsForPeople` in `App.tsx`) and pass the matching box/mask per student.
**Test:** e2e on a synthetic template with one elliptical and one rectangular baby slot: the editor for a student in each slot shows the matching shape (assert computed style `mask-image` / aspect ratio).

---

## P3-06 (P1) — "Center on face" in the editor and at render pick the same face

**Today:** The editor endpoint (`routes/mapping.py` `/detect-face-center` → `services/face_detection.py` editor path: YuNet → relaxed YuNet → RetinaFace → Haar, rotation search, centre-weighted pick) and render-time centring (`generator.py` → YuNet → Haar, largest face, no rotation) differ, so a photo with two faces can be centred on different faces.
**Change:** One detection-and-selection function in `face_detection.py`, used by both. Render-time also honours a per-student focus point if the user set one in the editor (persist `baby_focus` on the person record only if Plan 2 F4.1 needs it; otherwise reuse the editor's baked crop).
**Test:** backend — synthetic image with two faces (draw two face-like patches with OpenCV, or mock the detector) → both paths return the same box.

---

## P3-07 (P1) — Background-removal Stop really stops; first-run model download is explained

**Today:** `BabyPhotoEditor.tsx` "Stop" only stops polling; the server job keeps running and holds the per-workspace reservation, so a retry fails with `workspace_image_job_in_progress`. The first "Ultra" run downloads a model inside the job, progress sits at 15% and the UI times out after 120 s.
**Change:** Cooperative cancel for background-removal jobs (mirror the generation cancel added at base: `services/progress.py` `request_cancel`/`raise_if_cancelled` pattern, in `services/background_jobs.py`; check between processing stages). Add `POST /api/mapping/remove-background-cancel`. When the model file is not present yet, job status says "Downloading the background-removal model (one-time, about N MB)…" and the UI timeout does not apply while that status is shown.
**Test:** backend — cancel a running job (mock the slow step) → status `cancelled`, reservation released, a new job can start immediately.

---

## P3-08 (P1) — Config import doesn't fail completely when one edit can't be replayed

**Today:** Config import replays `babyEditHistory` (background removal etc.); any single replay error aborts the whole import ("Import finalization failed") even though every base asset imported (`App.tsx` replay ~lines 1115-1208, 1426-1454).
**Change:** Per-operation fallback: keep the unedited input for that student, collect a warning ("Couldn't re-apply the background removal for Ana Silva; her original photo is used."), finish the import, show warnings.
**Test:** e2e or unit — import a config whose history references a disabled feature → import completes with a warning.

---

## P3-09 (P1) — Baby-ZIP background-removal failure keeps the photo

**Today:** In `routes/mapping.py` `upload_baby_zip`, if background removal throws for a matched photo the loop `continue`s and the student ends up with no baby photo.
**Change:** Keep the original (validated) photo assigned, add a warning "Background removal failed for Ana Silva's photo; the original photo was kept.", and mark the person so the People step can offer "retry background removal".
**Test:** backend — monkeypatch `remove_background_bytes` to raise → person still has `baby_photo_filename`, warning present.

---

## P3-10 (P2) — Verification spreadsheet slot numbers match the printed spreads

**Today:** `GET /api/generation/download-spreadsheet` (`routes/generation.py`) recomputes slot numbers as `slot_assignments.get(...) or idx+1`, ignoring the placement mode remap and alphabetical sorting, so it can disagree with the spreads.
**Change:** Compute rows with the same functions the renderer uses (`services/placement.py` `compute_slot_number_to_index`, `sort_people_alphabetical`, collision handling) — ideally have the generator record the final (person → spread, slot) mapping in the saved request and have the spreadsheet read it.
**Test:** backend — render 2 spreads with `placement_mode="left_then_right"` and `force_alphabetical=True`; spreadsheet rows equal the generator's placement.

---

## P3-11 (P2) — One alphabetical order everywhere

**Today:** Frontend sorts with `localeCompare(..., {sensitivity: "base"})` (`utils/placement.ts` `comparePeopleByLastName`), chunks into spreads, then the backend re-sorts each chunk with a different comparator (`placement.py` `sort_people_alphabetical`, `casefold`). Accented names near a chunk boundary can land differently from the People grid.
**Change:** The frontend sorts once and sends `force_alphabetical: false` per chunk (it already sorted), and both comparators use the same rule: last name, then first name, accents folded (NFKD strip combining marks), case-insensitive. Keep the backend sort for direct API users and make it identical.
**Test:** unit (TS via a tiny Vitest or a Playwright-evaluated function) + backend test with names `Émile Durand, Erin Duran, Éva Dupont` → same order both sides.

---

## P3-12 (P2) — Correct print resolution metadata

**Today:** Outputs carry no DPI; PDFs are saved at Pillow's default 72 dpi, so a 5475-px spread becomes a ~76-inch page.
**Change:** Save PNG with `dpi=(300, 300)`, PDF with `resolution=300`, TIFF with `dpi=(300, 300)` in `generator.py` (and `tiff_layers.py` if still used). Put the value in one constant `PRINT_DPI = 300` (Plan 2 F4.3 turns it into a setting). Show the resulting print size on Generate ("Prints at 18.25 × 12.25 in at 300 dpi").
**Test:** backend — render each format; read back DPI (`Image.info["dpi"]`, PDF `MediaBox` = pixels × 72 / 300).

---

## P3-13 (P2) — Reload during a render doesn't lose the job

**Today:** The job id lives only in `runGeneration`'s closure; a reload mid-render loses it, and Render all must restart (and usage may be counted again).
**Change:** Persist `{jobIds, totalSpreads, startedAt}` of an in-flight Render all in `sessionStorage`; on load, if present and the server still knows the job (`/api/generation/status`), resume polling and progress; otherwise list what finished (`/api/generation/outputs`).
**Test:** e2e — start Render all, reload, see progress continue to completion.

---

## P3-14 (P2) — Download/status errors are real HTTP errors with readable text

**Today:** `routes/generation.py` `/download` and `/status` return HTTP 200 with `{"error": ...}` for missing files/jobs; downloads open a tab showing raw JSON.
**Change:** 404 with a plain-English `detail`; frontend shows a toast/status instead of opening a JSON tab (download via `fetch` → blob, or check `HEAD` first).
**Test:** backend 404s; e2e — delete an output then click download → readable message.

---

## P3-15 (P2) — Locked steps say exactly what's missing

**Today:** Clicking a locked step or disabled Continue gives "Complete the previous steps before jumping ahead" (or nothing). `RoadmapRail.tsx` exposes the reason only via `title` on a disabled button (not read by screen readers).
**Change:** Per-step checklist reason ("Template: no slots detected yet — parse your template", "Roster & Photos: upload a roster spreadsheet"). Use `aria-disabled` + `aria-describedby` instead of `disabled` + `title`; show the reason inline under the footer Continue button.
**Test:** e2e — fresh project, click "People" in the rail → reason text visible and announced (`aria-describedby` target contains it).

---

## P3-16 (P2) — Commercial licence lock screen has a way forward

**Today:** `ToolAppPage.tsx` lock-conflict screen (`lockConflict`, code `workspace_locked`) shows a message and optional lock time only.
**Change:** Add "Try again" (re-runs activation), a live countdown to `lockExpiresAt`, and "Take over this session" which calls the existing `POST /api/workspaces/takeover` after a confirm explaining the other device will be disconnected. Licence validation errors: distinguish 4xx key problems ("This licence key isn't valid…") from 5xx/network ("Couldn't reach the licence server — check your connection and try again.") instead of "Invalid license key (http_500)" (`licensing.ts` `http_${resp.status}`, `ToolAppPage.tsx` ~line 191/208).
**Test:** e2e — open the tool in two browser contexts with one commercial key → second sees the lock screen, takeover works.

---

## P3-17 (P2) — Quote editor shows the default as a placeholder, not as the student's text

**Today:** `PersonInspector.tsx` / `PeopleTab.tsx` show the *effective* quote (default-filled). Editing bakes the default into `person.quote`; clearing is impossible because empty falls back to the default.
**Change:** Edit `person.quote` directly; show the default (that would print) as greyed placeholder text with a hint "Using the default quote". Add an explicit "No quote for this student" toggle (`person.quote_blank: true` or an empty-string sentinel that the generator treats as "print nothing") — mirror in `schemas.py` / `types.ts`.
**Test:** e2e — clear a student's quote → placeholder shows default; toggle "No quote" → rendered spread has no quote text for that student (assert via the verification spreadsheet).

---

## P3-18 (P2) — Rotation-aware face centring in the baby editor

**Today:** `BabyPhotoEditor.tsx` face-centering math (~lines 381-445) assumes rotation 0; centring a rotated photo lands off-centre.
**Change:** Map the detected focus point through the current rotation before computing the crop (or detect on the rotated image).
**Test:** unit test of the mapping helper (extract it to `utils/`), 0/90/180/270.

---

## P3-19 (P2) — Orphaned edit/preview images are cleaned up

**Today:** Every background-removal preview uploads a `baby_preview_*` file and every Apply mints a new `baby_edit_*` file; superseded/discarded ones are never deleted (student photos accumulate).
**Change:** Previews go under a temp prefix and are deleted when the editor closes or the next preview starts; when an edit is applied, delete the previous edit output for that student unless it is still referenced by `babyEditHistory` or another person. The workspace janitor (`services/workspace_cleanup.py`) also removes temp previews older than 1 hour.
**Test:** backend — simulate 3 previews + 2 applies → only the current edit file remains (plus original).

---

## P3-20 (P2) — "People per spread" label tells the truth; template colour pickers match detection

**Today:** `ImportStep.tsx` "People per spread (max slots to keep)" says extra slots are dropped during grouping; they aren't (only at regroup/render). Colour override placeholders `#22c55e`/`#3b82f6` differ from detection defaults `#00bf63`/`#004aad` (`template_parser.py`). Backend `min_area` default is 400; frontend 800.
**Change:** Reword to "Students per spread — used to split your roster into spreads" with an InfoPopover; use the real default colours as placeholders/swatches; align `min_area` default to 800 in `routes/templates.py`.
**Test:** backend default test; visual check in UX review.

---

## P3-21 (P3) — Dialog, tour and live-region accessibility

**Today:** Config-import modal (`App.tsx` ~2642-2865) has no initial focus, no Escape, no focus return; the guided tour (`GuidedTour.tsx`) doesn't move focus into its card or trap Tab; the licence countdown (`ToolAppPage.tsx` `aria-live`) re-announces every second; `TipsBox.tsx` auto-rotates inside `role="status"` with no pause; `ToolMessages.tsx` collapses when any body click lands (including on toggles inside it).
**Change:** Focus management + Escape for modals (reuse the pattern in `HelpPanel.tsx`), focus trap in the tour, ticking countdown in an `aria-hidden` span with a static visually-hidden expiry, tips with a pause button and `aria-live="off"` while rotating, message collapse only via its own toggle.
**Test:** Playwright + `@axe-core/playwright` (allowed dev dependency) on each step: no serious/critical violations; keyboard-only run of the main flow.

---

## P3-22 (P3) — Small correctness leftovers

- `session.ts` `parseStepFromSearch`: case-insensitive (`?step=IMPORT` works).
- `routes/mapping.py` baby ZIP with `convert_pdfs` off: the skip warning names the "Convert PDFs in baby ZIP" option.
- HEIC/HEIF uploads (portraits and baby): message says "iPhone HEIC photos aren't supported yet — export them as JPEG" instead of the generic unsupported-type text.
- Background-removal and face-detection errors shown to users never mention "OpenCV", "rembg" or Python internals (`BabyPhotoEditor.tsx` ~316, `background_removal.py` ~227) — map to plain text.
- Baby editor "Center" button: also resets zoom-to-fit, and the tooltip says so.
- Face-centre result popover stays until the next action instead of auto-dismissing after 1.4 s.
**Test:** unit/backend tests per bullet where code changes.

---

## P3-23 (P3) — Refresh `CLAUDE.md`

The "Tool frontend" / pipeline sections are stale (the audit flagged this). Update: the 5-step flow as it is now, new modules (`services/name_matching.py`, `services/fonts.py` family index, generation cancel, `scripts/make_synthetic_project.py`, e2e suite), the noexec note is local-only (omit it), and the commands for e2e. Keep the file's existing structure and tone.

---

## Out of scope for this sheet

Everything in `02-plan2-customisation-features.md`. Do not change the default quote value. Do not change quote geometry (quotes may use up to 1.5× portrait width and full portrait height — owner decision).

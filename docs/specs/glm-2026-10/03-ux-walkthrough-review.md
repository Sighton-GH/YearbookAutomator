# Spec sheet — UX walkthrough review (as a real user, with screenshots)

Read `00-README-handoff.md` first (setup, data rule). This sheet produces a **report and screenshots**, not code. Run it **twice**:

1. **Baseline** — on base commit `170fd1a` before you change anything. Save as `ux-review/baseline/`.
2. **Final** — on your finished branch with Plan 3 and Plan 2 applied. Save as `ux-review/final/`.

The final report must say, for every baseline finding, whether it is fixed, improved, unchanged or worse.

## Who you are

You are **Ms. Rivera**, a high-school art teacher who runs the yearbook club. You are comfortable with Google Docs and Canva, not with code. You have a template from the club's designer, a roster export from the school office, a ZIP of portraits from the photographer, a Google Form export of quotes, and a ZIP of baby photos that students emailed in. You want finished spreads to send to the printer by Friday. You read labels but not long paragraphs, you click "Continue" a lot, and you get anxious when something says "error" without telling you what to do.

Use the UI only (a real browser via Playwright or your own computer-use, at 1440×900; also check one pass at 1024×768). Do not read the source code during the walkthrough; your observations must be about what a user sees. You may use the code afterwards to explain a cause in the report.

## Data

Only fictional data (README §3): the bundled sample (Help → "Load a sample project") and projects from `scripts/make_synthetic_project.py` (P3-00). For the baseline run, before P3-00 exists, write the same generator as a throwaway script outside the repo, or use the sample plus hand-made CSVs. Make one realistic project with **40 students** (3 spreads) and one "messy" project: roster with `first_name,last_name` headers, a blank row, accented names, a Windows-1252 encoded CSV, a portraits ZIP with a `__MACOSX` folder and one corrupt file, a quotes CSV with `REJECTED` and empty cells, a baby ZIP with a PDF.

## Scenarios (do them in order; screenshot every numbered step)

| # | Scenario | What to look for |
|---|---|---|
| S1 | First visit: licence screen → enter key → guided tour → close tour | Is it clear what the tool does and what to do first? Does the tour point at real things? |
| S2 | Help → Load a sample project → walk all 5 steps → Render preview → Render all → download | Does the sample teach the flow? Anything confusing in any step? |
| S3 | Start fresh (Reset all) with the 40-student project: upload template → review detected slots → fix one slot by dragging → continue | Can a teacher tell if detection worked? Can she fix a wrong box? |
| S4 | Roster & Photos: upload roster + portraits ZIP → quotes → baby ZIP | Are counts/warnings understandable? What happens with skipped files? |
| S5 | People: find a student, fix a name typo, swap two portraits, replace one portrait, edit a quote, edit a baby photo (crop, rotate, remove background, centre on face), lock a student | Where would she look for each? What can't she do? |
| S6 | Style: change fonts, sizes, alignment, caps (and every new F1 control in the final run); compare the preview with the rendered output | Does the preview match the print? |
| S7 | Generate: preview, Render all (3 spreads), cancel one render midway, render again, download all, download the verification spreadsheet | Progress clarity, waiting experience, what she gets in the download |
| S8 | Save config (File menu) → Reset all → upload config → re-upload files when asked | Can she get her project back? |
| S9 | The messy project end to end | Every error/warning message: does it say what went wrong and what to do? |
| S10 | Interruptions: reload the page in each step; reload during Render all; open the tool in a second browser with the same licence | Is work lost? Is she told what happened? |
| S11 | Keyboard only: complete S2 without a mouse; dark theme pass of every step | Focus visible? Traps? Contrast? |
| S12 | (Final run only) every Plan 2 control: F1 text styling, F2 per-student edits, F3 layout editing, F4 framing & print | Discoverable? Labelled in plain words? Does the output change as expected? |

## Screenshot rules

- PNG, viewport (not full page) unless the issue needs the full page.
- Name: `S<scenario>-<step>-<short-slug>.png`, e.g. `S4-03-portrait-warnings.png`.
- For every finding include at least one screenshot showing it; annotate if helpful (a red box drawn on a copy is fine, name it `...-annotated.png`).
- Also save each rendered spread you produce in S2, S7 and S12 (downscaled to 2000 px wide) under `renders/`.

## Report: `ux-review/<run>/REPORT.md`

1. **Summary** — 5–10 sentences: could Ms. Rivera finish? Where did she get stuck? Top 5 problems.
2. **Findings table** — one row per problem:

| ID | Scenario | Severity | What happened (user's words) | Expected | Screenshot(s) | Likely cause (file/function, optional) |
|---|---|---|---|---|---|---|

   Severity: **Blocker** (cannot finish / wrong printed output), **Major** (finishes only with outside help or loses work), **Minor** (confusing, slow, ugly), **Polish**.
3. **Heuristic scorecard** — 1–5 for each step (Template, Roster & Photos, People, Style, Generate) on: clarity of what to do, feedback while waiting, error recovery, consistency of wording, visual polish. One line of justification each.
4. **Output check** — for the renders: names/quotes inside their boxes, fonts as chosen, photos upright and centred, no blank or duplicated students, print size/DPI shown correctly.
5. **Final run only — Before/After table** for every baseline finding ID: Fixed / Improved / Unchanged / Worse, with the screenshot pair.
6. **Ideas** — up to 10 concrete improvements that would most help a teacher, each one sentence with where it would go.

## Deliverable

`ux-review/baseline/` and `ux-review/final/`, each with `REPORT.md`, `screens/`, `renders/`. Zip the `ux-review/` folder and hand it back next to the patch. Do not include any non-fictional data.

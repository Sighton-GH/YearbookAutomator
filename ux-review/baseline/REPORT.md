# Baseline UX walkthrough

Base: glm-base-2026-10 (53b904b). Local Python 3.12.14 / Node 22.23.3. Synthetic-only roster and drawn faces; bundled sample was used only as directed. onnxruntime-gpu 1.20.2 substituted locally for the unavailable 1.20.1 pin. Main viewport 1440x900; People checked at 1024x768. No product code changed during this run.

## Summary
A teacher can finish the sample and download a spread. The forty-student project renders three spreads and its verification sheet downloads. Missing quotes silently print the default. The text preview shows an example quote rather than the student's actual quote. Import asks for source files sequentially and restores the edited quote. Rotation metadata produces a sideways portrait in the printed output. Reloading the baby editor disables Reset to original. A second browser gets a lock screen without an action to recover. Optional-import warnings are labelled errors, which makes successful progress look like failure. Full keyboard completion and first-run background-removal download remain unverified, not passed.

## Findings
|ID|Scenario|Severity|What happened|Expected|Screenshot|
|---|---|---|---|---|---|
|B01|S2/S7|Major|The spread prints "404 quote not found" without asking me.|Explain default quotes before rendering.|S2-06-render-all.png, renders/forty-output_01.png|
|B02|S6|Major|The style preview quote is not the one that prints.|Preview actual content.|S2-04-style.png|
|B03|S4/S9|Minor|Skipped optional files are called errors.|Explain skipped files and recovery.|S4-01-import-warnings.png, S9-01-messy.png|
|B04|S3|Minor|Every tiny box has handles, and none has a number.|Readable selected handles and numbering.|S3-02-detected.png|
|B05|S5|Major|I cannot edit a student's name from the inspector.|Name fields.|S5-02-inspector.png|
|B06|S10|Major|Reset to original is disabled after reload.|Retain the original baseline.|S10-baby-reset-after-reload.png|
|B07|S10|Major|The second browser says wait or ask another user, with no button.|Retry/takeover.|S10-second-device.png|
|B08|S5/S7|Blocker|The orientation-tagged portrait prints sideways.|Upright portrait.|renders/forty-output_01.png|
|B09|S8|Minor|Import modal has no initial focused action.|Focus and keyboard recovery.|S8-02-import-dialog.png|
|B10|S5|Major|Quote editor shows default text as if it belongs to the student.|Placeholder and explicit no-quote control.|S5-02-inspector.png|

## Scenario coverage
S1 license and welcome tour opened/closed. S2 sample loaded eight people; inspected Template/Uploads/People/Style/Generate, preview, render-all and ZIP download. S3 synthetic template detected sixteen slots; canvas inspected, drag not completed. S4 forty-student roster and all optional inputs processed. S5 quote edited, portrait swap staged and revisited; individual baby uploaded, editor rotation/face centering and Apply exercised; name edit absent, lock not exercised, background removal not completed. S6 Style and output compared with defaults; font change not completed. S7 three spreads, cancel request, rerender, ZIP and spreadsheet downloads. S8 exported config, reset, imported config and source assets. S9 Windows-1252 underscore-header roster accepted; ambiguous synthetic names produced useful matching warnings, stopping meaningful baby editing until an individual upload. S10 each step reloaded; render reload attempt hit repeated automatic preview rerenders, exact in-flight resume not established; second browser lock and baby reset inspected. S11 small viewport and dark People inspected; keyboard focus check only, full keyboard-only S2 and dark every-step pass incomplete. S12 final-only.

## Scorecard
Scores: clarity / waiting / recovery / wording / polish, 1-5.
- Template: 3/3/3/3/3. Detection visible but handles small and unnumbered.
- Roster & Photos: 3/3/3/2/4. Processing succeeds but optional warnings are errors.
- People: 3/3/2/3/3. Inspector helps, edits and baseline recovery limited.
- Style: 4/3/3/3/4. Controls clear, print preview approximate and misleading content.
- Generate: 3/3/2/3/4. Downloads work; defaults and physical print size unclear.

## Output check
Sample and forty-student outputs saved at <=2000px width. Names and quotes remain in their boxes; long name shrinks severely. Three outputs account for forty students. EXIF orientation is not respected for the second portrait. Baby masks alternate ellipse/rectangle in rendered fallback images. DPI/physical size are not explained by the UI. No independent complete inventory of every student was performed.

## Ideas
1. Show missing-photo/default-quote names before rendering.
2. Use real rendering beside the approximate Style preview.
3. Number slots and enlarge selected handles.
4. Add name editing and per-student overrides in the Inspector.
5. Keep reset baselines across reloads.
6. Add retry and takeover on licence conflict.
7. Name optional skipped files without calling all warnings errors.
8. Explain print size and DPI on Generate.

## Untouched-base continuation
A separate worktree at glm-base-2026-10 was used to finish gaps after product changes had begun. On the sample, switched name font to Liberation Serif: browser preview visibly uses serif names, while quote preview stays an unrelated example. Captured every step in dark mode, including rendering/disabled state on Generate. Template/Uploads/People/Style/Generate dark screenshots are S11-dark-*.png. Full keyboard-only S2, exact in-flight resume and first background-removal remain separate checks, not asserted passed by those screenshots.

Keyboard-only S2 continuation: activated Help, Load sample, then all five roadmap steps with Tab/Enter only. The sample loaded eight fictional people. Reached Generate and attempted preview/full-render/download with keyboard. See S11-keyboard-* evidence; completion of the final download is reported below after its result, not inferred from focus reachability. Background-removal attempt: initially disabled by isolated local admin defaults, then enabled only in the test data store. Simple mode on the default transparent blocks image replied "Background already removed". Captured that usable retry/Force UI; first model download still needs a generated opaque image and complex mode.
Keyboard S2 completed through Render all and Download all spreads using Tab/Enter. Automatic preview already existed, so control was "Re-render preview", not "Render preview". That mismatch caused the initial automated focus hunt to miss it; no product keyboard trap was observed. Final keyboard-download screenshot and ZIP saved. Explicit re-render preview was not invoked in this keyboard continuation; initial automatic preview was used.

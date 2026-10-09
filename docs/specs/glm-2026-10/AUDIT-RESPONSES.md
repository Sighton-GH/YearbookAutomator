# Independent audit response matrix

Audits reviewed: frontend/backend/Plan 3 acceptance at96d772c0, later F1 typography, F2 queue and F3 slot reviews, plus final integration review pending. Earlier green gates did not establish complete acceptance. Findings below refer to their reported scope, not new proof.

|Source/finding|Response|Evidence/limit|
|---|---|---|
|AcceptanceF1 persistence dependencies|Fixed both autosave/flush dependencies; same-step reload regression added.|p3-02-staged; session unit tests|
|AcceptanceF2 ordinary pending uploads|Fixed ordinary ImportStep pending-file signal and Stay/Leave modal.|p3-02-staged browser|
|AcceptanceF3 baby placement collision|Shared frontend two-pass allocation, exclusions and aspect resolver.|baby-slot unit; ellipse/rectangle real pixels|
|AcceptanceF4 casefold|Generated Unicode casefold differences + codepoint comparison matching Python.|German sharp-S/final-sigma unit tests|
|AcceptanceF5 overlapping fixture names/early cascade exit|Unique full-name tokens; helpers wait quote+baby responses and assert counts.|full-flow helper verifies>30quotes/20babies; EXIF raw pixels subsequently fixed|
|AcceptanceF6 axe|Upload decorative button changed to span; labels added; action colors/dark preview/tab ink fixed; all5steps/both-theme scan added.|Full final scan pending; user-picked print colors are not silently changed|
|FrontendF1 resume closure/order|Wait for hydrated people/slots; ordered outputs and correct continuation; initial URL hydration remount loop fixed.|p3-13-resume + direct final reload reattachment|
|FrontendF2 cumulative warnings|Reset full-render warnings and resume job warnings; repeated text dedup remains.|Warnings belong to new full render; preview behavior needs final regression evidence|
|FrontendF3 original flag/re-ingest|Persist failure marker and reset baby baseline on re-ingest.|backend mapping+frontend session tests; actual config and baby-reset walk|
|FrontendF5 native confirm|Replaced with app dialog and ordinary-file guard.|Stay/Leave test|
|FrontendF6 retry masks errors|Preserve actual server error on retry.|lock helper tests, live lock regression|
|FrontendF7 mask/Safari/slot|Actual mask clipped, shared per-person placement; cookie auth works in live run.|Modern Chromium verified; older Safari not verified|
|FrontendF8 fixed focus/stacked dialogs|getClientRects for fixed controls; top-dialog guard; no-document guard for component tests.|focus helper/65unit; screen-reader platform behavior not claimed|
|FrontendF9 failed replay history|Prune failed operations after remapping to source.|replay fallback unit and real successful config import|
|Backend1 cleanup unsafe name aborts|Per-candidate exception handling.|editor cleanup tests|
|Backend2 client-protected files|Server saved-state/history references protected; reserved upload prefixes renamed.|cleanup+upload tests; histories intentionally retain referenced files|
|Backend3 immediate native cancellation|Partial. Cancel flag stops between stages; native inference cannot be interrupted mid-call and reservation releases after it returns.|controlled slow-step tests; actual Ultra/GPU not verified|
|Backend4 face detector failures|Shared detector guarded against exception; named fallback warning.|unified detection and warning tests; actual two detected faces not independently verified|
|Backend6 nonauto export placement|Shared place_generation_people used by renderer+XLSX in both modes.|layout assignment render/export regression|
|Backend7 filtered logical slots|No silent shortening; explicit allocation assertion added in d44f30d8.|slot regression|
|Backend8 warning text dedup|Intentionally dedup generic/font text; duplicate identical names may collapse warning text.|Known low-impact limitation|
|Atomic export concerns|Temp in same directory,chmod beforeos.replace, finally cleanup, stable download readback.|generation output/print tests|
|F1 typography review|Real variable axes and shared Unicode measurement/drawing integrated.|font/glyph/RTL/COLR tests; CBDT arbitrary strikes and mixed-font RTL remain partial|
|F2 queue review|Latest state/source/lock guards; per-person aspect; stop/unmount/workspace guard; no double start.|queue unit+two focused browser passes|
|F3 slot review|Physical assignments remapped through mutations/history; one shared render/export allocation.|65frontendunit + backend layout export|
|Final visualF4 missing request settings|Fixed photoSettings spread into every render request; browser request assertions added.|actual4000x2600 ellipse/border/shadow150dpi downloads inspected|
|Final performanceF1 fallback cmap thrash|Early-stop coverage selection, bounded cmap cache, cached success/failure font strikes.|unit regressions; full browser rerun in progress|
|Final mask atomic/quota|Atomic temporary replacement and quota checks, readable413.|failure/quota/HTTP regression tests|

## Final independent audit checkpoint d048fb65
- Auditor retracted the UI bulk same-name data-loss claim: api.ts already randomized filenames. Direct API same-name overwrites were real and hardened. Additional defence: per-person UUID editor-owned upload, plus server collision-safe ordinary uploads. Real HTTP red/blue same-basename regression preserves first image.
- Style strip double-applied slot pins: clear assignments after resolving full-project placement; route test asserts ordered positions420,20 and emptypins.
- Editor cleanup namespace: explicit editor_owned preview/edit Form field allocates UUID server filenames; ordinary prefix names remain renamed/protected. HTTP cleanup test deletes two editor images while preserving the ordinary original.
- Focused regression:5backendHTTP pass;66frontendunitpass;TypeScriptclean;lint0errors/7warnings;build6.46s. Full final gates/re-audit remain pending.
- Independent Regroup bug after overlapping duplication is awaiting a worker patch and retest; do not treat F3 acceptance as closed.

## Further final audit corrections
- F4 portrait detector exceptions now centre and warn with the person name, without failing the render; real render regression covers thrown detector.
- P3-11 frontend strips only nonzero canonical combining classes, matching Python and preserving Indic vowel marks. Both runtimes test कुमार versus कुमर.
- P3-08 config import explicitly restores exact destinations. Editor replay permits only validated baby_edit/baby_preview PNG names, with App returned-name verification and HTTP chained replay regression.
- F1.7 remaining performance limit: at32cached cmaps, distinct missing glyphs may each scan all installedfonts once (auditor100font/3glyph probe300parses). Path-list caching avoids repeating at each fit size but is not a globalcompactcoverageindex. A boundedcompactindex is futurework; arbitrarylargercmapcache previously exceeded2GB.

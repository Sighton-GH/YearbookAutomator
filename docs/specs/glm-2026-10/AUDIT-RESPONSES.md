# Independent audit response matrix

Audits reviewed: frontend/backend/Plan 3 acceptance at 96d 772c 0, later F 1 typography, F 2 queue and F 3 slot reviews, plus final integration review pending. Earlier green gates did not establish complete acceptance. Findings below refer to their reported scope, not new proof.

|Source/finding|Response|Evidence/limit|
|---|---|---|
|AcceptanceF 1 persistence dependencies|Fixed both autosave/flush dependencies; same-step reload regression added.|p 3-02-staged; session unit tests|
|AcceptanceF 2 ordinary pending uploads|Fixed ordinary ImportStep pending-file signal and Stay/Leave modal.|p 3-02-staged browser|
|AcceptanceF 3 baby placement collision|Shared frontend two-pass allocation, exclusions and aspect resolver.|baby-slot unit; ellipse/rectangle real pixels|
|AcceptanceF 4 casefold|Generated Unicode casefold differences + codepoint comparison matching Python.|German sharp-S/final-sigma unit tests|
|AcceptanceF 5 overlapping fixture names/early cascade exit|Unique full-name tokens; helpers wait quote+baby responses and assert counts.|full-flow helper verifies>30 quotes/20 babies; EXIF raw pixels subsequently fixed|
|AcceptanceF 6 axe|Upload decorative button changed to span; labels added; action colors/dark preview/tab ink fixed; all 5 steps/both-theme scan added.|Full final scan pending; user-picked print colors are not silently changed|
|FrontendF 1 resume closure/order|Wait for hydrated people/slots; ordered outputs and correct continuation; initial URL hydration remount loop fixed.|p 3-13-resume + direct final reload reattachment|
|FrontendF 2 cumulative warnings|Reset full-render warnings and resume job warnings; repeated text dedup remains.|Warnings belong to new full render; preview behavior needs final regression evidence|
|FrontendF 3 original flag/re-ingest|Persist failure marker and reset baby baseline on re-ingest.|backend mapping+frontend session tests; actual config and baby-reset walk|
|FrontendF 5 native confirm|Replaced with app dialog and ordinary-file guard.|Stay/Leave test|
|FrontendF 6 retry masks errors|Preserve actual server error on retry.|lock helper tests, live lock regression|
|FrontendF 7 mask/Safari/slot|Actual mask clipped, shared per-person placement; cookie auth works in live run.|Modern Chromium verified; older Safari not verified|
|FrontendF 8 fixed focus/stacked dialogs|getClientRects for fixed controls; top-dialog guard; no-document guard for component tests.|focus helper/65 unit; screen-reader platform behavior not claimed|
|FrontendF 9 failed replay history|Prune failed operations after remapping to source.|replay fallback unit and real successful config import|
|Backend 1 cleanup unsafe name aborts|Per-candidate exception handling.|editor cleanup tests|
|Backend 2 client-protected files|Server saved-state/history references protected; reserved upload prefixes renamed.|cleanup+upload tests; histories intentionally retain referenced files|
|Backend 3 immediate native cancellation|Partial. Cancel flag stops between stages; native inference cannot be interrupted mid-call and reservation releases after it returns.|controlled slow-step tests; actual Ultra/GPU not verified|
|Backend 4 face detector failures|Shared detector guarded against exception; named fallback warning.|unified detection and warning tests; actual two detected faces not independently verified|
|Backend 6 nonauto export placement|Shared place_generation_people used by renderer+XLSX in both modes.|layout assignment render/export regression|
|Backend 7 filtered logical slots|No silent shortening; explicit allocation assertion added in d 44f 30d 8.|slot regression|
|Backend 8 warning text dedup|Intentionally dedup generic/font text; duplicate identical names may collapse warning text.|Known low-impact limitation|
|Atomic export concerns|Temp in same directory,chmod beforeos.replace, finally cleanup, stable download readback.|generation output/print tests|
|F 1 typography review|Real variable axes and shared Unicode measurement/drawing integrated.|font/glyph/RTL/COLR tests; CBDT arbitrary strikes and mixed-font RTL remain partial|
|F 2 queue review|Latest state/source/lock guards; per-person aspect; stop/unmount/workspace guard; no double start.|queue unit+two focused browser passes|
|F 3 slot review|Physical assignments remapped through mutations/history; one shared render/export allocation.|65 frontendunit + backend layout export|
|Final visualF 4 missing request settings|Fixed photoSettings spread into every render request; browser request assertions added.|actual 4000x 2600 ellipse/border/shadow 150 dpi downloads inspected|
|Final performanceF 1 fallback cmap thrash|Early-stop coverage selection, bounded cmap cache, cached success/failure font strikes.|unit regressions; full browser rerun in progress|
|Final mask atomic/quota|Atomic temporary replacement and quota checks, readable 413.|failure/quota/HTTP regression tests|

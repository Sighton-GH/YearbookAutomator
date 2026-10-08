# Delivery status: review in progress, not ready

Repository: https://github.com/Sighton-GH/YearbookAutomator
Base: glm-base-2026-10 (53b904b40b6836e0ab68ea9045b7414ec97a6c87).
Code: glm/plans-2-3. UX artifacts prepared separately for glm/ux-review from the same base. Local patches/bundles only; no push, PR, merge or deployment performed.

## Summary
Implemented the Plan3 and Plan2 work in isolated fictional-data environments. Independent audits found real gaps after initial green tests; fixes and scope limits are recorded in AUDIT-RESPONSES.md. Full-resolution final walkthrough found missing F4 request wiring and expensive Unicode font scans; both were fixed and actual outputs rechecked. The final handoff remains blocked on the complete latest browser suite, independent final delta review, retained S9/S11 evidence and all-new-control walkthrough coverage. This document is a status record, not a ready claim.

## Plan3
Status means implemented and evidence gathered, not that every possible provider/platform path is proven.

|ID|Status|Change/files|Tests/evidence and remaining limits|
|---|---|---|---|
|P3-00|done|scripts/make_synthetic_project.py; isolated Playwright setup/helpers|Unique deterministic40student and messy projects, real quotes20babies/PDF/EXIF.22browser specs pending latest full run.|
|P3-01|done|App, FinalizeStep, BeforeRenderPanel|Preflight/default-name confirmation and persistent project flag; browser confirm test.|
|P3-02|done|App,ImportStep,PeopleTab|Lifted adjustments/swap, autosave+flush dependencies, ordinary pending-file guard, Stay/Leave modal; same-step reload tests.|
|P3-03|partial|progress,generation,mapping,generator,FinalizeStep|Named face/admin/font warnings, progress/resume warning lists; backend tests and actual font warnings. Real no-face completed job/UI proof narrower than requested.|
|P3-04|done|App/session baselines,BabyPhotoEditor|Original filenames/failure flags retained, old-chain fallback, reingest reset; actual edit/reload/reset/apply and config import. Reset Apply exports a fitted crop, not byte-identical original.|
|P3-05|done|babySlot,placement,App,BabyPhotoEditor,CSS|Two-pass actual placement and true mask clip; ellipse/rectangle browser pixels and computed-style regression. Older Safari not verified.|
|P3-06|done|face_detection,generator,mapping|Shared detector/selection, exception fallback; two-face mocked parity. No independent actual two detected faces/GPU proof.|
|P3-07|partial|background_jobs,mapping,BabyPhotoEditor|Stage-boundary cooperative cancellation, ownership route, model-download status/no download timeout. Native inference is not interruptible; reservation releases after that stage returns. Actual Ultra first download not completed.|
|P3-08|done|replayFallback,App|Per-op recovery/remap/warnings and failed-history pruning; unit tests, successful config roundtrip. Disabled provider UI scenario not retained.|
|P3-09|done|mapping/background fallback|Validate/retain original and flag failed removal; retry UI, backend injected failure tests. Real GPU/provider failure not verified.|
|P3-10|done|placement,generator,generation spreadsheet|Shared allocator in auto+nonauto modes, explicit full-assignment check; multi-spread render/export tests and downloaded XLSX.|
|P3-11|done|placement.py,placement.ts|Same accent fold, Unicode casefold and codepoint order; accented/German/Greek tests.|
|P3-12|done|print_output/generator,FinalizeStep|300dpi default replaced byF4 selectable setting; real PNG/TIFF/PDF metadata tests, final150dpi PNG.|
|P3-13|done|inflightRender,App,progress/outputs|Hydrated continuation, ordered outputs, no extra usage for later chunks; browser resume test and final direct reattachment. Latest full browser run pending.|
|P3-14|done|generation,downloadFile|404/status friendly text and fetch/blob downloads; backend tests and actualZIP/PNG/XLSX; removed-file UI scenario not retained.|
|P3-15|done|RoadmapRail,StepContinueButton,App|Disabled reasons visible/readable and Continue requirements; browser3cases.|
|P3-16|done|workspace_registry,workspaces,LockConflictScreen|Matching commercial owner only; admin-enabled+stale heartbeat takeover. Live lock onlyTry again. Route authorization/stale/live tests and two-browser test. Instant live-seat transfer intentionally not enabled.|
|P3-17|done|PersonInspector,schemas,generator,spreadsheet|Owned quote vs placeholder, explicit blank flag; backend print/XLSX tests and browser toggle.|
|P3-18|done|rotation,babyEditor|Rotated coordinate bounds, source crop handling; unit tests. Real detector-driven rotated face not verified.|
|P3-19|done|editor_images,mapping,janitor,BabyPhotoEditor|Per-candidate safe cleanup, server saved references/running source protection, reserved upload prefix renaming; tests. History-referenced edits deliberately retained.|
|P3-20|done|ImportStep,templates,template_parser|Spread wording, actual guide colors,min_area800; parser/default tests.|
|P3-21|partial|dialogFocus,ConfirmDialog,tour,tips,messages,CSS|Focus/Escape/stacked modal guards, quiet timers,tips pause,own-toggle messages; light/dark axeallsteps added but latest full pass pending. Actual default Style/darkTemplate fixed and inspected.|
|P3-22|done|small correctness utilities,mapping/editor/session|Step casing,PDF/HEIC labels,permanent messages,plain errors,centre zoom; unit tests.|
|P3-23|done|CLAUDE.md and this documentation|Current five-step architecture/request/control descriptions.|

## Plan2
|ID|Status|Change/files|Tests/evidence and remaining limits|
|---|---|---|---|
|F1.1|done|text_layout/textSpacing,TextStyleControls|Right/justify/vertical geometry; unit renderer tests, Style controls walked.|
|F1.2|done|text_color,style settings/request mapping|Name/quote swatch+hex; red real-strip browser pixel test.|
|F1.3|done|text_spacing,text_layout|Line spacing/tracking with shared measurement; tests. Fractional UI tracking is rounded to integer request pixels.|
|F1.4|done|text_effects|Outline/shadow and bounds; tests and real strip pixels.|
|F1.5|done|name_fitting,text_layout|Shrink/two-line/minimum and named overflow warning; tests; very long sample names still need larger boxes.|
|F1.6|done|font_styling/fonts|Real italic and variable400/700 axes, warning fallback; variable/italic tests. Legacy normal defaults preserve base pixels.|
|F1.7|partial|glyph_fallback/text_layout|Shared fallback run measurement/drawing,RTL/RAQM,COLR tests, bounded cmap and usable font caches. Bitmap-onlyCBDT arbitrary sizes unsupported; mixed-font complexRTL best effort warns; moon glyph unavailable on this install prints?with warning.|
|F1.8|done|render_test_strip,generation,StyleTab|First2resolvedslots real-render strip; no usage; golden/request/route tests and actual strip.|
|F2.1|done|PeopleTab,PersonInspector,App|Name edits and keep-edits reingest choice; session/browser tests.|
|F2.2|done|peopleEditor,PersonInspector,schemas/generator|Add max+1,exclude/include,skip rendering; tests.|
|F2.3|done|PersonInspector,schemas/generator|Name/quote size/color,hide baby,blank quote/reset; actual red31pt spread2 output and tests.|
|F2.4|done|AssetPicker,mapping/assets|Searchable portrait/baby file grid; catalog/browser tests.|
|F2.5|done|PersonPositionControl,placement|Mini map/spread+slot preview and physical-pin remaps; tests and actual relocated student.|
|F2.6|done|spreadsheet/ImportStep|Filenamecolumn threshold/case+extension fallback; ambiguous/missinglisted files never arbitrary numeric leftover; backend+browser tests.|
|F2.7|done|BulkPeopleToolbar,bulkQueue|Selection actions,lateststate/source/lock/workspace guards,sequentialqueue/Stop/unmount;9queueunit and2focusedbrowser passes. Full final suite pending.|
|F3.1|done|LayoutTab,layoutMutations,baby_masks|Add/delete/duplicate,assignment-aware history,atomicquota masks; unit/browser+HTTP413.|
|F3.2|done|layoutOrder/TemplatePreview|Effective numbers/renumber; tests.|
|F3.3|done|TemplatePreview|Selected constant-size handles,zoom/pan/nudge; focused browser test.|
|F3.4|done|layoutHistory|At least50steps,gesture-safe undo/redo,reparse/reset/regroup,no reloadhistory; unit/browser.|
|F3.5|done|template_parser,templates,ImportStep|Sensitivity,tolerance,raw detection dropped/invented accounting; tests.|
|F3.6|done|baby_masks,templates,LayoutTab|Exact moved mask and explicitslotshape,atomicpublish/quota; tests.|
|F4.1|done|PortraitEditor,SharedPhotoCropper,portrait_framing|Focus>face>centre andcontainfill; focus1.4UI+actualportrait,backendtests.|
|F4.2|done|portrait_framing,PhotoSettingsPanel|Portrait/babyshape border/shadow; corrected request wiring,actualellipsepixels150dpi.|
|F4.3|done|print_output,SafeAreaOverlay,PhotoSettingsPanel|DPI/physicalsize,resolutionwarning,PDFmarks+TrimBox,safearea; tests/actualPNG metadata. FinalUIPDFcrop-mark output not yet inspected.|
|F4.4|done (allowed fallback)|Deleted unused tiff_layers.py|Photoshop-readable layer reliability not established; no fake layered format offered. RegularTIFF retained/tested.|
|F4.5|done|PersonInspector,PersonRecord,generator|Per-personinherit/keeptransparent/fillcolor preserved in request export; backendtests.|

## Deviations and open acceptance
- No upstreampush/PR: patch fallback authorized; user or parent must arrange GitHub upload/PR. Existing main/tags untouched.
- Multiple focused ID-prefixed correction commits remain, rather than exactlyonecommit peritem. Do not rewrite shared checkpoints silently; final consolidation decision pending.
- Source baseline default golden is from untouchedbase; exact default pixels pass two golden scenarios, not universalplatform/fontproof.
- onnxruntime-gpu1.20.1 package unavailable locally; local environment used1.20.2, repositorypin unchanged. NoCUDA/GPU provider proof.
- Native background inference cannot be stopped mid-call; partialP3-07 stated above.
- UnicodeCBDT/mixedfontRTL limits remain partialF1.7.
- Full all-control screenshot acceptance incomplete even when focused automatedtests exist; UX REPORT names itscoveragegaps.
- Final browser suite, freshS9/S11 retained evidence and finaldeltaaudit are pending. Do not call ready.

## Gate record
Baseline at untouchedbase:184backend,TS clean,lint0errors/7warnings,buildpassed (baseline recorded separately).
Exact code checkpoint c891eb81: 364 backend tests passed, 19 dependency/deprecation warnings, 34.94s.
Frontend units: 65 passed, 0 failed. TypeScript clean. ESLint: 0 errors, 7 warnings. Build passed in 3.72s.
Full 22-test browser run was aborted under 2GB memory pressure; no pass claim. Fresh-server batches of every spec are running to avoid cumulative font/image process memory. Initial axe scan found six measured contrast nodes; corrected in 8df1e19e, fresh all-step/light+dark scan pending. Final browser results must replace this pending record before ready.

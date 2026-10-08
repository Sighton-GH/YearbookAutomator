# YearbookAutomator independent audit

Base: 53b904b40b6836e0ab68ea9045b7414ec97a6c87
Final reviewed bundle HEAD: 7e5532eaae82e759a8e158582747945874ad860e
Date: October 8, 2026
Read-only audit, fictional probes. No tracked source edits, pushes or PRs.

## Remaining findings

### Medium: Unicode fallback still reparses all font cmaps per distinct missing character
`tool/server/app/services/glyph_fallback.py:53-58` and `:21-28`.

`covering_paths` exhaustively scans installed fonts, but the cmap cache holds only 32. On this machine's 1,985 real font files, asking coverage for five distinct CJK characters took 11.24 seconds, with 9,925 cache misses and zero hits. Independent synthetic 100-font probes likewise caused 100 new font loads per distinct codepoint. The new path-list cache fixes repeated scans across fitting sizes for the same codepoint, but not scans across new codepoints. Many different missing CJK characters can make first rendering slow. This is not an unbounded cmap-memory claim: the cache is bounded. Whole-document worst-case render time was not measured.

Repro: clear glyph caches; call `covering_paths(ord(c), system_font_paths())` for each character in `中文测试𠀀`. Inspect `font_coverage.cache_info()` and elapsed time. Consider font-level compact coverage or another bounded index that avoids reparsing every font for every new character.

### Medium: frontend/backend fold parity depends on Python Unicode version
`tool/web/src/utils/placement.ts:75-82`, `tool/server/app/services/placement.py:26-28`.

The hardcoded frontend combining-class ranges describe Unicode 13. Python 3.11 in this audit uses Unicode 14. Enumerating every codepoint found 40 nonzero-combining-class marks absent from the frontend ranges. Concrete result: Python `fold_name("A\u1ac1")` returns `a`; frontend normalization plus its actual accentMarks regex returns `a᫁`. This can change name matching/order and baby-slot correspondence. The reported Indic vowel issue is fixed: कुमार and कुमर remain distinct. Full parity is not fixed for supported newer Python runtimes. Pin the Unicode contract or generate/share it for the supported runtime versions.

### Low: excluded people still receive slot-1 crop fallback
`tool/web/src/utils/babySlot.ts:24`, `tool/web/src/steps/edit/PeopleTab.tsx:189-190`, `tool/web/src/components/BabyPhotoEditor.tsx:109-114`.

Excluded people are omitted from the mapping entirely. The thumbnail/editor then use the first slot's baby box rather than their saved explicit assignment. A runtime call with excluded person 1 pinned to slot 2 produces no person-1 entry; the actual consumer falls back to slot 1. With square slot 1 and portrait slot 2, editing the excluded person's baby image uses the wrong aspect and output size. Excluded people do not render, so this is an editing consistency issue, not a current composite placement issue. Browser interaction for this exact case was not run.

## Restore-exact collision caveat

`tool/server/app/routes/mapping.py:446,479-483` accepts `restore_exact=true` for ordinary source files, not only validated editor replay. Two HTTP uploads of red then blue `ordinary.png` with that flag both return `ordinary.png`; the stored pixel is blue. Thus the new ordinary-upload collision protection is bypassable by this API option. Exact ordinary destinations can be useful for import, so this is not an authentication bypass or a confirmed unintended normal-UI overwrite. The caller must deliberately choose exact restoration. Specify and test import collision/overwrite semantics before describing the route as unable to overwrite non-editor files.

Editor replay itself validates prefix and PNG extension, rejects non-editor `source.png` and traversal names with 400, requires baby kind, and retains workspace write enforcement. Valid baby_edit/baby_preview replay returns the exact requested filename. Existing editor files can intentionally be replaced by replay. Browser end-to-end chained config import was not rerun after this last delta.

## Reverified fixes

- Portrait detector exception: real generator monkeypatched detector raises; final generator completes rather than propagating the exception. Catch also records a warning when warning_cb exists.
- Strip pins: real preview-strip HTTP route now agrees with full placement, first two placements [(1,410),(2,10)] rather than applying pins twice.
- Ordinary same-basename HTTP uploads without restore_exact: second upload gets a new name; first red image is preserved. Earlier claim that normal bulk UI overwrote a shared face-centred basename was incorrect and retracted: uploadImage already randomized the transmitted name.
- Editor-owned preview/edit HTTP uploads get UUID reserved names and cleanup deletes both unprotected assets. Ordinary reserved-prefix uploads are renamed away from that namespace and are not editor cleanup candidates.
- Valid exact replay now retains its destination. Previous replay-name mismatch fixed at route and caller name-check level.
- Default fictional real composite at base versus earlier reviewed head had identical pixels (ImageChops difference bbox None). Not rerun against final tiny delta.
- F4 portrait settings reach actual generate request: focused e2e passed, along with layout edit/history and detection mask.
- Pending adjustments reload and ordinary pending-upload leave dialog: focused e2e passed. Active commercial lock e2e passed.
- Slot collision frontend resolver claims explicit slots first and displaces defaults, matching backend scheme on reviewed paths. Layout edits/history paths were read and exercised by focused e2e. Full XLSX-versus-render output for every permutation was not independently compared.
- Output generator restricts temporary output permissions before atomic replace. Storage permission code also reviewed. Every format's filesystem mode was not independently measured.
- Commercial-owner takeover checks owner binding, admin enable setting and unexpired conflicting lock under the registry mutex. Admin-authenticated takeover is a distinct override and can replace an active commercial lock by design; it is not subject to the commercial-owner stale-lock gate.
- Duplicate ZIP ambiguity handling, upload byte/pixel/archive validation, path containment, autosave/flush state fields and pending render confirmation paths were inspected. No additional demonstrated exploit reported.

## Checks and limits

Final HEAD build passes; 67 frontend unit tests pass. Final Python 3.11 suite: 365 pass, 1 skip, 5 fail. Four failures are direct Python calls to the upload handler that omit newly added FastAPI Form defaults, causing Form objects instead of HTTP-parsed values; these do not establish a real HTTP HEIC regression. One failure is absent ONNX CPU provider in this test environment. These are not a green backend suite and must not be reported as such.

Independent HTTP/generator probe file: nine probes complete. Earlier focused browser batches total 11 passing e2e cases: 3 state/leave/lock, 3 F4/layout/mask, 5 text/bulk/filename/people. The five-case batch ran on c670 immediately before final delta. Full e2e attempt timed out; final entire browser suite was not completed.

Inspected real screenshot pixels of F4 portrait crop editor, F4 render preview and F3 cutout/layout editor: controls and crop/ellipse preview were visible and readable. These screenshots belong to earlier focused runs, not final-head full visual coverage.

Reviewed substantial backend/frontend normalized diffs, the fix deltas in full, face_detection, background_removal, components, CSS and added e2e. Some large output batches overflowed; this is NOT a certified literal every-line review of all 202 changed files. Native GPU/Ultra/RetinaFace/YuNet model execution, actual rembg downloads/production model inference, production concurrent-worker stress, all export formats, every import/undo/remap permutation and all visual states remain unverified. No claim of absence of bugs in those areas.

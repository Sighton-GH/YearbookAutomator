# Audit Bug-Fix Pass (Plan 1 of 2) Implementation Plan

> **For agentic workers:** Executed with opencode-driven-development (Muse Spark 1.3 implements and reviews every task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every verified defect from the 2026-10-05 end-to-end audit that breaks the live tool, corrupts data, or misleads users, without adding new customisation features (those are Plan 2).

**Architecture:** Surgical fixes inside the existing FastAPI services/routes (`tool/server/app/`) and React app (`tool/web/src/`). Backend fixes are test-first with pytest. Frontend has no test suite, so frontend tasks are gated on `tsc` + ESLint (0 errors) and are exercised by the controller in a headless browser against an isolated backend after the branch is complete.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, Pillow, pandas, OpenCV; React 18 + TypeScript + Vite, axios.

**Spec:** Audit findings in `.oc-runs/e2e-audit/audit-{1..5}-findings.md` and controller verification notes in `.oc-runs/e2e-audit/progress.md` (both gitignored, local only). User decisions: bugs-first scope; quote fitting keeps its current behaviour (quote may use up to 1.5x portrait width and full portrait height — do NOT change this); session/licence fixes approved for delegation.

## Global Constraints

- No new Python or npm dependencies.
- API payloads stay snake_case end-to-end; any field added to `tool/server/app/models/schemas.py` must be mirrored by hand in `tool/web/src/types.ts` or `tool/web/src/api.ts`.
- Do not touch `website/`, `deploy/`, `server/` (legacy top-level dir), or any systemd unit. Do not start, stop or restart any service.
- Quote rendering geometry stays as it is today: `max_quote_width = min(slot.quote.width, slot.mugshot.width * 1.5)` and `max_height = slot.mugshot.height`.
- Backend tests monkeypatch `storage.BASE_DATA` to a tmp dir (see `tool/server/tests/test_storage.py`); never write to the real `tool/server/app/data/`.
- The drive is mounted noexec: run frontend tools via `node node_modules/<pkg>/...`, never `npx`/`npm run`.
- Python venv lives only in the main checkout: from a worktree use `"/media/bryan/OptiData1/VS Code/Personal Projects/Yearbook Grad Mugshot Automator/tool/server/.venv/bin/python"`.
- User-facing messages are plain English for school staff: no raw codes (`workspace_generation_in_progress`), no Python exception names, no "HTTP 500".
- Product name strings stay "Custom Flow Automator" / "Sighton Yearbook Tools".

**Full verification command (VERIFY_ALL)** — run from the worktree root:
```
PY="/media/bryan/OptiData1/VS Code/Personal Projects/Yearbook Grad Mugshot Automator/tool/server/.venv/bin/python"; (cd tool/server && "$PY" -m pytest -q) && (cd tool/web && node node_modules/typescript/bin/tsc --noEmit -p . && node node_modules/eslint/bin/eslint.js . --max-warnings 9)
```
(`--max-warnings 9` = today's baseline; tasks must not add warnings, and Tasks 10/11 remove some.)

## Review Focus

1. A roster with 2+ spreads (e.g. 214 people / 16 slots) rendered with "Render all" must produce every spread, in order, with no stale files from an earlier larger or different-format render — covered by Task 1 tests.
2. A teacher's real-world roster CSV (Excel "CSV" in Windows-1252 with accented names, `first_name`-style headers, a blank row) must ingest or fail with a readable 400 — covered by Task 6 tests.
3. A font picked from the Style dropdown (system or uploaded) must be the font in the output PNG, and Bold must select a bold face when the family has one — covered by Task 4 tests.
4. A portrait shot on a phone (EXIF orientation 6) must render upright — covered by Task 5 tests.
5. One bad file inside a 150-photo ZIP must not abort the whole upload; it is skipped with a warning naming the file — covered by Task 7 tests.

---

### Task 1: Render all works for multi-spread yearbooks; outputs list is current

**Files:**
- Modify: `tool/web/src/App.tsx` (function `handleRenderAll`, ~line 2268)
- Modify: `tool/web/src/configFile.ts` (function `describeApiError`, line 37)
- Modify: `tool/server/app/routes/generation.py` (`_list_output_files` ~line 47, `generate` ~line 113)
- Test: `tool/server/tests/test_generation_outputs.py` (add tests)

**Interfaces:**
- Produces: `_clear_previous_outputs(root: Path, keep: str) -> None` in `generation.py`; `describeApiError` maps known server codes to friendly text (Task 2 relies on the `"generation_cancelled"` mapping added here).

Root cause (verified): `handleRenderAll` runs `maxParallel = 3` concurrent `/api/generation/generate` calls on one workspace; `progress.try_reserve_generation` allows one generation per workspace and returns 409 `workspace_generation_in_progress` to the rest, so "Render all" fails for any project with more than one spread.

- [ ] **Step 1: Failing backend tests** — append to `tool/server/tests/test_generation_outputs.py`:

```python
def test_list_output_files_prefers_most_recent_format(tmp_path):
    import os, time
    from app.routes.generation import _list_output_files
    (tmp_path / "output.pdf").write_bytes(b"old")
    old = time.time() - 100
    os.utime(tmp_path / "output.pdf", (old, old))
    (tmp_path / "output.tiff").write_bytes(b"new")
    assert [p.name for p in _list_output_files(tmp_path)] == ["output.tiff"]


def test_list_output_files_orders_spreads_numerically(tmp_path):
    from app.routes.generation import _list_output_files
    for n in (1, 2, 10, 100):
        (tmp_path / f"output_{n:02d}.png").write_bytes(b"x")
    assert [p.name for p in _list_output_files(tmp_path)] == [
        "output_01.png", "output_02.png", "output_10.png", "output_100.png"
    ]


def test_clear_previous_outputs_removes_stale_spreads_but_not_preview(tmp_path):
    from app.routes.generation import _clear_previous_outputs
    for name in ["output_01.png", "output_02.png", "output_03.png", "output.pdf", "output_01.tiff", "preview.png"]:
        (tmp_path / name).write_bytes(b"x")
    _clear_previous_outputs(tmp_path, keep="output_01.png")
    assert sorted(p.name for p in tmp_path.iterdir()) == ["output_01.png", "preview.png"]
```

- [ ] **Step 2:** Run `"$PY" -m pytest tests/test_generation_outputs.py -q` from `tool/server` → the three new tests FAIL.

- [ ] **Step 3: Backend implementation** in `tool/server/app/routes/generation.py`:

Replace `_list_output_files` with:
```python
_SPREAD_NUM_RE = re.compile(r"^output_(\d+)$")


def _list_output_files(root) -> list:
    """Return the most recent render's spread files, ordered by spread number.

    A workspace can hold leftovers from earlier renders in other formats; only the
    extension group with the newest file is returned.
    """
    candidates = [p for p in root.glob("output*") if p.is_file() and p.suffix.lower() in _OUTPUT_EXTS]
    if not candidates:
        return []
    newest_ext = max(candidates, key=lambda p: p.stat().st_mtime).suffix.lower()
    group = [p for p in candidates if p.suffix.lower() == newest_ext]
    spreads = [p for p in group if _SPREAD_NUM_RE.match(p.stem)]
    if spreads:
        return sorted(spreads, key=lambda p: int(_SPREAD_NUM_RE.match(p.stem).group(1)))
    return [p for p in group if p.stem == "output"][:1]


def _clear_previous_outputs(root, keep: str) -> None:
    """Delete output.* / output_*.* files (any format) except `keep`. Never touches preview.*."""
    for p in root.glob("output*"):
        if p.is_file() and p.name != keep and p.suffix.lower() in _OUTPUT_EXTS and (p.stem == "output" or _SPREAD_NUM_RE.match(p.stem)):
            try:
                p.unlink()
            except OSError:
                pass
```
(add `import re` at the top if absent). In `generate`, after the reservation succeeds and before `start_job`, add:
```python
    # A new full render starts at spread 1 (or the single-file output): drop leftovers
    # from earlier renders so downloads never mix old and new spreads.
    if re.match(r"^output(_0*1)?\.[a-z]+$", requested_output):
        _clear_previous_outputs(workspace_dir(payload.workspace_id), keep=requested_output)
```

- [ ] **Step 4:** Re-run the test file → PASS. Commit.

- [ ] **Step 5: Frontend — serialize Render all.** In `App.tsx` `handleRenderAll`: change `const maxParallel = 3;` to `const maxParallel = 1;` and change the status text `Rendering ${totalSpreads} spreads (max ${maxParallel} at a time)...` to `Rendering ${totalSpreads} spreads…`. Change the zero-padding of spread filenames from `padStart(2, "0")` to `padStart(3, "0")` only if `totalSpreads >= 100`, i.e. `String(spreadIdx + 1).padStart(totalSpreads >= 100 ? 3 : 2, "0")`. Change the failure status from `"Generation failed.\nOne or more spreads did not render successfully."` to `` `Generation stopped at spread ${completed + 1} of ${totalSpreads}. The spreads already finished are still available below; fix the problem shown above and press Render all again.` ``. Keep `suppressStatus: true` for spreads, but make the server's reason visible: add an optional `onError?: (message: string) => void` option to `runGeneration`, call it in each of its three failure branches with the same text those branches pass to `setStatus`, have the worker store it in a local `lastError`, and append `\n${lastError}` to the failure status when present.

- [ ] **Step 6: Friendly codes.** In `configFile.ts` `describeApiError`, before `return detail;`, translate known server codes:
```ts
const FRIENDLY_SERVER_CODES: Record<string, string> = {
  workspace_generation_in_progress: "A render is already running for this project. Wait for it to finish (or cancel it), then try again.",
  server_generation_capacity_reached: "The server is busy rendering other projects. Please try again in a minute.",
  workspace_image_job_in_progress: "Another photo is still being processed for this project. Wait for it to finish, then try again.",
  generation_cancelled: "Rendering was cancelled.",
};
```
and `if (typeof detail === "string" && detail.trim()) return FRIENDLY_SERVER_CODES[detail.trim()] ?? detail;`. Also apply the same lookup to `reason`.

- [ ] **Step 7:** Run VERIFY_ALL → passes. Commit.

---

### Task 2: Rendering can be cancelled and never polls forever

**Files:**
- Modify: `tool/server/app/services/progress.py`, `tool/server/app/routes/generation.py`
- Modify: `tool/web/src/api.ts` (add `cancelGeneration`), `tool/web/src/App.tsx` (`runGeneration`, `handleRenderAll`, pass props), `tool/web/src/steps/FinalizeStep.tsx` (Cancel button)
- Test: `tool/server/tests/test_progress.py` (add tests)

**Interfaces:**
- Consumes: Task 1's `"generation_cancelled"` friendly mapping.
- Produces: `progress.request_cancel(job_id: str) -> bool`, `progress.is_cancel_requested(job_id: str) -> bool`, `class GenerationCancelled(Exception)` in `progress.py`; route `POST /api/generation/cancel` with JSON body `{"job_id": str, "workspace_id": str}` → `{"ok": bool}`; `api.ts` `cancelGeneration(jobId: string, workspaceId: string): Promise<boolean>`; FinalizeStep prop `onCancelRender?: () => void`.

- [ ] **Step 1: Failing tests** — append to `tool/server/tests/test_progress.py`:
```python
def test_request_cancel_marks_job_and_unknown_job_returns_false():
    from app.services import progress
    progress.start_job("job-c1", "ws1")
    assert progress.is_cancel_requested("job-c1") is False
    assert progress.request_cancel("job-c1") is True
    assert progress.is_cancel_requested("job-c1") is True
    assert progress.request_cancel("no-such-job") is False


def test_cancel_check_raises_inside_progress_callback():
    import pytest
    from app.services import progress
    progress.start_job("job-c2", "ws1")
    progress.request_cancel("job-c2")
    with pytest.raises(progress.GenerationCancelled):
        progress.raise_if_cancelled("job-c2")
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** in `progress.py`: store `"cancel_requested": False` in the dict created by `start_job`; add
```python
class GenerationCancelled(Exception):
    pass


def request_cancel(job_id: str) -> bool:
    with _lock:
        job = _progress.get(job_id)
        if job is None:
            return False
        job["cancel_requested"] = True
        return True


def is_cancel_requested(job_id: str) -> bool:
    with _lock:
        job = _progress.get(job_id)
        return bool(job and job.get("cancel_requested"))


def raise_if_cancelled(job_id: str) -> None:
    if is_cancel_requested(job_id):
        raise GenerationCancelled()
```
In `routes/generation.py` `run_generation`, change the progress callback to `lambda pct, msg: (raise_if_cancelled(job_id), update_job(job_id, progress=pct, status=msg))` (or an equivalent small inner function), and add `except GenerationCancelled: update_job(job_id, status="cancelled", error="generation_cancelled")` before the generic `except`. Add the route:
```python
class CancelGenerationRequest(BaseModel):
    job_id: str
    workspace_id: str


@router.post("/cancel")
async def cancel(payload: CancelGenerationRequest, request: Request) -> dict[str, Any]:
    enforce_workspace_write(request, payload.workspace_id)
    job = get_job(payload.job_id)
    if not job or job.get("workspace_id") != payload.workspace_id:
        return {"ok": False}
    return {"ok": request_cancel(payload.job_id)}
```
(`generate_composite` already calls `progress_cb` once per person, so cancellation takes effect within one person; the `finally` already releases the reservation.) Add a route test in `tests/test_generation_outputs.py` following the existing LiveTestClient pattern in that file: create a job with `progress.start_job(uuid, workspace_id)`, POST `/api/generation/cancel` with the licence headers, assert `{"ok": True}` and `progress.is_cancel_requested(...)`; and that a job belonging to another workspace returns `{"ok": False}`.
- [ ] **Step 4:** Tests PASS. Commit.
- [ ] **Step 5: Frontend.** `api.ts`: `export async function cancelGeneration(jobId: string, workspaceId: string) { const { data } = await axios.post<{ ok: boolean }>("/api/generation/cancel", { job_id: jobId, workspace_id: workspaceId }); return Boolean(data.ok); }`. `App.tsx`: add `const activeJobIdRef = useRef<string | null>(null);` and `const cancelRequestedRef = useRef(false);`. In `runGeneration` set `activeJobIdRef.current = jobId` after `generateSpread`, clear it on every return path. In the poll loop: (a) if `cancelRequestedRef.current` and the status shows `error === "generation_cancelled"`, show `"Rendering cancelled."` and return null; (b) stall guard — track `lastProgress`/`lastChangeMs`; if progress and status text have not changed for 10 minutes, set status `"Rendering seems stuck (no progress for 10 minutes). Press Cancel, then try again."` keep polling but at 2s intervals. Add `const handleCancelRender = async () => { cancelRequestedRef.current = true; const id = activeJobIdRef.current; if (id && workspaceId) { try { await cancelGeneration(id, workspaceId); } catch { /* status poll will surface it */ } } };`. Reset `cancelRequestedRef.current = false` at the start of `handleRenderAll` and `handleRenderPreview`; `handleRenderAll`'s worker loop must stop scheduling further spreads when `cancelRequestedRef.current` is true and the final status must read `Rendering cancelled after ${completed} of ${totalSpreads} spreads.`. Pass `onCancelRender={handleCancelRender}` to `FinalizeStep`.
- [ ] **Step 6:** `FinalizeStep.tsx`: accept `onCancelRender?: () => void`; next to the Render all button render `{loading && onCancelRender && (<button type="button" onClick={onCancelRender}>Cancel</button>)}`.
- [ ] **Step 7:** VERIFY_ALL passes. Commit.

---

### Task 3: "Load a sample project" and config import work again

**Files:**
- Modify: `tool/web/src/App.tsx` (`loadSampleRef.current` ~line 2511; `runImportTemplateIfReady` ~line 1007; `applyImportedSession` ~line 880)
- Modify: `tool/web/src/configImport.ts` (`ParseTemplateFn` ~line 88, `importTemplate` ~line 140)

Root cause (verified in a browser): both call `parseTemplate(...)` without `workspaceId`; `POST /api/templates/parse` now requires `workspace_id` and returns 400. The server's `template_id` equals the workspace id, so both flows must reuse the app's current resolved `workspaceId` (state in `App.tsx`) instead of minting a new one.

- [ ] **Step 1:** Sample loader: change the parse call to `parseTemplate(annotated, clean, { minArea: parseMinArea, workspaceId: workspaceId || undefined })`; if `workspaceId` is falsy, set status `"Could not load the sample project: your session is still starting. Wait a moment and try again."` and return before uploading. Remove `setWorkspaceId(parsed.template_id)` (the workspace does not change). Change the catch message to `` `Could not load the sample project. ${formatServerMessage(err)}` `` (import `formatServerMessage` if not already imported) so users see the server's reason, not "Request failed with status code 400".
- [ ] **Step 2:** `configImport.ts`: add `workspaceId?: string;` to `ParseTemplateFn`'s opts type; add `workspaceId: string` to `importTemplate`'s args and pass `workspaceId: args.workspaceId` into the `parseTemplate` opts. Change the return type to `Promise<{ template_id: string; width: number; height: number; slots: TemplateSlots[] }>` and return the full parse response (import `TemplateSlots` from `./api`), so callers can see the fresh layout.
- [ ] **Step 3:** `App.tsx` `runImportTemplateIfReady`: if `!workspaceId` set `configImportError` to `"Your session is still starting. Wait a moment and try again."` and return. Pass `workspaceId` to `importTemplateRemote`. Use `resp.template_id` where `newWs` was used. After `applyImportedSession(s, resp.template_id)`, if the imported session's `templateSize` is missing or differs from `{ width: resp.width, height: resp.height }`, override with the fresh parse: `setSlots(resp.slots); setParsedSlots(resp.slots.map((x) => ({ ...x }))); setTemplateSize({ width: resp.width, height: resp.height });` and append to the import status: `"The template you uploaded is a different size from the one in this config, so the freshly detected layout was used instead of the saved slot positions."`.
- [ ] **Step 4:** `applyImportedSession`: also restore output settings the config carries — `outputFormat` (when it is `"png" | "pdf" | "tiff"`) and `outputSize` (when it is an object with positive numeric `width`/`height`) — using the same session field names `buildSessionPayload` writes (read `buildSessionPayload` to get the exact names; do not invent new ones).
- [ ] **Step 5:** VERIFY_ALL passes. Commit.

---

### Task 4: Fonts chosen in Style are the fonts that print; Bold works

**Files:**
- Modify: `tool/server/app/services/fonts.py` (add a family index)
- Modify: `tool/server/app/services/generator.py` (`_load_font`, lines 161-204)
- Modify: `tool/web/src/steps/edit/StyleTab.tsx` (remove forced italic, ~line 154-161)
- Modify: `tool/web/src/components/FontPick.tsx` (size max)
- Test: `tool/server/tests/test_generator_fonts.py`

**Interfaces:**
- Produces: `fonts.resolve_font_file(workspace_id: str, family: str, bold: bool) -> Path | None`.

Root cause (verified): the picker sends the font's name-table family (`'"Liberation Serif"'`), but `_load_font` only matches uploaded *filenames* or passes the bare family to `ImageFont.truetype`, which cannot resolve family names — 40/40 sampled system fonts and uploaded fonts fall back to DejaVuSans. `font_weight` is never read.

- [ ] **Step 1: Failing tests** — append to `tool/server/tests/test_generator_fonts.py`:
```python
import shutil
from pathlib import Path
import pytest

LIB = Path("/usr/share/fonts/truetype/liberation")


@pytest.fixture
def ws(tmp_path, monkeypatch):
    from app.services import storage
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    (tmp_path / "data").mkdir()
    wid = uuid4().hex
    storage.workspace_dir(wid)
    return wid


@pytest.mark.skipif(not (LIB / "LiberationSerif-Regular.ttf").exists(), reason="Liberation fonts not installed")
def test_system_font_family_name_resolves_to_that_family(ws):
    font = _load_font(ws, '"Liberation Serif"', "normal", size=30)
    assert Path(font.path).name == "LiberationSerif-Regular.ttf"


@pytest.mark.skipif(not (LIB / "LiberationSerif-Bold.ttf").exists(), reason="Liberation fonts not installed")
def test_bold_weight_picks_bold_face(ws):
    font = _load_font(ws, '"Liberation Serif"', "bold", size=30)
    assert Path(font.path).name == "LiberationSerif-Bold.ttf"


@pytest.mark.skipif(not (LIB / "LiberationSerif-Regular.ttf").exists(), reason="Liberation fonts not installed")
def test_uploaded_font_resolves_by_family_name_even_when_filename_differs(ws):
    from app.services import storage
    fonts_dir = storage.workspace_dir(ws) / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(LIB / "LiberationSerif-Regular.ttf", fonts_dir / "MySchoolFont.ttf")
    font = _load_font(ws, '"Liberation Serif"', "normal", size=30)
    assert Path(font.path).parent == fonts_dir


def test_uploaded_font_by_filename_still_works(ws):
    from app.services import storage
    src = Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf")
    if not src.exists():
        pytest.skip("DejaVuSerif not installed")
    fonts_dir = storage.workspace_dir(ws) / "fonts"
    fonts_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, fonts_dir / "Custom.ttf")
    font = _load_font(ws, "Custom.ttf", "normal", size=30)
    assert Path(font.path).name == "Custom.ttf"
```
- [ ] **Step 2:** Run → the family/bold/uploaded-family tests FAIL.
- [ ] **Step 3: Implement** in `fonts.py`:
```python
from functools import lru_cache

_BOLD_WORDS = ("bold", "black", "heavy", "semibold", "demibold", "extrabold")
_REGULAR_STYLES = ("regular", "book", "roman", "normal", "medium", "")


def _family_and_style(path: Path) -> tuple[str, str]:
    try:
        font = TTFont(str(path), lazy=True)
        family = style = ""
        for rec in font["name"].names:
            if rec.nameID == 1 and not family:
                family = str(rec.toStr())
            elif rec.nameID == 2 and not style:
                style = str(rec.toStr())
            elif rec.nameID == 16:  # typographic family wins when present
                family = str(rec.toStr())
            elif rec.nameID == 17:
                style = str(rec.toStr())
        return (family or path.stem), style
    except Exception:
        return path.stem, ""


def _index(paths: list[Path]) -> dict[str, list[tuple[str, Path]]]:
    out: dict[str, list[tuple[str, Path]]] = {}
    for p in paths:
        family, style = _family_and_style(p)
        out.setdefault(family.strip().lower(), []).append((style.strip().lower(), p))
    return out


@lru_cache(maxsize=1)
def _system_index() -> dict[str, list[tuple[str, Path]]]:
    paths: list[Path] = []
    for folder in SYSTEM_FONTS_DIRS:
        if folder.exists():
            paths.extend(folder.glob("**/*.ttf"))
            paths.extend(folder.glob("**/*.otf"))
    return _index(paths)


def _pick_style(entries: list[tuple[str, Path]], bold: bool) -> Path | None:
    def is_bold(style: str) -> bool:
        return any(w in style for w in _BOLD_WORDS)

    upright = [(s, p) for s, p in entries if "italic" not in s and "oblique" not in s]
    pool = upright or entries
    if bold:
        for s, p in pool:
            if is_bold(s):
                return p
    for wanted in _REGULAR_STYLES:
        for s, p in pool:
            if s == wanted:
                return p
    non_bold = [p for s, p in pool if not is_bold(s)]
    return (non_bold or [p for _, p in pool] or [None])[0]


def resolve_font_file(workspace_id: str, family: str, bold: bool) -> Path | None:
    key = (family or "").strip().strip('"').strip("'").lower()
    if not key:
        return None
    fonts_root = workspace_dir(workspace_id) / "fonts"
    uploaded = [p for p in fonts_root.glob("*.*") if p.suffix.lower() in {".ttf", ".otf"}] if fonts_root.exists() else []
    for index in (_index(uploaded), _system_index()):
        entries = index.get(key)
        if entries:
            return _pick_style(entries, bold)
    return None
```
In `generator._load_font`, after the existing uploaded-filename loop and before the bare-`truetype` loop, insert:
```python
    bold = (font_weight or "").strip().lower() in {"bold", "700", "800", "900"}
    for cand in candidates:
        path = resolve_font_file(workspace_id, cand, bold)
        if path is not None:
            loaded = _try_truetype(str(path), size=size)
            if loaded is not None:
                return loaded
```
(import `resolve_font_file` from `app.services.fonts`). Keep every existing fallback after it unchanged.
- [ ] **Step 4:** Tests PASS (the original CSS-stack test still passes). Commit.
- [ ] **Step 5: Frontend.** `StyleTab.tsx`: remove the forced `fontStyle: "italic"` on the quote preview so preview matches output. `FontPick.tsx`: raise `MAX_FONT_SIZE` to `500` to match the API (`schemas.py` `le=500`).
- [ ] **Step 6:** VERIFY_ALL passes. Commit.

---

### Task 5: Names fit and align inside their box; photos render upright; templates and masks behave

**Files:**
- Modify: `tool/server/app/services/generator.py` (`_render_text` line 550 and its call ~line 694; `_try_open_rgb`/`_try_open_baby_rgb` ~line 621-636; template open line 571; `_load_baby_mask` ~line 507)
- Modify: `tool/server/app/services/tiff_layers.py` (its image-open helpers ~lines 74-90: same EXIF fix)
- Test: new `tool/server/tests/test_generator_rendering_fixes.py`

**Interfaces:**
- Produces: `_render_name(draw, text: str, box, load_font: Callable[[int], ImageFont.ImageFont], start_size: int, align: str, all_caps: bool, min_size: int = 8) -> None`; `_find_baby_mask_path(workspace_id: str, slot_box) -> Path | None`.

- [ ] **Step 1: Failing tests** in `tool/server/tests/test_generator_rendering_fixes.py`:
```python
from types import SimpleNamespace
from pathlib import Path
from uuid import uuid4

from PIL import Image, ImageDraw, ImageFont
import pytest

from app.services import generator as g

DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def _font(size):
    return ImageFont.truetype(DEJAVU, size)


def _ink_bbox(img):
    inv = Image.eval(img.convert("L"), lambda v: 255 - v)
    return inv.getbbox()


def test_long_name_shrinks_to_fit_box_width():
    img = Image.new("RGB", (400, 100), "white")
    box = SimpleNamespace(x=10, y=10, width=200, height=60)
    g._render_name(ImageDraw.Draw(img), "Alexandria Featherington-Wetherby", box, _font, 40, "left", False)
    left, top, right, bottom = _ink_bbox(img)
    assert right <= box.x + box.width + 1


def test_centre_aligned_name_is_centred_in_box():
    img = Image.new("RGB", (600, 100), "white")
    box = SimpleNamespace(x=100, y=10, width=400, height=60)
    g._render_name(ImageDraw.Draw(img), "Ann Lee", box, _font, 30, "center", False)
    left, _, right, _ = _ink_bbox(img)
    assert abs(((left + right) / 2) - (box.x + box.width / 2)) <= 3


def test_exif_rotated_photo_is_transposed(tmp_path):
    img = Image.new("RGB", (40, 20), "red")
    exif = img.getexif()
    exif[0x0112] = 6  # rotate 90 CW when displayed
    path = tmp_path / "p.jpg"
    img.save(path, exif=exif.tobytes())
    opened = g._open_rgb_upright(path)
    assert opened.size == (20, 40)


def test_transparent_template_composites_on_white(tmp_path):
    path = tmp_path / "t.png"
    Image.new("RGBA", (10, 10), (0, 0, 0, 0)).save(path)
    assert g._open_template_rgb(path).getpixel((5, 5)) == (255, 255, 255)


def test_baby_mask_found_after_small_slot_nudge(tmp_path, monkeypatch):
    from app.services import storage
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    (tmp_path / "data").mkdir()
    wid = uuid4().hex
    masks = storage.workspace_dir(wid) / "masks" / "baby"
    masks.mkdir(parents=True)
    Image.new("L", (100, 80), 255).save(masks / "50_60_100_80.png")
    nudged = SimpleNamespace(x=52, y=59, width=100, height=80)
    assert g._find_baby_mask_path(wid, nudged) == masks / "50_60_100_80.png"
    far = SimpleNamespace(x=400, y=400, width=100, height=80)
    assert g._find_baby_mask_path(wid, far) is None
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
  - `_render_name`: single line (names are not wrapped). Start at `start_size`, step down by 1 to `min_size`, choosing the first size whose `draw.textbbox((0,0), content, font=font)` width ≤ `box.width`. Draw with `anchor="la"` at `(box.x, box.y)` for left, or `anchor="ma"` at `(box.x + box.width / 2, box.y)` for center, `fill=(20, 30, 50)`. If nothing fits, draw at `min_size`. Replace the `_render_text(...)` call for names (~line 694) with `_render_name(draw, f"{person.first_name} {person.last_name}", slot.name, lambda s: _load_font(payload.workspace_id, name_font_family, name_font_weight, size=s), name_font_size, name_align, name_all_caps)`. Delete `_render_text` if it has no remaining callers (grep first; `tiff_layers.py` may have its own copy — leave that file's text code alone except for EXIF).
  - Add module-level `_open_rgb_upright(path: Path) -> Image.Image` (`with Image.open(path) as img: return ImageOps.exif_transpose(img).convert("RGB")`) and use `ImageOps.exif_transpose` in both `_try_open_rgb` and `_try_open_baby_rgb` (keep their existing exception handling and the `_fill_transparency` branch; transpose first). Same transpose in the equivalent opens in `tiff_layers.py`.
  - Add `_open_template_rgb(path: Path) -> Image.Image`: open; if mode has alpha (`"A" in img.getbands()` or `img.mode == "P"` with transparency), paste onto a white RGB canvas using the alpha channel; else `convert("RGB")`. Use it at line 571 in place of `Image.open(template_path).convert("RGB")`.
  - Add `_find_baby_mask_path(workspace_id, slot_box)`: return the exact-name path if it exists; else scan `masks/baby/*.png`, parse `x_y_w_h` from each stem, and return the one with the highest intersection-over-union with `slot_box` if that IoU ≥ 0.8, else `None`. Make `_load_baby_mask` use it (keep its resize-to-slot logic).
- [ ] **Step 4:** Tests PASS; full backend suite still passes. Commit.

---

### Task 6: Roster spreadsheets from real schools ingest (or fail with a readable reason)

**Files:**
- Modify: `tool/server/app/services/spreadsheet.py` (`_find_name_columns`, `_load_dataframe`, `ingest_spreadsheet` row loop)
- Modify: `tool/server/app/routes/mapping.py` (`ingest` route ~line 391: map errors to 400)
- Test: new `tool/server/tests/test_spreadsheet_ingest.py`

**Interfaces:**
- Produces: `class RosterFormatError(ValueError)` in `spreadsheet.py` (Task 7 raises it too).

Verified failures: blank CSV row → phantom student `"nan nan"`; `first_name`/`FirstName`/`Full Name` headers → bare `ValueError` → HTTP 500; Windows-1252 CSV (`José`) → `UnicodeDecodeError` → HTTP 500.

- [ ] **Step 1: Failing tests:**
```python
import io
from uuid import uuid4
import pytest

from app.services import spreadsheet as s


@pytest.fixture(autouse=True)
def _data(tmp_path, monkeypatch):
    from app.services import storage
    monkeypatch.setattr(storage, "BASE_DATA", tmp_path / "data")
    (tmp_path / "data").mkdir()


def names(csv_bytes, filename="r.csv"):
    r = s.ingest_spreadsheet(uuid4().hex, io.BytesIO(csv_bytes), filename, None)
    return [(p.index, p.first_name, p.last_name) for p in r.people]


def test_blank_rows_are_dropped_and_indices_stay_contiguous():
    assert names(b"First Name,Last Name\nJohn,Doe\n,\n  ,  \nJane,Smith\n") == [(1, "John", "Doe"), (2, "Jane", "Smith")]


@pytest.mark.parametrize("header", ["first_name,last_name", "FirstName,LastName", "First,Last", "Given Name,Surname", "FIRST NAME,LAST NAME", "Student First Name,Student Last Name"])
def test_common_header_variants(header):
    assert names(f"{header}\nJohn,Doe\n".encode()) == [(1, "John", "Doe")]


def test_single_full_name_column_is_split_on_last_space():
    assert names(b"Full Name\nMary Ann Lee\nCher\n") == [(1, "Mary Ann", "Lee"), (2, "Cher", "")]


def test_windows_1252_csv_with_accents():
    assert names("First Name,Last Name\nJosé,García\n".encode("cp1252")) == [(1, "José", "García")]


def test_missing_name_columns_raises_roster_format_error_with_help():
    with pytest.raises(s.RosterFormatError) as exc:
        names(b"Student,Grade\nJohn,12\n")
    assert "First Name" in str(exc.value) and "Last Name" in str(exc.value)


def test_empty_file_raises_roster_format_error():
    with pytest.raises(s.RosterFormatError):
        names(b"")
```
Also add a route test (LiveTestClient pattern from `tests/test_generation_outputs.py`) that POSTs `/api/mapping/ingest` with a CSV lacking name columns and asserts status 400 and that `detail` mentions "First Name".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.**
  - `class RosterFormatError(ValueError)`.
  - `_load_dataframe`: for CSV try encodings in order `("utf-8-sig", "cp1252", "latin-1")` with `pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False)`; catch `pd.errors.EmptyDataError` → `RosterFormatError("The roster spreadsheet is empty.")`. For XLSX use `pd.read_excel(buf, dtype=str, keep_default_na=False)`; wrap any read exception in `RosterFormatError("Could not read the roster spreadsheet. Save it as .xlsx or .csv and try again.")`. Note: if `validate_spreadsheet_bytes` raises for empty bytes first, let that propagate unchanged (it is already a 400 `UnsafeUpload`); the empty-file test then needs `pytest.raises((s.RosterFormatError, ValueError))` — prefer making the empty case produce `RosterFormatError` by checking `if not data.strip(): raise RosterFormatError(...)` before validation.
  - `_find_name_columns(df) -> tuple[str | None, str | None, str | None]` returning `(first_col, last_col, full_col)`: normalise each header with `re.sub(r"[^a-z]", "", camel_to_words(header).lower())` where the normalisation must turn `first_name`, `FirstName`, `First Name`, `FIRST NAME`, `Student First Name` into strings containing `firstname`. Match first-name columns on any of: contains `firstname`, equals `first`, contains `givenname`, equals `forename`/`preferredname`(only if no other first column). Last-name: contains `lastname`, equals `last`, contains `surname`, contains `familyname`. Full-name (used only when first or last is missing): equals one of `name`, `fullname`, `studentname`, `student`. If neither pair nor full is found → `RosterFormatError("Could not find the student name columns. The roster needs a 'First Name' column and a 'Last Name' column (or a single 'Full Name' column). Columns found: <comma-separated list of the first 10 headers>.")`.
  - Row loop: build names with a helper `_cell(row, col) -> str` that returns `""` for `None`/NaN and `str(v).strip()` otherwise. With a full-name column, split on the last whitespace (`"Mary Ann Lee"` → `("Mary Ann", "Lee")`, single word → `(word, "")`). Skip rows whose first and last are both empty; assign `index` contiguously (1, 2, 3…) over the kept rows. Use the same kept-row numbering everywhere `valid_indices` and the numeric portrait mapping refer to rows (photo `001.jpg` = first kept row) and when building `name_tokens`.
  - Replace the plain `ValueError` raises for the row cap and naming pattern with `RosterFormatError` and friendly text (`"The roster has more than 5,000 rows…"`, `"The portrait filename pattern is not valid: …"`).
  - Route `ingest`: wrap the `ingest_spreadsheet(...)` call: `except RosterFormatError as exc: raise HTTPException(status_code=400, detail=str(exc)) from None`.
- [ ] **Step 4:** Tests PASS; full backend suite passes. Commit.

---

### Task 7: Photo matching is robust (accents, look-alike names, duplicate filenames, one bad file)

**Files:**
- Create: `tool/server/app/services/name_matching.py`
- Modify: `tool/server/app/services/spreadsheet.py` (replace the nested `_normalize/_tokens/_compact/_matches_name`), `tool/server/app/routes/mapping.py` (`_normalize_name/_tokens/_compact/_matches_name` and the baby-ZIP loop ~lines 691-782)
- Modify: `tool/web/src/App.tsx` (default naming pattern constant), `tool/web/src/steps/ImportStep.tsx` (portrait help copy)
- Test: new `tool/server/tests/test_name_matching.py`; extend `tool/server/tests/test_spreadsheet_ingest.py` (from Task 6)

**Interfaces:**
- Consumes: `RosterFormatError` (Task 6).
- Produces in `name_matching.py`: `normalize_name(text: str) -> str`, `name_tokens(text: str) -> list[str]`, `compact_name(text: str) -> str`, `match_people(stem_raw: str, people_tokens: dict[int, tuple[list[str], list[str]]]) -> list[int]`, `unique_stored_name(used: set[str], filename: str) -> str`.

- [ ] **Step 1: Failing tests** `tests/test_name_matching.py`:
```python
from app.services.name_matching import normalize_name, match_people, unique_stored_name


def test_accents_are_transliterated():
    assert normalize_name("José García") == "jose garcia"
    assert normalize_name("Zoë O'Brien-Smith") == "zoe o brien smith"


def test_exact_token_match_beats_compact_substring():
    people = {1: (["ann"], ["lee"]), 2: (["anne"], ["leeds"])}
    assert match_people("Anne Leeds", people) == [2]
    assert match_people("Ann Lee", people) == [1]


def test_compact_fallback_still_works_without_delimiters():
    assert match_people("johndoe2024", {7: (["john"], ["doe"])}) == [7]


def test_unique_stored_name():
    used = set()
    assert unique_stored_name(used, "photo.jpg") == "photo.jpg"
    assert unique_stored_name(used, "photo.jpg") == "photo_2.jpg"
    assert unique_stored_name(used, "photo.jpg") == "photo_3.jpg"
```
Extend `tests/test_spreadsheet_ingest.py` (helper builds a ZIP in memory with tiny JPEGs via Pillow):
  - accented roster `José,García` + ZIP member `jose_garcia.jpg` with `advanced_name_match=True` → José gets a portrait.
  - duplicate basenames in different folders: roster `Ann,Lee` / `Bob,Ray`, default pattern, ZIP members `x/001.jpg` (a red JPEG) and `y/001.jpg` (a blue JPEG). Both match row 1; the second is assigned to the next free row (row 2) by the existing logic. Assert both people get portraits, `people[0].mugshot_filename != people[1].mugshot_filename`, and the two stored files under `mugshots/` exist with different bytes (before the fix the second overwrites the first).
  - one corrupt member `003.jpg` (bytes `b"not an image"`) among valid `001.jpg`, `002.jpg` → ingest succeeds, rows 1-2 have portraits, a warning contains `003.jpg`.
  - default pattern: members `1.jpg` and `2.jpg` (no padding) map to rows 1 and 2 when called with the new default pattern.
  - `__MACOSX/._001.jpg` and `.DS_Store` members produce no warnings.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `name_matching.py`:
```python
from __future__ import annotations

import re
import unicodedata
from pathlib import Path


def normalize_name(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text or "")
    ascii_only = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    lowered = ascii_only.lower()
    lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
    return re.sub(r"\s+", " ", lowered).strip()


def name_tokens(text: str) -> list[str]:
    norm = normalize_name(text)
    return norm.split() if norm else []


def compact_name(text: str) -> str:
    return normalize_name(text).replace(" ", "")


def match_people(stem_raw: str, people_tokens: dict[int, tuple[list[str], list[str]]]) -> list[int]:
    """Return person indices whose first+last tokens appear in the filename stem.

    Exact token matches win; the delimiter-free compact fallback is used only when no
    person matches on tokens (so "Anne Leeds" never also matches "Ann Lee").
    """
    tokens = set(name_tokens(stem_raw))
    exact = [
        idx for idx, (first, last) in people_tokens.items()
        if first and last and any(t in tokens for t in first) and any(t in tokens for t in last)
    ]
    if exact:
        return exact
    compact = compact_name(stem_raw)
    return [
        idx for idx, (first, last) in people_tokens.items()
        if first and last and "".join(first) in compact and "".join(last) in compact
    ]


def unique_stored_name(used: set[str], filename: str) -> str:
    p = Path(filename)
    candidate, n = p.name, 2
    while candidate.lower() in used:
        candidate = f"{p.stem}_{n}{p.suffix}"
        n += 1
    used.add(candidate.lower())
    return candidate


def is_archive_junk(member_name: str) -> bool:
    parts = member_name.replace("\\", "/").split("/")
    base = parts[-1]
    return (
        "__MACOSX" in parts
        or base.startswith("._")
        or base.lower() in {".ds_store", "thumbs.db", "desktop.ini"}
        or base == ""
    )
```
  Use these in `spreadsheet.py` and `mapping.py` (delete the duplicated local helpers; keep `_compact_filename_name`/`_best_partial_name_match` in `mapping.py` but have them call `normalize_name`). In both ZIP loops: skip `is_archive_junk(member)` silently; wrap `validate_image_bytes(...)` per member in `try/except UnsafeUpload as exc: warnings.append(f"Skipped '{filename_only}': {exc}"); continue` (for portraits and for both baby validate calls); store files under `unique_stored_name(used_names, safe_filename(filename_only))` where `used_names` is a per-ingest `set[str]`. In `spreadsheet.py` change the default `naming_pattern` to `r"\d{1,4}"`; in the `ingest` route change `Form(r"\d{3,4}")` to `Form(r"\d{1,4}")`; in `App.tsx` change the default naming pattern constant (grep `\\d{3,4}`) to `\\d{1,4}`; in `ImportStep.tsx` update the portrait help text to say `Portrait files named with the row number (1.jpg, 01.jpg or 001.jpg → row 1) are matched first.`
- [ ] **Step 4:** Tests PASS; full backend suite passes (update `test_baby_partial_matching.py` only if a helper import path moved — do not weaken its assertions). Commit.

---

### Task 8: Quote spreadsheets keep real quotes and explain what they skipped

**Files:**
- Modify: `tool/server/app/routes/mapping.py` (`upload_quotes_spreadsheet` ~line 787-955, `_looks_like_quote` ~line 301, the `advanced_name_match` / `partial_name_match` Form defaults of both upload routes)
- Modify: `tool/web/src/api.ts` (`uploadBabyZip` and `uploadQuotesSpreadsheet`: always send booleans)
- Test: new `tool/server/tests/test_quotes_upload.py`

Verified: `_looks_like_quote` rejects one-word and non-Latin quotes even when they come from an explicit "Quote" column; warnings print the column header in quotes so they read like the value; a sheet with no name column silently applies nothing; the client cannot turn advanced matching off (it omits the field when false and the server defaults to true).

- [ ] **Step 1: Failing tests** (call the route through LiveTestClient as in `tests/test_generation_outputs.py`, posting CSV bytes and `people_json`):
  - Explicit `Quote` column values `"Finally."`, `"yolo"`, `"Isaiah 58:9"`, `"永远年轻"` are all applied to the matched people.
  - Explicit `Quote` column value `https://example.com/x` and `someone@school.ca` are NOT applied; warning text contains `Row 2` and `looks like a link or email`.
  - A sheet with columns `Quote` only → response 200, people unchanged, and `warnings[0]` contains `"no student name column"`.
  - A sheet where no row matches → a warning contains `"No rows matched"`.
  - Posting `advanced_name_match=false` as a form string is honoured (with it false, the route matches nothing by name and says so).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** When `quote_col` exists, accept its non-empty cell unless it looks like a URL or email (`_looks_like_url`/`_looks_like_email`); `_looks_like_quote` is used only for the fallback scan of other columns. Rewrite warnings to name the value, e.g. `Row {n}: {person name} — the quote cell looks like a link or email, so it was not used.` / `Row {n}: {person name} — the quote cell is empty.` / `Row {n}: no student matched the name "{raw_name}".` (truncate raw values to 60 chars). Before the row loop: if no first/last/name column was identified, return the people unchanged with warning `The quotes spreadsheet has no student name column, so quotes could not be matched. Add 'First Name' and 'Last Name' columns (or one 'Name' column).`. After the loop: if zero rows were applied, insert at index 0 `No rows matched a student on the roster. Check that the names in the quotes sheet match the roster spelling.`. Change both routes' `advanced_name_match: bool = Form(True)` to keep the default `True` but have the client always send it: in `api.ts` replace `if (opts?.advancedNameMatch) form.append("advanced_name_match", "true");` with `form.append("advanced_name_match", opts?.advancedNameMatch === false ? "false" : "true");` in both functions, and likewise `partial_name_match` (`opts?.partialNameMatch ? "true" : "false"`).
- [ ] **Step 4:** Tests PASS; VERIFY_ALL passes. Commit.

---

### Task 9: Generation requests can't silently overlap or drop students

**Files:**
- Modify: `tool/server/app/services/placement.py` (`apply_placement` or the function at lines 100-135), `tool/server/app/services/generator.py` (start of `generate_composite`), `tool/server/app/models/schemas.py` (`baby_background_color` validator)
- Modify: `tool/web/src/types.ts` only if a schema change requires it (it should not)
- Test: `tool/server/tests/test_placement_order.py`, `tool/server/tests/test_generator_baby_background_color.py`

Verified: an out-of-range `slot_assignments` value is placed on slot 1 on top of whoever is there; more people than slots are truncated by `zip`; an invalid `baby_background_color` is silently ignored and transparent pixels then render black.

- [ ] **Step 1: Failing tests.**
  - placement: 3 people, 3 slots, `slot_assignments={person3.index: 99}` → returned slots are 3 distinct slots and person 3 keeps its default slot 3 (override ignored).
  - placement: 2 people both assigned to slot 1 → `ValueError` whose message contains both student names and `"slot 1"`.
  - generator: `generate_composite` with 3 people and 2 slots raises `ValueError` containing `"3 students"` and `"2 slots"` before any file is written (follow existing generator test setup in `tests/test_generator_invalid_images.py`).
  - schemas: `GenerationRequest(..., baby_background_color="#ffgg00")` raises `pydantic.ValidationError`; `"#FFF"`, `"#ffffff"`, `"ffffff"`, `""`, and `None` are accepted.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** In placement: if `logical_idx` is out of range, use the default `i` instead of slot 0; after computing `out_slots`, detect duplicates (same slot object index) and raise `ValueError(f"Two students are assigned to slot {n}: {a} and {b}. Change one of their slot numbers on the People step.")`. In `generate_composite`: `if len(people) > len(slots): raise ValueError(f"This spread has {len(people)} students but only {len(slots)} slots. Re-render with 'Render all', which splits students across spreads.")`. In schemas: add a `field_validator("baby_background_color")` accepting `None`, empty/whitespace (→ `None`), or `^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`; otherwise raise `ValueError("Baby photo background colour must be a hex colour like #ffffff")`. The route already turns generator exceptions into job errors; make sure the job's `error` string is the message itself (it is: `str(exc)`).
- [ ] **Step 4:** Tests PASS; full backend suite passes. Commit.

---

### Task 10: People step — resets, locks and roster-only projects behave as labelled

**Files:**
- Modify: `tool/web/src/steps/edit/PeopleTab.tsx` (`resetToOriginalMapping` ~line 352, `swapPositions` ~line 177, `onDrop` ~line 692)
- Modify: `tool/web/src/steps/ImportStep.tsx` (`runPortraitsStage` ~line 547; stage status vs. newly picked files ~lines 375 and 828; template `accept` attributes ~lines 1056/1102; portrait/roster card copy)
- Modify: `tool/web/src/components/UploadDropLabel.tsx` (line ~69 rejected-drop feedback; line 186 `useMemo` deps)
- Modify: `tool/web/src/api.ts` (`ingestSpreadsheet` must allow a missing ZIP)

- [ ] **Step 1:** `resetToOriginalMapping`: restore only `mugshot_filename` from `originalPeople` (matched by `index`), keeping each current person's `quote` and `baby_photo_filename`; update the confirm/label text to "Reset portraits to how they were first matched" and the status to `"Portraits reset to their original matches (quotes and baby photos kept)."`.
- [ ] **Step 2:** `swapPositions` and the drop handler: refuse when either the source or the target person is locked (`lockedPeople` contains its index), with status `"That student is locked. Unlock them in the Inspector to move them."`.
- [ ] **Step 3:** Roster-only ingest: in `runPortraitsStage` require only the spreadsheet; when `zip` is missing proceed and after success set status `"Roster loaded without portraits. Students will use the default portrait until you upload a portraits ZIP."`. Make `ingestSpreadsheet` in `api.ts` accept `mugshotsZip: File | null` and append it only when present (backend already supports a missing ZIP).
- [ ] **Step 4:** Stale stages: whenever the user picks a new spreadsheet or portraits ZIP, set `portraitsStage` back to `"pending"`; new quotes sheet → `quotesStage` `"pending"`; new baby ZIP → `babyStage` `"pending"`. (Find the setters for `sheet`, `zip`, `quotesSheet`, `babyZip` and add the reset in the same handlers.)
- [ ] **Step 5:** Template inputs: change `accept="image/png"` to `accept="image/png,image/jpeg,image/webp"` for both template inputs and change the labels "Annotated template (.png)" / "Clean template (.png)" to "(.png or .jpg)". In `UploadDropLabel.tsx`, when a drop contains no accepted file, show the component's existing error/status mechanism (or `window.alert` only if none exists — prefer an inline message element) with text `That file type isn't accepted here. Use: <accept list in plain words>.`; add the missing `useMemo` dependencies (`accept`, `multiple`, `onFile`, `onFiles`).
- [ ] **Step 6:** VERIFY_ALL passes with `--max-warnings 8` (one warning removed). Commit.

---

### Task 11: Template layout edits can't break generation; baby editor keeps user work

**Files:**
- Modify: `tool/web/src/components/TemplatePreview.tsx` (drag/resize update ~lines 76-78), `tool/web/src/components/SlotInspectorFields.tsx` (number inputs), `tool/web/src/steps/edit/LayoutTab.tsx` (regroup button), `tool/web/src/utils/spreadUploadHandling.ts` (size check)
- Modify: `tool/web/src/components/BabyPhotoEditor.tsx` (crop dirty ~line 924, `resetEditingToOriginal` ~line 672, `useImperativeHandle` line 717)
- Modify: `tool/server/app/routes/mapping.py` (`remove-background-preview-result` ~line 603: keep bytes)
- Test: `tool/server/tests/test_background_removal.py` (preview result can be fetched twice)

- [ ] **Step 1: Slot geometry.** Add `clampBox(box, templateSize)` in `tool/web/src/utils/slots.ts`: rounds x/y/width/height to integers, width/height ≥ 1, x ∈ [0, W-1], y ∈ [0, H-1], and x+width ≤ W, y+height ≤ H (shrink width/height to fit). Call it on every drag/resize update in `TemplatePreview.tsx` and every field change in `SlotInspectorFields.tsx` (inputs: `min={0}` / `step={1}`; an empty or non-numeric field keeps the previous value instead of becoming 0).
- [ ] **Step 2: Regroup confirm.** In `LayoutTab.tsx`, before "Regroup nearby slots" runs, if the regrouped list would be shorter than the current one, ask with the existing `ConfirmDialog` component: `"Regrouping keeps {n} slots and removes {m}. Continue?"`.
- [ ] **Step 3: Size mismatch.** In `spreadUploadHandling.ts`, load both images' natural sizes (it already decodes them — reuse that) and if annotated and clean dimensions differ, call a new optional prompt handler `onSizeMismatch?: (message: string) => Promise<"continue" | "cancel">` with `"The annotated template is {aW}×{aH} but the clean template is {cW}×{cH}. They should be the same size, or boxes will land in the wrong place. Continue anyway?"`; when no handler is supplied, continue (keeps config import working). Wire a handler in `ImportStep.tsx` using its existing confirm pattern.
- [ ] **Step 4: Baby editor.** Mark edits dirty on crop change (`onCropChange={(c) => { setCrop(c); setDirtyEdits(true); }}` — use the component's actual dirty setter name). `resetEditingToOriginal` also calls `setRotation(0)`. Add `closeEditor` to the `useImperativeHandle` deps (wrap `closeEditor` in `useCallback` if needed to avoid re-creating the handle every render).
- [ ] **Step 5: Preview result.** Failing test: after a completed background-removal preview job, `GET /api/mapping/remove-background-preview-result` twice returns the same bytes both times (mirror the existing setup in `test_background_removal.py`; if no route-level test exists there, test the service/registry function the route reads from). Change the route to read the bytes without popping them; they are dropped when the next preview job for that workspace starts (existing replacement logic) — verify by reading the code and keep that behaviour.
- [ ] **Step 6:** VERIFY_ALL passes with `--max-warnings 7`. Commit.

---

### Task 12: Expired licences and lost workspaces are explained, not silent

**Files:**
- Modify: `tool/web/src/api.ts` (axios response interceptor), `tool/web/src/pages/ToolAppPage.tsx` (listen and return to the licence gate), `tool/web/src/App.tsx` (workspace-changed notice; keep the old local snapshot)

Verified gaps: no global handling of 401 licence failures (the tool stays unlocked and each action fails with "License key required"); when `/api/workspaces/resolve` returns a different workspace than the saved session (server restart or expiry), the saved session is skipped and then overwritten by autosave with no message.

- [ ] **Step 1:** `api.ts`: register once (module scope) an axios response interceptor: on `error.response?.status === 401` where `error.config?.url` starts with `/api/` and is not `/api/licensing/`, dispatch `window.dispatchEvent(new CustomEvent("ymga:license-invalid", { detail: { reason: error.response.data?.reason ?? null } }))`; always re-throw the error.
- [ ] **Step 2:** `ToolAppPage.tsx`: listen for `ymga:license-invalid`; when received while a key is active, return to the licence-entry state (the same state shown before a key is validated; do not delete the stored key value from the input) and show `"Your licence key is no longer valid (it may have expired, been revoked, or reached its limit). Enter a valid key to continue — your work in this browser is kept."`; append `(reason: X)` only when `reason` is present.
- [ ] **Step 3:** `App.tsx` restore logic (~lines 1486-1591): when a saved session exists whose `workspaceId` differs from the newly resolved one, (a) copy the saved session JSON to `localStorage` key `ymga-session-backup-v1` (with `saved_at` ISO timestamp) before anything overwrites it, and (b) set status `"Your previous project's files are no longer on the server (the session expired or the server was restarted). Your settings were saved as a backup — use File → Upload config after re-uploading files, or start again."`. Do not change the restore behaviour otherwise.
- [ ] **Step 4:** VERIFY_ALL passes (warning count must not increase). Commit.

---

## Self-review notes

- Coverage: E1→T1, E2/E5→T7, E3→T1, E4→T8; audit-1 criticals (sample/config/stale slots → T3, masks → T5, transparent template → T5), audit-1 importants (size mismatch/regroup/clamping/JPEG → T10-11); audit-2 criticals (dup basenames → T7, reset wipes quotes → T10, nan rows → T6) and importants (headers/encoding → T6, accents/ambiguity/pattern → T7, advanced toggle → T8, roster-only/stale stages/locks → T10, quotes no-name → T8); audit-3 criticals (render-all → T1, names → T5, slot collapse/people>slots → T9) and fonts/italic → T4, cancel/polling → T2; audit-4 sample/config/output restore → T3, 401/workspace loss → T12; audit-5 EXIF → T5, crop dirty/rotation/handle deps/preview pop → T11, invalid bg colour → T9.
- Deferred to Plan 2 (features) or recommendations: per-person styling, slot add/delete, DPI, face-aware mugshot crop, emoji/RTL, layered TIFF, batch photo ops, preflight report, quote-box semantics (user: keep).

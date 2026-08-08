from __future__ import annotations

import io
import re
from re import _parser as sre_parse
import zipfile
import bisect
from pathlib import Path
from typing import BinaryIO, Optional

import pandas as pd

from app.models.schemas import PersonRecord, SpreadsheetPreview
from app.services.storage import safe_filename, save_upload
from app.services.upload_security import read_zip_member, validate_image_bytes, validate_spreadsheet_bytes, validate_zip_archive


def _compile_safe_filename_pattern(pattern: str) -> re.Pattern[str]:
    """Compile a useful filename regex while rejecting ReDoS-prone constructs."""
    if len(pattern or "") > 80:
        raise ValueError("Naming pattern is too long")
    try:
        parsed = sre_parse.parse(pattern)
    except re.error as exc:
        raise ValueError(f"Invalid naming pattern: {exc}") from exc

    repeat_ops = {sre_parse.MAX_REPEAT, sre_parse.MIN_REPEAT, sre_parse.POSSESSIVE_REPEAT}
    rejected_ops = {sre_parse.GROUPREF, sre_parse.GROUPREF_EXISTS, sre_parse.ASSERT, sre_parse.ASSERT_NOT}

    def walk(tokens, *, inside_repeat: bool = False) -> None:
        for op, arg in tokens:
            if op in rejected_ops:
                raise ValueError("Naming pattern uses an unsupported advanced regex construct")
            if op in repeat_ops:
                if inside_repeat:
                    raise ValueError("Naming pattern contains nested repetition")
                _minimum, _maximum, child = arg
                walk(child, inside_repeat=True)
            elif op is sre_parse.SUBPATTERN:
                walk(arg[-1], inside_repeat=inside_repeat)
            elif op is sre_parse.BRANCH:
                if inside_repeat:
                    raise ValueError("Naming pattern repeats an alternation")
                for branch in arg[1]:
                    walk(branch, inside_repeat=inside_repeat)

    walk(parsed)
    return re.compile(f"^(?:{pattern})$")


def _find_name_columns(df: pd.DataFrame) -> tuple[str, str]:
    lower_cols = {c.lower(): c for c in df.columns}
    first = None
    last = None
    for col_lower, orig in lower_cols.items():
        if "first name" in col_lower:
            first = orig
        if "last name" in col_lower:
            last = orig
    if not first or not last:
        raise ValueError("Could not find 'first name' and 'last name' headers")
    return first, last


def _load_dataframe(file_obj: BinaryIO, filename: str) -> pd.DataFrame:
    data = file_obj.read(25 * 1024 * 1024 + 1)
    validate_spreadsheet_bytes(data, filename, label="Roster spreadsheet")
    buf = io.BytesIO(data)
    if filename.lower().endswith(".csv"):
        return pd.read_csv(buf)
    return pd.read_excel(buf)


def ingest_spreadsheet(
    workspace_id: str,
    spreadsheet: BinaryIO,
    filename: str,
    mugshots_zip: Optional[BinaryIO],
    naming_pattern: str = r"\d{3,4}",
    advanced_name_match: bool = False,
) -> SpreadsheetPreview:
    df = _load_dataframe(spreadsheet, filename)
    max_rows = 5_000
    if len(df) > max_rows:
        raise ValueError(f"Spreadsheet contains more than {max_rows} student rows")
    first_col, last_col = _find_name_columns(df)
    valid_indices = set(range(1, len(df) + 1))
    warnings: list[str] = []

    compiled_pattern = _compile_safe_filename_pattern(naming_pattern)

    def _normalize(text: str) -> str:
        lowered = (text or "").lower()
        lowered = re.sub(r"[^a-z0-9]+", " ", lowered)
        lowered = re.sub(r"\s+", " ", lowered).strip()
        return lowered

    def _tokens(text: str) -> list[str]:
        norm = _normalize(text)
        return norm.split() if norm else []

    def _compact(text: str) -> str:
        return re.sub(r"\s+", "", _normalize(text))

    def _matches_name(stem_norm: str, stem_tokens: set[str], stem_compact: str, first: list[str], last: list[str]) -> bool:
        # Require at least one token from first and last (or compact match) to reduce false positives.
        if not first or not last:
            return False

        # Match regardless of order in filename (FIRST LAST or LAST FIRST) since we only check presence.
        first_present = any(t in stem_tokens for t in first)
        last_present = any(t in stem_tokens for t in last)
        if first_present and last_present:
            return True

        # Compact fallback for filenames with no delimiters between name parts.
        first_compact = "".join(first)
        last_compact = "".join(last)
        return (first_compact in stem_compact and last_compact in stem_compact) or (
            last_compact in stem_compact and first_compact in stem_compact
        )

    name_tokens: dict[int, tuple[list[str], list[str]]] = {}
    if advanced_name_match:
        for idx, row in df.iterrows():
            person_index = int(idx) + 1
            first_name = str(row[first_col]).strip()
            last_name = str(row[last_col]).strip()
            first_parts = _tokens(first_name)
            last_parts = _tokens(last_name)

            # Avoid extremely short tokens that could cause false positives.
            first_parts = [t for t in first_parts if len(t) >= 2]
            last_parts = [t for t in last_parts if len(t) >= 2]

            # Only keep a small set of first-name candidates to tolerate middle names.
            if first_parts and last_parts:
                first_candidates = list(dict.fromkeys([first_parts[0], first_parts[-1]]))
                # For last name, require all parts if multi-word (e.g., "Van Dyke")
                name_tokens[person_index] = (first_candidates, last_parts)

    mugshot_lookup: dict[int, str] = {}
    if mugshots_zip:
        # Read zip bytes once, then reuse for saving and extraction
        zip_bytes = mugshots_zip.read()
        save_upload(workspace_id, "uploads/mugshots.zip", io.BytesIO(zip_bytes))
        allowed_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            archive_members = validate_zip_archive(zf, label="Portrait ZIP")

            used_members: set[str] = set()

            # Pass 1: Advanced name matching
            if advanced_name_match and name_tokens:
                assigned_people: set[int] = set()
                for member_info in archive_members:
                    member = member_info.filename
                    filename_only = Path(member).name
                    if Path(filename_only).suffix.lower() not in allowed_exts:
                        warnings.append(
                            f"Skipped mugshot '{filename_only}' (unsupported type; images only)."
                        )
                        continue
                    stem_raw = Path(filename_only).stem
                    stem_norm = _normalize(stem_raw)
                    stem_tokens = set(stem_norm.split()) if stem_norm else set()
                    stem_compact = _compact(stem_raw)
                    matches: list[int] = []
                    for person_index, (first_parts, last_parts) in name_tokens.items():
                        if _matches_name(stem_norm, stem_tokens, stem_compact, first_parts, last_parts):
                            matches.append(person_index)

                    if len(matches) == 1:
                        person_index = matches[0]
                        if person_index in assigned_people:
                            warnings.append(
                                f"Skipped mugshot '{filename_only}' (multiple files match {person_index} by name)."
                            )
                            continue
                        # Extract and assign
                        content = read_zip_member(zf, member_info)
                        validate_image_bytes(content, label=f"Portrait '{filename_only}'")
                        out_path = save_upload(workspace_id, f"mugshots/{safe_filename(filename_only)}", io.BytesIO(content))
                        mugshot_lookup[person_index] = out_path.name
                        used_members.add(member)
                        assigned_people.add(person_index)
                    elif len(matches) > 1:
                        warnings.append(
                            f"Skipped mugshot '{filename_only}' (matches multiple people by name)."
                        )

            # Prepare available indices for numeric mapping, honoring name assignments.
            available_indices = sorted(valid_indices - set(mugshot_lookup.keys()))

            for member_info in archive_members:
                member = member_info.filename
                if member in used_members:
                    continue
                filename_only = Path(member).name
                if Path(filename_only).suffix.lower() not in allowed_exts:
                    warnings.append(
                        f"Skipped mugshot '{filename_only}' (unsupported type; images only)."
                    )
                    continue
                stem = Path(filename_only).stem
                match = compiled_pattern.fullmatch(stem)
                if not match:
                    if not advanced_name_match:
                        warnings.append(
                            f"Skipped mugshot '{filename_only}' (does not match pattern '{naming_pattern}')."
                        )
                    else:
                        warnings.append(
                            f"Skipped mugshot '{filename_only}' (no name match and does not match pattern '{naming_pattern}')."
                        )
                    continue
                mugshot_index = int(stem.lstrip("0") or "0")
                if mugshot_index not in valid_indices:
                    warnings.append(
                        f"Skipped mugshot '{filename_only}' (no spreadsheet row {mugshot_index}; rows start at 1)."
                    )
                    continue

                # Shift numbered photos down if earlier indices were taken by name matches.
                # Assign to the first available row index >= mugshot_index.
                insert_pos = bisect.bisect_left(available_indices, mugshot_index)
                if insert_pos >= len(available_indices):
                    warnings.append(
                        f"Skipped mugshot '{filename_only}' (no available spreadsheet row at or after {mugshot_index})."
                    )
                    continue
                target_index = available_indices.pop(insert_pos)

                content = read_zip_member(zf, member_info)
                validate_image_bytes(content, label=f"Portrait '{filename_only}'")
                out_path = save_upload(workspace_id, f"mugshots/{safe_filename(filename_only)}", io.BytesIO(content))
                mugshot_lookup[target_index] = out_path.name

    people: list[PersonRecord] = []
    for idx, row in df.iterrows():
        # First data row (after header) is person index 1
        person_index = int(idx) + 1
        first_name = str(row[first_col]).strip()
        last_name = str(row[last_col]).strip()
        mugshot_name = mugshot_lookup.get(person_index)
        people.append(
            PersonRecord(
                index=person_index,
                first_name=first_name,
                last_name=last_name,
                mugshot_filename=mugshot_name,
            )
        )

    return SpreadsheetPreview(workspace_id=workspace_id, people=people, warnings=warnings)

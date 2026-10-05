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

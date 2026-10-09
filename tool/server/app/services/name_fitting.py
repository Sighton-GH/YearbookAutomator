"""F1.5 decision helpers independent of schemas and the generator."""
from __future__ import annotations


def fitting_warning(student: str, kind: str) -> str:
    label = student or 'This student'
    return f'{label}: the {kind} does not fit at the minimum font size. Please enlarge the text box or shorten the text.'


def append_once(warnings: list[str] | None, message: str) -> None:
    if warnings is not None and message not in warnings:
        warnings.append(message)

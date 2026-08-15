"""Compare expected repair catalog authority against actual PostgreSQL catalog definitions."""
from __future__ import annotations

from typing import Any

from ci_r3b1d12_catalog_model import ExpectedCatalog, Mismatch, defaults_match


def _add(mismatches: list[Mismatch], **kwargs: Any) -> None:
    mismatches.append(Mismatch(**kwargs))


def compare_expected_to_actual(expected: ExpectedCatalog, actual: dict[str, Any], slot: int | None = None) -> list[Mismatch]:
    mismatches: list[Mismatch] = []

    for name, meta in expected.types.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        actual_type = actual["types"].get(name)
        if not actual_type:
            _add(mismatches, category="enum", slot=meta["slot"], object=name, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))
            continue
        if list(actual_type["labels"]) != list(meta["labels"]):
            _add(mismatches, category="enum", slot=meta["slot"], object=name, property="labels", expected=meta["labels"], actual=actual_type["labels"], source_action=meta.get("source_action"))

    for name, meta in expected.sequences.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        if name not in actual["sequences"]:
            _add(mismatches, category="sequence", slot=meta["slot"], object=name, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))

    for table, meta in expected.tables.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        if table not in actual["tables"]:
            _add(mismatches, category="table", slot=meta["slot"], object=table, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))

    for table, cols in expected.columns.items():
        tmeta = expected.tables.get(table, {})
        if slot is not None and tmeta.get("slot", 99) > slot:
            continue
        actual_cols = actual["columns"].get(table, {})
        for col_name, col_meta in cols.items():
            if col_name not in actual_cols:
                _add(mismatches, category="column", slot=col_meta["slot"], object=f"{table}.{col_name}", property="exists", expected=True, actual=False, source_action=col_meta.get("source_action"))
                continue
            actual_col = actual_cols[col_name]
            if actual_col["type"] != col_meta["type"]:
                _add(mismatches, category="type", slot=col_meta["slot"], object=f"{table}.{col_name}", property="type", expected=col_meta["type"], actual=actual_col["type"], source_action=col_meta.get("source_action"))
            if actual_col["nullable"] != col_meta["nullable"]:
                _add(mismatches, category="nullability", slot=col_meta["slot"], object=f"{table}.{col_name}", property="nullable", expected=col_meta["nullable"], actual=actual_col["nullable"], source_action=col_meta.get("source_action"))
            if not defaults_match(col_meta["default"], actual_col["default"]):
                _add(mismatches, category="default", slot=col_meta["slot"], object=f"{table}.{col_name}", property="default", expected=col_meta["default"], actual=actual_col["default"], source_action=col_meta.get("source_action"))

        unexpected = set(actual_cols.keys()) - set(cols.keys())
        for extra in sorted(unexpected):
            _add(mismatches, category="column", slot=tmeta.get("slot"), object=f"{table}.{extra}", property="unexpected_column", expected=False, actual=True, source_action=tmeta.get("source_action"))

    for name, meta in expected.primary_keys.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        actual_pk = actual["primary_keys"].get(name)
        if not actual_pk:
            _add(mismatches, category="primary_key", slot=meta["slot"], object=name, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))
        elif list(actual_pk["columns"]) != list(meta["columns"]):
            _add(mismatches, category="primary_key", slot=meta["slot"], object=name, property="columns", expected=meta["columns"], actual=actual_pk["columns"], source_action=meta.get("source_action"))

    for name, meta in expected.unique_constraints.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        actual_uq = actual["unique_constraints"].get(name)
        if not actual_uq:
            _add(mismatches, category="unique", slot=meta["slot"], object=name, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))
        elif list(actual_uq["columns"]) != list(meta["columns"]):
            _add(mismatches, category="unique", slot=meta["slot"], object=name, property="columns", expected=meta["columns"], actual=actual_uq["columns"], source_action=meta.get("source_action"))

    for name, meta in expected.foreign_keys.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        actual_fk = actual["foreign_keys"].get(name)
        if not actual_fk:
            _add(mismatches, category="foreign_key", slot=meta["slot"], object=name, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))
            continue
        checks = [
            ("local_table", meta["local_table"], actual_fk["local_table"]),
            ("local_columns", meta["local_columns"], actual_fk["local_columns"]),
            ("referenced_table", meta["referenced_table"], actual_fk["referenced_table"]),
            ("referenced_columns", meta["referenced_columns"], actual_fk["referenced_columns"]),
            ("on_delete", meta["on_delete"], actual_fk["on_delete"]),
            ("on_update", meta["on_update"], actual_fk["on_update"]),
        ]
        for prop, exp, act in checks:
            if exp != act:
                _add(mismatches, category="foreign_key", slot=meta["slot"], object=name, property=prop, expected=exp, actual=act, source_action=meta.get("source_action"))

    for name, meta in expected.indexes.items():
        if slot is not None and meta.get("slot", 99) > slot:
            continue
        actual_idx = actual["indexes"].get(name)
        if not actual_idx:
            _add(mismatches, category="index", slot=meta["slot"], object=name, property="exists", expected=True, actual=False, source_action=meta.get("source_action"))
            continue
        if list(actual_idx["columns"]) != list(meta["columns"]):
            _add(mismatches, category="index", slot=meta["slot"], object=name, property="columns", expected=meta["columns"], actual=actual_idx["columns"], source_action=meta.get("source_action"))
        if actual_idx["unique"] != meta["unique"]:
            _add(mismatches, category="index", slot=meta["slot"], object=name, property="unique", expected=meta["unique"], actual=actual_idx["unique"], source_action=meta.get("source_action"))
        if not actual_idx["valid"]:
            _add(mismatches, category="index", slot=meta["slot"], object=name, property="indisvalid", expected=True, actual=False, source_action=meta.get("source_action"))
        if not actual_idx["ready"]:
            _add(mismatches, category="index", slot=meta["slot"], object=name, property="indisready", expected=True, actual=False, source_action=meta.get("source_action"))

    return mismatches


def summarize_mismatches(mismatches: list[Mismatch]) -> dict[str, int]:
    categories = [
        "table",
        "column",
        "type",
        "nullability",
        "default",
        "enum",
        "sequence",
        "primary_key",
        "unique",
        "foreign_key",
        "index",
    ]
    counts = {c: 0 for c in categories}
    for m in mismatches:
        counts[m.category] = counts.get(m.category, 0) + 1
    counts["total"] = len(mismatches)
    return counts

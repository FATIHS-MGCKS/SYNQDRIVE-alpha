"""Semantic catalog delta ↔ expected-effect comparators (CI-R3B1O.4 ambiguity corrective)."""
from __future__ import annotations

import re
from typing import Any


def _norm_ws(value: Any) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip())


def _norm_default(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = _norm_ws(value)
    return text or None


def _norm_action(value: Any) -> str:
    return _norm_ws(value).upper().replace("_", " ")


def _expected_state(effect: dict[str, Any], change_type: str) -> dict[str, Any] | list[Any] | None:
    if change_type == "REMOVED":
        return effect.get("before_state")
    if change_type == "CHANGED":
        return {"before": effect.get("before_state"), "after": effect.get("after_state")}
    return effect.get("after_state")


def _actual_state(delta: dict[str, Any], change_type: str) -> dict[str, Any] | list[Any] | None:
    if change_type == "REMOVED":
        return delta.get("before")
    if change_type == "CHANGED":
        return {"before": delta.get("before"), "after": delta.get("after")}
    return delta.get("after")


def _match_column(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    for field in ("format_type",):
        if field in expected:
            exp = _norm_ws(expected.get(field)).lower()
            act = _norm_ws(actual.get(field)).lower()
            if exp != act and exp not in act and act not in exp:
                return False, "column.format_type mismatch"
    if "nullable" in expected and bool(actual.get("nullable")) != bool(expected.get("nullable")):
        return False, "column.nullable mismatch"
    if "default" in expected and _norm_default(actual.get("default")) != _norm_default(expected.get("default")):
        return False, "column.default mismatch"
    return True, "column semantic match"


def _index_key_names(payload: dict[str, Any]) -> list[str]:
    if "columns" in payload:
        return list(payload.get("columns") or [])
    keys = payload.get("keys") or []
    return [k.get("name") for k in keys if k.get("kind") != "include"]


def _include_names(payload: dict[str, Any]) -> list[str]:
    includes = payload.get("include_columns") or []
    return [c.get("name") if isinstance(c, dict) else str(c) for c in includes]


def _match_index(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    if expected.get("owner_table") and actual.get("owner_table") != expected.get("owner_table"):
        return False, "index.owner_table mismatch"
    if expected.get("access_method") and _norm_ws(actual.get("access_method")).lower() != _norm_ws(expected.get("access_method")).lower():
        return False, "index.access_method mismatch"
    for field in ("unique", "primary", "valid", "ready"):
        if field in expected and bool(actual.get(field)) != bool(expected.get(field)):
            return False, f"index.{field} mismatch"
    exp_keys = _index_key_names(expected)
    act_keys = _index_key_names(actual)
    if exp_keys and act_keys != exp_keys:
        return False, "index.keys mismatch"
    if expected.get("keys") and actual.get("keys"):
        for idx, (exp_key, act_key) in enumerate(zip(expected["keys"], actual["keys"])):
            if exp_key.get("kind") == "include":
                continue
            for field in ("name", "collation", "opclass", "sort_direction", "nulls_ordering"):
                if field not in exp_key:
                    continue
                exp_val = exp_key.get(field)
                act_val = act_key.get(field)
                if field in {"collation", "opclass"}:
                    exp_val = exp_val or "default"
                    act_val = act_val or "default"
                if exp_val != act_val:
                    return False, f"index.keys[{idx}].{field} mismatch"
    exp_inc = _include_names(expected)
    act_inc = _include_names(actual)
    if exp_inc != act_inc:
        return False, "index.include_columns mismatch"
    exp_pred = _norm_ws(expected.get("predicate")) or None
    act_pred = _norm_ws(actual.get("predicate")) or None
    if exp_pred is not None and exp_pred != act_pred:
        return False, "index.predicate mismatch"
    return True, "index semantic match"


def _constraint_kind(actual_type: str) -> str:
    mapping = {"p": "PRIMARY KEY", "u": "UNIQUE", "f": "FOREIGN KEY", "c": "CHECK", "x": "EXCLUDE"}
    return mapping.get(actual_type, actual_type.upper())


def _parse_fk_definition(defn: str) -> dict[str, Any] | None:
    text = _norm_ws(defn)
    if text.startswith("("):
        text = f"FOREIGN KEY {text}"
    base = re.search(
        r'FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*(?:"([^"]+)"|(\w+))\s*\(([^)]+)\)',
        text,
        re.I,
    )
    if not base:
        return None
    on_update = re.search(r"ON UPDATE\s+(NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)", text, re.I)
    on_delete = re.search(r"ON DELETE\s+(NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)", text, re.I)
    match_type = re.search(r"MATCH\s+(FULL|PARTIAL|SIMPLE)", text, re.I)
    return {
        "source_columns": [c.strip().strip('"') for c in base.group(1).split(",")],
        "target_table": base.group(2) or base.group(3),
        "target_columns": [c.strip().strip('"') for c in base.group(4).split(",")],
        "match_type": (match_type.group(1) if match_type else "SIMPLE").upper(),
        "on_update": _norm_action(on_update.group(1) if on_update else "NO ACTION"),
        "on_delete": _norm_action(on_delete.group(1) if on_delete else "NO ACTION"),
    }


def _fk_structured(expected: dict[str, Any]) -> dict[str, Any]:
    if expected.get("target_table"):
        return expected
    parsed = _parse_fk_definition(expected.get("definition", ""))
    return parsed or {}


def _match_constraint(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    if expected.get("owner_table") and actual.get("owner_table") != expected.get("owner_table"):
        return False, "constraint.owner_table mismatch"
    exp_kind = str(expected.get("kind") or expected.get("type") or "").upper()
    act_kind = _constraint_kind(str(actual.get("type", "")))
    if exp_kind and exp_kind != act_kind:
        return False, "constraint.kind mismatch"
    for field in ("deferrable", "initially_deferred", "validated"):
        if field in expected and bool(actual.get(field)) != bool(expected.get(field)):
            return False, "constraint.{field} mismatch".format(field=field)

    if exp_kind == "PRIMARY KEY" or actual.get("type") == "p":
        exp_def = _norm_ws(expected.get("definition")).upper()
        act_def = _norm_ws(actual.get("definition")).upper()
        exp_cols = re.findall(r'"([^"]+)"', exp_def) or re.findall(r"\(([^)]+)\)", exp_def)
        act_cols = re.findall(r"\(([^)]+)\)", act_def)
        if exp_cols and act_cols:
            exp_norm = [c.strip().strip('"') for c in exp_cols[-1].split(",")]
            act_norm = [c.strip().strip('"') for c in act_cols[-1].split(",")]
            if exp_norm != act_norm:
                return False, "constraint.primary_key.columns mismatch"
        return True, "primary key semantic match"

    if exp_kind == "FOREIGN KEY" or actual.get("type") == "f":
        exp_fk = _fk_structured(expected)
        act_fk = _parse_fk_definition(actual.get("definition", ""))
        if not exp_fk or not act_fk:
            return False, "constraint.fk parse failure"
        for field in ("source_columns", "target_table", "target_columns", "match_type", "on_update", "on_delete"):
            if field in exp_fk and exp_fk.get(field) != act_fk.get(field):
                return False, f"constraint.fk.{field} mismatch"
        return True, "foreign key semantic match"

    if exp_kind == "UNIQUE" or actual.get("type") == "u":
        exp_def = _norm_ws(expected.get("definition")).upper()
        act_def = _norm_ws(actual.get("definition")).upper()
        exp_cols = [c.strip().strip('"') for c in re.findall(r'"([^"]+)"', exp_def)]
        act_cols = [c.strip().strip('"') for c in re.findall(r"\(([^)]+)\)", act_def)[-1].split(",")] if re.findall(r"\(([^)]+)\)", act_def) else []
        if exp_cols and act_cols and exp_cols != act_cols:
            return False, "constraint.unique.columns mismatch"
        if exp_def and exp_def != act_def:
            return False, "constraint.unique.definition mismatch"
        return True, "unique constraint semantic match"

    exp_def = _norm_ws(expected.get("definition")).upper()
    act_def = _norm_ws(actual.get("definition")).upper()
    if exp_def and exp_def != act_def:
        return False, "constraint.definition mismatch"
    return True, "constraint semantic match"


def _match_table(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    exp_cols = expected.get("columns")
    if exp_cols is None:
        return True, "table identity-only match"
    act_cols = actual.get("columns")
    if isinstance(act_cols, dict):
        act_cols = sorted(act_cols.keys())
    if sorted(exp_cols) != sorted(act_cols or []):
        return False, "table.columns mismatch"
    return True, "table semantic match"


def _match_enum(actual: list[str] | dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    exp_labels = expected.get("labels") if isinstance(expected, dict) else expected
    act_labels = actual if isinstance(actual, list) else actual.get("labels", [])
    if list(exp_labels or []) != list(act_labels or []):
        return False, "enum.labels mismatch"
    return True, "enum semantic match"


def _match_type(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    for field in ("kind", "category", "related_table", "element_type"):
        if field in expected and (actual.get(field) or None) != (expected.get(field) or None):
            return False, f"type.{field} mismatch"
    if "labels" in expected and actual.get("kind") == "e":
        return True, "enum type kind match"
    if "labels" in expected:
        return _match_enum(actual, expected)
    return True, "type semantic match"


def _match_sequence(actual: dict[str, Any], expected: dict[str, Any]) -> tuple[bool, str]:
    if expected.get("name") and actual.get("name") != expected.get("name"):
        return False, "sequence.name mismatch"
    return True, "sequence semantic match"


def semantic_match_delta_to_effect(delta: dict[str, Any], effect: dict[str, Any]) -> tuple[bool, str, str]:
    """Return (matches, match_mode, reason)."""
    change_type = delta["change_type"]
    object_type = delta["object_type"]
    expected = _expected_state(effect, change_type)
    actual = _actual_state(delta, change_type)

    if change_type == "CHANGED":
        exp_before, exp_after = expected["before"], expected["after"]  # type: ignore[index]
        act_before, act_after = actual["before"], actual["after"]  # type: ignore[index]
        ok_b, reason_b = semantic_match_payload(object_type, act_before, exp_before)
        if not ok_b:
            return False, "EXACT", f"changed.before {reason_b}"
        ok_a, reason_a = semantic_match_payload(object_type, act_after, exp_after)
        if not ok_a:
            return False, "EXACT", f"changed.after {reason_a}"
        return True, "EXACT", "changed semantic match"

    ok, reason = semantic_match_payload(object_type, actual, expected)
    if not ok:
        return False, "EXACT", reason
    mode = "IMPLICIT_DETERMINISTIC" if effect.get("authority_match") == "IMPLICIT_POSTGRES_EFFECT" else "EXACT"
    return True, mode, reason


def semantic_match_payload(
    object_type: str,
    actual: Any,
    expected: Any,
) -> tuple[bool, str]:
    if expected is None and actual is None:
        return True, "both null"
    if expected is None or actual is None:
        return False, "missing expected or actual state"
    if object_type == "column":
        return _match_column(actual, expected)
    if object_type == "index":
        if isinstance(expected, dict) and expected.get("name") and len(expected) == 1:
            return actual.get("name") == expected.get("name"), "index removed by name"
        return _match_index(actual, expected)
    if object_type == "constraint":
        return _match_constraint(actual, expected)
    if object_type == "table":
        return _match_table(actual, expected)
    if object_type == "enum":
        return _match_enum(actual, expected if isinstance(expected, dict) else {"labels": expected})
    if object_type == "type":
        return _match_type(actual, expected)
    if object_type == "sequence":
        return _match_sequence(actual, expected)
    return actual == expected, "generic equality"

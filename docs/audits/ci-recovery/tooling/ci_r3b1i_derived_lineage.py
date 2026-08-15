"""Column-level derived lineage proofs for CI-R3B1I preflight."""
from __future__ import annotations

import re
from typing import Any

WINDOW_OUTPUT_COLUMNS = {"rn", "row_number"}
FUNCTION_TOKENS = {"gen_random_uuid", "now", "current_timestamp", "current_date"}
LITERAL_PREFIXES = ("'", '"')


def _strip_ident(value: str) -> str:
    return value.strip().strip('"')


def _split_select_items(select_body: str) -> list[str]:
    items: list[str] = []
    depth = 0
    current: list[str] = []
    for ch in select_body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == "," and depth == 0:
            item = "".join(current).strip()
            if item:
                items.append(item)
            current = []
            continue
        current.append(ch)
    tail = "".join(current).strip()
    if tail:
        items.append(tail)
    return items


def _output_name(item: str) -> str | None:
    as_match = re.search(r'\bAS\s+"?([a-z_][a-z0-9_]*)"?\.?$', item, re.I)
    if as_match:
        return _strip_ident(as_match.group(1))
    qualified = re.match(r'^"?([a-z_][a-z0-9_]*)"?\."?([a-z_][a-z0-9_]*)"?$', item.strip(), re.I)
    if qualified:
        return _strip_ident(qualified.group(2))
    bare = re.match(r'^"?([a-z_][a-z0-9_]*)"?$', item.strip(), re.I)
    if bare:
        return _strip_ident(bare.group(1))
    return None


def _extract_ctes(sql: str) -> dict[str, str]:
    ctes: dict[str, str] = {}
    with_match = re.search(r"\bWITH\b", sql, re.I)
    if not with_match:
        return ctes
    pos = with_match.end()
    while pos < len(sql):
        name_match = re.match(r'\s*"?(?P<name>[a-z_][a-z0-9_]*)"?\s+AS\s*\(', sql[pos:], re.I)
        if not name_match:
            break
        name = _strip_ident(name_match.group("name"))
        open_paren = pos + name_match.end() - 1
        depth = 0
        end = open_paren
        for i in range(open_paren, len(sql)):
            ch = sql[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    end = i
                    break
        ctes[name] = sql[open_paren + 1 : end].strip()
        pos = end + 1
        if re.match(r"\s*,", sql[pos:]):
            pos = re.match(r"\s*,", sql[pos:]).end() + pos
            continue
        break
    return ctes


def _find_subquery_body(scope_sql: str, alias: str) -> str | None:
    match = re.search(rf"\)\s*AS\s+\"?{re.escape(alias)}\"?\b", scope_sql, re.I)
    if not match:
        return None
    close_idx = match.start()
    depth = 0
    for i in range(close_idx, -1, -1):
        if scope_sql[i] == ")":
            depth += 1
        elif scope_sql[i] == "(":
            depth -= 1
            if depth == 0:
                return scope_sql[i + 1 : close_idx].strip()
    return None


def _find_alias_binding(scope_sql: str, alias: str) -> dict[str, str] | None:
    subquery_body = _find_subquery_body(scope_sql, alias)
    if subquery_body is not None:
        return {"kind": "subquery", "body": subquery_body, "alias": alias, "scope_sql": scope_sql}

    candidates: list[dict[str, str]] = []
    for pattern in (
        rf'\bFROM\s+"?(?P<src>[a-z_][a-z0-9_]*)"?\s+"?{re.escape(alias)}"?\b',
        rf'\bJOIN\s+"?(?P<src>[a-z_][a-z0-9_]*)"?\s+"?{re.escape(alias)}"?\b',
    ):
        for match in re.finditer(pattern, scope_sql, re.I):
            candidates.append(
                {
                    "kind": "relation_or_cte",
                    "source": _strip_ident(match.group("src")),
                    "alias": alias,
                    "scope_sql": scope_sql,
                }
            )
    return candidates[-1] if candidates else None


def _expression_for_column(scope_sql: str, column: str) -> str | None:
    select_matches = list(re.finditer(r"\bSELECT\b", scope_sql, re.I))
    if not select_matches:
        return None
    select_match = select_matches[-1]
    from_match = re.search(r"\bFROM\b", scope_sql[select_match.end() :], re.I)
    select_body = (
        scope_sql[select_match.end() : select_match.end() + from_match.start()]
        if from_match
        else scope_sql[select_match.end() :]
    )
    matches: list[str] = []
    for item in _split_select_items(select_body):
        out = _output_name(item)
        if out == column:
            matches.append(item.strip())
    if not matches:
        return None
    qualified = [item for item in matches if "." in item]
    return qualified[0] if qualified else matches[0]


def _source_column_from_expression(expr: str) -> tuple[str | None, str | None]:
    qualified = re.match(
        r'^\s*"?(?P<alias>[a-z_][a-z0-9_]*)"?\s*\.\s*"?(?P<col>[a-z_][a-z0-9_]*)"?',
        expr.strip(),
        re.I,
    )
    if qualified:
        return _strip_ident(qualified.group("alias")), _strip_ident(qualified.group("col"))
    bare_as = re.match(r'^\s*"?(?P<col>[a-z_][a-z0-9_]*)"?\s+AS\b', expr.strip(), re.I)
    if bare_as:
        return None, _strip_ident(bare_as.group("col"))
    bare = re.match(r'^\s*"?(?P<col>[a-z_][a-z0-9_]*)"?$', expr.strip(), re.I)
    if bare:
        return None, _strip_ident(bare.group("col"))
    return None, None


def _trace_from_cte_source(
    expr: str,
    column: str,
    cte_body: str,
    ctes: dict[str, str],
    stmt: str,
    alias: str,
    inventory: set[str],
    visited: set[tuple[str, str, str]],
) -> dict[str, Any] | None:
    from_match = re.search(r'\bFROM\s+"?(?P<table>[a-z_][a-z0-9_]*)"?\b', cte_body, re.I)
    if not from_match:
        return None
    from_name = _strip_ident(from_match.group("table"))
    src_alias, src_col = _source_column_from_expression(expr)
    if src_col is None:
        src_col = column
    if from_name in ctes:
        inner_scope = ctes[from_name]
        inner_expr = _expression_for_column(inner_scope, src_col)
        if inner_expr:
            physical = _physical_sources_in_expression(inner_expr, inventory)
            if physical:
                return {
                    "pass": True,
                    "category": "derived_output_with_physical_lineage",
                    "expression": expr.strip(),
                    "physical_sources": physical,
                    "alias": alias,
                    "column": column,
                }
            bare_table = _single_from_table(inner_scope, inventory)
            if bare_table and re.match(rf'^"?{re.escape(src_col)}"?$', inner_expr.strip(), re.I):
                return {
                    "pass": True,
                    "category": "derived_output_with_physical_lineage",
                    "expression": expr.strip(),
                    "physical_sources": [{"relation": bare_table, "property": src_col}],
                    "alias": alias,
                    "column": column,
                }
            inner_non_column = _classify_non_column(inner_expr, src_col)
            if inner_non_column:
                inner_non_column["pass"] = True
                inner_non_column["alias"] = alias
                inner_non_column["column"] = column
                inner_non_column["category"] = "derived_output_with_physical_lineage"
                return inner_non_column
        nested = trace_qualified_column(
            stmt,
            src_alias or from_name,
            src_col,
            inventory,
            scope_sql=inner_scope,
            ctes=ctes,
            visited=visited,
        )
        if nested.get("pass"):
            return {
                "pass": True,
                "category": "derived_output_with_physical_lineage",
                "expression": expr.strip(),
                "via": nested,
                "physical_sources": nested.get("physical_sources", []),
                "alias": alias,
                "column": column,
            }
    return None


def _single_from_table(scope_sql: str, inventory: set[str]) -> str | None:
    from_match = re.search(r'\bFROM\s+"?(?P<table>[a-z_][a-z0-9_]*)"?\b', scope_sql, re.I)
    if not from_match:
        return None
    table = _strip_ident(from_match.group("table"))
    return table if table in inventory else None


def _physical_sources_in_expression(expr: str, inventory: set[str]) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    for table, col in re.findall(r'"?(?P<table>[a-z_][a-z0-9_]*)"?\."?(?P<col>[a-z_][a-z0-9_]*)"?', expr, re.I):
        table = _strip_ident(table)
        col = _strip_ident(col)
        if table in inventory:
            sources.append({"relation": table, "property": col})
    return sources


def _classify_non_column(expr: str, column: str) -> dict[str, Any] | None:
    upper = expr.upper()
    if column.lower() in WINDOW_OUTPUT_COLUMNS and "ROW_NUMBER" in upper:
        return {"category": "window_function_output", "expression": expr.strip()}
    if re.search(r"\bOVER\s*\(", expr, re.I):
        return {"category": "window_function_output", "expression": expr.strip()}
    if any(fn in expr.lower() for fn in FUNCTION_TOKENS):
        return {"category": "function_call", "expression": expr.strip()}
    if expr.strip().startswith(LITERAL_PREFIXES):
        return {"category": "literal", "expression": expr.strip()}
    if re.search(r"migration_id\s*=\s*'", expr, re.I):
        return {"category": "literal_predicate", "expression": expr.strip()}
    return None


def trace_qualified_column(
    stmt: str,
    alias: str,
    column: str,
    inventory: set[str],
    *,
    scope_sql: str | None = None,
    ctes: dict[str, str] | None = None,
    visited: set[tuple[str, str, str]] | None = None,
) -> dict[str, Any]:
    scope_sql = scope_sql or stmt
    visited = visited or set()
    visit_key = (scope_sql[:80], alias, column)
    if visit_key in visited:
        return {"pass": False, "reason": "cycle", "alias": alias, "column": column}
    visited.add(visit_key)
    ctes = _extract_ctes(scope_sql) if ctes is None else ctes

    if alias in inventory:
        return {
            "pass": True,
            "category": "physical_table_alias",
            "physical_sources": [{"relation": alias, "property": column}],
            "alias": alias,
            "column": column,
        }

    binding = _find_alias_binding(scope_sql, alias)
    if binding is None:
        return {"pass": False, "reason": "alias_unbound", "alias": alias, "column": column}

    if binding["kind"] == "subquery":
        body = binding["body"]
        inner_ctes = _extract_ctes(body)
        merged_ctes = {**ctes, **inner_ctes}
        expr = _expression_for_column(body, column)
        if expr is None:
            return {"pass": False, "reason": "column_expression_not_found", "alias": alias, "column": column}
        non_column = _classify_non_column(expr, column)
        if non_column:
            non_column["pass"] = True
            non_column["alias"] = alias
            non_column["column"] = column
            return non_column
        physical = _physical_sources_in_expression(expr, inventory)
        if physical:
            return {
                "pass": True,
                "category": "physical_column_reference",
                "expression": expr.strip(),
                "physical_sources": physical,
                "alias": alias,
                "column": column,
            }
        for ref_alias, ref_col in re.findall(r'"?(?P<a>[a-z_][a-z0-9_]*)"?\."?(?P<c>[a-z_][a-z0-9_]*)"?', expr, re.I):
            nested = trace_qualified_column(
                stmt,
                _strip_ident(ref_alias),
                _strip_ident(ref_col),
                inventory,
                scope_sql=body,
                ctes=merged_ctes,
                visited=visited,
            )
            if nested.get("pass"):
                return {
                    "pass": True,
                    "category": "derived_output_with_physical_lineage",
                    "expression": expr.strip(),
                    "via": nested,
                    "physical_sources": nested.get("physical_sources", []),
                    "alias": alias,
                    "column": column,
                }
        bare_table = _single_from_table(body, inventory)
        if bare_table and re.match(rf'^"?{re.escape(column)}"?$', expr.strip(), re.I):
            return {
                "pass": True,
                "category": "physical_column_reference",
                "expression": expr.strip(),
                "physical_sources": [{"relation": bare_table, "property": column}],
                "alias": alias,
                "column": column,
            }
        cte_trace = _trace_from_cte_source(expr, column, body, merged_ctes, stmt, alias, inventory, visited)
        if cte_trace:
            return cte_trace
        return {"pass": False, "reason": "unproven_derived_lineage", "alias": alias, "column": column, "expression": expr.strip()}

    source = binding["source"]
    if source in inventory:
        return {
            "pass": True,
            "category": "physical_table_alias",
            "physical_sources": [{"relation": source, "property": column}],
            "alias": alias,
            "column": column,
        }

    cte_body = ctes.get(source)
    if cte_body:
        expr = _expression_for_column(cte_body, column)
        if expr is None:
            return {"pass": False, "reason": "column_expression_not_found", "alias": alias, "column": column}
        non_column = _classify_non_column(expr, column)
        if non_column:
            non_column["pass"] = True
            non_column["alias"] = alias
            non_column["column"] = column
            return non_column
        physical = _physical_sources_in_expression(expr, inventory)
        if physical:
            return {
                "pass": True,
                "category": "physical_column_reference",
                "expression": expr.strip(),
                "physical_sources": physical,
                "alias": alias,
                "column": column,
            }
        bare_table = _single_from_table(cte_body, inventory)
        if bare_table and re.match(rf'^"?{re.escape(column)}"?$', expr.strip(), re.I):
            return {
                "pass": True,
                "category": "physical_column_reference",
                "expression": expr.strip(),
                "physical_sources": [{"relation": bare_table, "property": column}],
                "alias": alias,
                "column": column,
            }
        for ref_alias, ref_col in re.findall(r'"?(?P<a>[a-z_][a-z0-9_]*)"?\."?(?P<c>[a-z_][a-z0-9_]*)"?', expr, re.I):
            nested = trace_qualified_column(
                stmt,
                _strip_ident(ref_alias),
                _strip_ident(ref_col),
                inventory,
                scope_sql=cte_body,
                ctes=ctes,
                visited=visited,
            )
            if nested.get("pass"):
                return {
                    "pass": True,
                    "category": "derived_output_with_physical_lineage",
                    "expression": expr.strip(),
                    "via": nested,
                    "physical_sources": nested.get("physical_sources", []),
                    "alias": alias,
                    "column": column,
                }
        cte_trace = _trace_from_cte_source(expr, column, cte_body, ctes, stmt, alias, inventory, visited)
        if cte_trace:
            return cte_trace
        return {"pass": False, "reason": "unproven_derived_lineage", "alias": alias, "column": column, "expression": expr.strip()}

    expr = _expression_for_column(scope_sql, column)
    if expr is None:
        return {"pass": False, "reason": "column_expression_not_found", "alias": alias, "column": column}

    non_column = _classify_non_column(expr, column)
    if non_column:
        non_column["pass"] = True
        non_column["alias"] = alias
        non_column["column"] = column
        return non_column

    physical = _physical_sources_in_expression(expr, inventory)
    if physical:
        return {
            "pass": True,
            "category": "physical_column_reference",
            "expression": expr.strip(),
            "physical_sources": physical,
            "alias": alias,
            "column": column,
        }

    bare_table = _single_from_table(scope_sql, inventory)
    if bare_table and re.match(rf'^"?{re.escape(column)}"?$', expr.strip(), re.I):
        return {
            "pass": True,
            "category": "physical_column_reference",
            "expression": expr.strip(),
            "physical_sources": [{"relation": bare_table, "property": column}],
            "alias": alias,
            "column": column,
        }

    for ref_alias, ref_col in re.findall(r'"?(?P<a>[a-z_][a-z0-9_]*)"?\."?(?P<c>[a-z_][a-z0-9_]*)"?', expr, re.I):
        ref_alias = _strip_ident(ref_alias)
        ref_col = _strip_ident(ref_col)
        nested = trace_qualified_column(
            stmt,
            ref_alias,
            ref_col,
            inventory,
            scope_sql=scope_sql,
            ctes=ctes,
            visited=visited,
        )
        if nested.get("pass"):
            return {
                "pass": True,
                "category": "derived_output_with_physical_lineage",
                "expression": expr.strip(),
                "via": nested,
                "physical_sources": nested.get("physical_sources", []),
                "alias": alias,
                "column": column,
            }

    return {"pass": False, "reason": "unproven_derived_lineage", "alias": alias, "column": column, "expression": expr.strip()}


def prove_false_positive_record(
    record: dict[str, Any],
    stmt: str,
    inventory: set[str],
) -> dict[str, Any]:
    alias = record.get("resolved_alias") or record.get("resolved_relation") or ""
    column = record.get("required_property") or ""
    if not alias or not column:
        return {"pass": False, "reason": "missing_alias_or_column", "record_id": record.get("id")}
    if column.endswith("_") and column + "from" in stmt:
        alt = trace_qualified_column(stmt, alias, column + "from", inventory)
        if alt.get("pass"):
            alt["record_id"] = record.get("id")
            alt["note"] = "truncated_property_prefix_match"
            return alt
    proof = trace_qualified_column(stmt, alias, column, inventory)
    proof["record_id"] = record.get("id")
    return proof


def reference_is_covered(
    alias_or_rel: str,
    col: str,
    stmt: str,
    stmt_records: list[dict[str, Any]],
    inventory: set[str],
) -> tuple[bool, dict[str, Any] | None]:
    for record in stmt_records:
        prop = record.get("required_property") or ""
        if prop != col and not (col.startswith(prop) or prop.startswith(col)):
            continue
        if alias_or_rel in {
            record.get("resolved_relation"),
            record.get("resolved_alias"),
            record.get("required_relation"),
        }:
            return True, {"source": "matrix_record", "record_id": record.get("id")}

    proof = trace_qualified_column(stmt, alias_or_rel, col, inventory)
    if proof.get("pass"):
        return True, proof
    return False, proof

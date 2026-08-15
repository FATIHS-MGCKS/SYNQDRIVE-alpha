"""Extract column dependencies from INSERT ... SELECT backfill statements (CI-R3B1H)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from expression_dependency_extractor import (
    ExpressionDependency,
    dedupe_dependencies,
    strip_sql_comments,
)
from sql_scope_resolver import (
    IDENT_RE,
    TABLE_NAME_RE,
    ResolvedReference,
    _extract_cte_output_aliases,
    _ident,
    _split_select_list,
    build_select_output_lineage,
    extract_scoped_expression_columns,
    parse_from_item,
    parse_with_ctes,
    split_from_items,
    ScopeBinding,
    StatementScope,
)


@dataclass
class ParsedInsertSelect:
    target_table: str
    target_columns: list[str]
    select_list: str
    from_clause: str | None
    where_clause: str | None
    join_on_clauses: list[str] = field(default_factory=list)
    scope: StatementScope = field(default_factory=StatementScope)
    cte_physical: dict[str, dict[str, tuple[str, str]]] = field(default_factory=dict)


def _split_from_join_items(from_clause: str) -> list[str]:
    """Split FROM/JOIN chain into individual relation items (without ON predicates)."""
    items: list[str] = []
    buf: list[str] = []
    depth = 0
    in_single = False
    i = 0
    text = from_clause.strip().rstrip(";")
    while i < len(text):
        ch = text[i]
        if in_single:
            buf.append(ch)
            if ch == "'" and i + 1 < len(text) and text[i + 1] == "'":
                buf.append(text[i + 1])
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if ch == "'":
            in_single = True
            buf.append(ch)
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            join_m = re.match(
                r"\b(?:(?:LEFT|RIGHT|INNER|CROSS|FULL)\s+)?JOIN\b",
                text[i:],
                re.I,
            )
            from_m = re.match(r"\bFROM\b", text[i:], re.I) if not items and not buf else None
            if join_m or from_m:
                part = "".join(buf).strip()
                if part:
                    items.append(part)
                buf = []
                i += (join_m or from_m).end()  # type: ignore[union-attr]
                continue
            on_m = re.match(r"\bON\b", text[i:], re.I)
            if on_m and items:
                part = "".join(buf).strip()
                if part:
                    items.append(part)
                break
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail and not re.match(r"^\bON\b", tail, re.I):
        items.append(tail)
    return [x for x in items if x]


def _extract_join_on_clauses(from_clause: str) -> list[str]:
    ons: list[str] = []
    for m in re.finditer(r"\bON\b", from_clause, re.I):
        start = m.end()
        depth = 0
        in_single = False
        j = start
        while j < len(from_clause):
            ch = from_clause[j]
            if in_single:
                if ch == "'" and j + 1 < len(from_clause) and from_clause[j + 1] == "'":
                    j += 2
                    continue
                if ch == "'":
                    in_single = False
                j += 1
                continue
            if ch == "'":
                in_single = True
                j += 1
                continue
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth = max(0, depth - 1)
            elif depth == 0 and re.match(r"\b(?:LEFT|RIGHT|INNER|CROSS|FULL)?\s*JOIN\b", from_clause[j:], re.I):
                break
            j += 1
        ons.append(from_clause[start:j].strip())
    return ons


def _truncate_from_clause(from_text: str) -> str:
    """Stop FROM scan at clause boundaries that are not part of the relation list."""
    depth = 0
    in_single = False
    i = 0
    while i < len(from_text):
        ch = from_text[i]
        if in_single:
            if ch == "'" and i + 1 < len(from_text) and from_text[i + 1] == "'":
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0:
            for kw in ("WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "RETURNING", "ON CONFLICT"):
                if re.match(rf"\b{kw}\b", from_text[i:], re.I):
                    return from_text[:i].strip().rstrip(";")
        i += 1
    return from_text.strip().rstrip(";")


def _mask_select_subqueries(text: str) -> str:
    """Replace ( SELECT ... ) subquery bodies with placeholders for outer-scope scans."""
    out: list[str] = []
    i = 0
    while i < len(text):
        m = re.match(r"\(\s*SELECT\b", text[i:], re.I | re.S)
        if not m:
            out.append(text[i])
            i += 1
            continue
        depth = 0
        j = i
        while j < len(text):
            if text[j] == "(":
                depth += 1
            elif text[j] == ")":
                depth -= 1
                if depth == 0:
                    out.append("(/*subquery*/)")
                    i = j + 1
                    break
            j += 1
        else:
            out.append(text[i:])
            break
    return "".join(out)


def _cte_body_map(ctes: list[tuple[str, str]]) -> dict[str, str]:
    return {name: body for name, body in ctes if name}


def _bind_scope_from_clause(
    scope: StatementScope,
    from_clause: str,
    ctes: list[tuple[str, str]],
    outer: StatementScope | None = None,
) -> None:
    if outer is not None:
        scope.outer = outer
    cte_map = _cte_body_map(ctes)
    truncated = _truncate_from_clause(from_clause)
    for part in _split_from_join_items(truncated):
        bind = parse_from_item(part.strip().rstrip(";"))
        name = bind.relation or bind.alias
        if name in scope.cte_names or name in cte_map:
            body = cte_map.get(name or "", next((b for n, b in ctes if n == name), ""))
            inner_scope = StatementScope(outer=scope.outer or scope)
            inner_scope.cte_names = set(scope.cte_names)
            for cte_name, cte_body in ctes:
                if cte_name:
                    inner_scope.cte_names.add(cte_name)
                    inner_scope.bindings[cte_name] = ScopeBinding(
                        relation=cte_name,
                        alias=cte_name,
                        kind="CTE",
                        output_columns=_extract_cte_output_aliases(cte_body),
                        column_lineage=build_select_output_lineage(
                            _select_list_from_body(cte_body) or "",
                            inner_scope,
                            cte_map,
                        ),
                    )
            sel_list = _select_list_from_body(body) or ""
            _bind_scope_from_clause(inner_scope, _from_clause_from_body(body) or "", ctes, outer=scope.outer or scope)
            lineage = build_select_output_lineage(sel_list, inner_scope, cte_map)
            bind = ScopeBinding(
                relation=name,
                alias=bind.alias or name,
                kind="CTE" if name in cte_map else bind.kind,
                output_columns=_extract_cte_output_aliases(body),
                column_lineage=lineage,
            )
        elif bind.kind == "SUBQUERY":
            inner_scope = StatementScope(outer=scope.outer or scope)
            inner_scope.cte_names = set(scope.cte_names)
            sub_body = _subquery_body_from_item(part)
            if sub_body:
                sub_ctes, sub_remainder = parse_with_ctes(sub_body)
                for cte_name, cte_body in sub_ctes:
                    if cte_name:
                        inner_scope.cte_names.add(cte_name)
                        inner_scope.bindings[cte_name] = ScopeBinding(
                            relation=cte_name,
                            alias=cte_name,
                            kind="CTE",
                            output_columns=_extract_cte_output_aliases(cte_body),
                            column_lineage=build_select_output_lineage(
                                _select_list_from_body(cte_body) or "",
                                inner_scope,
                                {**cte_map, **_cte_body_map(sub_ctes)},
                            ),
                        )
                sub_from = _from_clause_from_body(sub_remainder) or _from_clause_from_body(sub_body) or ""
                if sub_from:
                    _bind_scope_from_clause(inner_scope, sub_from, sub_ctes + ctes, outer=scope.outer or scope)
                sel_list = _select_list_from_body(sub_remainder) or _select_list_from_body(sub_body) or ""
                bind.column_lineage = build_select_output_lineage(
                    sel_list,
                    inner_scope,
                    {**cte_map, **_cte_body_map(sub_ctes)},
                )
                bind.output_columns = _extract_cte_output_aliases(sub_remainder or sub_body)
        if bind.alias:
            scope.bindings[bind.alias] = bind
        if bind.relation and bind.relation not in scope.bindings:
            scope.bindings[bind.relation] = bind


def _select_list_from_body(body: str) -> str | None:
    sel_m = re.search(r"\bSELECT\b", body, re.I)
    from_pos, _ = _find_top_level_from(body)
    if not sel_m or from_pos is None:
        return None
    return body[sel_m.end() : from_pos].strip()


def _from_clause_from_body(body: str) -> str | None:
    _, from_clause = _find_top_level_from(body)
    return from_clause


def _subquery_body_from_item(item: str) -> str | None:
    item = item.strip()
    if not item.startswith("("):
        return None
    depth = 0
    for idx, ch in enumerate(item):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return item[1:idx]
    return None


def _parse_cte_physical_outputs(body: str) -> dict[str, tuple[str, str]]:
    inner_scope = StatementScope()
    sel_m = re.search(r"\bSELECT\b", body, re.I)
    from_m = re.search(r"\bFROM\b", body, re.I)
    if not sel_m or not from_m:
        return {}
    inner_from = body[from_m.end() :]
    for kw in ("WHERE", "GROUP", "HAVING", "ORDER", "LIMIT"):
        km = re.search(rf"\b{kw}\b", inner_from, re.I)
        if km:
            inner_from = inner_from[: km.start()]
    _bind_from_join_clause(inner_scope, inner_from.strip().rstrip(";"), [])

    outputs: dict[str, tuple[str, str]] = {}
    for part in _split_select_list(body[sel_m.end() : from_m.start()]):
        as_m = re.search(rf"\bAS\s+{IDENT_RE}\s*$", part, re.I)
        if as_m:
            out_name = _ident(as_m.group(1) or as_m.group(2))
            expr = part[: as_m.start()]
        else:
            col_m = re.search(rf"{IDENT_RE}\s*\.\s*{IDENT_RE}\s*$", part)
            if col_m:
                out_name = _ident(col_m.group(3) or col_m.group(4))
                expr = part
            else:
                bare = re.match(rf"^{IDENT_RE}$", part.strip(), re.I)
                out_name = _ident(bare.group(1) or bare.group(2)) if bare else None
                expr = part
        if not out_name:
            continue
        for ref in extract_scoped_expression_columns(expr, inner_scope, None):
            if not ref.false_positive:
                outputs[out_name] = (ref.table, ref.column)
                break
    return outputs


def _find_top_level_from(body: str) -> tuple[int | None, str | None]:
    depth = 0
    in_single = False
    i = 0
    while i < len(body):
        ch = body[i]
        if in_single:
            if ch == "'" and i + 1 < len(body) and body[i + 1] == "'":
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0 and re.match(r"\bFROM\b", body[i:], re.I):
            from_text = body[i + 4 :]
            from_text = _truncate_from_clause(from_text)
            return i, from_text
        i += 1
    return None, None


def _extract_outer_where_clause(rest: str) -> str | None:
    """Extract top-level WHERE after INSERT-SELECT FROM, not subquery WHERE."""
    from_pos, _ = _find_top_level_from(rest)
    if from_pos is None:
        return _extract_where_clause(rest)
    search = rest[from_pos + 4 :]
    depth = 0
    in_single = False
    i = 0
    while i < len(search):
        ch = search[i]
        if in_single:
            if ch == "'" and i + 1 < len(search) and search[i + 1] == "'":
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue
        if ch == "'":
            in_single = True
            i += 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif depth == 0 and re.match(r"\bWHERE\b", search[i:], re.I):
            return search[i + 5 :].strip().rstrip(";")
        i += 1
    return None


def _extract_select_parts(select_body: str) -> tuple[str | None, str | None, str | None, list[str]]:
    sel_m = re.search(r"\bSELECT\b", select_body, re.I)
    if not sel_m:
        return None, None, None, []
    body = select_body[sel_m.end() :]
    from_pos, from_clause = _find_top_level_from(body)
    if from_pos is None or not from_clause:
        return body.strip(), None, _extract_where_clause(body), []
    select_list = body[:from_pos].strip()
    where_clause = _extract_outer_where_clause(body)
    join_on = _extract_join_on_clauses(from_clause)
    return select_list, from_clause, where_clause, join_on


def _build_insert_select_scope(stmt: str) -> ParsedInsertSelect | None:
    stmt = strip_sql_comments(stmt)
    ctes, remainder = parse_with_ctes(stmt)
    m = re.search(
        rf"INSERT\s+INTO\s+{TABLE_NAME_RE}\s*\(([^)]+)\)\s*SELECT\b",
        remainder,
        re.I | re.S,
    )
    if not m:
        return None
    target = _ident(m.group(1) or m.group(2))
    if not target:
        return None
    cols_part = m.group(3)
    target_columns = [_ident(x) for x in re.findall(r'"([^"]+)"', cols_part)]
    if not target_columns:
        target_columns = [_ident(x) for x in re.findall(r"\b([a-z_][a-z0-9_]*)\b", cols_part, re.I)]

    select_body = remainder[m.start() :]
    select_list, from_clause, where_clause, join_on = _extract_select_parts(select_body)
    if select_list is None:
        return None

    scope = StatementScope(target_relation=target)
    scope.bindings[target] = ScopeBinding(relation=target, alias=target, kind="TABLE")
    cte_physical: dict[str, dict[str, tuple[str, str]]] = {}

    processed_cte_bindings: dict[str, ScopeBinding] = {}
    for cte_name, body in ctes:
        if not cte_name:
            continue
        scope.cte_names.add(cte_name)
        inner_scope = StatementScope(outer=scope)
        inner_scope.cte_names = set(processed_cte_bindings.keys())
        for prev_name, prev_bind in processed_cte_bindings.items():
            inner_scope.bindings[prev_name] = prev_bind
        _bind_scope_from_clause(inner_scope, _from_clause_from_body(body) or "", ctes)
        lineage = build_select_output_lineage(_select_list_from_body(body) or "", inner_scope, _cte_body_map(ctes))
        cte_physical[cte_name] = {k: v for k, v in lineage.items() if v is not None}  # type: ignore[misc]
        bind = ScopeBinding(
            relation=cte_name,
            alias=cte_name,
            kind="CTE",
            output_columns=_extract_cte_output_aliases(body),
            column_lineage=lineage,
        )
        processed_cte_bindings[cte_name] = bind
        scope.bindings[cte_name] = bind

    if from_clause:
        _bind_scope_from_clause(scope, from_clause, ctes)

    return ParsedInsertSelect(
        target_table=target,
        target_columns=target_columns,
        select_list=select_list,
        from_clause=from_clause,
        where_clause=where_clause,
        join_on_clauses=join_on,
        scope=scope,
        cte_physical=cte_physical,
    )


def _resolve_physical_ref(scope: StatementScope, ref: ResolvedReference, cte_physical: dict[str, dict[str, tuple[str, str]]]) -> ResolvedReference:
    if not ref.false_positive:
        return ref
    alias = ref.alias or ""
    binding = scope.bindings.get(alias)
    if binding and binding.kind == "CTE":
        phys = cte_physical.get(binding.relation or alias, {})
        if ref.column in phys:
            table, column = phys[ref.column]
            return ResolvedReference(
                table=table,
                column=column,
                scope_kind="TARGET_COLUMN",
                alias=alias,
                source_relation=table,
                false_positive=False,
                reason="resolved CTE lineage to physical source column",
            )
    return ref


def _refs_to_deps(
    refs: list[ResolvedReference],
    context: str,
    scope: StatementScope,
    cte_physical: dict[str, dict[str, tuple[str, str]]],
) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    for ref in refs:
        if ref.column in {"__subquery__", "subquery"}:
            continue
        ref = _resolve_physical_ref(scope, ref, cte_physical)
        deps.append(
            ExpressionDependency(
                table=ref.source_relation or ref.table,
                column=ref.column,
                context=context,
                scope_kind=ref.scope_kind,
                resolved_relation=ref.source_relation or ref.table,
                resolved_alias=ref.alias,
                false_positive=ref.false_positive,
                reason=ref.reason,
            )
        )
    return deps


def extract_insert_select_dependencies(stmt: str) -> list[ExpressionDependency]:
    parsed = _build_insert_select_scope(stmt)
    if not parsed:
        return []
    deps: list[ExpressionDependency] = []
    scope = parsed.scope

    for col in parsed.target_columns:
        deps.append(
            ExpressionDependency(
                table=parsed.target_table,
                column=col,
                context="INSERT_SELECT_TARGET",
                scope_kind="TARGET_COLUMN",
                resolved_relation=parsed.target_table,
                false_positive=False,
                reason="insert_target_column",
            )
        )

    for expr in _split_select_list(parsed.select_list):
        deps.extend(
            _refs_to_deps(
                extract_scoped_expression_columns(expr, scope, parsed.target_table),
                "INSERT_SELECT_EXPRESSION",
                scope,
                parsed.cte_physical,
            )
        )

    if parsed.where_clause:
        masked_where = _mask_select_subqueries(parsed.where_clause)
        deps.extend(
            _refs_to_deps(
                extract_scoped_expression_columns(masked_where, scope, parsed.target_table),
                "INSERT_SELECT_WHERE",
                scope,
                parsed.cte_physical,
            )
        )

    for on_clause in parsed.join_on_clauses:
        deps.extend(
            _refs_to_deps(
                extract_scoped_expression_columns(on_clause, scope, parsed.target_table),
                "INSERT_SELECT_JOIN",
                scope,
                parsed.cte_physical,
            )
        )

    where_text = parsed.where_clause or ""
    for sub_m in re.finditer(r"\(\s*SELECT\b", where_text, re.I):
        sub_body = where_text[sub_m.start() :]
        sub_scope = StatementScope(outer=scope)
        sub_ctes, sub_remainder = parse_with_ctes(sub_body[1:])
        for cte_name, cte_body in sub_ctes:
            if cte_name:
                sub_scope.cte_names.add(cte_name)
                sub_scope.bindings[cte_name] = ScopeBinding(
                    relation=cte_name,
                    alias=cte_name,
                    kind="CTE",
                    output_columns=_extract_cte_output_aliases(cte_body),
                    column_lineage=build_select_output_lineage(
                        _select_list_from_body(cte_body) or "",
                        sub_scope,
                        _cte_body_map(sub_ctes),
                    ),
                )
        sub_from_m = re.search(r"\bFROM\b", sub_remainder, re.I)
        if sub_from_m:
            sub_from = sub_remainder[sub_from_m.end() :]
            sub_where_m = re.search(r"\bWHERE\b", sub_from, re.I)
            if sub_where_m:
                _bind_scope_from_clause(
                    sub_scope,
                    sub_from[: sub_where_m.start()].strip().rstrip(";"),
                    sub_ctes,
                    outer=scope,
                )
                sub_where = sub_from[sub_where_m.end() :].strip().rstrip(")")
                deps.extend(
                    _refs_to_deps(
                        extract_scoped_expression_columns(sub_where, sub_scope, None),
                        "INSERT_SELECT_SUBQUERY",
                        sub_scope,
                        {},
                    )
                )

    return dedupe_dependencies(deps)


def extract_insert_select_from_migration(sql: str) -> list[tuple[int, str, list[ExpressionDependency]]]:
    from sql_migration_analyzer import split_sql_statements

    out: list[tuple[int, str, list[ExpressionDependency]]] = []
    for idx, stmt in enumerate(split_sql_statements(sql), 1):
        if re.search(r"INSERT\s+INTO\b", stmt, re.I) and re.search(r"\bSELECT\b", stmt, re.I):
            deps = extract_insert_select_dependencies(stmt)
            if deps:
                out.append((idx, stmt, deps))
    return out

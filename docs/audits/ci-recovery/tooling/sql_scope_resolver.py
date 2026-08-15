"""SQL scope resolution for UPDATE/DELETE … FROM / CTE statements (CI-R3B1F.1.1)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from expression_dependency_extractor import is_false_positive_identifier, normalize_expr, strip_string_literals
from migration_creator_state import split_top_level_commas

ScopeKind = Literal[
    "TARGET_COLUMN",
    "FROM_RELATION",
    "RELATION_ALIAS",
    "CTE_RELATION",
    "CTE_OUTPUT_ALIAS",
    "CTE_OUTPUT_REFERENCE",
    "JSON_KEY_LITERAL",
    "STRING_LITERAL",
    "CAST_TYPE",
    "FUNCTION",
    "FALSE_POSITIVE",
]

TABLE_NAME_RE = r'(?:"([^"]+)"|([a-z_][a-z0-9_]*))'
IDENT_RE = r'(?:"([^"]+)"|([a-z_][a-z0-9_]*))'


@dataclass
class ScopeBinding:
    relation: str | None
    alias: str | None
    kind: Literal["TABLE", "CTE", "SUBQUERY"] = "TABLE"
    output_columns: dict[str, str | None] = field(default_factory=dict)


@dataclass
class ResolvedReference:
    table: str
    column: str
    scope_kind: ScopeKind
    alias: str | None = None
    source_relation: str | None = None
    false_positive: bool = False
    reason: str = ""


@dataclass
class StatementScope:
    target_relation: str | None = None
    target_alias: str | None = None
    set_clause: str | None = None
    where_clause: str | None = None
    bindings: dict[str, ScopeBinding] = field(default_factory=dict)
    cte_names: set[str] = field(default_factory=set)


def _ident(raw: str | None) -> str | None:
    if raw is None:
        return None
    return raw.strip('"')


def parse_with_ctes(stmt: str) -> tuple[list[tuple[str, str]], str]:
    """Return [(cte_name, cte_body), ...] and remainder after WITH clause."""
    m = re.match(r"^\s*WITH\s+", stmt, re.I | re.S)
    if not m:
        return [], stmt
    i = m.end()
    ctes: list[tuple[str, str]] = []
    while i < len(stmt):
        name_m = re.match(rf"{IDENT_RE}\s+AS\s*\(", stmt[i:], re.I | re.S)
        if not name_m:
            break
        name = _ident(name_m.group(1) or name_m.group(2))
        open_idx = i + name_m.end() - 1
        depth = 0
        j = open_idx
        while j < len(stmt):
            if stmt[j] == "(":
                depth += 1
            elif stmt[j] == ")":
                depth -= 1
                if depth == 0:
                    body = stmt[open_idx + 1 : j]
                    ctes.append((name or "", body))
                    i = j + 1
                    break
            j += 1
        else:
            break
        tail = stmt[i:].lstrip()
        if tail.startswith(","):
            i += stmt[i:].index(",") + 1
            continue
        return ctes, tail
    return ctes, stmt


def _extract_from_clause(remainder: str) -> str | None:
    m = re.search(r"\bFROM\b", remainder, re.I)
    if not m:
        return None
    i = m.end()
    while i < len(remainder) and remainder[i].isspace():
        i += 1
    depth = 0
    in_single = False
    start = i
    j = i
    while j < len(remainder):
        ch = remainder[j]
        if in_single:
            if ch == "'" and j + 1 < len(remainder) and remainder[j + 1] == "'":
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
        elif depth == 0 and re.match(r"\bWHERE\b", remainder[j:], re.I):
            return remainder[start:j].strip()
        j += 1
    return remainder[start:].strip().rstrip(";")


def _extract_set_clause(remainder: str) -> str | None:
    m = re.search(r"\bSET\b", remainder, re.I)
    if not m:
        return None
    i = m.end()
    depth = 0
    in_single = False
    start = i
    j = i
    while j < len(remainder):
        ch = remainder[j]
        if in_single:
            if ch == "'" and j + 1 < len(remainder) and remainder[j + 1] == "'":
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
        elif depth == 0 and re.match(r"\b(FROM|WHERE)\b", remainder[j:], re.I):
            return remainder[start:j].strip()
        j += 1
    return remainder[start:].strip()


def _extract_where_clause(remainder: str) -> str | None:
    from_clause = _extract_from_clause(remainder)
    search_from = 0
    if from_clause:
        idx = remainder.find(from_clause)
        if idx >= 0:
            search_from = idx + len(from_clause)
    tail = remainder[search_from:]
    m = re.search(r"\bWHERE\b", tail, re.I)
    if not m:
        return None
    return tail[m.end() :].strip().rstrip(";")


def _extract_subquery_output_columns(body: str) -> dict[str, str | None]:
    select_m = re.search(r"SELECT\s+(.*?)\s+FROM\b", body, re.I | re.S)
    if not select_m:
        return {}
    aliases: dict[str, str | None] = {}
    for part in _split_select_list(select_m.group(1)):
        as_m = re.search(rf"\bAS\s+{IDENT_RE}\s*$", part, re.I)
        if as_m:
            alias = _ident(as_m.group(1) or as_m.group(2))
            if alias:
                aliases[alias] = _lineage_column(part[: as_m.start()])
            continue
        col_m = re.search(rf"^{IDENT_RE}$", part.strip(), re.I)
        if col_m:
            name = _ident(col_m.group(1) or col_m.group(2))
            if name:
                aliases[name] = name
    return aliases


def _lineage_column(expr: str) -> str | None:
    m = re.search(rf"{IDENT_RE}\s*\.\s*{IDENT_RE}", expr)
    if m:
        return f"{_ident(m.group(1) or m.group(2))}.{_ident(m.group(3) or m.group(4))}"
    m2 = re.search(rf"^{IDENT_RE}$", expr.strip(), re.I)
    if m2:
        return _ident(m2.group(1) or m2.group(2))
    return None


def _extract_cte_output_aliases(body: str) -> dict[str, str | None]:
    aliases: dict[str, str | None] = {}
    select_m = re.search(r"SELECT\s+(.*?)\s+FROM\b", body, re.I | re.S)
    if not select_m:
        return aliases
    for part in _split_select_list(select_m.group(1)):
        as_m = re.search(rf"\bAS\s+{IDENT_RE}\s*$", part, re.I)
        if as_m:
            alias = _ident(as_m.group(1) or as_m.group(2))
            if alias:
                aliases[alias] = _lineage_column(part[: as_m.start()])
            continue
        col_m = re.search(rf"{IDENT_RE}\s*\.\s*{IDENT_RE}\s*$", part)
        if col_m:
            col = _ident(col_m.group(3) or col_m.group(4))
            if col:
                aliases[col] = f"{_ident(col_m.group(1) or col_m.group(2))}.{_ident(col_m.group(3) or col_m.group(4))}"
            continue
        bare = re.match(rf"^{IDENT_RE}$", part.strip(), re.I)
        if bare:
            name = _ident(bare.group(1) or bare.group(2))
            if name:
                aliases[name] = name
    return aliases


def _split_select_list(text: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    in_single = False
    i = 0
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
        elif ch == "," and depth == 0:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def parse_update_scope(stmt: str) -> StatementScope | None:
    from expression_dependency_extractor import strip_sql_comments

    stmt = strip_sql_comments(stmt)
    ctes, remainder = parse_with_ctes(stmt)
    m = re.search(
        rf"UPDATE\s+{TABLE_NAME_RE}(?:\s+{IDENT_RE})?\s+SET\b",
        remainder,
        re.I | re.S,
    )
    if not m:
        return None
    target = _ident(m.group(1) or m.group(2))
    target_alias = _ident(m.group(3) or m.group(4))
    scope = StatementScope(target_relation=target, target_alias=target_alias)
    scope.set_clause = _extract_set_clause(remainder)
    scope.where_clause = _extract_where_clause(remainder)
    if target:
        scope.bindings[target] = ScopeBinding(relation=target, alias=target_alias or target, kind="TABLE")
    if target_alias and target_alias != target:
        scope.bindings[target_alias] = ScopeBinding(relation=target, alias=target_alias, kind="TABLE")

    for cte_name, body in ctes:
        if not cte_name:
            continue
        scope.cte_names.add(cte_name)
        scope.bindings[cte_name] = ScopeBinding(
            relation=cte_name,
            alias=cte_name,
            kind="CTE",
            output_columns=_extract_cte_output_aliases(body),
        )

    def bind_from_item(item: str) -> None:
        bind = parse_from_item(item)
        name = bind.relation or bind.alias
        if name in scope.cte_names:
            body = next((b for n, b in ctes if n == name), "")
            bind = ScopeBinding(
                relation=name,
                alias=bind.alias or name,
                kind="CTE",
                output_columns=_extract_cte_output_aliases(body),
            )
        if bind.alias:
            scope.bindings[bind.alias] = bind
        if bind.relation and bind.relation not in scope.bindings:
            scope.bindings[bind.relation] = bind

    from_clause = _extract_from_clause(remainder)
    if from_clause:
        for part in split_from_items(from_clause):
            bind_from_item(part)

    using_clause = None
    using_m = re.search(r"\bUSING\b", remainder, re.I)
    if using_m and (from_clause is None or using_m.start() > remainder.find(from_clause)):
        using_clause = _extract_from_clause(remainder[using_m.start() :].replace("USING", "FROM", 1))
    if using_clause:
        for part in split_from_items(using_clause):
            bind_from_item(part)

    return scope


def split_from_items(from_clause: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    in_single = False
    i = 0
    text = from_clause.strip()
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
        elif ch == "," and depth == 0:
            part = "".join(buf).strip()
            if part:
                parts.append(part)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


def parse_from_item(item: str) -> ScopeBinding:
    item = item.strip()
    sub_m = re.match(r"^\(", item)
    if sub_m:
        depth = 0
        end = 0
        for idx, ch in enumerate(item):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    end = idx
                    break
        body = item[1:end] if end else item
        alias_m = re.search(rf"\)\s+(?:AS\s+)?{IDENT_RE}\s*$", item, re.I)
        alias = _ident(alias_m.group(1) or alias_m.group(2)) if alias_m else None
        return ScopeBinding(
            relation=alias,
            alias=alias,
            kind="SUBQUERY",
            output_columns=_extract_subquery_output_columns(body),
        )
    m = re.match(rf"^{TABLE_NAME_RE}(?:\s+(?:AS\s+)?{IDENT_RE})?\s*$", item, re.I)
    if m:
        relation = _ident(m.group(1) or m.group(2))
        alias = _ident(m.group(3) or m.group(4)) or relation
        return ScopeBinding(relation=relation, alias=alias, kind="TABLE")
    cte_m = re.match(rf"^{IDENT_RE}\s*$", item, re.I)
    if cte_m:
        name = _ident(cte_m.group(1) or cte_m.group(2))
        return ScopeBinding(relation=name, alias=name, kind="CTE")
    return ScopeBinding(relation=None, alias=None, kind="TABLE")


def strip_json_key_operators(expr: str) -> str:
    expr = re.sub(r"->>\s*''", " ", expr)
    expr = re.sub(r"->>\s*'[^']*'", " ", expr)
    expr = re.sub(r"->\s*'[^']*'", " ", expr)
    expr = re.sub(r"#>>\s*'\{[^}]*\}'", " ", expr)
    expr = re.sub(r"#>\s*'\{[^}]*\}'", " ", expr)
    return expr


def resolve_qualified_reference(scope: StatementScope, alias: str, column: str) -> ResolvedReference | None:
    binding = scope.bindings.get(alias)
    if binding is None:
        if alias in scope.cte_names:
            return ResolvedReference(
                table=scope.target_relation or alias,
                column=column,
                scope_kind="CTE_OUTPUT_REFERENCE",
                alias=alias,
                source_relation=alias,
                false_positive=True,
                reason="unbound CTE output reference",
            )
        return None

    if binding.kind in {"CTE", "SUBQUERY"}:
        if column in binding.output_columns:
            return ResolvedReference(
                table=scope.target_relation or binding.relation or alias,
                column=column,
                scope_kind="CTE_OUTPUT_ALIAS",
                alias=alias,
                source_relation=binding.relation,
                false_positive=True,
                reason="derived relation output alias, not physical column on target",
            )

    if binding.kind in {"CTE", "SUBQUERY"}:
        return ResolvedReference(
            table=binding.relation or alias,
            column=column,
            scope_kind="CTE_OUTPUT_REFERENCE",
            alias=alias,
            source_relation=binding.relation,
            false_positive=True,
            reason="derived relation reference without physical column authority",
        )

    if binding.relation and column == binding.relation:
        return ResolvedReference(
            table=scope.target_relation or binding.relation,
            column=column,
            scope_kind="FROM_RELATION",
            alias=alias,
            source_relation=binding.relation,
            false_positive=True,
            reason="relation name used where column expected",
        )

    if binding.relation:
        return ResolvedReference(
            table=binding.relation,
            column=column,
            scope_kind="TARGET_COLUMN",
            alias=alias,
            source_relation=binding.relation,
            false_positive=False,
            reason="resolved FROM/JOIN alias column",
        )
    return None


def resolve_unqualified_reference(scope: StatementScope, column: str) -> ResolvedReference | None:
    if is_false_positive_identifier(column):
        return None
    for alias, binding in scope.bindings.items():
        if binding.relation and column == binding.relation and binding.relation != scope.target_relation:
            return ResolvedReference(
                table=scope.target_relation or binding.relation,
                column=column,
                scope_kind="FROM_RELATION",
                alias=alias,
                source_relation=binding.relation,
                false_positive=True,
                reason="FROM relation name, not target column",
            )
        if column == alias and alias not in {scope.target_relation, scope.target_alias}:
            return ResolvedReference(
                table=scope.target_relation or "",
                column=column,
                scope_kind="RELATION_ALIAS",
                alias=alias,
                source_relation=binding.relation,
                false_positive=True,
                reason="relation alias token, not column",
            )
    if column in scope.bindings:
        binding = scope.bindings[column]
        if binding.kind in {"CTE", "SUBQUERY"} or (binding.relation == column and column != scope.target_relation):
            return ResolvedReference(
                table=scope.target_relation or column,
                column=column,
                scope_kind="FROM_RELATION" if binding.kind == "TABLE" else "CTE_RELATION",
                alias=column,
                source_relation=binding.relation,
                false_positive=True,
                reason="unqualified relation/CTE name, not target column",
            )
    if column in scope.cte_names:
        return ResolvedReference(
            table=scope.target_relation or "",
            column=column,
            scope_kind="CTE_RELATION",
            false_positive=True,
            reason="CTE relation name treated as column",
        )
    if scope.target_relation:
        return ResolvedReference(
            table=scope.target_relation,
            column=column,
            scope_kind="TARGET_COLUMN",
            false_positive=False,
            reason="unqualified target-table column",
        )
    return None


def extract_scoped_expression_columns(expr: str, scope: StatementScope | None, default_table: str | None) -> list[ResolvedReference]:
    from expression_dependency_extractor import strip_cast_type_suffixes

    expr_norm = strip_cast_type_suffixes(strip_json_key_operators(normalize_expr(expr)))
    found: list[ResolvedReference] = []
    seen: set[tuple[str, str]] = set()

    def add(ref: ResolvedReference) -> None:
        if is_false_positive_identifier(ref.column):
            return
        key = (ref.table, ref.column)
        if key in seen:
            return
        seen.add(key)
        found.append(ref)

    for m in re.finditer(rf"{IDENT_RE}\s*\.\s*{IDENT_RE}", expr_norm):
        alias = _ident(m.group(1) or m.group(2)) or ""
        column = _ident(m.group(3) or m.group(4)) or ""
        if scope:
            ref = resolve_qualified_reference(scope, alias, column)
            if ref:
                add(ref)
                continue
        add(
            ResolvedReference(
                table=alias,
                column=column,
                scope_kind="TARGET_COLUMN",
                alias=alias,
                false_positive=False,
                reason="qualified reference without scope",
            )
        )

    expr_no_qualified = re.sub(rf'{IDENT_RE}\s*\.\s*{IDENT_RE}', " ", expr_norm)
    for m in re.finditer(
        r"(?<![\"A-Za-z0-9_])([a-z_][a-z0-9_]*)(?=\s*(?:=|<>|!=|<|>|<=|>=|\)|,|\s|$|::|\s+is\b|\s+and\b|\s+or\b))",
        expr_no_qualified,
        re.I,
    ):
        column = m.group(1)
        if scope:
            ref = resolve_unqualified_reference(scope, column)
            if ref:
                add(ref)
                continue
        if default_table:
            add(
                ResolvedReference(
                    table=default_table,
                    column=column,
                    scope_kind="TARGET_COLUMN",
                    false_positive=False,
                    reason="unqualified with default table",
                )
            )

    return found


def parse_delete_scope(stmt: str) -> StatementScope | None:
    from expression_dependency_extractor import strip_sql_comments

    stmt = strip_sql_comments(stmt)
    ctes, remainder = parse_with_ctes(stmt)
    m = re.search(rf"DELETE\s+FROM\s+{TABLE_NAME_RE}(?:\s+{IDENT_RE})?", remainder, re.I)
    if not m:
        return None
    target = _ident(m.group(1) or m.group(2))
    target_alias = _ident(m.group(3) or m.group(4))
    scope = StatementScope(target_relation=target, target_alias=target_alias)
    if target:
        scope.bindings[target] = ScopeBinding(relation=target, alias=target_alias or target, kind="TABLE")
    for cte_name, body in ctes:
        scope.cte_names.add(cte_name)
        scope.bindings[cte_name] = ScopeBinding(
            relation=cte_name, alias=cte_name, kind="CTE", output_columns=_extract_cte_output_aliases(body)
        )
    using_m = re.search(r"\bUSING\s+(.+?)(?:\bWHERE\b|;|$)", remainder, re.I | re.S)
    if using_m:
        for part in split_from_items(using_m.group(1)):
            bind = parse_from_item(part)
            if bind.alias:
                scope.bindings[bind.alias] = bind
    return scope

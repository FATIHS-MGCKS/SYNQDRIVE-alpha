"""Extract column dependencies from SQL predicates and expressions (CI-R3B1F)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from migration_creator_state import split_top_level_commas

DependencyContext = Literal[
    "COLUMN_REFERENCE",
    "INDEX_KEY",
    "INDEX_EXPRESSION",
    "PARTIAL_INDEX_PREDICATE",
    "CHECK_EXPRESSION",
    "GENERATED_EXPRESSION",
    "ALTER_USING_EXPRESSION",
    "UPDATE_EXPRESSION",
]

SQL_KEYWORDS = {
    "and",
    "or",
    "not",
    "null",
    "true",
    "false",
    "is",
    "in",
    "between",
    "like",
    "ilike",
    "case",
    "when",
    "then",
    "else",
    "end",
    "as",
    "on",
    "where",
    "set",
    "from",
    "select",
    "exists",
    "distinct",
    "all",
    "any",
    "some",
    "with",
    "without",
    "stored",
    "generated",
    "always",
    "if",
    "exists",
    "do",
    "begin",
    "exception",
    "raise",
    "returning",
    "using",
    "check",
    "constraint",
    "default",
    "current_timestamp",
    "now",
    "asc",
    "desc",
    "update",
    "into",
    "values",
    "join",
    "inner",
    "left",
    "right",
    "cross",
    "over",
    "partition",
    "by",
    "order",
    "limit",
    "offset",
    "array",
    "row",
    "rows",
}

SQL_FUNCTIONS = {
    "lower",
    "upper",
    "coalesce",
    "nullif",
    "greatest",
    "least",
    "abs",
    "round",
    "trunc",
    "length",
    "trim",
    "ltrim",
    "rtrim",
    "substring",
    "replace",
    "concat",
    "date_trunc",
    "extract",
    "to_char",
    "to_timestamp",
    "cast",
    "btrim",
    "strpos",
    "split_part",
    "jsonb_extract_path_text",
    "json_extract_path_text",
}

SQL_TYPES = {
    "text",
    "varchar",
    "char",
    "bpchar",
    "int",
    "int2",
    "int4",
    "int8",
    "integer",
    "bigint",
    "smallint",
    "float",
    "float4",
    "float8",
    "double",
    "precision",
    "numeric",
    "decimal",
    "boolean",
    "bool",
    "timestamp",
    "timestamptz",
    "date",
    "time",
    "timetz",
    "uuid",
    "json",
    "jsonb",
    "bytea",
    "serial",
    "bigserial",
    "real",
}


@dataclass(frozen=True)
class ExpressionDependency:
    table: str
    column: str
    context: DependencyContext
    schema: str = "public"
    scope_kind: str | None = None
    resolved_relation: str | None = None
    resolved_alias: str | None = None
    false_positive: bool = False
    reason: str = ""


def strip_sql_comments(sql: str) -> str:
    sql = re.sub(r"--[^\n]*", " ", sql)
    return re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)


def strip_string_literals(sql: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(sql):
        if sql[i] == "'":
            out.append(" '' ")
            i += 1
            while i < len(sql):
                if sql[i] == "'" and i + 1 < len(sql) and sql[i + 1] == "'":
                    i += 2
                    continue
                if sql[i] == "'":
                    i += 1
                    break
                i += 1
            continue
        out.append(sql[i])
        i += 1
    return "".join(out)


def normalize_expr(expr: str) -> str:
    return " ".join(strip_string_literals(strip_sql_comments(expr)).split())


def is_false_positive_identifier(name: str) -> bool:
    lower = name.lower()
    if lower in SQL_KEYWORDS or lower in SQL_FUNCTIONS or lower in SQL_TYPES:
        return True
    if lower.isdigit():
        return True
    if len(name) == 1 and name.isalpha():
        return True
    if re.match(r"^[A-Z][a-zA-Z0-9]*$", name) and any(ch.isupper() for ch in name[1:]):
        return True
    return False


def strip_json_key_operators(expr: str) -> str:
    expr = re.sub(r"->>\s*''", " ", expr)
    expr = re.sub(r"->>\s*'[^']*'", " ", expr)
    expr = re.sub(r"->\s*'[^']*'", " ", expr)
    expr = re.sub(r"#>>\s*'\{[^}]*\}'", " ", expr)
    expr = re.sub(r"#>\s*'\{[^}]*\}'", " ", expr)
    return expr


def strip_cast_type_suffixes(expr: str) -> str:
    return re.sub(r"::\s*[a-z_][a-z0-9_]*(?:\(\d+\))?", " ", expr, flags=re.I)


def extract_columns_from_expression(expr: str, default_table: str | None) -> list[tuple[str, str]]:
    """Return deduplicated (table, column) pairs referenced in an expression."""
    expr = strip_cast_type_suffixes(strip_json_key_operators(normalize_expr(expr)))
    found: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()

    def add(table: str | None, column: str) -> None:
        if is_false_positive_identifier(column):
            return
        resolved_table = table or default_table
        if not resolved_table:
            return
        key = (resolved_table, column)
        if key not in seen:
            seen.add(key)
            found.append(key)

    for m in re.finditer(r'"([^"]+)"\s*\.\s*"([^"]+)"', expr):
        add(m.group(1), m.group(2))

    expr_no_qualified = re.sub(r'"([^"]+)"\s*\.\s*"([^"]+)"', " ", expr)
    for m in re.finditer(r'"([^"]+)"', expr_no_qualified):
        add(default_table, m.group(1))

    for m in re.finditer(
        r"(?<![\"A-Za-z0-9_])([a-z_][a-z0-9_]*)(?=\s*(?:=|<>|!=|<|>|<=|>=|\)|,|\s|$|::|\s+is\b|\s+and\b|\s+or\b))",
        expr_no_qualified,
        re.I,
    ):
        add(default_table, m.group(1))

    for m in re.finditer(r"\(\s*([a-z_][a-z0-9_]*)\s*\)", expr_no_qualified, re.I):
        token = m.group(1)
        prefix = expr_no_qualified[max(0, m.start() - 20) : m.start()]
        if re.search(rf"\b{re.escape(token)}\s*$", prefix, re.I):
            continue
        add(default_table, token)

    for m in re.finditer(r"\(\s*\"([^\"]+)\"\s*\)", expr_no_qualified):
        add(default_table, m.group(1))

    return found


def _balanced_paren_content(text: str, open_idx: int) -> tuple[str, int] | None:
    if open_idx >= len(text) or text[open_idx] != "(":
        return None
    depth = 0
    start = open_idx + 1
    i = open_idx
    while i < len(text):
        ch = text[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[start:i], i
        i += 1
    return None


def parse_create_index(stmt: str) -> list[dict[str, str | None]]:
    """Parse CREATE INDEX statements into structural parts."""
    results: list[dict[str, str | None]] = []
    header = re.compile(
        r"CREATE\s+(?P<unique>UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"
        r'(?:"(?P<qname>[^"]+)"|(?P<uname>[a-z_][a-z0-9_]*))[\s\S]*?\s+ON\s+'
        r'(?:"(?P<qtable>[^"]+)"|(?P<utable>[a-z_][a-z0-9_]*))\s*\(',
        re.I,
    )
    for m in header.finditer(stmt):
        table = m.group("qtable") or m.group("utable")
        open_paren = m.end() - 1
        cols_match = _balanced_paren_content(stmt, open_paren)
        if not cols_match:
            continue
        cols_part, close_idx = cols_match
        tail = stmt[close_idx + 1 :]
        predicate = None
        where_m = re.match(r"\s+WHERE\s+(.+?)(?:\s*;|\s*$)", tail, re.I | re.S)
        if where_m:
            predicate = where_m.group(1).strip().rstrip(";")
        results.append(
            {
                "index_name": m.group("qname") or m.group("uname"),
                "table": table,
                "cols_part": cols_part,
                "predicate": predicate,
            }
        )
    return results


def extract_index_key_columns(cols_part: str) -> list[str]:
    stripped = strip_string_literals(cols_part).strip()
    if "(" in stripped:
        return []
    cols: list[str] = []
    for m in re.finditer(r'"([^"]+)"', cols_part):
        cols.append(m.group(1))
    if cols:
        return cols
    for m in re.finditer(r"\b([a-z_][a-z0-9_]*)\b", stripped, re.I):
        if not is_false_positive_identifier(m.group(1)):
            cols.append(m.group(1))
    return cols


def extract_index_expression_columns(cols_part: str, table: str) -> list[tuple[str, str]]:
    expr_cols: list[tuple[str, str]] = []
    stripped = cols_part.strip()

    def unwrap_expression(value: str) -> str:
        inner = value.strip()
        while inner.startswith("(") and inner.endswith(")"):
            candidate = inner[1:-1].strip()
            if not candidate or candidate == inner:
                break
            inner = candidate
        return inner

    inner = unwrap_expression(stripped)
    if inner != stripped or any(op in inner for op in ("->", ">>", "#>", "::")):
        expr_cols.extend(extract_columns_from_expression(inner, table))
        if expr_cols:
            return expr_cols

    if "(" in cols_part and ")" in cols_part:
        for fn_m in re.finditer(r"\b([a-z_][a-z0-9_]*)\s*\(([^)]+)\)", cols_part, re.I):
            fn = fn_m.group(1).lower()
            if fn in SQL_FUNCTIONS or fn in SQL_TYPES:
                expr_cols.extend(extract_columns_from_expression(fn_m.group(2), table))
    return expr_cols


def extract_create_index_dependencies(stmt: str) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    for parsed in parse_create_index(stmt):
        table = parsed["table"]
        assert table
        cols_part = parsed["cols_part"] or ""
        for col in extract_index_key_columns(cols_part):
            deps.append(ExpressionDependency(table=table, column=col, context="INDEX_KEY"))
        for table_name, col in extract_index_expression_columns(cols_part, table):
            deps.append(ExpressionDependency(table=table_name, column=col, context="INDEX_EXPRESSION"))
        predicate = parsed.get("predicate")
        if predicate:
            for table_name, col in extract_columns_from_expression(predicate, table):
                deps.append(
                    ExpressionDependency(table=table_name, column=col, context="PARTIAL_INDEX_PREDICATE")
                )
    return deps


def extract_check_dependencies(stmt: str, default_table: str | None = None) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    tbl_m = re.search(r'ALTER\s+TABLE\s+"([^"]+)"', stmt, re.I)
    table = tbl_m.group(1) if tbl_m else default_table
    for m in re.finditer(r"CHECK\s*\((.+?)\)", stmt, re.I | re.S):
        for table_name, col in extract_columns_from_expression(m.group(1), table):
            deps.append(ExpressionDependency(table=table_name, column=col, context="CHECK_EXPRESSION"))
    return deps


def extract_generated_dependencies(stmt: str, default_table: str | None = None) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    tbl_m = re.search(r'ALTER\s+TABLE\s+"([^"]+)"', stmt, re.I)
    table = tbl_m.group(1) if tbl_m else default_table
    for m in re.finditer(r"GENERATED\s+ALWAYS\s+AS\s*\((.+?)\)\s+STORED", stmt, re.I | re.S):
        for table_name, col in extract_columns_from_expression(m.group(1), table):
            deps.append(ExpressionDependency(table=table_name, column=col, context="GENERATED_EXPRESSION"))
    create_tbl = re.search(r'CREATE\s+TABLE\s+"([^"]+)"', stmt, re.I)
    if create_tbl:
        table = create_tbl.group(1)
    for m in re.finditer(r"GENERATED\s+ALWAYS\s+AS\s*\((.+?)\)\s+STORED", stmt, re.I | re.S):
        for table_name, col in extract_columns_from_expression(m.group(1), table):
            deps.append(ExpressionDependency(table=table_name, column=col, context="GENERATED_EXPRESSION"))
    return deps


def extract_alter_using_dependencies(stmt: str) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    tbl_m = re.search(r'ALTER\s+TABLE\s+"([^"]+)"', stmt, re.I)
    table = tbl_m.group(1) if tbl_m else None
    for m in re.finditer(r"USING\s+(.+?)(?:;|$)", stmt, re.I | re.S):
        for table_name, col in extract_columns_from_expression(m.group(1), table):
            deps.append(ExpressionDependency(table=table_name, column=col, context="ALTER_USING_EXPRESSION"))
    return deps


def _refs_to_deps(refs, context: DependencyContext) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    seen: set[tuple[str, str, str]] = set()
    for ref in refs:
        key = (ref.table, ref.column, context)
        if key in seen:
            continue
        seen.add(key)
        deps.append(
            ExpressionDependency(
                table=ref.table,
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


IDENT_PATTERN = r'(?:"([^"]+)"|([a-z_][a-z0-9_]*))'


def extract_update_dependencies(stmt: str) -> list[ExpressionDependency]:
    from sql_scope_resolver import extract_scoped_expression_columns, parse_update_scope

    scope = parse_update_scope(stmt)
    if not scope or not scope.target_relation:
        return []
    deps: list[ExpressionDependency] = []
    assign_re = re.compile(rf"^{IDENT_PATTERN}\s*=\s*(.+)$", re.I | re.S)
    if scope.set_clause:
        for part in split_top_level_commas(scope.set_clause):
            assign_m = assign_re.match(part.strip())
            if not assign_m:
                continue
            lhs = assign_m.group(1) or assign_m.group(2)
            rhs = assign_m.group(3) or ""
            if re.search(r"^\s*'[^']*'", rhs):
                continue
            if re.search(r"^\s*\d", rhs):
                continue
            refs = extract_scoped_expression_columns(rhs, scope, scope.target_relation)
            for ref in refs:
                dep = ExpressionDependency(
                    table=ref.table,
                    column=ref.column,
                    context="UPDATE_EXPRESSION",
                    scope_kind=ref.scope_kind,
                    resolved_relation=ref.source_relation or ref.table,
                    resolved_alias=ref.alias,
                    false_positive=ref.false_positive,
                    reason=ref.reason,
                )
                if not ref.false_positive and ref.column == lhs and ref.table == scope.target_relation:
                    continue
                deps.append(dep)
    if scope.where_clause:
        deps.extend(
            _refs_to_deps(
                extract_scoped_expression_columns(scope.where_clause, scope, scope.target_relation),
                "UPDATE_EXPRESSION",
            )
        )
    return dedupe_dependencies(deps)


def extract_delete_dependencies(stmt: str) -> list[ExpressionDependency]:
    from sql_scope_resolver import extract_scoped_expression_columns, parse_delete_scope

    scope = parse_delete_scope(stmt)
    if not scope or not scope.target_relation:
        return []
    where_m = re.search(r"\bWHERE\b(.+?)(?:;|$)", stmt, re.I | re.S)
    if not where_m:
        return []
    return dedupe_dependencies(
        _refs_to_deps(extract_scoped_expression_columns(where_m.group(1), scope, scope.target_relation), "UPDATE_EXPRESSION")
    )


def extract_statement_expression_dependencies(stmt: str) -> list[ExpressionDependency]:
    deps: list[ExpressionDependency] = []
    if re.search(r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\b", stmt, re.I):
        deps.extend(extract_create_index_dependencies(stmt))
    deps.extend(extract_check_dependencies(stmt))
    deps.extend(extract_generated_dependencies(stmt))
    deps.extend(extract_alter_using_dependencies(stmt))
    if re.search(r"\bUPDATE\b", stmt, re.I):
        deps.extend(extract_update_dependencies(stmt))
    if re.search(r"\bDELETE\s+FROM\b", stmt, re.I) and re.search(r"\bUSING\b", stmt, re.I):
        deps.extend(extract_delete_dependencies(stmt))
    return dedupe_dependencies(deps)


def dedupe_dependencies(deps: list[ExpressionDependency]) -> list[ExpressionDependency]:
    seen: set[tuple[str, str, str]] = set()
    out: list[ExpressionDependency] = []
    for dep in deps:
        key = (dep.table, dep.column, dep.context)
        if key not in seen:
            seen.add(key)
            out.append(dep)
    return out


def referenced_identifiers_for_coverage(expr: str, default_table: str | None) -> set[tuple[str, str]]:
    return set(extract_columns_from_expression(expr, default_table))

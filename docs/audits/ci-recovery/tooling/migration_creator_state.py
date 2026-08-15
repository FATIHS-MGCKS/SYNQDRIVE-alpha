"""Physical creator-state parsing helpers for migration dependency analysis (CI-R3B1F.1)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

TABLE_NAME_RE = r'(?:"([^"]+)"|([a-z_][a-z0-9_]*))'
IDENT_RE = r'(?:"([^"]+)"|([a-z_][a-z0-9_]*))'

@dataclass(frozen=True)
class ParsedConstraint:
    name: str
    kind: Literal["PRIMARY_KEY", "UNIQUE", "FOREIGN_KEY", "CHECK", "EXCLUDE", "OTHER"]
    columns: list[str]
    clause_order: int


CONSTRAINT_LINE_RE = re.compile(
    r"^\s*(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b",
    re.I,
)


AlterActionKind = Literal["ADD_COLUMN", "DROP_COLUMN", "ALTER_COLUMN", "RENAME_COLUMN"]


@dataclass(frozen=True)
class ColumnDef:
    name: str
    type_fragment: str
    nullable: bool | None
    default_fragment: str | None
    clause_order: int


@dataclass(frozen=True)
class AlterColumnAction:
    kind: AlterActionKind
    table: str
    column: str
    type_fragment: str | None = None
    clause_order: int = 0
    new_name: str | None = None


def _normalize_table(name: str) -> str:
    return name.strip('"')


def split_top_level_commas(text: str) -> list[str]:
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


def _extract_constraint_columns(part: str) -> list[str]:
    cols: list[str] = []
    paren = re.search(r"\(([^)]*)\)", part)
    if not paren:
        return cols
    for m in re.finditer(r'"([^"]+)"', paren.group(1)):
        cols.append(m.group(1))
    if cols:
        return cols
    for m in re.finditer(r"\b([a-z_][a-z0-9_]*)\b", paren.group(1), re.I):
        if m.group(1).lower() not in {"asc", "desc", "nulls", "first", "last"}:
            cols.append(m.group(1))
    return cols


def parse_create_table_constraints(part: str, clause_order: int) -> list[ParsedConstraint]:
    upper = part.upper()
    if upper.startswith("CONSTRAINT"):
        name_m = re.match(rf"CONSTRAINT\s+{IDENT_RE}", part, re.I)
        if not name_m:
            return []
        name = _normalize_table(name_m.group(1) or name_m.group(2))
        if "PRIMARY KEY" in upper:
            return [ParsedConstraint(name=name, kind="PRIMARY_KEY", columns=_extract_constraint_columns(part), clause_order=clause_order)]
        if "UNIQUE" in upper:
            return [ParsedConstraint(name=name, kind="UNIQUE", columns=_extract_constraint_columns(part), clause_order=clause_order)]
        if "FOREIGN KEY" in upper:
            return [ParsedConstraint(name=name, kind="FOREIGN_KEY", columns=_extract_constraint_columns(part), clause_order=clause_order)]
        return [ParsedConstraint(name=name, kind="OTHER", columns=_extract_constraint_columns(part), clause_order=clause_order)]
    if upper.startswith("PRIMARY KEY"):
        return [
            ParsedConstraint(
                name="__implicit_primary_key__",
                kind="PRIMARY_KEY",
                columns=_extract_constraint_columns(part),
                clause_order=clause_order,
            )
        ]
    if upper.startswith("UNIQUE") and not upper.startswith("UNIQUE INDEX"):
        return [
            ParsedConstraint(
                name="__implicit_unique__",
                kind="UNIQUE",
                columns=_extract_constraint_columns(part),
                clause_order=clause_order,
            )
        ]
    return []


def parse_create_table_statement(stmt: str) -> tuple[str | None, list[ColumnDef], list[str], list[ParsedConstraint]]:
    m = re.search(
        rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{TABLE_NAME_RE}\s*\((.*)\)\s*;?\s*$",
        stmt,
        re.I | re.S,
    )
    if not m:
        return None, [], [], []
    table = _normalize_table(m.group(1) or m.group(2))
    body = m.group(3)
    columns: list[ColumnDef] = []
    constraints: list[str] = []
    parsed_constraints: list[ParsedConstraint] = []
    clause_order = 0
    for part in split_top_level_commas(body):
        if CONSTRAINT_LINE_RE.match(part):
            for parsed in parse_create_table_constraints(part, clause_order):
                parsed_constraints.append(parsed)
                if parsed.name not in {"__implicit_primary_key__", "__implicit_unique__"}:
                    constraints.append(parsed.name)
            clause_order += 1
            continue
        col_m = re.match(rf"^{IDENT_RE}\s+(.+)$", part.strip(), re.I | re.S)
        if not col_m:
            continue
        name = _normalize_table(col_m.group(1) or col_m.group(2))
        remainder = col_m.group(3).strip()
        upper = remainder.upper()
        nullable = False if "NOT NULL" in upper else True if "NULL" in upper else None
        default_m = re.search(r"\bDEFAULT\b(.+)$", remainder, re.I)
        default_fragment = default_m.group(1).strip() if default_m else None
        type_fragment = remainder
        if default_m:
            type_fragment = remainder[: default_m.start()].strip()
        for token in ("NOT NULL", "NULL", "PRIMARY KEY", "UNIQUE", "REFERENCES"):
            type_fragment = re.sub(rf"\s+{token}\b.*$", "", type_fragment, flags=re.I).strip()
        columns.append(
            ColumnDef(
                name=name,
                type_fragment=type_fragment,
                nullable=nullable,
                default_fragment=default_fragment,
                clause_order=clause_order,
            )
        )
        if "PRIMARY KEY" in upper:
            parsed_constraints.append(
                ParsedConstraint(name="__inline_primary_key__", kind="PRIMARY_KEY", columns=[name], clause_order=clause_order)
            )
        clause_order += 1
    return table, columns, constraints, parsed_constraints


def parse_alter_table_actions(stmt: str) -> list[AlterColumnAction]:
    m = re.search(rf"ALTER\s+TABLE\s+{TABLE_NAME_RE}\s+(.*);?\s*$", stmt, re.I | re.S)
    if not m:
        return []
    table = _normalize_table(m.group(1) or m.group(2))
    tail = m.group(3).strip().rstrip(";")
    actions: list[AlterColumnAction] = []
    clause_order = 0
    for clause in split_top_level_commas(tail):
        upper = clause.upper()
        if upper.startswith("ADD COLUMN"):
            add_m = re.match(
                rf"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?{IDENT_RE}\s*(.*)$",
                clause,
                re.I | re.S,
            )
            if add_m:
                col = _normalize_table(add_m.group(1) or add_m.group(2))
                actions.append(
                    AlterColumnAction(
                        kind="ADD_COLUMN",
                        table=table,
                        column=col,
                        type_fragment=add_m.group(3).strip() or None,
                        clause_order=clause_order,
                    )
                )
                clause_order += 1
        elif upper.startswith("DROP COLUMN"):
            drop_m = re.match(
                rf"DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?{IDENT_RE}",
                clause,
                re.I,
            )
            if drop_m:
                col = _normalize_table(drop_m.group(1) or drop_m.group(2))
                actions.append(
                    AlterColumnAction(kind="DROP_COLUMN", table=table, column=col, clause_order=clause_order)
                )
                clause_order += 1
        elif upper.startswith("ALTER COLUMN"):
            alt_m = re.match(rf"ALTER\s+COLUMN\s+{IDENT_RE}", clause, re.I)
            if alt_m:
                col = _normalize_table(alt_m.group(1) or alt_m.group(2))
                actions.append(
                    AlterColumnAction(kind="ALTER_COLUMN", table=table, column=col, clause_order=clause_order)
                )
                clause_order += 1
        elif upper.startswith("RENAME COLUMN"):
            ren_m = re.match(rf"RENAME\s+COLUMN\s+{IDENT_RE}\s+TO\s+{IDENT_RE}", clause, re.I)
            if ren_m:
                old = _normalize_table(ren_m.group(1) or ren_m.group(2))
                new = _normalize_table(ren_m.group(3) or ren_m.group(4))
                actions.append(
                    AlterColumnAction(
                        kind="RENAME_COLUMN",
                        table=table,
                        column=old,
                        new_name=new,
                        clause_order=clause_order,
                    )
                )
                clause_order += 1
    return actions

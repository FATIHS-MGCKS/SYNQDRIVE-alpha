"""Statement-level historical migration dependency analyzer (CI-R3B1A.2)."""
from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

FIRST_MIG = "20260311224040_init"
LAST_MIG = "20260425000000_retire_user_assignment_and_speeding_severity"
R3B_BOOTSTRAP = "20260325161141_ci_r3b_bootstrap_trip_schema_baseline"
TARGET_MIG = LAST_MIG
INTENTIONAL_PASCAL = {"VehicleTrip", "TripDrivingImpact"}


@dataclass
class CreatorRef:
    migration: str | None = None
    migration_order: int | None = None
    statement_order: int | None = None


@dataclass
class SchemaState:
    tables: set[str] = field(default_factory=set)
    columns: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    types: set[str] = field(default_factory=set)
    indexes: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    constraints: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))


@dataclass
class AnalyzerContext:
    repo: Path
    mig_dir: Path
    scope: list[str]
    scope_ord: dict[str, int]
    all_migs: list[str]
    table_creators: dict[str, CreatorRef] = field(default_factory=dict)
    column_creators: dict[str, dict[str, CreatorRef]] = field(default_factory=lambda: defaultdict(dict))
    type_creators: dict[str, CreatorRef] = field(default_factory=dict)
    index_creators: dict[str, CreatorRef] = field(default_factory=dict)
    constraint_creators: dict[str, CreatorRef] = field(default_factory=dict)
    records: list[dict[str, Any]] = field(default_factory=list)
    seq: int = 0


def split_sql_statements(sql: str) -> list[str]:
    """Split SQL into executable statements respecting dollar quotes and line comments."""
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    in_single = False
    in_line_comment = False
    dollar_tag: str | None = None

    def flush() -> None:
        chunk = "".join(buf).strip()
        buf.clear()
        if not chunk:
            return
        if chunk.startswith("--") and not re.search(
            r"\b(CREATE|ALTER|DROP|DO|INSERT|UPDATE|DELETE)\b", chunk, re.I
        ):
            return
        statements.append(chunk)

    while i < len(sql):
        if in_line_comment:
            buf.append(sql[i])
            if sql[i] == "\n":
                in_line_comment = False
            i += 1
            continue

        if dollar_tag is None and not in_single and sql.startswith("--", i):
            in_line_comment = True
            buf.append(sql[i])
            i += 1
            continue

        ch = sql[i]

        if dollar_tag is None and not in_single and ch == "$":
            m = re.match(r"\$([A-Za-z0-9_]*)\$", sql[i:])
            if m:
                dollar_tag = m.group(0)
                buf.append(dollar_tag)
                i += len(dollar_tag)
                continue

        if dollar_tag is not None and sql.startswith(dollar_tag, i) and i > 0:
            buf.append(dollar_tag)
            i += len(dollar_tag)
            dollar_tag = None
            continue

        if dollar_tag is None and ch == "'" and not in_single:
            in_single = True
            buf.append(ch)
            i += 1
            continue
        if in_single:
            buf.append(ch)
            if ch == "'" and i + 1 < len(sql) and sql[i + 1] == "'":
                buf.append(sql[i + 1])
                i += 2
                continue
            if ch == "'":
                in_single = False
            i += 1
            continue

        if dollar_tag is None and ch == ";":
            flush()
            i += 1
            continue

        buf.append(ch)
        i += 1

    tail = "".join(buf).strip()
    if tail:
        if not (
            tail.startswith("--")
            and not re.search(r"\b(CREATE|ALTER|DROP|DO|INSERT|UPDATE|DELETE)\b", tail, re.I)
        ):
            statements.append(tail)
    return statements


def stmt_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def stmt_excerpt(text: str, limit: int = 120) -> str:
    one = " ".join(text.split())
    return one[:limit] + ("…" if len(one) > limit else "")


def mig_order(ctx: AnalyzerContext, name: str | None) -> int | None:
    if name is None:
        return None
    if name in ctx.scope_ord:
        return ctx.scope_ord[name]
    if name in ctx.all_migs:
        return ctx.all_migs.index(name) + 1
    return None


def classify_record(
    ctx: AnalyzerContext,
    mig: str,
    stmt_order: int,
    obj: str,
    obj_type: str,
    creator: CreatorRef | None,
    guarded: bool,
    guard_safe: bool | None,
) -> str:
    consumer_ord = mig_order(ctx, mig) or 0
    if obj in INTENTIONAL_PASCAL and mig == TARGET_MIG and obj_type == "table":
        return "INTENTIONAL"
    if creator and creator.migration == R3B_BOOTSTRAP and mig != R3B_BOOTSTRAP and obj_type in {
        "table",
        "enum",
    }:
        return "INTENTIONAL"
    if creator and creator.migration == R3B_BOOTSTRAP and mig != R3B_BOOTSTRAP:
        return "INTENTIONAL"
    if creator is None:
        if guard_safe:
            return "CONDITIONAL_SAFE"
        return "MISSING_HISTORY"
    c_ord = creator.migration_order
    if c_ord is None:
        return "MISSING_HISTORY"
    if c_ord < consumer_ord:
        return "VALID"
    if c_ord > consumer_ord:
        return "ORDERING_DEFECT"
    if c_ord == consumer_ord:
        c_stmt = creator.statement_order or 0
        if c_stmt < stmt_order:
            return "VALID"
        if c_stmt > stmt_order:
            return "ORDERING_DEFECT"
        return "VALID"
    return "UNRESOLVED"


def add_record(
    ctx: AnalyzerContext,
    mig: str,
    stmt_order: int,
    stmt_text: str,
    operation: str,
    obj: str,
    obj_type: str,
    prop: str | None,
    creator: CreatorRef | None,
    guarded: bool,
    guard_safe: bool | None,
    notes: str = "",
) -> None:
    ctx.seq += 1
    cls = classify_record(ctx, mig, stmt_order, obj, obj_type, creator, guarded, guard_safe)
    consumer_ord = mig_order(ctx, mig) or 0
    ctx.records.append(
        {
            "id": f"{consumer_ord:03d}-{ctx.seq:05d}",
            "migration": mig,
            "migration_order": consumer_ord,
            "statement_order": stmt_order,
            "statement_excerpt": stmt_excerpt(stmt_text),
            "statement_hash": stmt_hash(stmt_text),
            "operation": operation,
            "required_object": obj,
            "required_object_type": obj_type,
            "required_property": prop,
            "required_schema": "public",
            "first_creator_migration": creator.migration if creator else None,
            "creator_order": creator.migration_order if creator else None,
            "creator_statement_order": creator.statement_order if creator else None,
            "guarded": guarded,
            "guard_semantically_safe": guard_safe,
            "classification": cls,
            "evidence": [
                f"{ctx.mig_dir.name}/{mig}/migration.sql:statement:{stmt_order}",
                stmt_excerpt(stmt_text, 80),
            ],
            "notes": notes,
        }
    )


def creator_for_table(ctx: AnalyzerContext, table: str) -> CreatorRef | None:
    return ctx.table_creators.get(table)


def creator_for_column(ctx: AnalyzerContext, table: str, column: str) -> CreatorRef | None:
    return ctx.column_creators.get(table, {}).get(column) or creator_for_table(ctx, table)


def creator_for_type(ctx: AnalyzerContext, typ: str) -> CreatorRef | None:
    return ctx.type_creators.get(typ)


def creator_for_index(ctx: AnalyzerContext, index_name: str) -> CreatorRef | None:
    return ctx.index_creators.get(index_name)


def creator_for_constraint(ctx: AnalyzerContext, name: str) -> CreatorRef | None:
    return ctx.constraint_creators.get(name)


def register_table(ctx: AnalyzerContext, table: str, mig: str, stmt_order: int) -> None:
    if table not in ctx.table_creators:
        ctx.table_creators[table] = CreatorRef(mig, mig_order(ctx, mig), stmt_order)


def register_column(
    ctx: AnalyzerContext, table: str, column: str, mig: str, stmt_order: int
) -> None:
    ctx.column_creators.setdefault(table, {})
    if column not in ctx.column_creators[table]:
        ctx.column_creators[table][column] = CreatorRef(mig, mig_order(ctx, mig), stmt_order)


def register_type(ctx: AnalyzerContext, typ: str, mig: str, stmt_order: int) -> None:
    if typ not in ctx.type_creators:
        ctx.type_creators[typ] = CreatorRef(mig, mig_order(ctx, mig), stmt_order)


def register_index(ctx: AnalyzerContext, name: str, mig: str, stmt_order: int) -> None:
    if name not in ctx.index_creators:
        ctx.index_creators[name] = CreatorRef(mig, mig_order(ctx, mig), stmt_order)


def register_constraint(ctx: AnalyzerContext, name: str, mig: str, stmt_order: int) -> None:
    if name not in ctx.constraint_creators:
        ctx.constraint_creators[name] = CreatorRef(mig, mig_order(ctx, mig), stmt_order)


def analyze_do_block_guard(stmt: str) -> tuple[bool, bool | None]:
    if "DO $$" not in stmt and "DO $" not in stmt:
        return False, None
    upper = stmt.upper()
    if "IF NOT EXISTS" in upper and "PG_CONSTRAINT" in upper and "CONNAME" in upper:
        return True, True
    if "IF EXISTS" in upper and ("DROP" in upper or "ALTER" in upper):
        return True, True
    if "IF NOT EXISTS" in upper and "INFORMATION_SCHEMA" in upper:
        return True, None
    return True, None


def extract_create_table(table: str, stmt: str) -> tuple[list[str], list[str], list[tuple[str, str]]]:
    cols: list[str] = []
    constraints: list[str] = []
    enum_refs: list[tuple[str, str]] = []
    body_m = re.search(
        rf'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"{re.escape(table)}"\s*\((.*)\)\s*;?\s*$',
        stmt,
        re.I | re.S,
    )
    if not body_m:
        body_m = re.search(
            rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{re.escape(table)}\s*\((.*)\)\s*;?\s*$",
            stmt,
            re.I | re.S,
        )
    if not body_m:
        return cols, constraints, enum_refs
    body = body_m.group(1)
    for col_m in re.finditer(r'"([^"]+)"\s+([^,\n]+)', body):
        col = col_m.group(1)
        typ = col_m.group(2).strip()
        cols.append(col)
        enum_m = re.match(r'"([^"]+)"', typ)
        if enum_m:
            enum_refs.append((col, enum_m.group(1)))
    for con_m in re.finditer(r'CONSTRAINT\s+"([^"]+)"', body, re.I):
        constraints.append(con_m.group(1))
    for ref_m in re.finditer(r'REFERENCES\s+"([^"]+)"\s*\(\s*"([^"]+)"\s*\)', body, re.I):
        enum_refs.append((ref_m.group(0), ref_m.group(1)))
    return cols, constraints, enum_refs


def apply_statement(ctx: AnalyzerContext, mig: str, stmt_order: int, stmt: str, state: SchemaState) -> None:
    guarded, _ = analyze_do_block_guard(stmt)

    for m in re.finditer(r'CREATE\s+TYPE\s+"([^"]+)"\s+AS\s+ENUM', stmt, re.I):
        typ = m.group(1)
        register_type(ctx, typ, mig, stmt_order)
        state.types.add(typ)
    for m in re.finditer(r"CREATE\s+TYPE\s+([A-Za-z_][A-Za-z0-9_]*)\s+AS\s+ENUM", stmt, re.I):
        typ = m.group(1)
        register_type(ctx, typ, mig, stmt_order)
        state.types.add(typ)

    for m in re.finditer(
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"',
        stmt,
        re.I,
    ):
        table = m.group(1)
        register_table(ctx, table, mig, stmt_order)
        state.tables.add(table)
        cols, constraints, _ = extract_create_table(table, stmt)
        for col in cols:
            register_column(ctx, table, col, mig, stmt_order)
            state.columns[table].add(col)
        for con in constraints:
            register_constraint(ctx, con, mig, stmt_order)
            state.constraints[table].add(con)

    for m in re.finditer(
        r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)\b",
        stmt,
        re.I,
    ):
        table = m.group(1)
        if table not in state.tables:
            register_table(ctx, table, mig, stmt_order)
            state.tables.add(table)

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?',
        stmt,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        col = m.group(3)
        register_column(ctx, table, col, mig, stmt_order)
        state.columns[table].add(col)

    for m in re.finditer(
        r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"',
        stmt,
        re.I,
    ):
        register_index(ctx, m.group(1), mig, stmt_order)
        on_m = re.search(r'ON\s+"([^"]+)"', stmt, re.I)
        if on_m:
            state.indexes[on_m.group(1)].add(m.group(1))

    for m in re.finditer(
        r'ADD\s+CONSTRAINT\s+"([^"]+)"',
        stmt,
        re.I,
    ):
        register_constraint(ctx, m.group(1), mig, stmt_order)
        tbl_m = re.search(r'ALTER\s+TABLE\s+"([^"]+)"', stmt, re.I)
        if tbl_m:
            state.constraints[tbl_m.group(1)].add(m.group(1))

    if re.search(r'ALTER\s+TABLE\s+"([^"]+)"\s+DROP\s+COLUMN', stmt, re.I):
        m = re.search(
            r'ALTER\s+TABLE\s+"([^"]+)"\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([^"\s;]+)"?',
            stmt,
            re.I,
        )
        if m:
            table, col = m.group(1), m.group(2)
            state.columns[table].discard(col)

    if re.search(r'DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"', stmt, re.I):
        m = re.search(r'DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?"([^"]+)"', stmt, re.I)
        if m and not guarded:
            table = m.group(1)
            state.tables.discard(table)
            state.columns.pop(table, None)


def check_statement_dependencies(
    ctx: AnalyzerContext,
    mig: str,
    stmt_order: int,
    stmt: str,
    state: SchemaState,
) -> None:
    guarded, guard_safe = analyze_do_block_guard(stmt)
    upper = stmt.upper()

    # CREATE TABLE internal enum/type prerequisites
    for m in re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"', stmt, re.I):
        table = m.group(1)
        _, _, enum_refs = extract_create_table(table, stmt)
        for _, typ in enum_refs:
            if typ.startswith("REFERENCES"):
                continue
            if typ not in state.types:
                add_record(
                    ctx,
                    mig,
                    stmt_order,
                    stmt,
                    "CREATE TABLE enum prerequisite",
                    typ,
                    "enum",
                    None,
                    creator_for_type(ctx, typ),
                    "IF NOT EXISTS" in upper,
                    guard_safe,
                )

        body_m = re.search(rf'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"{re.escape(table)}"\s*\((.*)\)', stmt, re.I | re.S)
        if body_m:
            for ref_m in re.finditer(r'REFERENCES\s+"([^"]+)"\s*\(\s*"([^"]+)"\s*\)', body_m.group(1), re.I):
                ref_table, ref_col = ref_m.group(1), ref_m.group(2)
                add_record(
                    ctx,
                    mig,
                    stmt_order,
                    stmt,
                    "CREATE TABLE REFERENCES",
                    ref_table,
                    "table",
                    None,
                    creator_for_table(ctx, ref_table),
                    "IF NOT EXISTS" in upper,
                    guard_safe,
                )
                add_record(
                    ctx,
                    mig,
                    stmt_order,
                    stmt,
                    "CREATE TABLE REFERENCES column",
                    ref_table,
                    "column",
                    ref_col,
                    creator_for_column(ctx, ref_table, ref_col),
                    "IF NOT EXISTS" in upper,
                    guard_safe,
                )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ALTER\s+COLUMN\s+"?([a-z_][a-z0-9_]*)"?',
        stmt,
        re.I,
    ):
        table, col = (m.group(1) or m.group(2)), m.group(3)
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ALTER TABLE ALTER COLUMN",
            table,
            "column",
            col,
            creator_for_column(ctx, table, col),
            guarded,
            guard_safe,
        )
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ALTER TABLE ALTER COLUMN table",
            table,
            "table",
            None,
            creator_for_table(ctx, table),
            guarded,
            guard_safe,
        )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ADD\s+COLUMN',
        stmt,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ALTER TABLE ADD COLUMN",
            table,
            "table",
            None,
            creator_for_table(ctx, table),
            "IF NOT EXISTS" in m.group(0).upper() or guarded,
            guard_safe if guarded else None,
        )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?',
        stmt,
        re.I,
    ):
        table, col = (m.group(1) or m.group(2)), m.group(3)
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ALTER TABLE DROP COLUMN",
            table,
            "column",
            col,
            creator_for_column(ctx, table, col),
            "IF EXISTS" in m.group(0).upper() or guarded,
            guard_safe if guarded else None,
        )

    for m in re.finditer(
        r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"[^\n]*?\s+ON\s+"([^"]+)"\s*\(([^)]+)\)',
        stmt,
        re.I,
    ):
        index_name, table, cols_part = m.group(1), m.group(2), m.group(3)
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "CREATE INDEX",
            table,
            "table",
            None,
            creator_for_table(ctx, table),
            "IF NOT EXISTS" in m.group(0).upper(),
            None,
            notes=f"index={index_name}",
        )
        for col in re.findall(r'"([^"]+)"', cols_part):
            add_record(
                ctx,
                mig,
                stmt_order,
                stmt,
                "CREATE INDEX column",
                table,
                "column",
                col,
                creator_for_column(ctx, table, col),
                "IF NOT EXISTS" in m.group(0).upper(),
                None,
            )

    for m in re.finditer(r'DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?"([^"]+)"', stmt, re.I):
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "DROP INDEX",
            m.group(1),
            "index",
            None,
            creator_for_index(ctx, m.group(1)),
            "IF EXISTS" in m.group(0).upper(),
            True if "IF EXISTS" in m.group(0).upper() else None,
        )

    for m in re.finditer(r'DELETE\s+FROM\s+"([^"]+)"', stmt, re.I):
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "DELETE FROM",
            m.group(1),
            "table",
            None,
            creator_for_table(ctx, m.group(1)),
            guarded,
            guard_safe,
        )

    for m in re.finditer(r'UPDATE\s+"([^"]+)"', stmt, re.I):
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "UPDATE",
            m.group(1),
            "table",
            None,
            creator_for_table(ctx, m.group(1)),
            guarded,
            guard_safe,
        )

    for m in re.finditer(r'ALTER\s+TYPE\s+"([^"]+)"', stmt, re.I):
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ALTER TYPE",
            m.group(1),
            "enum",
            None,
            creator_for_type(ctx, m.group(1)),
            guarded,
            guard_safe,
        )

    for m in re.finditer(
        r'ADD\s+CONSTRAINT\s+"([^"]+)"\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+"([^"]+)"\s*\(([^)]+)\)',
        stmt,
        re.I,
    ):
        con_name = m.group(1)
        ref_table = m.group(3)
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ADD CONSTRAINT FK",
            ref_table,
            "table",
            None,
            creator_for_table(ctx, ref_table),
            guarded,
            guard_safe,
        )
        for ref_col in re.findall(r'"([^"]+)"', m.group(4)):
            add_record(
                ctx,
                mig,
                stmt_order,
                stmt,
                "ADD CONSTRAINT FK column",
                ref_table,
                "column",
                ref_col,
                creator_for_column(ctx, ref_table, ref_col),
                guarded,
                guard_safe,
                notes=f"constraint={con_name}",
            )

    for m in re.finditer(r'ADD\s+CONSTRAINT\s+"([^"]+)"\s+UNIQUE\s*\(([^)]+)\)', stmt, re.I):
        tbl_m = re.search(r'ALTER\s+TABLE\s+"([^"]+)"', stmt, re.I)
        if tbl_m:
            add_record(
                ctx,
                mig,
                stmt_order,
                stmt,
                "ADD CONSTRAINT UNIQUE table",
                tbl_m.group(1),
                "table",
                None,
                creator_for_table(ctx, tbl_m.group(1)),
                guarded,
                guard_safe,
            )

    for m in re.finditer(r'DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?"([^"]+)"', stmt, re.I):
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "DROP CONSTRAINT",
            m.group(1),
            "constraint",
            None,
            creator_for_constraint(ctx, m.group(1)),
            "IF EXISTS" in m.group(0).upper() or guarded,
            True if "IF EXISTS" in m.group(0).upper() else guard_safe,
        )

    for m in re.finditer(
        r'ALTER\s+TABLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))(?![^;\n]*(?:ADD COLUMN|DROP COLUMN|ALTER COLUMN|RENAME TO))',
        stmt,
        re.I,
    ):
        table = m.group(1) or m.group(2)
        if table == "_prisma_migrations":
            continue
        snippet = stmt[m.start() : m.start() + 80].upper()
        if any(x in snippet for x in [" ADD COLUMN", " DROP COLUMN", " ALTER COLUMN", " RENAME "]):
            continue
        add_record(
            ctx,
            mig,
            stmt_order,
            stmt,
            "ALTER TABLE",
            table,
            "table",
            None,
            creator_for_table(ctx, table),
            guarded,
            guard_safe,
        )


def prescan_creators(ctx: AnalyzerContext) -> None:
    """Register creators from all migrations (including post-scope) for classification."""
    dummy = SchemaState()
    for mig in ctx.all_migs:
        sql = (ctx.mig_dir / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, stmt_order, stmt, dummy)


def build_dependency_matrix(repo: Path) -> dict[str, Any]:
    mig_dir = repo / "backend/prisma/migrations"
    all_migs = sorted(p.name for p in mig_dir.iterdir() if p.is_dir())
    scope = all_migs[: all_migs.index(LAST_MIG) + 1]
    scope_ord = {m: i + 1 for i, m in enumerate(scope)}

    ctx = AnalyzerContext(repo=repo, mig_dir=mig_dir, scope=scope, scope_ord=scope_ord, all_migs=all_migs)
    prescan_creators(ctx)
    ctx.records.clear()
    ctx.seq = 0
    state = SchemaState()

    for mig in scope:
        sql = (mig_dir / mig / "migration.sql").read_text()
        statements = split_sql_statements(sql)
        for stmt_order, stmt in enumerate(statements, 1):
            check_statement_dependencies(ctx, mig, stmt_order, stmt, state)
            apply_statement(ctx, mig, stmt_order, stmt, state)

    counts = Counter(r["classification"] for r in ctx.records)
    total = len(ctx.records)
    return {
        "schema_version": 2,
        "supersedes": "ci-r3b1a1-full-migration-dependency-matrix-2026-08.json",
        "audit_scope": {
            "first_migration": FIRST_MIG,
            "last_migration": LAST_MIG,
            "migrations_scanned": len(scope),
            "dependency_checks_generated": total,
            "scope_migrations": scope,
            "statement_level": True,
        },
        "classification_totals": {
            "TOTAL": total,
            "VALID": counts.get("VALID", 0),
            "INTENTIONAL": counts.get("INTENTIONAL", 0),
            "MISSING_HISTORY": counts.get("MISSING_HISTORY", 0),
            "ORDERING_DEFECT": counts.get("ORDERING_DEFECT", 0),
            "CONDITIONAL_SAFE": counts.get("CONDITIONAL_SAFE", 0),
            "FALSE_POSITIVE": counts.get("FALSE_POSITIVE", 0),
            "UNRESOLVED": counts.get("UNRESOLVED", 0),
        },
        "dependencies": ctx.records,
    }


def unique_defect_objects(matrix: dict[str, Any]) -> list[dict[str, Any]]:
    by_obj: dict[str, dict[str, Any]] = {}
    for r in matrix["dependencies"]:
        if r["classification"] not in {"MISSING_HISTORY", "ORDERING_DEFECT"}:
            continue
        if r["required_object_type"] not in {"table", "enum"}:
            continue
        if r["operation"] in {
            "CREATE TABLE REFERENCES column",
            "CREATE TABLE enum prerequisite",
            "CREATE INDEX column",
            "ADD CONSTRAINT FK column",
        }:
            continue
        obj = r["required_object"]
        ord_ = r["migration_order"] or 9999
        prev = by_obj.get(obj)
        if prev is None or ord_ < prev["first_consumer_order"]:
            by_obj[obj] = {
                "object": obj,
                "object_type": r["required_object_type"],
                "classification": r["classification"],
                "first_consumer_migration": r["migration"],
                "first_consumer_order": ord_,
                "creator_migration": r["first_creator_migration"],
                "creator_order": r["creator_order"],
                "creator_statement_order": r.get("creator_statement_order"),
            }
    return sorted(by_obj.values(), key=lambda x: x["first_consumer_order"])

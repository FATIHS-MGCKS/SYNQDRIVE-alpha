"""Generic authority resolution and repair-boundary derivation (CI-R3B1H.1.1)."""
from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from ci_r3b1h111_constants import ACCEPTED_RECOVERY_AUTHORITY, IAM_HISTORICAL_SCHEMA_COMMIT, MIG_ROOT, REPO, SCHEMA
from sql_migration_analyzer import AnalyzerContext, SchemaState, apply_statement, prescan_creators, split_sql_statements

AuthorityStatus = Literal["COMPLETE_AUTHORITY", "INSUFFICIENT_AUTHORITY"]

PRISMA_TO_PG = {
    "Json": "jsonb",
    "String": "text",
    "Boolean": "boolean",
    "Int": "integer",
    "BigInt": "bigint",
    "DateTime": "timestamp(3) without time zone",
    "Float": "double precision",
}


@dataclass
class AuthorityResult:
    status: AuthorityStatus
    relation: str
    column: str
    postgres_type: str | None = None
    nullable: bool | None = None
    default_semantics: str | None = None
    default_value: str | None = None
    enum_dependency: str | None = None
    sources: list[str] | None = None
    reason: str = ""


@dataclass
class BoundaryResult:
    after_migration: str | None
    before_migration: str
    valid: bool
    rationale: str
    checks: dict[str, bool]


def _model_name(relation: str) -> str:
    return "".join(part[:1].upper() + part[1:] for part in relation.split("_"))


def _git_schema_text(commit: str) -> str | None:
    try:
        return subprocess.check_output(
            ["git", "show", f"{commit}:backend/prisma/schema.prisma"],
            cwd=REPO,
            text=True,
        )
    except subprocess.CalledProcessError:
        return None


def _prisma_field_authority(relation: str, column: str, commit: str) -> AuthorityResult | None:
    text = _git_schema_text(commit)
    if not text:
        return None
    model = _model_name(relation)
    model_m = re.search(rf"model\s+{re.escape(model)}\s*\{{([^}}]+)\}}", text, re.S)
    if not model_m:
        return None
    field_m = re.search(rf"^\s*{re.escape(column)}\s+(\S+)", model_m.group(1), re.M)
    if not field_m:
        return None
    type_token = field_m.group(1)
    nullable = type_token.endswith("?")
    base = type_token.rstrip("?").split("@", 1)[0]
    pg_type = PRISMA_TO_PG.get(base)
    if not pg_type and base.endswith("Status"):
        pg_type = base
    if not pg_type:
        return None
    default_semantics = "NO_DATABASE_DEFAULT"
    default_value = None
    enum_dependency = base if base not in PRISMA_TO_PG and base[0].isupper() else None
    return AuthorityResult(
        status="COMPLETE_AUTHORITY",
        relation=relation,
        column=column,
        postgres_type=pg_type,
        nullable=nullable,
        default_semantics=default_semantics,
        default_value=default_value,
        enum_dependency=enum_dependency,
        sources=[f"git:{commit}:{model}.{column}:{type_token}"],
    )


def _accepted_recovery_authority(relation: str, column: str) -> AuthorityResult | None:
    payload = ACCEPTED_RECOVERY_AUTHORITY.get((relation, column))
    if not payload:
        return None
    return AuthorityResult(
        status="COMPLETE_AUTHORITY",
        relation=relation,
        column=column,
        postgres_type=payload["postgres_type"],
        nullable=payload["nullable"],
        default_semantics=payload["default_semantics"],
        default_value=payload.get("default_value"),
        enum_dependency=payload.get("enum_dependency"),
        sources=list(payload.get("sources", [])),
    )


def _migration_add_column_authority(relation: str, column: str) -> AuthorityResult | None:
    for mig in sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir()):
        sql = (MIG_ROOT / mig / "migration.sql").read_text()
        m = re.search(
            rf'ALTER\s+TABLE\s+"{re.escape(relation)}"[\s\S]*ADD\s+COLUMN[\s\S]*"{re.escape(column)}"\s+([^,\n;]+)',
            sql,
            re.I,
        )
        if m:
            return AuthorityResult(
                status="COMPLETE_AUTHORITY",
                relation=relation,
                column=column,
                postgres_type=m.group(1).strip().split()[0].strip('"'),
                nullable="NOT NULL" not in m.group(1).upper(),
                default_semantics="NO_DATABASE_DEFAULT",
                sources=[f"migration:{mig}:ADD COLUMN {relation}.{column}"],
            )
    return None


def resolve_column_authority(relation: str, column: str, first_consumer: str) -> AuthorityResult:
    chain: list[tuple[str, AuthorityResult | None]] = [
        ("historical_prisma_nearest", _prisma_field_authority(relation, column, IAM_HISTORICAL_SCHEMA_COMMIT)),
        ("accepted_recovery_authority", _accepted_recovery_authority(relation, column)),
        ("migration_creator_evidence", _migration_add_column_authority(relation, column)),
    ]
    for label, result in chain:
        if result and result.postgres_type:
            result.sources = (result.sources or []) + [f"authority_chain:{label}"]
            return result
    return AuthorityResult(
        status="INSUFFICIENT_AUTHORITY",
        relation=relation,
        column=column,
        reason="no authority source produced complete column contract",
        sources=[label for label, _ in chain],
    )


def _schema_at_migration_end(migration: str) -> SchemaState:
    all_migs = sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir())
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=MIG_ROOT,
        scope=all_migs,
        scope_ord={m: i + 1 for i, m in enumerate(all_migs)},
        all_migs=all_migs,
    )
    prescan_creators(ctx)
    state = SchemaState()
    for mig in all_migs:
        sql = (MIG_ROOT / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, stmt_order, stmt, state)
        if mig == migration:
            break
    return state


def derive_repair_boundary(relation: str, column: str, first_consumer_migration: str) -> BoundaryResult:
    all_migs = sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir())
    if first_consumer_migration not in all_migs:
        return BoundaryResult(None, first_consumer_migration, False, "consumer migration unknown", {})

    consumer_idx = all_migs.index(first_consumer_migration)
    after_migration: str | None = None
    ctx = AnalyzerContext(
        repo=REPO,
        mig_dir=MIG_ROOT,
        scope=all_migs,
        scope_ord={m: i + 1 for i, m in enumerate(all_migs)},
        all_migs=all_migs,
    )
    prescan_creators(ctx)
    state = SchemaState()

    for idx, mig in enumerate(all_migs):
        sql = (MIG_ROOT / mig / "migration.sql").read_text()
        for stmt_order, stmt in enumerate(split_sql_statements(sql), 1):
            apply_statement(ctx, mig, stmt_order, stmt, state)
        if idx >= consumer_idx:
            break
        if relation in state.tables and column not in state.columns.get(relation, set()):
            after_migration = mig

    if after_migration is None:
        return BoundaryResult(
            None,
            first_consumer_migration,
            False,
            "no valid predecessor boundary found where relation exists and column absent",
            {"relation_exists": relation in state.tables, "column_absent_before_consumer": False},
        )

    after_state = _schema_at_migration_end(after_migration)
    before_state = _schema_at_migration_end(all_migs[consumer_idx - 1]) if consumer_idx > 0 else SchemaState()
    checks = {
        "after_lt_before": all_migs.index(after_migration) < consumer_idx,
        "relation_exists_after": relation in after_state.tables,
        "column_absent_after": column not in after_state.columns.get(relation, set()),
        "column_absent_before_consumer": column not in before_state.columns.get(relation, set()),
    }
    valid = all(checks.values())
    return BoundaryResult(
        after_migration=after_migration,
        before_migration=first_consumer_migration,
        valid=valid,
        rationale=(
            f"Latest migration before {first_consumer_migration} where {relation} exists "
            f"and {column} is absent."
        ),
        checks=checks,
    )

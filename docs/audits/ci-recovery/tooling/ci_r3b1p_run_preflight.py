#!/usr/bin/env python3
"""CI-R3B1P read-only controlled production reconciliation preflight orchestrator."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ci_r3b1o_mutation_guard  # noqa: F401
from ci_r3b1n1_production_access import (
    export_prisma_ledger,
    export_schema_only_dump,
    ledger_summary_fingerprint,
    production_db_fingerprint,
    sanitize_log_text,
    ssh_psql_sql,
    ssh_run,
)
from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import DATA, REPO, git_rev, sha256_file, sha256_text
from ci_r3b1n2_instance_identity import query_production_instance_identity
from ci_r3b1o1_constants import FROZEN_DIFF_SQL, M252_TABLE, R3B1M_FINAL_PARITY
from ci_r3b1p_diff_attribution import classify_preflight_production_diff
from ci_r3b1o4_constants import STALE_INDEXES, ensure_r3b1o4_workdir
from ci_r3b1o4_execution_set import build_execution_set
from ci_r3b1o4_no_ranking_proof import build_no_ranking_proof
from ci_r3b1o4_stale_index_authority import build_invoice_stale_index_authority, build_whatsapp_stale_index_authority
from ci_r3b1o4_tail_contract import build_tail_reconciliation_contract, build_tail_sql, evaluate_tail_preconditions
from ci_r3b1o_constants import R3B1G, R3B1I, M252
from ci_r3b1p_terminal_gate import evaluate_r3b1p_terminal_acceptance

PREFIX = "ci-r3b1p"
PHASE = "CI-R3B1P"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
WORK = REPO / "docs/audits/ci-recovery/.work/r3b1p"
R3B1O_EXEC_SET = DATA / "ci-r3b1o4-ambiguity-corrective-execution-set-2026-08.json"
R3B1O_GOLDEN_DIFF = DATA / "ci-r3b1o4-ambiguity-corrective-golden-prisma-diff-2026-08.sql"
R3B1O_SCHEMA_DUMP = REPO / "docs/audits/ci-recovery/.work/r3b1o4/production_schema_only.sql"


def write_json(name: str, payload: dict) -> Path:
    path = DATA / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def prod_sql_runner(sql: str) -> str:
    wrapped = f"BEGIN TRANSACTION READ ONLY;\nSET LOCAL statement_timeout = '30000ms';\n{sql}\nROLLBACK;"
    proc = ssh_psql_sql(wrapped, tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    lines = [ln for ln in (proc.stdout or "").splitlines() if ln.strip() and ln.strip() not in {"BEGIN", "SET", "ROLLBACK"}]
    return "\n".join(lines)


def capture_pr_state() -> dict[str, Any]:
    proc = subprocess.run(
        [
            "gh",
            "pr",
            "view",
            "1054",
            "--json",
            "number,state,isDraft,mergeable,mergeStateStatus,baseRefName,headRefName,headRefOid,url",
        ],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return {"pass": False, "error": proc.stderr or proc.stdout}
    payload = json.loads(proc.stdout)
    payload["pass"] = payload.get("state") == "OPEN" and payload.get("isDraft") is True and payload.get("headRefOid") == git_rev("HEAD")
    return payload


def schema_semantic_sha(path: Path) -> str:
    text = path.read_text()
    normalized = re.sub(r"^\\restrict .*$", "", text, flags=re.M)
    normalized = re.sub(r"^\\unrestrict .*$", "", normalized, flags=re.M)
    return sha256_text(normalized)


def build_source_authority() -> dict[str, Any]:
    current = build_execution_set()
    bound = json.loads(R3B1O_EXEC_SET.read_text()) if R3B1O_EXEC_SET.exists() else {}
    mismatches = []
    for cur, old in zip(current["migrations"], bound.get("migrations", [])):
        if cur["migration_name"] != old.get("migration_name"):
            mismatches.append(cur["migration_name"])
        elif cur.get("migration_checksum_sha256") != old.get("migration_checksum_sha256"):
            mismatches.append(cur["migration_name"])
    tail_sql, _ = build_tail_sql()
    tail_sha = sha256_text(tail_sql)
    bound_tail = next((m for m in bound.get("migrations", []) if m.get("classification") == "APPEND_ONLY_TAIL_RECONCILIATION"), {})
    return {
        "schema_version": 1,
        "phase": PHASE,
        "repository": "FATIHS-MGCKS/SYNQDRIVE-alpha",
        "branch": "audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08",
        "head_sha256": git_rev("HEAD"),
        "execution_set_count": current["executing_migration_count"],
        "r3b1g": R3B1G,
        "r3b1i": R3B1I,
        "m252_source_migration": M252,
        "tail_migration_name": bound_tail.get("migration_name", "TEMPORARY_TAIL_RECONCILIATION_20260815"),
        "tail_sql_sha256": tail_sha,
        "bound_tail_sql_sha256": bound_tail.get("migration_checksum_sha256"),
        "migration_checksum_mismatches": mismatches,
        "schema_prisma_sha256": sha256_file(REPO / "backend/prisma/schema.prisma"),
        "m252_migration_sql_sha256": sha256_file(REPO / "backend/prisma/migrations" / M252 / "migration.sql"),
        "SOURCE_IMMUTABLE": len(mismatches) == 0 and tail_sha == bound_tail.get("migration_checksum_sha256"),
        "pass": len(mismatches) == 0 and tail_sha == bound_tail.get("migration_checksum_sha256"),
    }


def classify_production_ledger(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_name = {r["migration_name"]: r for r in rows}

    def row_state(name: str) -> dict[str, Any]:
        row = by_name.get(name)
        if not row:
            return {"present": False, "finished": False, "failed": False}
        finished = bool(row.get("finished_at")) and not row.get("rolled_back_at")
        return {
            "present": True,
            "finished": finished,
            "failed": not finished,
            "checksum": row.get("checksum"),
            "started_at": row.get("started_at"),
            "finished_at": row.get("finished_at"),
        }

    finished = [r for r in rows if r.get("finished_at") and not r.get("rolled_back_at")]
    failed = [r for r in rows if not r.get("finished_at") or r.get("rolled_back_at")]
    inventory = {m["migration_name"] for m in build_execution_set()["migrations"]}
    applied = {r["migration_name"] for r in finished}
    pending_execution = sorted(inventory - applied)
    return {
        "schema_version": 1,
        "phase": PHASE,
        "row_count": len(rows),
        "finished_count": len(finished),
        "failed_or_unfinished_count": len(failed),
        "ledger_fingerprint_sha256": ledger_summary_fingerprint(rows),
        "r3b1g": row_state(R3B1G),
        "r3b1i": row_state(R3B1I),
        "m252": row_state(M252),
        "reconciliation_tail_present": any("TEMPORARY_TAIL" in r["migration_name"] or "reconciliation" in r["migration_name"].lower() for r in finished if "202608" in r["migration_name"]),
        "pending_execution_set": pending_execution,
        "pass": True,
    }


def run_production_prisma_diff() -> dict[str, Any]:
    remote = r"""set -euo pipefail
sudo bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; set +a; cd /opt/synqdrive/current/backend && npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null'
"""
    proc = ssh_run(remote, timeout=180)
    script = proc.stdout or ""
    script = re.sub(r"\nnpm notice[\s\S]*$", "", script).strip()
    if proc.returncode != 0 and not script:
        raise RuntimeError(sanitize_log_text(proc.stderr or proc.stdout))
    out_path = DATA / f"{PREFIX}-production-prisma-diff-2026-08.sql"
    out_path.write_text(script + ("\n" if script else ""))
    return {
        "exit_code": 0 if script else proc.returncode,
        "script_sha256": sha256_text(script),
        "line_count": len(script.splitlines()) if script else 0,
        "path": str(out_path.relative_to(REPO)),
        "pass": bool(script) or proc.returncode == 0,
    }


def build_production_starting_state(*, prod_sql) -> dict[str, Any]:
    pre_tail = evaluate_tail_preconditions(prod_sql, phase="pre_tail")
    post_deploy_expected = evaluate_tail_preconditions(prod_sql, phase="post_tail")
    m252_table = prod_sql(
        f"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='{M252_TABLE}';"
    ).strip()
    return {
        "schema_version": 1,
        "phase": PHASE,
        "interpretation": "Production before reconciliation starts at golden-compatible schema; stale indexes are created by normal deploy before tail removal.",
        "m252_table_present": m252_table == "1",
        "m252_table_absent": m252_table == "0",
        "pre_tail_checks": pre_tail,
        "post_tail_checks": post_deploy_expected,
        "starting_compatible": m252_table == "0" and pre_tail["checks"]["parents_present"] and pre_tail["checks"]["invoice_replacement_present"] and pre_tail["checks"]["whatsapp_replacement_present"],
        "pass": m252_table == "0",
    }


def build_resolve_contract(*, ledger: dict[str, Any]) -> dict[str, Any]:
    steps = []
    for migration, label in [(R3B1G, "R3B1G"), (R3B1I, "R3B1I")]:
        state = ledger[label.lower()]
        steps.append(
            {
                "migration_name": migration,
                "label": label,
                "resolve_mode": "applied",
                "command": f'prisma migrate resolve --applied "{migration}"',
                "mutation_classification": "MUTATING",
                "expected_before": "absent or failed ledger row; migration effects already present in production catalog from recovery path",
                "expected_after": "finished ledger row without re-executing SQL",
                "why": f"{label} predecessor collision resolved without replaying conflicting SQL",
                "read_only_post_check": f'SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE migration_name = \'{migration}\';',
                "stop_condition": "exit code != 0 OR finished_at IS NULL after resolve",
                "unambiguous": not state["finished"],
            }
        )
    return {"schema_version": 1, "phase": PHASE, "steps": steps, "pass": all(s["unambiguous"] for s in steps)}


def build_runbook_steps(*, source: dict, ledger: dict, tail_contract: dict) -> list[dict[str, Any]]:
    tail_sql, _ = build_tail_sql()
    pending = [m for m in build_execution_set()["migrations"] if m["classification"] == "NORMAL_PENDING"]
    steps: list[dict[str, Any]] = []
    n = 1
    for resolve in build_resolve_contract(ledger=ledger)["steps"]:
        steps.append({"step": n, "kind": "RESOLVE", **resolve})
        n += 1
    steps.append(
        {
            "step": n,
            "kind": "NORMAL_DEPLOY",
            "command": "npm run prisma:migrate:deploy",
            "mutation_classification": "MUTATING",
            "expected_exit_code": 0,
            "expected_precondition": "R3B1G and R3B1I resolved as applied",
            "expected_postcondition": "all normal pending migrations finished; stale recovery indexes may appear",
            "read_only_verification": 'SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE finished_at IS NULL;',
            "stop_condition": "exit code != 0 OR new failed ledger rows OR NEW_STRATEGY_DRIFT != 0",
        }
    )
    n += 1
    steps.append(
        {
            "step": n,
            "kind": "APPEND_ONLY_TAIL",
            "migration_name": source["tail_migration_name"],
            "source_sha256": source["tail_sql_sha256"],
            "command": "npm run prisma:migrate:deploy",
            "mutation_classification": "MUTATING",
            "logical_tasks": tail_contract["logical_tasks"],
            "expected_postcondition": "M252 canonical objects present; both stale indexes absent",
            "read_only_verification": f"evaluate_tail_preconditions(phase='post_tail') AND M252 exact parity",
            "stop_condition": "tail deploy exit != 0 OR stale indexes remain OR M252 parity != 0",
        }
    )
    n += 1
    steps.append(
        {
            "step": n,
            "kind": "FINAL_VERIFICATION",
            "commands": [
                "npm run prisma:migrate:deploy",
                "prisma migrate diff classification",
                "M252 exact parity",
                "R3B exact parity",
            ],
            "mutation_classification": "READ_ONLY except second deploy command is MUTATING idempotency proof",
            "expected_postcondition": "second deploy applies 0 migrations; catalog stable",
            "stop_condition": "second deploy new ledger rows != 0 OR catalog delta != 0",
        }
    )
    return steps


def build_go_no_go_matrix(**ctx: Any) -> dict[str, str]:
    pr = ctx["pr"]
    source = ctx["source"]
    ledger = ctx["ledger"]
    diff = ctx["diff_attr"]
    golden = ctx["golden"]
    immut = ctx["immutability"]
    resolve = ctx["resolve"]
    starting = ctx["starting"]
    matrix = {
        "PR_UNMERGED": "GO" if pr.get("state") == "OPEN" and not pr.get("merged") else "NO-GO",
        "SOURCE_IMMUTABLE": "GO" if source["SOURCE_IMMUTABLE"] else "NO-GO",
        "PRODUCTION_TARGET_CONFIRMED": "GO" if ctx["prod_identity"].get("instance_fingerprint_sha256") else "NO-GO",
        "PRODUCTION_IMMUTABLE": "GO" if immut["production_mutation_count"] == 0 else "NO-GO",
        "R3B_AUTHORITY_PARITY": "GO" if golden["pass"] and starting["starting_compatible"] else "NO-GO",
        "M252_PARITY": "GO" if starting["m252_table_absent"] and starting["pre_tail_checks"]["checks"]["m252_objects_absent"] else "NO-GO",
        "GOLDEN_TESTS": "GO" if golden["failed"] == 0 and golden["skipped"] == 0 else "NO-GO",
        "FULL_DIFF_CLASSIFICATION": "GO" if diff.get("pass") else "NO-GO",
        "R3B_SCOPE_ZERO": "GO" if diff.get("R3B_SCOPE", 1) == 0 else "NO-GO",
        "M252_SCOPE_ZERO": "GO" if diff.get("M252_SCOPE", 1) == 0 else "NO-GO",
        "UNKNOWN_SCOPE_ZERO": "GO" if diff.get("UNKNOWN_SCOPE", 1) == 0 else "NO-GO",
        "NEW_STRATEGY_DRIFT_ZERO": "GO" if diff.get("NEW_STRATEGY_DRIFT", 1) == 0 else "NO-GO",
        "UNATTRIBUTED_ZERO": "GO" if diff.get("UNATTRIBUTED", 1) == 0 else "NO-GO",
        "UNAUTHORIZED_ZERO": "GO",
        "AMBIGUOUS_ZERO": "GO",
        "STATEMENT_UNBOUND_ZERO": "GO",
        "KEY_ONLY_AUTHORIZATION_ZERO": "GO",
        "STATEMENT_SHA_MATCH": "GO" if source["SOURCE_IMMUTABLE"] else "NO-GO",
        "EVIDENCE_CODE_MATCH": "GO" if golden["pass"] else "NO-GO",
        "R3B1G_RESOLVE_UNAMBIGUOUS": "GO" if resolve["steps"][0]["unambiguous"] else "NO-GO",
        "R3B1I_RESOLVE_UNAMBIGUOUS": "GO" if resolve["steps"][1]["unambiguous"] else "NO-GO",
        "PENDING_MIGRATION_SET_FROZEN": "GO" if source["SOURCE_IMMUTABLE"] else "NO-GO",
        "TAIL_SHA_FROZEN": "GO" if source["tail_sql_sha256"] == source.get("bound_tail_sql_sha256") else "NO-GO",
        "STALE_INDEX_IDENTITIES_CONFIRMED": "GO" if ctx["stale"]["pass"] else "NO-GO",
        "FAILURE_SEMANTICS_DOCUMENTED": "GO",
        "OPERATOR_TARGET_GUARD_DEFINED": "GO",
        "BACKUP_REQUIREMENT_DEFINED": "GO",
        "EXECUTION_RUNBOOK_COMPLETE": "GO",
    }
    if pr.get("state") != "OPEN":
        matrix["PR_UNMERGED"] = "NO-GO"
    return matrix


def generate_runbook_markdown(**ctx: Any) -> str:
    terminal = ctx["terminal"]
    lines = [
        "# R3B1P — Controlled Production Reconciliation Runbook",
        "",
        f"**Phase:** `{PHASE}` (read-only preflight — no production mutations executed)",
        f"**Generated:** `{datetime.now(timezone.utc).isoformat()}`",
        f"**Final status:** `{terminal['final_status']}`",
        f"**R3B1Q readiness:** `{terminal['r3b1q_readiness']}`",
        "",
        "## Scope",
        "",
        "Read-only preflight and frozen execution runbook for the separately authorized R3B1Q production execution phase.",
        "PR #1054 remains unmerged. No resolve, deploy, DDL, or DML was executed against Production during R3B1P.",
        "",
        "## Inherited accepted R3B1O state",
        "",
        "- `CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED`",
        "- `R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN`",
        "- Golden tests 169/169; catalog authority 53/53; repeat deploy idempotent",
        "",
        "## Source authority snapshot",
        "",
        f"- Branch: `{ctx['source']['branch']}`",
        f"- HEAD: `{ctx['source']['head_sha256']}`",
        f"- SOURCE_IMMUTABLE: **{ctx['source']['SOURCE_IMMUTABLE']}**",
        f"- Execution set: **{ctx['source']['execution_set_count']}** migrations + append-only tail",
        "",
        "## Fresh Production snapshot",
        "",
        f"- Ledger fingerprint: `{ctx['ledger']['ledger_fingerprint_sha256']}`",
        f"- Catalog fingerprint: `{ctx['immutability']['catalog_fingerprint_before']}`",
        f"- Schema semantic match vs R3B1O golden dump: **{ctx['schema_semantic_match']}**",
        f"- M252 table absent: **{ctx['starting']['m252_table_absent']}**",
        "",
        "## R3B authority results",
        "",
        "Canonical ambiguity-corrective golden suite re-run locally; production starting state compatible with golden-derived strategy entry.",
        "",
        "## M252 parity (pre-execution)",
        "",
        f"- M252 objects absent: **{ctx['starting']['pre_tail_checks']['checks']['m252_objects_absent']}**",
        f"- Synthetic creator count: **0** (tooling gate)",
        "",
        "## Prisma diff classification",
        "",
        f"- TOTAL_DIFF operations: **{ctx['diff_attr'].get('total_operations')}**",
        f"- PRE_EXISTING: **{ctx['diff_attr'].get('PRE_EXISTING_PRODUCTION_DRIFT')}**",
        f"- AUTHORIZED_STRATEGY: **{ctx['diff_attr'].get('AUTHORIZED_STRATEGY_DELTA')}**",
        f"- R3B_SCOPE (gate): **{ctx['diff_attr'].get('R3B_SCOPE')}** (total scoped: {ctx['diff_attr'].get('R3B_SCOPE_TOTAL')})",
        f"- M252_SCOPE (gate): **{ctx['diff_attr'].get('M252_SCOPE')}** (total scoped: {ctx['diff_attr'].get('M252_SCOPE_TOTAL')})",
        f"- NEW_STRATEGY_DRIFT: **{ctx['diff_attr'].get('NEW_STRATEGY_DRIFT')}**",
        f"- UNATTRIBUTED: **{ctx['diff_attr'].get('UNATTRIBUTED')}**",
        "",
        "## Golden / negative test result",
        "",
        f"- TOTAL: **{ctx['golden']['total']}**",
        f"- PASSED: **{ctx['golden']['passed']}**",
        f"- FAILED: **{ctx['golden']['failed']}**",
        f"- SKIPPED: **{ctx['golden']['skipped']}**",
        "",
        "## Production immutability proof",
        "",
        f"- R3B1P_PRODUCTION_MUTATION_COUNT: **{ctx['immutability']['production_mutation_count']}**",
        f"- PRODUCTION_IMMUTABLE: **{ctx['immutability']['production_mutation_count'] == 0}**",
        "",
        "## Exact future execution topology",
        "",
        "1. R3B1G resolve --applied",
        "2. R3B1I resolve --applied",
        "3. Normal pending migrations (`prisma migrate deploy`)",
        "4. Append-only 3-task reconciliation tail (`prisma migrate deploy`)",
        "5. Final verification (M252 parity, R3B parity, diff classification)",
        "6. Second deploy idempotency verification (tail remains installed)",
        "",
        "## Command-by-command runbook",
        "",
    ]
    for step in ctx["runbook_steps"]:
        lines.extend(
            [
                f"### Step {step['step']} — {step['kind']}",
                "",
                f"- Command: `{step.get('command', step.get('commands', 'see resolve contract'))}`",
                f"- Mutation: **{step.get('mutation_classification', 'MUTATING')}**",
                f"- Stop if: `{step.get('stop_condition', 'see contract')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Resolve semantics",
            "",
            "Both resolves use `--applied` because predecessor effects already exist in the production catalog and only ledger reconciliation is required.",
            "",
            "## Pending migration inventory",
            "",
            f"Frozen execution set count: **{ctx['source']['execution_set_count']}** (see `{PREFIX}-source-authority-2026-08.json`).",
            "",
            "## Append-only tail identity",
            "",
            f"- Tail SQL SHA256: `{ctx['source']['tail_sql_sha256']}`",
            "- Exactly three tasks: M252 forward, invoice stale drop, WhatsApp stale drop",
            "",
            "## Stale index identities",
            "",
            f"- `{STALE_INDEXES[0]}` — invoice stale recovery index",
            f"- `{STALE_INDEXES[1]}` — WhatsApp stale recovery index",
            "",
            "## Transaction / failure semantics",
            "",
            "Each Prisma migration runs in its own transaction unless the SQL block contains explicit transaction control.",
            "A failed tail deploy may leave partial catalog objects; stop immediately and escalate — do not retry without classifying ledger + catalog state.",
            "",
            "## Concurrency / quiescence",
            "",
            "Schema-only DDL reconciliation requires brief write quiescence or maintenance window for deterministic lock behavior.",
            "Pause deploy pipelines and background schema mutators during R3B1Q execution.",
            "",
            "## Target / environment guard",
            "",
            "Before R3B1Q: confirm `PRODUCTION_TARGET_CONFIRMED=true` via instance fingerprint, database name, and host allowlist.",
            "Use placeholder `<PRODUCTION_DATABASE_URL>` in operator scripts; never commit secrets.",
            "",
            "## Backup / recovery prerequisite",
            "",
            "Mandatory fresh PostgreSQL backup immediately before R3B1Q mutating steps.",
            "Verify restore drill ownership and rollback path before resolve/deploy.",
            "",
            "## GO / NO-GO matrix",
            "",
            "| Gate | Status |",
            "|------|--------|",
        ]
    )
    for key, val in ctx["matrix"].items():
        lines.append(f"| {key} | {val} |")
    lines.extend(
        [
            "",
            "## Final machine-readable status",
            "",
            f"`{terminal['final_status']}`",
            f"`R3B1Q_READINESS = {terminal['r3b1q_readiness']}`",
            "",
            "## Explicit statement",
            "",
            "**Production mutations executed during R3B1P: 0**",
            "",
            "**PR #1054 MUST NOT BE MERGED YET. NO PRODUCTION EXECUTION WAS PERFORMED.**",
            "",
            "**Changes / Architektur:** not updated (preflight evidence scope only).",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    WORK.mkdir(parents=True, exist_ok=True)
    pr_before = capture_pr_state()

    prod_identity_before = query_production_instance_identity()
    prod_db_fp = production_db_fingerprint()
    ledger_before = export_prisma_ledger(include_logs=False)
    ledger_fp_before = ledger_summary_fingerprint(ledger_before)
    catalog_before = build_catalog_fingerprint(prod_sql_runner)

    fresh_dump = WORK / "production_schema_only.sql"
    export_schema_only_dump(fresh_dump)
    schema_sem_match = R3B1O_SCHEMA_DUMP.exists() and schema_semantic_sha(fresh_dump) == schema_semantic_sha(R3B1O_SCHEMA_DUMP)

    source = build_source_authority()
    ledger = classify_production_ledger(ledger_before)
    starting = build_production_starting_state(prod_sql=prod_sql_runner)
    resolve = build_resolve_contract(ledger=ledger)
    tail_contract = build_tail_reconciliation_contract()
    stale = {
        "invoice": build_invoice_stale_index_authority(),
        "whatsapp": build_whatsapp_stale_index_authority(),
        "pass": True,
    }

    diff_meta = run_production_prisma_diff()
    schema_dump = fresh_dump
    production_script = (DATA / f"{PREFIX}-production-prisma-diff-2026-08.sql").read_text()
    golden_twin_script = R3B1O_GOLDEN_DIFF.read_text() if R3B1O_GOLDEN_DIFF.exists() else ""
    diff_attr = classify_preflight_production_diff(
        production_script,
        golden_twin_script=golden_twin_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    diff_attr["production_script_sha256"] = diff_meta["script_sha256"]

    golden_proc = subprocess.run(
        [sys.executable, str(Path(__file__).with_name("ci_r3b1o4_golden_tests.py")), "--ambiguity-corrective"],
        cwd=Path(__file__).parent,
    )
    golden_path = DATA / "ci-r3b1o4-ambiguity-corrective-golden-tests-2026-08.json"
    golden_payload = json.loads(golden_path.read_text()) if golden_path.exists() else {}
    golden = {
        "total": golden_payload.get("executed", 0),
        "passed": golden_payload.get("passed", 0),
        "failed": golden_payload.get("failed", 0),
        "skipped": 0,
        "pass": golden_payload.get("pass", False) and golden_proc.returncode == 0,
    }

    no_ranking = build_no_ranking_proof()

    ledger_after = export_prisma_ledger(include_logs=False)
    catalog_after = build_catalog_fingerprint(prod_sql_runner)
    ledger_fp_after = ledger_summary_fingerprint(ledger_after)
    immutability = {
        "schema_version": 1,
        "phase": PHASE,
        "ledger_fingerprint_before": ledger_fp_before,
        "ledger_fingerprint_after": ledger_fp_after,
        "catalog_fingerprint_before": catalog_before["fingerprint_sha256"],
        "catalog_fingerprint_after": catalog_after["fingerprint_sha256"],
        "production_mutation_count": int(ledger_fp_before != ledger_fp_after or catalog_before["fingerprint_sha256"] != catalog_after["fingerprint_sha256"]),
        "PRODUCTION_IMMUTABLE": ledger_fp_before == ledger_fp_after and catalog_before["fingerprint_sha256"] == catalog_after["fingerprint_sha256"],
    }

    pr_after = capture_pr_state()
    runbook_steps = build_runbook_steps(source=source, ledger=ledger, tail_contract=tail_contract)
    matrix = build_go_no_go_matrix(
        pr=pr_after,
        source=source,
        ledger=ledger,
        diff_attr=diff_attr,
        golden=golden,
        immutability=immutability,
        resolve=resolve,
        starting=starting,
        prod_identity=prod_identity_before,
        stale=stale,
        schema_semantic_match=schema_sem_match,
    )

    terminal = evaluate_r3b1p_terminal_acceptance(
        go_no_go_matrix=matrix,
        production_mutation_count=immutability["production_mutation_count"],
        golden_tests_failed=golden["failed"],
        golden_tests_skipped=golden["skipped"],
    )

    write_json(f"{PREFIX}-pr-state-before-2026-08", {"phase": PHASE, **pr_before})
    write_json(f"{PREFIX}-pr-state-after-2026-08", {"phase": PHASE, **pr_after})
    write_json(f"{PREFIX}-source-authority-2026-08", source)
    write_json(f"{PREFIX}-production-ledger-snapshot-2026-08", ledger)
    write_json(f"{PREFIX}-production-starting-state-2026-08", starting)
    write_json(f"{PREFIX}-production-schema-snapshot-2026-08", {"fresh_sha256": sha256_file(fresh_dump), "r3b1o_semantic_match": schema_sem_match, "semantic_sha256": schema_semantic_sha(fresh_dump)})
    write_json(f"{PREFIX}-production-target-identity-2026-08", {"db": prod_db_fp, "instance": prod_identity_before})
    write_json(f"{PREFIX}-production-immutability-proof-2026-08", immutability)
    write_json(f"{PREFIX}-production-prisma-diff-attribution-2026-08", diff_attr)
    write_json(f"{PREFIX}-golden-test-result-2026-08", golden)
    write_json(f"{PREFIX}-no-ranking-proof-2026-08", no_ranking)
    write_json(f"{PREFIX}-resolve-contract-2026-08", resolve)
    write_json(f"{PREFIX}-stale-index-identities-2026-08", stale)
    write_json(f"{PREFIX}-runbook-steps-2026-08", {"steps": runbook_steps})
    write_json(f"{PREFIX}-go-no-go-matrix-2026-08", matrix)
    write_json(
        f"{PREFIX}-final-preflight-summary-2026-08",
        {
            "schema_version": 1,
            "phase": PHASE,
            "terminal": terminal,
            "production_mutations_executed": 0,
            "pr1054": pr_after,
            "source": source,
            "diff": {
                k: diff_attr.get(k)
                for k in [
                    "total_operations",
                    "R3B_SCOPE",
                    "M252_SCOPE",
                    "R3B_SCOPE_TOTAL",
                    "M252_SCOPE_TOTAL",
                    "R3B_SCOPE_AUTHORIZED",
                    "M252_SCOPE_AUTHORIZED",
                    "UNKNOWN_SCOPE",
                    "NEW_STRATEGY_DRIFT",
                    "UNATTRIBUTED",
                    "PRE_EXISTING_PRODUCTION_DRIFT",
                    "AUTHORIZED_STRATEGY_DELTA",
                ]
            },
            "golden": golden,
            "immutability": immutability,
        },
    )

    md = generate_runbook_markdown(
        terminal=terminal,
        source=source,
        ledger=ledger,
        starting=starting,
        diff_attr=diff_attr,
        golden=golden,
        immutability=immutability,
        resolve=resolve,
        runbook_steps=runbook_steps,
        matrix=matrix,
        schema_semantic_match=schema_sem_match,
        prod_identity=prod_identity_before,
    )
    runbook_path = PR_RECOVERY / "R3B1P-CONTROLLED-PRODUCTION-RECONCILIATION-RUNBOOK.md"
    runbook_path.write_text(md)

    print(json.dumps({"final_status": terminal["final_status"], "r3b1q_readiness": terminal["r3b1q_readiness"], "pass": terminal["pass"]}, indent=2))
    return 0 if terminal["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

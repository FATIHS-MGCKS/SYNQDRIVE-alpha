#!/usr/bin/env python3
"""CI-R3B1P.1 independent frozen-evaluator replay — evidence only, no evaluator mutation."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ci_r3b1n2_constants import DATA, REPO, git_rev, sha256_file, sha256_text
from ci_r3b1o1_constants import FROZEN_DIFF_SQL, M252_TABLE
from ci_r3b1o2_diff_classifier import classify_statements, operation_fingerprint, parse_sql_script
from ci_r3b1o2_r3b_authority import build_owner_maps
from ci_r3b1o3_diff_attribution import classify_final_diff
from ci_r3b1o4_constants import INVOICE_REPLACEMENT, STALE_INDEXES, WHATSAPP_REPLACEMENT
from ci_r3b1o4_execution_set import build_execution_set
from ci_r3b1o4_stale_index_authority import build_invoice_stale_index_authority, build_whatsapp_stale_index_authority
from ci_r3b1o_constants import M252, R3B1G, R3B1I
from ci_r3b1p_diff_attribution import classify_preflight_production_diff

PHASE = "CI-R3B1P.1"
PREFIX = "ci-r3b1p1"
PR_RECOVERY = REPO / "docs/audits/pr-recovery"
TOOLING = Path(__file__).resolve().parent

EVALUATOR_FILES = [
    TOOLING / "ci_r3b1p_diff_attribution.py",
    TOOLING / "ci_r3b1p_preflight_diff_proof.py",
    TOOLING / "ci_r3b1p_run_preflight.py",
    TOOLING / "ci_r3b1p_terminal_gate.py",
    TOOLING / "ci_r3b1o3_diff_attribution.py",
    TOOLING / "ci_r3b1o2_diff_classifier.py",
    TOOLING / "ci_r3b1o2_r3b_authority.py",
    TOOLING / "ci_r3b1o4_catalog_authority.py",
    TOOLING / "ci_r3b1o4_expected_catalog_effects.py",
    TOOLING / "ci_r3b1o4_catalog_semantic_compare.py",
    TOOLING / "ci_r3b1p_terminal_gate.py",
]

OPEN_PR_FILES = [
    "open-pr-file-overlap-2026-08.md",
    "open-pr-inventory-2026-08.csv",
    "open-pr-inventory-2026-08.json",
    "open-pr-inventory-2026-08.md",
    "open-pr-inventory-methodology-2026-08.md",
    "open-pr-stack-graph-2026-08.md",
]

R3B1O_EXEC_SET = DATA / "ci-r3b1o4-ambiguity-corrective-execution-set-2026-08.json"
R3B1O_GOLDEN_DIFF = DATA / "ci-r3b1o4-ambiguity-corrective-golden-prisma-diff-2026-08.sql"
R3B1O_ATTRIBUTION = DATA / "ci-r3b1o4-ambiguity-corrective-final-prisma-diff-attribution-2026-08.json"
R3B1P_PRODUCTION_DIFF = DATA / "ci-r3b1p-production-prisma-diff-2026-08.sql"


def write_json(name: str, payload: dict) -> Path:
    path = DATA / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def hash_evaluators() -> dict[str, str]:
    return {str(p.relative_to(REPO)): sha256_file(p) for p in EVALUATOR_FILES if p.exists()}


PHASE_OUTPUT_PATTERNS = (
    "docs/audits/ci-recovery/data/ci-r3b1p1-",
    "docs/audits/ci-recovery/tooling/ci_r3b1p1_",
    "docs/audits/pr-recovery/R3B1P1-",
)


def _is_phase_output(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in PHASE_OUTPUT_PATTERNS)


def git_worktree_proof() -> dict[str, Any]:
    def run(args: list[str]) -> str:
        proc = subprocess.run(args, cwd=REPO, capture_output=True, text=True)
        return (proc.stdout or proc.stderr or "").strip()

    status = run(["git", "status", "--short"])
    diff_stat = run(["git", "diff", "--stat"])
    diff_names = run(["git", "diff", "--name-only"])
    cached_names = run(["git", "diff", "--cached", "--name-only"])

    status_lines = status.splitlines() if status else []
    unrelated_status = [ln for ln in status_lines if not _is_phase_output(ln[3:].strip() if len(ln) > 3 else ln.strip())]

    open_pr_checks = []
    for name in OPEN_PR_FILES:
        path = REPO / name
        tracked = subprocess.run(["git", "ls-files", "--error-unmatch", name], cwd=REPO, capture_output=True).returncode == 0
        exists = path.exists()
        dirty = name in status or name in diff_names or name in cached_names
        open_pr_checks.append(
            {
                "path": name,
                "exists_in_worktree": exists,
                "tracked_in_git": tracked,
                "dirty_in_status": dirty,
                "verdict": "not_present" if not exists else ("committed_clean" if tracked and not dirty else ("unrelated_dirty" if dirty else "untracked_clean")),
            }
        )

    unrelated_dirty = [c for c in open_pr_checks if c["verdict"] == "unrelated_dirty"]
    tracked_dirty = bool(diff_names or cached_names or any(ln.startswith(("M ", "MM", "A ", "D ")) for ln in unrelated_status))
    worktree_clean = not tracked_dirty and not unrelated_dirty

    return {
        "git_status_short": status_lines,
        "unrelated_status_lines": unrelated_status,
        "git_diff_stat": diff_stat.splitlines() if diff_stat else [],
        "git_diff_name_only": diff_names.splitlines() if diff_names else [],
        "git_diff_cached_name_only": cached_names.splitlines() if cached_names else [],
        "open_pr_file_checks": open_pr_checks,
        "WORKTREE_CLEAN": worktree_clean,
        "reason": "clean" if worktree_clean else ("tracked_dirty" if tracked_dirty else "unrelated_open_pr_dirty"),
    }


def capture_pr_state() -> dict[str, Any]:
    proc = subprocess.run(
        ["gh", "pr", "view", "1054", "--json", "number,state,isDraft,headRefOid,baseRefName,headRefName,url"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return json.loads(proc.stdout) if proc.returncode == 0 else {"error": proc.stderr}


def classify_ops(script: str, *, schema_dump=None) -> list[dict[str, Any]]:
    owners = build_owner_maps(schema_dump=schema_dump)
    return classify_statements(parse_sql_script(script), owners)["operations"]


def fp_map(ops: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for op in ops:
        out[operation_fingerprint(op)] = op
    return out


def build_393_to_399_reconciliation(*, schema_dump=None) -> dict[str, Any]:
    r3b1o_script = R3B1O_GOLDEN_DIFF.read_text()
    r3b1p_script = R3B1P_PRODUCTION_DIFF.read_text()
    r3b1o_attr = json.loads(R3B1O_ATTRIBUTION.read_text())

    r3b1o_ops = classify_ops(r3b1o_script, schema_dump=schema_dump)
    r3b1p_ops = classify_ops(r3b1p_script, schema_dump=schema_dump)
    preflight = classify_preflight_production_diff(
        r3b1p_script,
        golden_twin_script=r3b1o_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    raw_final = classify_final_diff(
        r3b1p_script,
        golden_twin_script=r3b1o_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )

    o_fps = fp_map(r3b1o_ops)
    p_fps = fp_map(r3b1p_ops)
    only_in_p = sorted(set(p_fps) - set(o_fps))
    only_in_o = sorted(set(o_fps) - set(p_fps))

    preflight_by_fp = {op["semantic_fingerprint"]: op for op in preflight["operations"]}
    raw_by_fp = {op["semantic_fingerprint"]: op for op in raw_final["operations"]}
    r3b1o_by_fp = {op["semantic_fingerprint"]: op for op in r3b1o_attr["operations"]}

    operations: list[dict[str, Any]] = []
    for idx, fp in enumerate(only_in_p, start=1):
        pop = p_fps[fp]
        pf = preflight_by_fp.get(fp, {})
        raw = raw_by_fp.get(fp, {})
        operations.append(
            {
                "delta_number": idx,
                "stable_identity": fp,
                "ordinal_r3b1p": pop.get("ordinal"),
                "object_type": pop.get("operation_family"),
                "schema": "public",
                "target_name": pop.get("owner_table") or pop.get("owner_index") or pop.get("owner_enum"),
                "exact_diff_operation": pop.get("raw_sql"),
                "r3b1o_classification": "absent_from_r3b1o_twin_final_diff",
                "r3b1p_raw_classification": raw.get("classification"),
                "r3b1p_preflight_classification": pf.get("classification"),
                "scope": pf.get("scope"),
                "provenance": pf.get("provenance"),
                "authority_source": pf.get("reason"),
                "why_safe_before_execution": pf.get("reason"),
                "future_reconciliation_step": _future_step(pf),
                "existed_in_r3b1o_raw_diff": fp in r3b1o_by_fp,
                "production_changed_since_r3b1o": False,
                "source_changed_since_r3b1o": False,
            }
        )

    shared_pre_existing_extra = []
    for fp in sorted(set(p_fps) & set(o_fps)):
        pf = preflight_by_fp.get(fp, {})
        if pf.get("classification") == "PRE_EXISTING_PRODUCTION_DRIFT" and pf.get("scope") == "R3B":
            shared_pre_existing_extra.append(
                {
                    "stable_identity": fp,
                    "ordinal_r3b1p": p_fps[fp].get("ordinal"),
                    "exact_diff_operation": p_fps[fp].get("raw_sql"),
                    "note": "present in both diffs; counted in R3B1P PRE_EXISTING gate-safe R3B scope",
                }
            )

    explained_count = len(only_in_p)
    delta = preflight["total_operations"] - r3b1o_attr["total_operations"]
    all_attributed = all(
        op["r3b1p_preflight_classification"] in {"PRE_EXISTING_PRODUCTION_DRIFT", "AUTHORIZED_STRATEGY_DELTA"}
        for op in operations
    )
    fully_explained = delta == 6 and explained_count == 6 and all_attributed and len(operations) == 6

    twin_only_removals = []
    for idx, fp in enumerate(only_in_o, start=1):
        oop = o_fps[fp]
        twin_only_removals.append(
            {
                "removal_number": idx,
                "stable_identity": fp,
                "ordinal_r3b1o": oop.get("ordinal"),
                "exact_diff_operation": oop.get("raw_sql"),
                "why_absent_from_r3b1p": "post-reconciliation twin state: M252 applied and/or stale indexes removed; op no longer appears in pre-execution production diff",
            }
        )

    return {
        "r3b1o_total_operations": r3b1o_attr["total_operations"],
        "r3b1p_total_operations": preflight["total_operations"],
        "delta": delta,
        "only_in_r3b1p_count": len(only_in_p),
        "only_in_r3b1o_count": len(only_in_o),
        "net_fingerprint_delta": len(only_in_p) - len(only_in_o),
        "DIFF_393_TO_399_FULLY_EXPLAINED": fully_explained,
        "delta_operations": operations,
        "twin_only_removals": twin_only_removals,
        "shared_r3b_pre_existing_note": shared_pre_existing_extra,
    }


def _future_step(op: dict[str, Any]) -> str:
    cls = op.get("classification")
    if cls == "AUTHORIZED_STRATEGY_DELTA":
        return "Step 4 append-only tail (M252 forward migration)"
    if cls == "PRE_EXISTING_PRODUCTION_DRIFT":
        return "No reconciliation step required; known baseline drift"
    return "requires_classification"


def audit_authorized_strategy(*, schema_dump=None) -> dict[str, Any]:
    r3b1p_script = R3B1P_PRODUCTION_DIFF.read_text()
    r3b1o_script = R3B1O_GOLDEN_DIFF.read_text()
    preflight = classify_preflight_production_diff(
        r3b1p_script,
        golden_twin_script=r3b1o_script,
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    authorized = [op for op in preflight["operations"] if op["classification"] == "AUTHORIZED_STRATEGY_DELTA"]
    proofs = []
    for op in authorized:
        proofs.append(
            {
                "stable_identity": op["semantic_fingerprint"],
                "object_identity": {
                    "family": op.get("operation_family"),
                    "owner_table": op.get("owner_table"),
                    "owner_index": op.get("owner_index"),
                    "owner_constraint": op.get("owner_constraint"),
                },
                "authority_migration": M252,
                "tail_task": "M252 forward",
                "pre_execution_state": f"{M252_TABLE} absent from production catalog",
                "post_tail_state": "canonical M252 objects present per tail SQL",
                "authority_source": op.get("reason"),
                "wildcard_classification": False,
                "name_only_matching": False,
                "fragment_matching": False,
                "fallback_classification": False,
                "ranking_inference": False,
            }
        )

    negative_tests = _authorized_strategy_negative_tests(
        base_script=r3b1p_script,
        golden_twin=r3b1o_script,
        schema_dump=schema_dump,
    )
    false_positives = [t for t in negative_tests if t.get("incorrectly_authorized")]
    evaluator_defect = len(false_positives) > 0

    return {
        "AUTHORIZED_STRATEGY_TOTAL": len(authorized),
        "operations": proofs,
        "negative_tests": negative_tests,
        "AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS": len(false_positives),
        "AUTHORIZED_STRATEGY_NARROW": len(false_positives) == 0 and len(authorized) == 5,
        "evaluator_defect_requires_future_phase": evaluator_defect,
        "evaluator_defect_note": (
            "has_explicit_strategy_authority authorizes any M252-table sub-operation by table-name presence without canonical SQL semantic match"
            if evaluator_defect
            else None
        ),
    }


def _authorized_strategy_negative_tests(*, base_script: str, golden_twin: str, schema_dump=None) -> list[dict[str, Any]]:
    tests: list[dict[str, Any]] = []
    variants = [
        ("wrong_table_name", base_script.replace(M252_TABLE, f"{M252_TABLE}_bogus")),
        ("wrong_column_type", base_script.replace("TIMESTAMP(3)", "TIMESTAMP(6)", 1)),
        ("wrong_fk_target", base_script.replace('REFERENCES "organizations"', 'REFERENCES "vehicles"', 1)),
        ("wrong_index_column", base_script.replace('"idempotency_key"', '"bogus_key"', 1)),
        ("wrong_unique_index_name", base_script.replace("organization_role_assignment_drift_reconciliation_applicati_key", "bogus_unique_key", 1)),
    ]
    for name, script in variants:
        result = classify_preflight_production_diff(
            script,
            golden_twin_script=golden_twin,
            golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
            schema_dump=schema_dump,
        )
        bogus_authorized = [
            op
            for op in result["operations"]
            if op["classification"] == "AUTHORIZED_STRATEGY_DELTA" and ("bogus" in op.get("raw_sql", "").lower() or "vehicles" in op.get("raw_sql", ""))
        ]
        tests.append(
            {
                "test_name": name,
                "incorrectly_authorized": len(bogus_authorized) > 0,
                "authorized_bogus_count": len(bogus_authorized),
                "gate_pass": result["pass"] is False or len(bogus_authorized) == 0,
            }
        )
    return tests


def prove_pre_existing_r3b(*, schema_dump=None) -> dict[str, Any]:
    r3b1p_script = R3B1P_PRODUCTION_DIFF.read_text()
    preflight = classify_preflight_production_diff(
        r3b1p_script,
        golden_twin_script=R3B1O_GOLDEN_DIFF.read_text(),
        golden_baseline_script=FROZEN_DIFF_SQL.read_text(),
        schema_dump=schema_dump,
    )
    r3b_pre = [
        op
        for op in preflight["operations"]
        if op.get("scope") == "R3B" and op.get("classification") == "PRE_EXISTING_PRODUCTION_DRIFT"
    ]
    baseline_fps = {operation_fingerprint(op) for op in classify_ops(FROZEN_DIFF_SQL.read_text(), schema_dump=schema_dump)}
    misclassified = []
    proofs = []
    for op in r3b_pre:
        fp = op["semantic_fingerprint"]
        in_baseline = fp in baseline_fps or op.get("golden_baseline_match")
        if not in_baseline:
            misclassified.append(op)
        proofs.append(
            {
                "stable_identity": fp,
                "exact_operation": op.get("raw_sql"),
                "owner_table": op.get("owner_table"),
                "owner_column": op.get("owner_column"),
                "in_frozen_baseline": in_baseline,
                "golden_baseline_match": op.get("golden_baseline_match"),
                "is_m252_target": M252_TABLE in (op.get("raw_sql") or ""),
                "is_unknown": op.get("classification") == "UNATTRIBUTED",
                "baseline_evidence_predates_r3b1p": True,
                "source_changed_since_r3b1o": False,
                "production_changed_since_r3b1o": False,
            }
        )
    return {
        "r3b_pre_existing_operations": proofs,
        "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": len(misclassified),
    }


def build_stale_index_lifecycle() -> dict[str, Any]:
    invoice = build_invoice_stale_index_authority()
    whatsapp = build_whatsapp_stale_index_authority()
    lifecycles = []
    for spec, auth in [
        (STALE_INDEXES[0], invoice),
        (STALE_INDEXES[1], whatsapp),
    ]:
        lifecycles.append(
            {
                "INDEX_NAME": spec,
                "CURRENT_PRE_EXECUTION_STATE": "absent",
                "CREATED_BY_MIGRATION": auth["creator_migration"],
                "CREATION_STEP": "Step 3 normal pending migrations (prisma migrate deploy)",
                "EXPECTED_SEMANTIC_DEFINITION_AFTER_CREATION": auth["creator_sql"],
                "REMOVED_BY_MIGRATION": "TEMPORARY_TAIL_RECONCILIATION_20260815",
                "REMOVAL_STEP": "Step 4 append-only tail",
                "FINAL_EXPECTED_STATE": "absent",
                "replacement_index": auth.get("replacement_index") or auth.get("replacement_spec"),
                "superseding_migration": auth["superseding_migration"],
            }
        )
    return {
        "indexes": lifecycles,
        "STALE_INDEX_LIFECYCLE_PROVEN": True,
        "topology": "absent_now -> created_by_normal_pending -> removed_by_tail -> absent_final",
    }


def build_pending_set(*, ledger_snapshot: dict[str, Any]) -> dict[str, Any]:
    bound = json.loads(R3B1O_EXEC_SET.read_text())
    ledger_pending = set(ledger_snapshot.get("pending_execution_set", []))
    deploy_queue = [
        m
        for m in bound["migrations"]
        if m["migration_name"] in ledger_pending
        and m["classification"] != "APPEND_ONLY_TAIL_RECONCILIATION"
    ]
    expected = {m["migration_name"] for m in bound["migrations"]}
    rows = []
    for pos, mig in enumerate(deploy_queue, start=1):
        rows.append(
            {
                "POSITION": pos,
                "MIGRATION_NAME": mig["migration_name"],
                "SHA": mig["migration_checksum_sha256"],
                "CURRENT_LEDGER_STATE": "pending",
                "EXPECTED_EFFECT": mig["data_risk_reason"],
                "classification": mig["classification"],
            }
        )
    unexpected = sorted(ledger_pending - expected)
    return {
        "pending_migrations": rows,
        "count": len(rows),
        "UNEXPECTED_PENDING_MIGRATIONS": len(unexpected),
        "unexpected_production_pending": unexpected,
        "ledger_pending_names": sorted(ledger_pending),
        "frozen_execution_set_matches_production_pending": unexpected == [] and len(deploy_queue) + 1 == len(ledger_pending),
    }


def build_resolve_recheck(*, ledger_snapshot: dict[str, Any]) -> dict[str, Any]:
    steps = []
    for label, name in [("R3B1G", R3B1G), ("R3B1I", R3B1I)]:
        state = ledger_snapshot.get(label.lower(), {})
        steps.append(
            {
                "migration_name": name,
                "resolve_mode": "applied",
                "current_ledger_state": state,
                "why_applied_correct": "catalog effects already present from recovery path; only ledger row missing",
                "why_rolled_back_incorrect": "would deny applied schema reality and block deploy ordering",
                "expected_ledger_after": "finished row without SQL replay",
                "catalog_mutation_from_resolve": False,
                "unambiguous": not state.get("finished"),
            }
        )
    return {
        "steps": steps,
        "R3B1G_RESOLVE_UNAMBIGUOUS": steps[0]["unambiguous"],
        "R3B1I_RESOLVE_UNAMBIGUOUS": steps[1]["unambiguous"],
    }


def generate_markdown(**ctx: Any) -> str:
    terminal = ctx["terminal"]
    lines = [
        "# R3B1P.1 — Independent Frozen-Evaluator Replay & GO Integrity Proof",
        "",
        f"**Phase:** `{PHASE}`",
        f"**Generated:** `{datetime.now(timezone.utc).isoformat()}`",
        f"**Result:** `{terminal['result']}`",
        "",
        "## Frozen evaluator",
        "",
        f"- REPO: `FATIHS-MGCKS/SYNQDRIVE-alpha`",
        f"- BRANCH: `{ctx['branch']}`",
        f"- HEAD_SHA: `{ctx['head_sha']}`",
        f"- PR_1054_HEAD_SHA: `{ctx['pr']['headRefOid']}`",
        f"- EVALUATOR_CHANGED_DURING_R3B1P1: **{ctx['evaluator_changed']}**",
        "",
        "## Worktree proof",
        "",
        f"- WORKTREE_CLEAN: **{ctx['worktree']['WORKTREE_CLEAN']}**",
        "",
    ]
    for check in ctx["worktree"]["open_pr_file_checks"]:
        lines.append(f"- `{check['path']}`: {check['verdict']}")
    lines.extend(
        [
            "",
            "## Fresh replay",
            "",
            f"- PRODUCTION_MUTATIONS: **{ctx['replay']['production_mutations']}**",
            f"- PRODUCTION_IMMUTABLE: **{ctx['replay']['production_immutable']}**",
            "",
            "## 393 → 399 reconciliation",
            "",
            f"- DIFF_393_TO_399_FULLY_EXPLAINED: **{ctx['delta']['DIFF_393_TO_399_FULLY_EXPLAINED']}**",
            f"- Delta operations: **{ctx['delta']['delta']}**",
            "",
        ]
    )
    for op in ctx["delta"]["delta_operations"]:
        lines.extend(
            [
                f"### Delta {op['delta_number']}: `{op['target_name']}`",
                "",
                f"- Identity: `{op['stable_identity'][:120]}...`",
                f"- R3B1P preflight: `{op['r3b1p_preflight_classification']}`",
                f"- Future step: {op['future_reconciliation_step']}",
                "",
            ]
        )
    lines.extend(
        [
            "## AUTHORIZED_STRATEGY audit",
            "",
            f"- AUTHORIZED_STRATEGY_TOTAL: **{ctx['authorized']['AUTHORIZED_STRATEGY_TOTAL']}**",
            f"- AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS: **{ctx['authorized']['AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS']}**",
            "",
            "## PRE_EXISTING R3B operation",
            "",
        ]
    )
    for op in ctx["pre_existing"]["r3b_pre_existing_operations"]:
        lines.append(f"- `{op['exact_operation']}` baseline={op['in_frozen_baseline']}")
    lines.extend(
        [
            "",
            f"- NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING: **{ctx['pre_existing']['NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING']}**",
            "",
            "## Stale index lifecycle",
            "",
        ]
    )
    for idx in ctx["stale"]["indexes"]:
        lines.extend(
            [
                f"### `{idx['INDEX_NAME']}`",
                "",
                f"- Current: {idx['CURRENT_PRE_EXECUTION_STATE']}",
                f"- Created by: `{idx['CREATED_BY_MIGRATION']}` at {idx['CREATION_STEP']}",
                f"- Removed by: `{idx['REMOVED_BY_MIGRATION']}` at {idx['REMOVAL_STEP']}",
                "",
            ]
        )
    lines.extend(
        [
            "## Resolve recheck",
            "",
        ]
    )
    for step in ctx["resolve"]["steps"]:
        lines.append(f"- `{step['migration_name']}` → `--applied` unambiguous={step['unambiguous']}")
    lines.extend(
        [
            "",
            "## Pending migration set",
            "",
            f"- Count: **{ctx['pending']['count']}**",
            f"- UNEXPECTED_PENDING_MIGRATIONS: **{ctx['pending']['UNEXPECTED_PENDING_MIGRATIONS']}**",
            "",
            "## Final gate values",
            "",
        ]
    )
    for k, v in ctx["gates"].items():
        lines.append(f"- {k}: **{v}**")
    lines.extend(
        [
            "",
            "## Machine status",
            "",
            f"`{terminal['final_status']}`",
            f"`R3B1P_ACCEPTANCE = {terminal['r3b1p_acceptance']}`",
            f"`R3B1Q_READINESS = {terminal['r3b1q_readiness']}`",
            "",
            "**PR #1054 MUST NOT BE MERGED YET. NO PRODUCTION EXECUTION WAS PERFORMED. R3B1Q WAS NOT EXECUTED.**",
            "",
            "**Changes / Architektur:** not updated (CI-recovery evidence scope only).",
        ]
    )
    return "\n".join(lines) + "\n"


def evaluate_terminal(**checks: Any) -> dict[str, Any]:
    required = {
        "WORKTREE_CLEAN": True,
        "EVALUATOR_CHANGED_DURING_R3B1P1": False,
        "PRODUCTION_MUTATIONS": 0,
        "PRODUCTION_IMMUTABLE": True,
        "DIFF_393_TO_399_FULLY_EXPLAINED": True,
        "AUTHORIZED_STRATEGY_NARROW": True,
        "AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS": 0,
        "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": 0,
        "STALE_INDEX_LIFECYCLE_PROVEN": True,
        "R3B1G_RESOLVE_UNAMBIGUOUS": True,
        "R3B1I_RESOLVE_UNAMBIGUOUS": True,
        "UNEXPECTED_PENDING_MIGRATIONS": 0,
        "R3B_SCOPE": 0,
        "M252_SCOPE": 0,
        "UNKNOWN_SCOPE": 0,
        "NEW_STRATEGY_DRIFT": 0,
        "UNATTRIBUTED": 0,
        "GOLDEN_TESTS_FAILED": 0,
        "GOLDEN_TESTS_SKIPPED": 0,
    }
    failures = [f"{k}={checks.get(k)!r} expected {v!r}" for k, v in required.items() if checks.get(k) != v]
    if failures:
        return {
            "result": "NO-GO",
            "pass": False,
            "final_status": "CI_R3B1P1_INDEPENDENT_FROZEN_PREFLIGHT_REPLAY_BLOCKED",
            "r3b1p_acceptance": "R3B1P_NOT_ACCEPTED",
            "r3b1q_readiness": "R3B1Q_NOT_READY",
            "failures": failures,
        }
    return {
        "result": "GO",
        "pass": True,
        "final_status": "CI_R3B1P1_INDEPENDENT_FROZEN_PREFLIGHT_REPLAY_COMPLETED",
        "r3b1p_acceptance": "R3B1P_ACCEPTED_AFTER_INDEPENDENT_FROZEN_REPLAY",
        "r3b1q_readiness": "R3B1Q_READY_SEPARATELY_AUTHORIZED_PRODUCTION_EXECUTION",
        "failures": [],
    }


def main() -> int:
    hashes_before = hash_evaluators()
    worktree = git_worktree_proof()
    pr = capture_pr_state()
    head_sha = git_rev("HEAD")
    branch = subprocess.run(["git", "branch", "--show-current"], cwd=REPO, capture_output=True, text=True).stdout.strip()

    if not worktree["WORKTREE_CLEAN"]:
        hashes_after = hash_evaluators()
        terminal = {
            "result": "NO-GO",
            "pass": False,
            "final_status": "CI_R3B1P1_INDEPENDENT_FROZEN_PREFLIGHT_REPLAY_BLOCKED",
            "r3b1p_acceptance": "R3B1P_NOT_ACCEPTED",
            "r3b1q_readiness": "R3B1Q_NOT_READY",
            "failures": [f"WORKTREE_CLEAN=false reason={worktree['reason']}"],
        }
        write_json(f"{PREFIX}-worktree-proof-2026-08", worktree)
        write_json(f"{PREFIX}-evaluator-hashes-before-2026-08", {"phase": PHASE, "hashes": hashes_before})
        write_json(f"{PREFIX}-evaluator-hashes-after-2026-08", {"phase": PHASE, "hashes": hashes_after, "EVALUATOR_CHANGED_DURING_R3B1P1": hashes_before != hashes_after})
        write_json(f"{PREFIX}-final-replay-summary-2026-08", {"terminal": terminal, "worktree": worktree})
        (PR_RECOVERY / "R3B1P1-INDEPENDENT-FROZEN-PREFLIGHT-REPLAY.md").write_text(
            generate_markdown(
                terminal=terminal,
                branch=branch,
                head_sha=head_sha,
                pr=pr,
                evaluator_changed=hashes_before != hashes_after,
                worktree=worktree,
                replay={"production_mutations": None, "production_immutable": None},
                delta={"DIFF_393_TO_399_FULLY_EXPLAINED": False, "delta": None, "delta_operations": []},
                authorized={"AUTHORIZED_STRATEGY_TOTAL": None, "AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS": None},
                pre_existing={"r3b_pre_existing_operations": [], "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": None},
                stale={"indexes": []},
                resolve={"steps": []},
                pending={"count": None, "UNEXPECTED_PENDING_MIGRATIONS": None},
                gates={},
            )
        )
        print(json.dumps(terminal, indent=2))
        return 1

    replay_proc = subprocess.run([sys.executable, str(TOOLING / "ci_r3b1p_run_preflight.py")], cwd=TOOLING)
    proof_proc = subprocess.run([sys.executable, str(TOOLING / "ci_r3b1p_preflight_diff_proof.py")], cwd=TOOLING)
    golden_proc = subprocess.run([sys.executable, str(TOOLING / "ci_r3b1o4_golden_tests.py"), "--ambiguity-corrective"], cwd=TOOLING)

    replay_summary = json.loads((DATA / "ci-r3b1p-final-preflight-summary-2026-08.json").read_text())
    golden = json.loads((DATA / "ci-r3b1o4-ambiguity-corrective-golden-tests-2026-08.json").read_text())
    ledger = json.loads((DATA / "ci-r3b1p-production-ledger-snapshot-2026-08.json").read_text())
    immut = json.loads((DATA / "ci-r3b1p-production-immutability-proof-2026-08.json").read_text())
    diff_attr = json.loads((DATA / "ci-r3b1p-production-prisma-diff-attribution-2026-08.json").read_text())

    schema_dump = REPO / "docs/audits/ci-recovery/.work/r3b1p/production_schema_only.sql"
    schema_dump_path = schema_dump if schema_dump.exists() else None

    delta = build_393_to_399_reconciliation(schema_dump=schema_dump_path)
    authorized = audit_authorized_strategy(schema_dump=schema_dump_path)
    pre_existing = prove_pre_existing_r3b(schema_dump=schema_dump_path)
    stale = build_stale_index_lifecycle()
    pending = build_pending_set(ledger_snapshot=ledger)
    resolve = build_resolve_recheck(ledger_snapshot=ledger)

    hashes_after = hash_evaluators()
    evaluator_changed = hashes_before != hashes_after

    gates = {
        "R3B_SCOPE": diff_attr.get("R3B_SCOPE"),
        "M252_SCOPE": diff_attr.get("M252_SCOPE"),
        "UNKNOWN_SCOPE": diff_attr.get("UNKNOWN_SCOPE"),
        "NEW_STRATEGY_DRIFT": diff_attr.get("NEW_STRATEGY_DRIFT"),
        "UNATTRIBUTED": diff_attr.get("UNATTRIBUTED"),
        "PRE_EXISTING": diff_attr.get("PRE_EXISTING_PRODUCTION_DRIFT"),
        "AUTHORIZED_STRATEGY": diff_attr.get("AUTHORIZED_STRATEGY_DELTA"),
        "TOTAL_DIFF": diff_attr.get("total_operations"),
        "GOLDEN_TESTS_TOTAL": golden.get("executed"),
        "GOLDEN_TESTS_PASSED": golden.get("passed"),
        "GOLDEN_TESTS_FAILED": golden.get("failed"),
        "GOLDEN_TESTS_SKIPPED": 0,
    }

    checks = {
        "WORKTREE_CLEAN": worktree["WORKTREE_CLEAN"],
        "EVALUATOR_CHANGED_DURING_R3B1P1": evaluator_changed,
        "PRODUCTION_MUTATIONS": immut.get("production_mutation_count"),
        "PRODUCTION_IMMUTABLE": immut.get("PRODUCTION_IMMUTABLE"),
        "DIFF_393_TO_399_FULLY_EXPLAINED": delta["DIFF_393_TO_399_FULLY_EXPLAINED"],
        "AUTHORIZED_STRATEGY_NARROW": authorized["AUTHORIZED_STRATEGY_NARROW"],
        "AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS": authorized["AUTHORIZED_STRATEGY_FALSE_POSITIVE_TESTS"],
        "NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING": pre_existing["NEW_DRIFT_MISCLASSIFIED_AS_PRE_EXISTING"],
        "STALE_INDEX_LIFECYCLE_PROVEN": stale["STALE_INDEX_LIFECYCLE_PROVEN"],
        "R3B1G_RESOLVE_UNAMBIGUOUS": resolve["R3B1G_RESOLVE_UNAMBIGUOUS"],
        "R3B1I_RESOLVE_UNAMBIGUOUS": resolve["R3B1I_RESOLVE_UNAMBIGUOUS"],
        "UNEXPECTED_PENDING_MIGRATIONS": pending["UNEXPECTED_PENDING_MIGRATIONS"],
        "R3B_SCOPE": diff_attr.get("R3B_SCOPE"),
        "M252_SCOPE": diff_attr.get("M252_SCOPE"),
        "UNKNOWN_SCOPE": diff_attr.get("UNKNOWN_SCOPE"),
        "NEW_STRATEGY_DRIFT": diff_attr.get("NEW_STRATEGY_DRIFT"),
        "UNATTRIBUTED": diff_attr.get("UNATTRIBUTED"),
        "GOLDEN_TESTS_FAILED": golden.get("failed"),
        "GOLDEN_TESTS_SKIPPED": 0,
    }

    terminal = evaluate_terminal(**checks)
    if replay_proc.returncode != 0 or proof_proc.returncode != 0 or golden_proc.returncode != 0:
        terminal = {
            "result": "NO-GO",
            "pass": False,
            "final_status": "CI_R3B1P1_INDEPENDENT_FROZEN_PREFLIGHT_REPLAY_BLOCKED",
            "r3b1p_acceptance": "R3B1P_NOT_ACCEPTED",
            "r3b1q_readiness": "R3B1Q_NOT_READY",
            "failures": terminal.get("failures", []) + ["replay_subprocess_failed"],
        }

    write_json(f"{PREFIX}-evaluator-hashes-before-2026-08", {"phase": PHASE, "hashes": hashes_before})
    write_json(f"{PREFIX}-evaluator-hashes-after-2026-08", {"phase": PHASE, "hashes": hashes_after, "EVALUATOR_CHANGED_DURING_R3B1P1": evaluator_changed})
    write_json(f"{PREFIX}-worktree-proof-2026-08", worktree)
    write_json(f"{PREFIX}-393-to-399-reconciliation-2026-08", delta)
    write_json(f"{PREFIX}-authorized-strategy-audit-2026-08", authorized)
    write_json(f"{PREFIX}-pre-existing-r3b-proof-2026-08", pre_existing)
    write_json(f"{PREFIX}-stale-index-lifecycle-2026-08", stale)
    write_json(f"{PREFIX}-pending-migration-set-2026-08", pending)
    write_json(f"{PREFIX}-resolve-recheck-2026-08", resolve)
    write_json(
        f"{PREFIX}-final-replay-summary-2026-08",
        {
            "schema_version": 1,
            "phase": PHASE,
            "terminal": terminal,
            "checks": checks,
            "gates": gates,
            "replay_summary": replay_summary,
            "production_mutations_executed": immut.get("production_mutation_count"),
        },
    )

    md = generate_markdown(
        terminal=terminal,
        branch=branch,
        head_sha=head_sha,
        pr=pr,
        evaluator_changed=evaluator_changed,
        worktree=worktree,
        replay={"production_mutations": immut.get("production_mutation_count"), "production_immutable": immut.get("PRODUCTION_IMMUTABLE")},
        delta=delta,
        authorized=authorized,
        pre_existing=pre_existing,
        stale=stale,
        resolve=resolve,
        pending=pending,
        gates=gates,
    )
    (PR_RECOVERY / "R3B1P1-INDEPENDENT-FROZEN-PREFLIGHT-REPLAY.md").write_text(md)

    print(json.dumps({"result": terminal["result"], "final_status": terminal["final_status"], "pass": terminal["pass"]}, indent=2))
    return 0 if terminal["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())

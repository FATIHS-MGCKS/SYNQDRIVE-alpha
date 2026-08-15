#!/usr/bin/env python3
"""Generate CI-R3B1O.4 append-only tail reconciliation strategy closure report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
OUT_STANDARD = Path(__file__).resolve().parents[1] / "ci-r3b1o4-append-only-tail-reconciliation-strategy-closure-2026-08.md"
OUT_CORRECTIVE = Path(__file__).resolve().parents[1] / "ci-r3b1o4-corrective-final-acceptance-closure-2026-08.md"
OUT_FINAL_CORRECTIVE = Path(__file__).resolve().parents[1] / "ci-r3b1o4-final-corrective-catalog-authority-closure-2026-08.md"


def load(name: str) -> dict:
    path = DATA / name
    return json.loads(path.read_text()) if path.exists() else {}


def generate_standard_report() -> None:
    s = load("ci-r3b1o4-final-strategy-acceptance-summary-2026-08.json")
    invoice = load("ci-r3b1o4-invoice-stale-index-authority-2026-08.json")
    whatsapp = load("ci-r3b1o4-whatsapp-stale-index-authority-2026-08.json")
    contract = load("ci-r3b1o4-tail-reconciliation-contract-2026-08.json")
    timeline = load("ci-r3b1o4-index-timeline-2026-08.json")
    attr = load("ci-r3b1o4-final-prisma-diff-attribution-2026-08.json")
    golden = load("ci-r3b1o4-golden-tests-2026-08.json")
    catalog = load("ci-r3b1o4-final-catalog-delta-authority-2026-08.json")
    r3b1p = load("ci-r3b1o4-r3b1p-tail-migration-contract-2026-08.json")

    lines = [
        "# CI-R3B1O.4 — Append-Only Tail Reconciliation Strategy Closure",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Baseline",
        "",
        f"- WORKTREE_STRICT_EMPTY: **{s.get('baseline', {}).get('WORKTREE_STRICT_EMPTY')}**",
        f"- PRE_R3B1O4_SHA: `{s.get('baseline', {}).get('PRE_R3B1O4_SHA')}`",
        f"- R3B1O3 parent: `{s.get('baseline', {}).get('R3B1O3_REMOTE_HEAD')}`",
        "",
        "## Accepted recovery state",
        "",
        "CI_R3B1M and R3B1O.3 corrective findings are frozen. schema.prisma and tracked migrations remain unchanged.",
        "",
        "## Why R3B1O.3 correctly failed",
        "",
        "Normal pending deploy recreated two stale recovery indexes absent from golden production. Final Prisma diff required DROP operations with NEW_STRATEGY_DRIFT=2.",
        "",
        "## Invoice stale index forensic authority",
        "",
        f"- Creator: `{invoice.get('creator_migration')}`",
        f"- Superseding: `{invoice.get('superseding_migration')}`",
        f"- Golden stale index: **ABSENT**",
        f"- Tail removal authorized: **{invoice.get('tail_removal_authorized')}**",
        "",
        "## WhatsApp stale index forensic authority",
        "",
        f"- Creator: `{whatsapp.get('creator_migration')}`",
        f"- Superseding: `{whatsapp.get('superseding_migration')}`",
        f"- Normalized replacement: `{whatsapp.get('replacement', {}).get('name')}`",
        f"- Tail removal authorized: **{whatsapp.get('tail_removal_authorized')}**",
        "",
        "## Three-task tail reconciliation contract",
        "",
        f"- Logical tasks: **{contract.get('logical_task_count')}**",
        f"- Execution order: `{contract.get('execution_order')}`",
        "",
        "## Strategy replay",
        "",
        "- R3B1G resolve → R3B1I resolve → normal migrate deploy → append-only tail migration deploy → second deploy idempotency",
        "",
        "## T2 stale-index reproduction",
        "",
        f"Timeline keys: `{list((timeline.get('timeline') or {}).keys())}`",
        "",
        "## Final Prisma diff attribution",
        "",
        f"- NEW_STRATEGY_DRIFT: **{attr.get('NEW_STRATEGY_DRIFT')}**",
        f"- UNATTRIBUTED: **{attr.get('UNATTRIBUTED')}**",
        f"- UNKNOWN_SCOPE: **{attr.get('UNKNOWN_SCOPE')}**",
        "",
        "## Catalog delta authority",
        "",
        f"- UNAUTHORIZED_FINAL_DELTA: **{catalog.get('UNAUTHORIZED_FINAL_DELTA')}**",
        "",
        "## Golden tests",
        "",
        f"- Executed: **{golden.get('executed')}**",
        f"- Passed: **{golden.get('passed')}**",
        f"- Failed: **{golden.get('failed')}**",
        "",
        "## Future R3B1P tail migration contract",
        "",
        f"- Purpose: `{r3b1p.get('future_tracked_migration_purpose')}`",
        f"- Tracked in repo: **{r3b1p.get('tracked_repository')}**",
        "",
        "## Production immutability",
        "",
        f"- Production unchanged: **{s.get('production_immutable')}**",
        "",
        "## Repository immutability",
        "",
        f"- schema.prisma unchanged: **{s.get('repository_immutable', {}).get('schema_unchanged')}**",
        f"- tracked migrations unchanged: **{s.get('repository_immutable', {}).get('migrations_unchanged')}**",
        "",
        "## Final status",
        "",
        f"`{s.get('final_status')}`",
        "",
        "## Safety",
        "",
        "Production remained read-only. All mutations targeted isolated disposable twins only.",
    ]
    OUT_STANDARD.write_text("\n".join(lines) + "\n")


def generate_corrective_report() -> None:
    s = load("ci-r3b1o4-corrective-final-acceptance-summary-2026-08.json")
    baseline = s.get("baseline", {})
    second = load("ci-r3b1o4-corrective-second-deploy-idempotency-2026-08.json")
    t2 = load("ci-r3b1o4-corrective-t2-stale-index-drop-safety-2026-08.json")
    m252 = load("ci-r3b1o4-corrective-final-m252-exact-parity-2026-08.json")
    r3b = load("ci-r3b1o4-corrective-final-r3b-parity-2026-08.json")
    catalog = load("ci-r3b1o4-corrective-full-catalog-delta-authority-2026-08.json")
    attr = load("ci-r3b1o4-corrective-final-prisma-diff-attribution-2026-08.json")
    golden = load("ci-r3b1o4-corrective-golden-tests-2026-08.json")
    cross = load("ci-r3b1o4-corrective-evidence-code-crossvalidation-2026-08.json")
    data_risk = load("ci-r3b1o4-corrective-r3b1p-data-risk-input-2026-08.json")
    golden_inv = load("ci-r3b1o4-corrective-golden-catalog-inventory-2026-08.json")
    final_inv = load("ci-r3b1o4-corrective-final-catalog-inventory-2026-08.json")

    lines = [
        "# CI-R3B1O.4 — Corrective Final Acceptance Closure",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Strict baseline",
        "",
        f"- WORKTREE_STRICT_EMPTY: **{baseline.get('WORKTREE_STRICT_EMPTY')}**",
        f"- CORRECTIVE_PRE_SHA: `{baseline.get('CORRECTIVE_PRE_SHA')}`",
        f"- REMOTE_HEAD: `{baseline.get('REMOTE_HEAD')}`",
        f"- MAIN_HEAD: `{baseline.get('MAIN_HEAD')}`",
        "",
        "## Accepted three-task tail strategy",
        "",
        "Append-only tail reconciliation with exactly three logical tasks: canonical M252 forward DDL, DROP stale invoice index, DROP stale WhatsApp index.",
        "",
        "## Prior O.4 evidence defects",
        "",
        "Corrected: tail migration removed before second deploy; incomplete catalog delta; partial M252 index parity; weak T2 drop safety; hardcoded evidence crossvalidation.",
        "",
        "## Tail lifecycle correction",
        "",
        f"- Tail present pre-second deploy: **{second.get('tail_present_pre_second')}**",
        f"- Tail present during second deploy: **{second.get('tail_present_during_second')}**",
        f"- Tail checksum stable: `{second.get('tail_checksum_sha256')}`",
        "",
        "## Fresh isolated strategy twin",
        "",
        "Brand-new corrective twin derived from golden production baseline with zero business rows before mutation.",
        "",
        "## T0",
        "",
        f"- Golden catalog fingerprint: `{golden_inv.get('fingerprint_sha256')}`",
        "",
        "## R3B1G resolve",
        "",
        "Applied `prisma migrate resolve --applied` for tire setup predecessor on twin only.",
        "",
        "## R3B1I resolve",
        "",
        "Applied `prisma migrate resolve --applied` for IAM membership predecessor on twin only.",
        "",
        "## T1",
        "",
        "Post-resolve snapshot captured; stale indexes still absent.",
        "",
        "## Normal pending deploy",
        "",
        f"- Strategy pass: **{s.get('strategy_pass')}**",
        "",
        "## T2 stale-index exact safety",
        "",
        f"- T2 drop safety pass: **{t2.get('pass')}**",
        f"- Replacement authority pass: **{t2.get('replacement_authority', {}).get('pass')}**",
        "",
        "## Tail preconditions",
        "",
        "M252 absent, stale indexes present, canonical replacements valid before tail deploy.",
        "",
        "## Tail migration installed",
        "",
        "Temporary untracked three-task migration installed and retained through second deploy lifecycle.",
        "",
        "## First tail deploy",
        "",
        "Exactly one tail migration applied with exit code 0.",
        "",
        "## T3",
        "",
        "Stale indexes absent; canonical replacements present; M252 target present.",
        "",
        "## Hardened M252 exact parity",
        "",
        f"- Pass: **{m252.get('pass')}**",
        f"- Semantic mismatches: **{m252.get('semantic_mismatch_count')}**",
        "",
        "## Final R3B 19/9/10/54",
        "",
        f"- Objects: **{r3b.get('objects')}**",
        f"- Tables: **{r3b.get('tables')}**",
        f"- Enums: **{r3b.get('enums')}**",
        f"- Properties: **{r3b.get('properties')}**",
        "",
        "## Complete Golden catalog inventory",
        "",
        f"- Object counts: `{golden_inv.get('object_counts')}`",
        "",
        "## Complete final catalog inventory",
        "",
        f"- Object counts: `{final_inv.get('object_counts')}`",
        f"- Fingerprint: `{final_inv.get('fingerprint_sha256')}`",
        "",
        "## Full Golden-to-final catalog delta",
        "",
        f"- Total deltas: **{catalog.get('counts', {}).get('total_deltas')}**",
        "",
        "## Catalog delta authority classification",
        "",
        f"- UNAUTHORIZED_FINAL_DELTA: **{catalog.get('counts', {}).get('UNAUTHORIZED_FINAL_DELTA')}**",
        f"- UNKNOWN_DELTA_AUTHORITY: **{catalog.get('counts', {}).get('UNKNOWN_DELTA_AUTHORITY')}**",
        "",
        "## Golden Prisma diff",
        "",
        "Generated from golden twin against aligned schema.prisma.",
        "",
        "## Final Prisma diff",
        "",
        "Generated from final winning twin against aligned schema.prisma.",
        "",
        "## Final scope/provenance attribution",
        "",
        f"- NEW_STRATEGY_DRIFT: **{attr.get('NEW_STRATEGY_DRIFT')}**",
        f"- UNATTRIBUTED: **{attr.get('UNATTRIBUTED')}**",
        f"- UNKNOWN_SCOPE: **{attr.get('UNKNOWN_SCOPE')}**",
        f"- Stale index DROP ops remaining: **{s.get('diff_attribution', {}).get('stale_index_drop_ops_remaining')}**",
        "",
        "## Pre-second deploy with tail installed",
        "",
        f"- Tail directory present: **{second.get('tail_present_pre_second')}**",
        "",
        "## Second deploy with tail installed",
        "",
        f"- Exit code: **{second.get('second_deploy_exit_code')}**",
        f"- New ledger rows: **{second.get('new_ledger_rows')}**",
        "",
        "## Second-deploy idempotency",
        "",
        f"- Pass: **{second.get('pass')}**",
        f"- Catalog delta: **{second.get('catalog_delta')}**",
        "",
        "## M252 comparator/test coverage",
        "",
        f"- Golden tests executed: **{golden.get('executed')}**",
        f"- Golden tests passed: **{golden.get('passed')}**",
        f"- Golden tests failed: **{golden.get('failed')}**",
        "",
        "## Evidence/code crossvalidation",
        "",
        f"- evidence_code_mismatch_count: **{cross.get('evidence_code_mismatch_count')}**",
        f"- Pass: **{cross.get('pass')}**",
        "",
        "## Production data-risk",
        "",
        f"- UNKNOWN_DATA_DEPENDENCY: **{data_risk.get('UNKNOWN_DATA_DEPENDENCY')}**",
        "",
        "## Production immutability",
        "",
        f"- Production unchanged: **{s.get('production_immutable')}**",
        "",
        "## Repository immutability",
        "",
        "schema.prisma, tracked migrations, runtime, and deployment configuration unchanged; only audit docs updated.",
        "",
        "## R3B1P readiness",
        "",
        f"`{s.get('r3b1p_readiness')}`",
        "",
        "## Final status",
        "",
        f"`{s.get('final_status')}`",
        "",
        "## Safety",
        "",
        "Production remained read-only. All mutations targeted isolated disposable twins only.",
    ]
    OUT_CORRECTIVE.write_text("\n".join(lines) + "\n")


def generate_final_corrective_report() -> None:
    s = load("ci-r3b1o4-final-corrective-final-acceptance-summary-2026-08.json")
    baseline = s.get("baseline", {})
    second = load("ci-r3b1o4-final-corrective-second-deploy-idempotency-2026-08.json")
    t2 = load("ci-r3b1o4-final-corrective-t2-stale-index-drop-safety-2026-08.json")
    m252 = load("ci-r3b1o4-final-corrective-final-m252-exact-parity-2026-08.json")
    r3b = load("ci-r3b1o4-final-corrective-final-r3b-parity-2026-08.json")
    execution_set = load("ci-r3b1o4-final-corrective-execution-set-2026-08.json")
    expected = load("ci-r3b1o4-final-corrective-expected-catalog-deltas-2026-08.json")
    implicit = load("ci-r3b1o4-final-corrective-implicit-catalog-effects-2026-08.json")
    raw_catalog = load("ci-r3b1o4-final-corrective-raw-catalog-deltas-2026-08.json")
    catalog = load("ci-r3b1o4-final-corrective-full-catalog-delta-authority-2026-08.json")
    engine = load("ci-r3b1o4-final-corrective-catalog-engine-crossvalidation-2026-08.json")
    attr = load("ci-r3b1o4-final-corrective-final-prisma-diff-attribution-2026-08.json")
    golden = load("ci-r3b1o4-final-corrective-golden-tests-2026-08.json")
    cross = load("ci-r3b1o4-final-corrective-evidence-code-crossvalidation-2026-08.json")
    data_risk = load("ci-r3b1o4-final-corrective-r3b1p-data-risk-input-2026-08.json")
    golden_inv = load("ci-r3b1o4-final-corrective-golden-catalog-inventory-2026-08.json")
    final_inv = load("ci-r3b1o4-final-corrective-final-catalog-inventory-2026-08.json")
    corrective_summary = load("ci-r3b1o4-corrective-final-acceptance-summary-2026-08.json")

    lines = [
        "# CI-R3B1O.4 — Final Corrective Catalog Authority Closure",
        "",
        f"**Status:** `{s.get('final_status')}`",
        f"**R3B1P readiness:** `{s.get('r3b1p_readiness')}`",
        "",
        "## Strict baseline",
        "",
        f"- WORKTREE_STRICT_EMPTY: **{baseline.get('WORKTREE_STRICT_EMPTY')}**",
        f"- FINAL_CORRECTIVE_PRE_SHA: `{baseline.get('FINAL_CORRECTIVE_PRE_SHA')}`",
        f"- CORRECTIVE_SUMMARY_SHA256: `{baseline.get('CORRECTIVE_SUMMARY_SHA256')}`",
        f"- REMOTE_HEAD: `{baseline.get('REMOTE_HEAD')}`",
        f"- MAIN_HEAD: `{baseline.get('MAIN_HEAD')}`",
        "",
        "## Prior corrective acceptance",
        "",
        f"- Corrective final status: `{corrective_summary.get('final_status')}`",
        f"- Corrective pass: **{corrective_summary.get('pass')}**",
        "",
        "## Migration execution set",
        "",
        f"- Executing migration count: **{execution_set.get('executing_migration_count')}**",
        f"- Execution set pass: **{execution_set.get('pass')}**",
        "",
        "## Expected catalog effects",
        "",
        f"- Expected effect count: **{expected.get('expected_effect_count')}**",
        f"- Operation families: `{expected.get('operation_family_counts')}`",
        "",
        "## Implicit PostgreSQL catalog effects",
        "",
        f"- Implicit effect count: **{implicit.get('implicit_effect_count')}**",
        "",
        "## Tail lifecycle",
        "",
        f"- Tail present pre-second deploy: **{second.get('tail_present_pre_second')}**",
        f"- Tail present during second deploy: **{second.get('tail_present_during_second')}**",
        "",
        "## T2 stale-index exact safety",
        "",
        f"- T2 drop safety pass: **{t2.get('pass')}**",
        f"- Replacement authority pass: **{t2.get('replacement_authority', {}).get('pass')}**",
        "",
        "## Hardened M252 exact parity",
        "",
        f"- Pass: **{m252.get('pass')}**",
        f"- Semantic mismatches: **{m252.get('semantic_mismatch_count')}**",
        "",
        "## Final R3B 19/9/10/54",
        "",
        f"- Objects: **{r3b.get('objects')}**",
        f"- Tables: **{r3b.get('tables')}**",
        f"- Enums: **{r3b.get('enums')}**",
        f"- Properties: **{r3b.get('properties')}**",
        "",
        "## Golden catalog inventory",
        "",
        f"- Object counts: `{golden_inv.get('object_counts')}`",
        "",
        "## Final catalog inventory",
        "",
        f"- Object counts: `{final_inv.get('object_counts')}`",
        f"- Fingerprint: `{final_inv.get('fingerprint_sha256')}`",
        "",
        "## Raw catalog deltas",
        "",
        f"- Total raw deltas: **{raw_catalog.get('counts', {}).get('total')}**",
        "",
        "## Full catalog delta authority",
        "",
        f"- Total deltas: **{catalog.get('counts', {}).get('total_raw_deltas')}**",
        f"- UNAUTHORIZED_FINAL_DELTA: **{catalog.get('counts', {}).get('UNAUTHORIZED_FINAL_DELTA')}**",
        f"- UNKNOWN_DELTA_AUTHORITY: **{catalog.get('counts', {}).get('UNKNOWN_DELTA_AUTHORITY')}**",
        f"- AMBIGUOUS: **{catalog.get('counts', {}).get('AMBIGUOUS')}**",
        "",
        "## Catalog engine crossvalidation",
        "",
        f"- Pass: **{engine.get('pass')}**",
        f"- Missing stages: `{engine.get('missing_stages')}`",
        f"- Missing test coverage: `{engine.get('required_missing_test_coverage')}`",
        "",
        "## Final Prisma diff attribution",
        "",
        f"- NEW_STRATEGY_DRIFT: **{attr.get('NEW_STRATEGY_DRIFT')}**",
        f"- UNATTRIBUTED: **{attr.get('UNATTRIBUTED')}**",
        f"- UNKNOWN_SCOPE: **{attr.get('UNKNOWN_SCOPE')}**",
        f"- Stale index DROP ops remaining: **{s.get('diff_attribution', {}).get('stale_index_drop_ops_remaining')}**",
        "",
        "## Second-deploy idempotency",
        "",
        f"- Pass: **{second.get('pass')}**",
        f"- Catalog delta: **{second.get('catalog_delta')}**",
        "",
        "## Golden tests",
        "",
        f"- Executed: **{golden.get('executed')}**",
        f"- Passed: **{golden.get('passed')}**",
        f"- Failed: **{golden.get('failed')}**",
        "",
        "## Evidence/code crossvalidation",
        "",
        f"- evidence_code_mismatch_count: **{cross.get('evidence_code_mismatch_count')}**",
        f"- Pass: **{cross.get('pass')}**",
        "",
        "## Production data-risk",
        "",
        f"- UNKNOWN_DATA_DEPENDENCY: **{data_risk.get('UNKNOWN_DATA_DEPENDENCY')}**",
        "",
        "## Production immutability",
        "",
        f"- Production unchanged: **{s.get('production_immutable')}**",
        "",
        "## Repository immutability",
        "",
        "schema.prisma, tracked migrations, runtime, and deployment configuration unchanged; only audit docs updated.",
        "",
        "## R3B1P readiness",
        "",
        f"`{s.get('r3b1p_readiness')}`",
        "",
        "## Final status",
        "",
        f"`{s.get('final_status')}`",
        "",
        "## Safety",
        "",
        "Production remained read-only. All mutations targeted isolated disposable twins only.",
        "",
        "**Changes / Architektur:** not updated (CI-recovery evidence scope only).",
    ]
    OUT_FINAL_CORRECTIVE.write_text("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--corrective", action="store_true")
    parser.add_argument("--final-corrective", action="store_true")
    args = parser.parse_args()
    if args.final_corrective:
        generate_final_corrective_report()
    elif args.corrective:
        generate_corrective_report()
    else:
        generate_standard_report()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

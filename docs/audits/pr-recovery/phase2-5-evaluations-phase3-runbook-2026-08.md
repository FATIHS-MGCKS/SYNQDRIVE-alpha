# Phase 2.5 — Evaluations Phase-3 Runbook

## Branch and PR policy

For each package, create `integration/evaluations-<package-id-lower>-<slug>-2026-08` from the then-current `origin/main`. Every PR targets `main`; do not base a PR on another package branch and do not create all package branches in parallel.

Required PR body: package/change-set IDs, source PRs/commits, architecture decisions, tests, migrations/backfill, security/privacy review, feature flags and rollback.
An implementation PR may begin as draft during active work, but must be non-draft before final review; CI must be green and conflicts resolved. Historical source PRs are closed as superseded only in a later explicitly authorized cleanup phase after replacement evidence is merged.

## Exact execution order

1. `E1` — Foundation & Contracts
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
   - Run: typecheck; shared contract tests; timezone/DST tests; tenant-scope tests.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
2. `E2` — Money & Finance Correctness
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): REIMPLEMENT_ON_CURRENT_MAIN
   - Run: money property tests; finance integration tests; migration dry run; multi-currency reconciliation.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
3. `E3` — Analytics Backend
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
   - Run: repository tests; aggregation/pagination tests; large-dataset tests; tenant tests.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
4. `E4` — Data Quality & Security
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
   - Run: cross-tenant negative tests; RBAC tests; data-quality/freshness tests; PII redaction tests.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
5. `E5` — Core UI
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
   - Run: frontend typecheck; E2E; mobile/visual regression; accessibility/i18n.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
6. `E6` — Recommendations & Actions
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): PORT_PATCH_MANUALLY, RECONSTRUCT_MERGE_RESULT, REIMPLEMENT_ON_CURRENT_MAIN
   - Run: state-machine tests; authorization/idempotency; audit outbox; workflow integration; side-effect safety.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
7. `E7` — Predictive Backend
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): REIMPLEMENT_ON_CURRENT_MAIN
   - Run: point-in-time correctness; future-leakage tests; backtesting/baseline comparison; model release gates; tenant isolation.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.
8. `E8` — Forecast UI & Final Acceptance
   - Fetch and branch from current `origin/main` after all dependencies are merged.
   - Integration method(s): REIMPLEMENT_ON_CURRENT_MAIN
   - Run: full E2E; visual regression; staging smoke; observability verification; release-gate denial tests.
   - Open PR directly against `main`; require clean CI and no conflicts.
   - Merge only after human review; refresh `origin/main` before the next package.

## Migration gate

- Recompute schema diff against current main; never copy a historical migration blindly.
- Validate forward order, clean-database replay, upgrade from current production migration state, backward-compatible deployment order, backfill dry run/idempotency/reconciliation, production volume, lock/index risk and roll-forward strategy.
- Prefer expand/backfill/switch/contract. Do not remove old columns in the same package that introduces their replacement.

## Security and privacy no-go gates

- Authenticated cross-tenant or cross-station access succeeds: `NO-GO`.
- Financial reconciliation mismatch, unconverted mixed-currency sum, missing policy check, unconfirmed material action, PII in logs/metrics, future-data leakage or predictive default-on: `NO-GO`.
- Manual security review is mandatory for finance, PII, driver/customer detail, tenant scope, authorization, export, audit, AI/forecast and recommendation/action change-sets.

## Feature flags

- `VITE_EVALUATIONS_UI_V2=off|shadow|on`, default `off`, optional org allowlist.
- `EVALUATIONS_ANALYTICS_V2_MODE=off|shadow|on`, default `off` until E3 acceptance.
- `EVALUATIONS_RECOMMENDATIONS_MODE=off|shadow|on`, default `off`.
- `EVALUATIONS_IMPACT_MEASUREMENT_ENABLED=false` by default.
- `EVALUATIONS_PREDICTIVE_MODE=off|shadow|on`, default `off`, backend authority plus org allowlist.
- Frontend flags can reduce exposure only; backend gates remain authoritative.

## Final acceptance

E8 requires full authenticated staging, E2E/visual/a11y/i18n, observability, model-release denial/enable paths and rollback smoke. VPS validation occurs only after staging acceptance and an explicit deployment request in a later phase.

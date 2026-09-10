# Internationalization (i18n) — Knowledge Gaps

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **I18N-GAP-001** | Hardcoded-copy enforce-clean remaining | CONFIRMED | **Current read-only scan:** 1,658 of 3,088 in P21–P23 enforce-clean surfaces (MASTER 1,071). **Snapshot (2026-09-07):** 1,661 of 3,091 — see snapshot vs current reconciliation in `CURRENT_STATE.md`. |
| **I18N-GAP-002** | Partial locale dictionaries | CONFIRMED | fr/pl/cs/nl/es/it partial; tr.ts empty (fallback-only official locale) |
| **I18N-GAP-003** | Production per-locale UX validation | UNKNOWN | Read-only structural audit only; no browser probe |
| **I18N-GAP-004** | Missing `hardcoded-copy-guard.test.ts` on main | CONFIRMED | Referenced by `i18n-check.mjs` but file absent from `frontend/` |
| **I18N-GAP-005** | Repo vs Production governance drift | CONFIRMED | #1589 merged on main; not deployed to Production at audit SHA |
| **I18N-GAP-006** | Campaign slice file-by-file re-validation | INFERRED | ~60+ `audit-campaign/architecture/I18N_*` slice docs not fully re-audited in bootstrap |
| **I18N-GAP-007** | `.cursor/rules/i18n.mdc` stale Rental bridge path | CONFIRMED | Rule still mentions removed `frontend/src/rental/i18n/` |
| **I18N-GAP-008** | Backend evaluations metric stale comment | INFERRED | `evaluations-metric.i18n.ts` may reference old rental i18n path in comment |

## Remaining workstreams (evidence-derived)

| Order | Workstream | Objective | Gap | Risk |
|-------|------------|-----------|-----|------|
| 1 | Enforce-clean hardcoded-copy (P21–P23) | Eliminate governed hardcoded UI strings | I18N-GAP-001 | High — blocks PRs on touched enforce-clean files |
| 2 | Master surface migration | Migrate remaining Master admin copy to `t()` keys | I18N-GAP-001 (MASTER bucket) | Medium — large surface area |
| 3 | Partial locale completion | Fill fr/pl/cs/nl/es/it dictionaries vs en | I18N-GAP-002 | Medium — translation quality / review |
| 4 | Turkish owned dictionary | Populate `tr.ts` when product requests | I18N-GAP-002 | Low until product priority |
| 5 | Governance test gap closure | Restore or remove `hardcoded-copy-guard.test.ts` reference | I18N-GAP-004 | Low — CI clarity |
| 6 | Docs/rules sync | Update i18n.mdc and stale comments | I18N-GAP-007/008 | Low |
| 7 | Production deploy catch-up | Deploy main including #1589 governance | I18N-GAP-005 | Medium — ops dependency |
| 8 | AUTHORITY_ACTIVE promotion | Complete bootstrap review + Production UX evidence | I18N-GAP-003 | Governance — blocks canonical routing |

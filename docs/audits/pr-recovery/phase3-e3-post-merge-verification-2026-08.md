# Phase 3 E3 — Post-Merge Verification

Independent verification performed on the ACTUAL merged `main` after the controlled
squash merge of PR #1022.

## 1. Revision identity

- `PRE_MERGE_MAIN_SHA` = `6acdb24eb84986b25789c01fb544645231c53dc5`
- `E3_PR_HEAD_SHA` = `0d10bd0d5a3de2b7bb30a4444880e0d9f20fc17b`
- `E3_MERGE_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f`
- `POST_MERGE_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` (== E3_MERGE_SHA)
- squash parent = `6acdb24eb84986b25789c01fb544645231c53dc5` (exactly one parent = PRE_MERGE_MAIN_SHA)
- source branch retained = YES (`integration/evaluations-e3-money-finance-correctness-2026-08` @ `0d10bd0d`)

## 2. PR merge evidence

- PR #1022 state = MERGED; mergedAt = `2026-08-11T15:09:53Z`
- merge method = squash (normal GitHub merge; `gh pr merge 1022 --squash --delete-branch=false`)
- admin bypass used = NO (`--admin` not used; branch protection honored; merge accepted normally)
- merge commit `cefeedfe` has exactly ONE parent (proves squash ancestry)
- merge diff = 73 files = audited PR diff; no unrelated/surprise files

## 3. E3 scope

Merged content is E3 Money & Finance Correctness only (canonical finance domain,
metric contracts/registry, Financial Insights serving path + adapter,
InsightsCockpit presentation, shared finance, config, tests, docs). No E4–E9 code,
no Prisma migration.

## 4. E1 regression (merged main)

Backend `test:evaluations` includes E1 (metric registry, money, currency/ISO
exponent, SIGNED_PERCENT, period, timezone, status, shared-contract mirror).
Result: PASS. `NEW_POST_MERGE_E1_FAILURE = 0`.

## 5. E2 regression (merged main)

Analytics tenant isolation, station role matrix, worker/subadmin empty, driver,
mixed-station, HTTP security, EntityReference integrity — PASS.
`POST_MERGE_READ_CROSS_TENANT_LEAKAGE_COUNT = 0`,
`POST_MERGE_WRITE_CROSS_TENANT_LEAKAGE_COUNT = 0`,
`POST_MERGE_STATION_SCOPE_ESCALATION_COUNT = 0`.

## 6. Money precision

Backend finance suite (money/fx) PASS. `FLOAT_MONEY_AUTHORITY_COUNT = 0`,
`IMPLICIT_CURRENCY_DEFAULT_COUNT = 0`, `MIXED_CURRENCY_FALSE_AGGREGATION_COUNT = 0`,
`MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE_COUNT = 0`.

## 7. Revenue / Cashflow

July-issued/August-paid separation, partial payment, deposit exclusion, lifecycle —
PASS. `POST_MERGE_ISSUED_REVENUE_CASHFLOW_MIX_COUNT = 0`,
`POST_MERGE_PAID_REVENUE_INVOICE_SUBSTITUTION_COUNT = 0`.

## 8. Receivables

Current outstanding, partial payment, historical fail-closed, overdue, missing
outstanding authority — PASS.
`POST_MERGE_HISTORICAL_RECEIVABLE_FALSE_VALUE_COUNT = 0`,
`POST_MERGE_LEGACY_OUTSTANDING_DERIVATION_COUNT = 0`.

## 9. Result / Margin

Signed margin (+50/-50/-200) and zero-denominator NOT_APPLICABLE — PASS.
`POST_MERGE_NEGATIVE_MARGIN_HIDDEN_COUNT = 0`.

## 10. Multi-Currency

Mixed-without-FX fail-closed; JPY/KWD correct; original preserved — PASS.
`CLIENT/LEGACY_MIXED_CURRENCY_SILENT_DROP_COUNT = 0`.

## 11. Tenant / Station security

Payment→invoice same-tenant; station-scoped finance fail-closed with reason; no org
fallback — PASS.
`POST_MERGE_CROSS_TENANT_FINANCE_READ_LEAKAGE_COUNT = 0`,
`POST_MERGE_CROSS_TENANT_FINANCE_WRITE_LEAKAGE_COUNT = 0`,
`POST_MERGE_STATION_SCOPE_FINANCE_LEAKAGE_COUNT = 0`,
`POST_MERGE_PAYMENT_INVOICE_FOREIGN_RELATION_ACCEPT_COUNT = 0`.

## 12. UI / Render acceptance (real rendered tests)

`InsightsCockpit.render.test.tsx` (UNAVAILABLE → no `0 €`, JPY, KWD, no risk €
card) and `FinancialInsightsView.render.test.tsx` (finance-success/invoice-fail,
finance-fail/invoice-success, USD, station-scoped unavailable) — PASS.
`POST_MERGE_COCKPIT_FALSE_ZERO_COUNT = 0`,
`POST_MERGE_NONCANONICAL_RISK_VISIBLE_AMOUNT_COUNT = 0`,
`POST_MERGE_RAW_INVOICE_CORE_SUPPRESSION_COUNT = 0`,
`POST_MERGE_FINANCE_INVOICE_RECONSTRUCTION_COUNT = 0`.

## 13. Financial risk unit safety

`financialImpactEur()` heuristic removed; no magnitude-based unit guessing; no
noncanonical monetary risk visible (non-monetary count only). Counters = 0.

## 14. Registry ownership

Ownership spec passes: every active finance value metric has a canonical E3 owner;
client-only metrics `active_degraded`. `POST_MERGE_ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## 15. Prisma / build / typecheck (merged main)

Backend `nest build` PASS; frontend build PASS; backend typecheck 4 pre-existing
errors only (0 E3); frontend typecheck PASS; `prisma validate` PASS.

## 16. Baseline classification

Global red gates on merged main are identical to `PRE_MERGE_MAIN_SHA` baseline
(typecheck billing/workflow specs; lint:all; migration/integration P3018; playwright
vehicle-detail; dependency scan). `NEW_POST_MERGE_E3_FAILURE = 0`, `UNKNOWN = 0`.

## 17. No production actions

`PRODUCTION_MIGRATION_PERFORMED = NO`, `PRODUCTION_DATA_BACKFILL_PERFORMED = NO`,
`PRODUCTION_DEPLOYMENT_PERFORMED = NO`. No SSH/VPS/migrate-deploy/restart.

## 18. Historical cleanup = NO

`HISTORICAL_DRAFT_PRS_CLOSED = 0`, `HISTORICAL_BRANCHES_DELETED = 0`.

## 19. E4 = NOT STARTED

`E4_STARTED = NO`.

## 20. Final counters (post-merge)

All of the following = 0: NEW_POST_MERGE_E1_FAILURE, POST_MERGE_READ/WRITE
CROSS_TENANT_LEAKAGE, POST_MERGE_STATION_SCOPE_ESCALATION, FLOAT_MONEY_AUTHORITY,
IMPLICIT_CURRENCY_DEFAULT, MIXED_CURRENCY_FALSE_AGGREGATION,
MONEY_MINOR_EXPONENT_PRESENTATION_FAILURE, POST_MERGE_ISSUED_REVENUE_CASHFLOW_MIX,
POST_MERGE_PAID_REVENUE_INVOICE_SUBSTITUTION,
POST_MERGE_HISTORICAL_RECEIVABLE_FALSE_VALUE, POST_MERGE_LEGACY_OUTSTANDING_DERIVATION,
POST_MERGE_NEGATIVE_MARGIN_HIDDEN, POST_MERGE_COCKPIT_FALSE_ZERO,
POST_MERGE_NONCANONICAL_RISK_VISIBLE_AMOUNT, POST_MERGE_RAW_INVOICE_CORE_SUPPRESSION,
POST_MERGE_FINANCE_INVOICE_RECONSTRUCTION,
POST_MERGE_CROSS_TENANT_FINANCE_READ/WRITE_LEAKAGE,
POST_MERGE_STATION_SCOPE_FINANCE_LEAKAGE,
POST_MERGE_PAYMENT_INVOICE_FOREIGN_RELATION_ACCEPT,
POST_MERGE_ACTIVE_BUT_NOT_CANONICALLY_SERVED, NEW_POST_MERGE_E3_FAILURE, UNKNOWN.

Test evidence: backend `test:evaluations` 431 passed (2 pre-existing tire failures);
backend finance suite 77 passed; frontend finance/render 71 passed / 9 files.

## 21. Final decision

Merge succeeded (normal squash, single parent = pre-merge main, reachable from main,
source branch retained); post-merge E1/E2/E3 + render + security + registry all pass
on merged main; builds/typecheck/prisma pass; only pre-existing baseline reds remain.
Status: **E3_COMPLETED**.

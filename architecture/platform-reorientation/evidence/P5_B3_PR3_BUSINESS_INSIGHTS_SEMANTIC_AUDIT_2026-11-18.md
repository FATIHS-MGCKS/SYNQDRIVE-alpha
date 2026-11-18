# P5-B3-PR3 — Business Insights semantic Master Admin audit (GAP-C3)

**Date:** 2026-11-18 (Europe/Berlin)  
**Base:** `5442db48ea20bbb69003fdf50b35d4999671ead2`

## Audit actions

| Action | Route |
|--------|--------|
| `MASTER_BUSINESS_INSIGHTS_RUN_ALL` | `POST /api/v1/admin/business-insights/run-all` |
| `MASTER_BUSINESS_INSIGHTS_RUN_ORG` | `POST /api/v1/admin/business-insights/run/:orgId` |
| `MASTER_BUSINESS_INSIGHTS_TRIGGER_QUEUED` | `POST /api/v1/admin/business-insights/trigger/:orgId` |
| `MASTER_BUSINESS_INSIGHTS_POLICY_UPDATED` | `PATCH /api/v1/admin/business-insights/policy/:orgId` |

## Outcome semantics

- Debounced trigger audits use `outcome: QUEUED` (never `COMPLETED`).
- Run-all uses `FINISHED` with observable counts (`organizationCount`, `totalPublished`, `orgsWithZeroPublished`); zero per-org publish counts are **not** classified as confirmed partial failure.
- Single-org run: `INSIGHTS_DISABLED` when `runId` empty and `published === 0`; `EXECUTION_UNCERTAIN` when `runId` present with `published === 0` (internal catch vs zero-publish indistinguishable); `EXECUTED` when `published > 0`.
- Semantic audits record `httpStatus` 201 for POST routes and 200 for PATCH (matches Nest defaults; API unchanged).
- Failed handler paths do not emit semantic success audits (PR #2430 failure path unchanged).
- Policy audit stores **field names** only, not full payload values.

## F1/F2 remediation (independent review)

- Removed misleading `PARTIAL` run-all outcome and `EXECUTED` label for `runId` + zero `published`.
- `fireRecord` uses route-method HTTP status instead of hardcoded 200.

## Dedup

`shouldSkipGenericPrivilegedSuccessAudit` extended for the four Business Insights mutation routes.

## Limitations

- Run-all does not infer per-org execution failure from `published === 0` alone.
- Audit recording remains fire-and-forget (not transactionally coupled to insight runs).
- Revoke-all style org enrichment not applicable to run-all (platform-scoped).

**REGISTRY_REVIEWED:** UNCHANGED
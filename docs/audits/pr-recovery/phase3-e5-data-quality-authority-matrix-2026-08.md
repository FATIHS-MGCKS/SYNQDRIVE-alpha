# Phase 3 – E5 Data-Quality / Freshness / Lineage Authority Matrix (2026-08)

Base main SHA: `960365a9b095a54f4656947ac2067a104e56bd8a` (E4 merge). E5A layers quality
governance around the E1–E4 truths without becoming a second calculation engine
(`PARALLEL_QUALITY_TRUTH_COUNT = 0`).

## Reused authorities (do not fork)

| Concern | Owner (current main) | File | E5A usage |
|---|---|---|---|
| Metric status (AVAILABLE/PARTIAL/STALE/UNAVAILABLE/ERROR/NOT_APPLICABLE) | E1 metric-response contract | `shared/evaluations-metrics/evaluations-metric-response.contract.ts` | E5 quality never upgrades status |
| Source freshness shape (`newestSourceAt`, `oldestSourceAt`, `lastSuccessfulImportAt`, `evaluatedAt`, `state` ∈ FRESH/STALE/UNKNOWN/ERROR) | E1 `EvaluationsSourceFreshness` | same | E5 freshness reuses this exact contract |
| Data coverage (`expectedRecords`, `availableRecords`, `excludedRecords`, `ratio`, `missingSources`) | E1 `EvaluationsDataCoverage` | same | E5 coverage reuses this; conservative aggregation |
| Period / timezone (`[start,endExclusive)`, reference) | E1 `resolveEvaluationsPeriod` | `evaluations-period.resolver.ts` | E5 uses `scope.period` |
| Tenant + station scope | E2 `EvaluationsAnalyticsScopeService` | `evaluations-analytics-scope.service.ts` | E5 resolves scope via E2; station fail-closed |
| Finance provenance / Money | E3 `EvaluationsFinanceService` | `evaluations-finance.service.ts` | E5 lineage references E3 finance source class; never recomputes |
| E4 section coverage / status / reason / generatedAt / calculationVersion | E4 `EvaluationsInsightsService` sections | `e4/contracts/evaluations-insights.contract.ts` | E5 consumes E4 section metadata as the quality substrate |

## Source → freshness timestamp authority (E5A)

| Source class | source model | freshness timestamp (newestSourceAt) | business/effective timestamp | ingestion timestamp | authority reason |
|---|---|---|---|---|---|
| FINANCE (invoices) | `OrgInvoice` (incoming/outgoing) | max(`invoiceDate`, `issuedAt`, `paidAt`) in period scope | `invoiceDate ?? issuedAt` | `createdAt` | E3 expense/revenue business time; not createdAt |
| BOOKINGS | `Booking` | max(`completedAt`, `cancelledAt`, `startDate`) | lifecycle timestamp | `createdAt` | booking lifecycle is the business time |
| MAINTENANCE | `ServiceCase` | max(`completedAt`, `downtimeEnd`) | `completedAt` | `createdAt` | realized service time |
| DAMAGE | `VehicleDamage` | `repairedAt` | `repairedAt` | `createdAt` | realized repair time |
| TELEMETRY | `VehicleLatestState` | `lastSeenAt` (CURRENT snapshot only) | n/a | `providerFetchedAt` | current snapshot; NEVER a historical period freshness fact |

## Quality dimensions (no global 0–100 score)

Distinct dimensions (`UNSUPPORTED_GLOBAL_QUALITY_SCORE_COUNT = 0`): `FRESHNESS`,
`COMPLETENESS` (coverage), `PROVENANCE` (lineage present + source authority),
`VALIDITY` (source status not ERROR), `TEMPORAL_APPLICABILITY` (period vs
current-snapshot correctness). Aggregation is conservative: a section is only
`COMPLETE` when every material dimension is complete; any PARTIAL/UNKNOWN
dimension keeps the section PARTIAL.

## Lineage model (tenant-safe)

Each quality output exposes: result section → source category → opaque source
reference (never raw PII/content) → effective timestamp → calculationVersion →
quality reason. Lineage is data access: it is tenant-scoped (E2) and never emits
cross-tenant or out-of-station source references
(`CROSS_TENANT_LINEAGE_LEAKAGE_COUNT = 0`, `STATION_LINEAGE_SCOPE_LEAKAGE_COUNT = 0`).

## Audit authority (E5C)

Sensitive person-level access is audited via the **canonical** `BusinessAudit`
durable outbox (`backend/src/modules/business-audit/`), reused (not forked):
`EvaluationsAuditService` extends the canonical action taxonomy with
`EVALUATIONS_PERSON_ANALYTICS_ACCESSED`/`_DENIED` + entity type
`EVALUATIONS_DRIVER_ANALYTICS` and records non-PII metadata only.
`PARALLEL_AUDIT_TRUTH_COUNT = 0`.

## Boundaries

E5 implements Quality/Freshness/Lineage/Coverage (E5A), Privacy & Authorization
(E5B), and Auditability (E5C). Roles/Permissions reuse existing platform RBAC +
E5B PII tiers (no bespoke evaluations RBAC matrix). No E6–E9.

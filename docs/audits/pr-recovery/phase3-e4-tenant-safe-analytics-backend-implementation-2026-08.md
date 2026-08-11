# Phase 3 – E4 Tenant-Safe Analytics Backend — Implementation Report (2026-08)

## Revision

- `E4_BASE_MAIN_SHA` = `cefeedfe7dcfd7f682ba5b80fad1fec37d4a6c0f` (E3 merge #1022; still main HEAD; `merge-base --is-ancestor` PASS)
- Branch = `integration/evaluations-e4-tenant-safe-analytics-backend-2026-08` (direct from current main)
- `TESTED_CODE_SHA` = `4f5d20d0cfa2570c6f5b2c3d4385e31d86b37902`
- Historical source refs (EVIDENCE ONLY — not cherry-picked): #773 `e65b88db` (summary), #780 `d96ba7a8` (cost), #782 `46f533af` (utilization), #783 `f5cfe0c5` (strength), #784 `32714750` (weakness), #786 `56b9efe2` (driver)

## Reconstruction

See `phase3-e4-source-reconstruction-matrix-2026-08.csv`. Each historical commit was inspected with `git show` and classified per file/hunk. The historical stack was built on a `business-insights` summary that recomputed finance directly, an EUR-only money filter, snapshot fleet utilization, DQ/recommendation leakage, and magnitude-based financial exposure. All of these were classified `REIMPLEMENT_FOR_CURRENT_ARCHITECTURE` / `SECURITY_UNSAFE` / `E5_SCOPE` / `E7_SCOPE` and reconciled against E1–E3. Intent reused: metric identities, formulas, interval semantics, evidence-gate thresholds, driver disclaimer/confounders.

## Canonical Architecture

One orchestration authority (`EvaluationsInsightsService`). Serving path: request → E2 `resolveAuthorizedScope` → E1 period → `EvaluationsInsightsService` → E3 finance + E4 capability builders → tenant-scoped repositories → E1-compatible section envelopes. `PARALLEL_ANALYTICS_TRUTH_COUNT = 0`.

## Analytics Summary

- Endpoint: `GET /organizations/:orgId/evaluations/analytics/insights/summary` (under the existing analytics namespace; guards `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`, `EvaluationsAnalyticsFeatureGuard`; permission `evaluations:read`). No `/analytics-v2`.
- Composes finance (E3-delegated), cost, utilization, strengths, weaknesses, driver influence.
- E2 scope + E1 period reused verbatim. Section failure isolation: each section is independently AVAILABLE/PARTIAL/UNAVAILABLE/ERROR; a failing section never zeroes others (`isolateAsync`/`isolate`).
- Finance delegation only (no invoice/payment re-query in E4). `E4_FINANCE_REIMPLEMENTATION_COUNT = 0`. No `estimatedFinancialExposure` / `financialImpactEur` (`UNSAFE_FINANCIAL_EXPOSURE_REINTRODUCTION_COUNT = 0`).

## Cost Model

- Categories: `OPERATING_EXPENSES` (incoming invoices, ACTUAL), `UNPLANNED_MAINTENANCE` (ServiceCase REPAIR/DIAGNOSTIC actualCostCents, ACTUAL), `DAMAGE_REPAIR` (VehicleDamage repairCostCents, ACTUAL), `ESTIMATED_FIXED_COSTS` (per-vehicle leasing/insurance/tax pro-rated, ESTIMATED). See `phase3-e4-cost-source-authority-matrix-2026-08.csv`.
- ACTUAL vs ESTIMATED explicit; each category carries formula + sources. Fixed-cost estimate is allowed only because it derives from explicit per-vehicle tenant config; no fabricated constants (`UNPROVEN_COST_ESTIMATE_COUNT = 0`).
- Money: per-currency BigInt aggregation via E1/E3 helpers. No float; no blended cross-currency total (mixed currency → PARTIAL, segmented). No implicit EUR (`COST_FLOAT_MONEY_COUNT`/`COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT`/`COST_IMPLICIT_CURRENCY_COUNT` = 0).
- Double-count protection: economic-key dedup (`extraction:*` shared invoice↔damage; OrgTask-linked invoice key for service cases); invoice fact wins (`COST_DOUBLE_COUNT_COUNT = 0`).
- Period: business timestamp per source (invoiceDate/createdAt, completedAt, repairedAt); no future leak. Formula version `cost-model-e4-v1`.
- Station: no station lineage → station scope UNAVAILABLE, never org fallback (`COST_STATION_ORG_FALLBACK_COUNT = 0`).

## Utilization

- Formula: `utilization = Σ rentedEffective / Σ netCapacity`, `netCapacity = eligibleCapacity − downtime`, `rentedEffective = rented − downtime` (clipped to eligibility & period). Time-weighted, not snapshot. Version `utilization-model-e4-v1`; served metric `ops.fleet_utilization_pct`.
- Interval clipping to `[period.start, period.endExclusive)`; overlapping rentals unioned (`OVERLAPPING_INTERVAL_DOUBLE_COUNT_COUNT = 0`); ratio ≤ 1 by construction (`UTILIZATION_OVER_100_COUNT = 0`).
- Rented time = ACTIVE/COMPLETED bookings only (reserved/cancelled/no-show excluded). Maintenance/blocked from ServiceCase downtime (`blocksRental`); available ≠ ready-to-rent (`AVAILABLE_READY_CONFLATION_COUNT = 0`).
- Telemetry offline is counted informationally only, never downtime (`TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT = 0`).
- DST: capacity is real elapsed ms of the period (23h/25h days handled). Station history unavailable → station-scoped utilization fails closed (`CURRENT_STATION_RETROACTIVE_HISTORY_COUNT = 0`). Denominator zero / missing lineage → UNAVAILABLE (no manufactured %).

## Strength Detection

- Rules: `HIGH_UTILIZATION` (ORG_TARGET ≥70%), `REVENUE_GROWTH` (PREVIOUS ≥+5%), `LOW_CANCELLATION_RATE` (ORG_TARGET ≤10%, ≥10 outcomes). Each carries ruleId/version/comparatorBasis/evidence/threshold/dimension. Version `strength-detection-e4-v1`.
- Evidence gates (min vehicles, coverage, comparator baseline, min outcomes) → insufficient evidence emits nothing (`STRENGTH_INSUFFICIENT_EVIDENCE_COUNT = 0`). Deterministic ordering + dedup.

## Weakness Detection

- Rules: `UNDERUTILIZATION` (<40%), `DECLINING_REVENUE` (≤−5%), `LOW_MARGIN` (<10%), `HIGH_CANCELLATION_RATE` (>10%). Severity from gap (INFO/WARNING/CRITICAL). Version `weakness-detection-e4-v1`.
- All evidence is OBSERVATION (no ESTIMATE/FORECAST) → E8 not implemented (`E8_FORECAST_IMPLEMENTATION_LEAK_COUNT = 0`). No weakness from missing/zero-from-unavailable/tiny sample (`WEAKNESS_INSUFFICIENT_EVIDENCE_COUNT = 0`). No recommendations (`E7_ACTION_SCOPE_LEAK_COUNT = 0`).
- Reconciliation: disjoint thresholds + assertion → no strength/weakness contradiction (`STRENGTH_WEAKNESS_CONTRADICTION_COUNT = 0`, `DUPLICATE_DETECTION_COUNT = 0`).

## Driver Influence

- Association-only decomposition over parent evidence (attributed counts); never recomputes parent KPIs (`DRIVER_PARENT_KPI_REIMPLEMENTATION_COUNT = 0`). Version `driver-influence-e4-v1`.
- Scope = parent scope (station-scoped parent → driver UNAVAILABLE, `DRIVER_SCOPE_MISMATCH_COUNT = 0`). Driver refs are org-scoped Customer ids from org-scoped rows (`CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT = 0`). Sample gate (min per-driver + min dimension total) → insufficient omitted (`DRIVER_INSUFFICIENT_SAMPLE_RESULT_COUNT = 0`). Disclaimer + confounders; ASSOCIATED_WITH/CORRELATES_WITH only (`DRIVER_CAUSAL_CLAIM_COUNT = 0`). Permission fail-closed via existing `evaluations:read` + E2 scope.

## Tenant Security / Station Scope

- Every repository query carries explicit `organizationId`; payment defense-in-depth pattern reused. `CROSS_TENANT_ANALYTICS_READ_LEAKAGE_COUNT = 0`.
- Requested station scope authorized by E2 (narrows, never widens). Station scope with insufficient lineage fails closed / PARTIAL; never org fallback (`STATION_SCOPE_ANALYTICS_LEAKAGE_COUNT = 0`, `ORG_FALLBACK_ON_STATION_SCOPE_COUNT = 0`).
- No cache introduced (no cross-tenant/cross-station reuse risk).

## E1 / E2 / E3 Integration

- E1: metric-response builders + status + period + registry reused; utilization served metric uses registry `calculationVersion`.
- E2: `EvaluationsAnalyticsScopeService.resolveAuthorizedScope` sole scope authority.
- E3: `EvaluationsFinanceService.computeFinancialInsights` sole finance authority (delegated).

## Registry

- `ops.fleet_utilization_pct` → `active_degraded` (served org-scope, station-scope fail-closed). Registry version 1.4.0 → 1.5.0.
- `ops.strengths_count` / `ops.weaknesses_count` remain `planned` (E4 serves rule-based sections, not the count metric responses). Cost KPIs are section-local envelopes (own `cost-model-e4-v1` version), not registry metrics. `ACTIVE_BUT_NOT_CANONICALLY_SERVED = 0`.

## Performance

- Bounded, aggregated queries: cost/utilization/driver each use a small fixed number of `findMany`/`count` calls bounded by the period window and `organizationId`; no per-vehicle/per-driver N+1 loops. Booking outcomes use `count`. Domain aggregation is O(records). No unbounded historic scans (all filtered by period window).

## Residual Limitations

- Station-scoped cost/utilization/driver are fail-closed (schema lacks continuous vehicle→station history and station-attributed cost) — correct per policy, but limits station drill-down until lineage exists.
- Revenue-growth strength/weakness only emit when the E3 finance metric carries a previous-period comparison; current E3 responses omit comparison, so those rules stay evidence-gated silent in production (safe).

## Explicit Deferrals (E5–E9)

- E5 Data Quality, E6 UI, E7 Recommendations/Actions, E8 Prediction/Forecast, E9 Forecast UI — NOT started. E4 exposes only local section coverage and association-only observations.

## E4.1A — Tenant Integrity & Driver Attribution Hardening (2026-08-11)

`TESTED_CODE_SHA` = `d398c116ea4bd35acea591bcc78a5bdc3a812fa3` (base `PRE_E4_1A_HEAD` = `0dad3e73`). No schema change.

Independent-audit defects fixed on the E4 branch:

- **Customer-as-driver removed.** `loadDriverObservations` no longer uses `assignedDriverId ?? customerId`. The contract customer is never the driver; a booking without an assigned driver is UNATTRIBUTED (`CUSTOMER_AS_DRIVER_FALLBACK_COUNT = 0`). See `phase3-e4-driver-attribution-authority-matrix-2026-08.md` for role classification (CONTRACT_CUSTOMER / AUTHORIZED_DRIVER / ASSIGNED_DRIVER / ACTUAL_DRIVER kept distinct) and the priority (DriverAttribution → validated same-tenant assignedDriver → UNATTRIBUTED). Trip-level `DriverAttribution` integration is deferred to E4.1B.
- **Same-tenant driver defense.** `Booking.organizationId` does not prove the assigned driver's tenant; the nested `assignedDriver.organizationId` is validated (nested select), so a foreign driver is dropped with no id/name/reference leak (`CROSS_TENANT_DRIVER_ANALYSIS_LEAK_COUNT = 0`). Unattributed events are reported (coverage `excludedRecords`) and never redistributed.
- **Damage attribution.** `VehicleDamage.customerId` (liable contract party) is no longer used as actual driver; damage stays UNATTRIBUTED for driver analytics while still feeding non-driver cost analytics.
- **Task→Invoice tenant integrity.** The cost-dedup path now requires the linked invoice to belong to the same organization (nested `invoice.is.organizationId` predicate + in-code guard) before it can affect economic dedup/suppression, so a foreign invoice cannot suppress or alter legitimate ORG_A cost facts (`CROSS_TENANT_COST_RELATION_ACCEPT_COUNT = 0`).
- **Nested relation audit.** Added nested `vehicle.is.organizationId` predicates to the utilization booking and cost damage queries. `ServiceCase` exposes only a `vehicleId` scalar (no relation object) — tenant safety there rests on its own `organizationId` plus the downstream vehicle map-join (foreign `vehicleId` dropped). Full matrix in `phase3-e4-1-correction-authority-matrix-2026-08.csv`.
- **No N+1.** All hardening uses nested relational predicates / map-joins, not per-row validation queries.
- **Real PostgreSQL adversarial tests.** Added `evaluations-insights.tenant-integrity.integration.spec.ts` + harness (env-gated `EVALUATIONS_E4_POSTGRES_INTEGRATION=1`, DB-probed) planting cross-tenant relations (ORG_A booking→ORG_B driver, ORG_A task→ORG_B invoice, ORG_A booking→ORG_B vehicle) and asserting no leakage against a live database. Mocked-repository coverage retained for the always-run suite.

Details and counters: `phase3-e4-1a-tenant-driver-integrity-test-report-2026-08.md`.

## E4.1B — Cost Source Authority & Historical Correctness (2026-08-11)

`TESTED_CODE_SHA` = `c6d93ea9e77312672fa069df721a3ea9fd188d6b` (base `PRE_E4_1B_HEAD` = `9a768fe6`). No schema change. Cost `calculationVersion` bumped `cost-model-e4-v1` → `cost-model-e4-v2` (material change: source set, currency semantics, periodicity, historical accrual, dedup).

Provenance-driven narrowing of the authoritative cost model (see `phase3-e4-cost-source-authority-matrix-2026-08.csv`):

- **Only `OrgInvoice` (incoming expense) is an authoritative Money cost source** — it carries an explicit per-row `currency`. Each event uses that concrete currency.
- **ServiceCase.actualCostCents / VehicleDamage.repairCostCents currency is UNPROVEN** — no currency column exists in the schema, write-path, or docs. They are no longer denominated in the organization's *current* reporting currency (that would be retroactive) and are excluded from the authoritative total (`UNPROVEN_COST_CURRENCY_ACCEPT_COUNT = 0`).
- **Fixed costs (leasing/insurance/tax) periodicity is UNPROVEN** — no periodicity annotation, no currency column (the sole consumer, `vehicle-file-summary`, hardcodes `EUR`/monthly for display only), and no effective-date/version history. The fake `monthlyAmount * periodMs / 30d` accrual is removed; fixed costs are excluded from authoritative accrual (`UNPROVEN_COST_PERIODICITY_ACCEPT_COUNT = 0`, `CURRENT_COST_CONFIG_RETROACTIVE_HISTORY_COUNT = 0`, no fake 30-day month).
- **Unsupported categories are reported, not hidden.** `loadUnsupportedCostSources` counts ServiceCase/Damage/fixed-config records that exist in the period; the section lists them as `UNAVAILABLE` categories with explicit reasons (`SERVICECASE_COST_CURRENCY_UNPROVEN`, `DAMAGE_COST_CURRENCY_UNPROVEN`, `FIXED_COST_PERIODICITY_AND_HISTORY_UNPROVEN`) and downgrades the section to **PARTIAL** (STEP 12) — never a false zero, never "AVAILABLE pretending the model is complete".
- **Status semantics:** authoritative invoice cost + unsupported records → `PARTIAL`; mixed currency → `PARTIAL` (segmented, no false blended total); only-unsupported sources → `UNAVAILABLE` (`COST_SOURCES_UNSUPPORTED`); no source at all → `UNAVAILABLE` (`NO_COST_SOURCE`).
- **No invented estimates** — no depreciation / insurance / maintenance-% / per-vehicle constants (`UNPROVEN_COST_ESTIMATE_COUNT = 0`). Money safety preserved (BigInt, explicit currency, per-currency segmentation; `COST_FLOAT_MONEY_COUNT`/`COST_MIXED_CURRENCY_FALSE_TOTAL_COUNT`/`COST_IMPLICIT_CURRENCY_COUNT = 0`). Station scope still fails closed (`COST_STATION_ORG_FALLBACK_COUNT = 0`).
- **Cost≠all E3 expenses** preserved: only defined categories enter the model; an incoming invoice maps to `OPERATING_EXPENSES`, nothing silently added.
- **Double-count & tenant safety:** because recorded costs are no longer aggregated, the Task→Invoice cost-suppression surface is eliminated (supersedes the E4.1A guard by removal); `COST_DOUBLE_COUNT_COUNT = 0`, `CROSS_TENANT_COST_RELATION_ACCEPT_COUNT = 0`. Re-validated by the real-Postgres adversarial spec.

Details and counters: `phase3-e4-1b-cost-source-historical-correctness-test-report-2026-08.md`.

## E4.1C — Utilization, Detection Semantics & Final E4.1 Acceptance (2026-08-11)

`TESTED_CODE_SHA` = `ce9dfaeb4be75788825609962ba76fa02aa6b04d` (base `PRE_E4_1C_HEAD` = `ee1c145a`; A `d398c116` + B `c6d93ea9` confirmed ancestors). No schema change.

- **No false-zero utilization.** All `EvaluationsUtilizationSection` numeric fields are `number | null`. UNAVAILABLE (station scope) and ERROR emit `null` for every unobserved quantity (`capacityMs/rentedMs/maintenanceMs/blockedMs/netCapacityMs/eligibleVehicles/overlappingBookingPairs/telemetryOfflineVehicles`) — never `0` (`FALSE_ZERO_ANALYTICS_COUNT = 0`). ERROR ≠ empty fleet.
- **PARTIAL preserved.** The metric `ops.fleet_utilization_pct` is served as `PARTIAL` (value + coverage) via `buildPartialEvaluationsMetric`; there is no PARTIAL→AVAILABLE upgrade (`PARTIAL_TO_AVAILABLE_STATUS_UPGRADE_COUNT = 0`). Utilization is structurally coverage-limited on current main so it is never `AVAILABLE`.
- **Blocked is unknown, not zero.** No authoritative historical vehicle blocked/hold/status-history source exists (only `ServiceCase` downtime, already bound to maintenance). `blockedMs` is always `null`; the fabricated `blocked: []`→`blockedMs=0` is gone (`SYNTHETIC_BLOCKED_ZERO_COUNT = 0`). Proven by a repository-adapter test (ServiceCase downtime → maintenance; blocked stays empty/unknown).
- **Eligibility not overstated.** `vehicle.createdAt → period.end` does not prove continuous rental eligibility; coverage `missingSources` includes `VEHICLE_ELIGIBILITY_HISTORY` and the section is coverage-limited (`UNPROVEN_ELIGIBILITY_FULL_COVERAGE_COUNT = 0`). Current state is never applied retroactively (`CURRENT_STATION_RETROACTIVE_HISTORY_COUNT = 0`, `CURRENT_ELIGIBILITY_STATE_RETROACTIVE_HISTORY_COUNT = 0`).
- **Scheduled ≠ actual.** `rentedMs` is SCHEDULED occupancy (booking start/end), not actual possession; the section carries `occupancyBasis: 'SCHEDULED'` and `missingSources: ['SCHEDULED_OCCUPANCY_NOT_ACTUAL', …]` (no BookingHandoverProtocol actual-possession reconstruction on current main). No calculation claims actual rented utilization.
- **Platform-rule thresholds.** Fixed detection constants (0.70 / 0.40 / 0.10 / 10%) are labeled `PLATFORM_RULE_THRESHOLD`, never `ORGANIZATION_TARGET` (no tenant target config exists): `FAKE_ORGANIZATION_TARGET_COUNT = 0`. Previous-period rules keep `PREVIOUS_COMPARABLE_PERIOD`.
- **Telemetry / available≠ready invariants preserved** (`TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT = 0`, `AVAILABLE_READY_CONFLATION_COUNT = 0`); interval clip/overlap/DST unchanged (`OVERLAPPING_INTERVAL_DOUBLE_COUNT_COUNT = 0`, `UTILIZATION_OVER_100_COUNT = 0`).
- **Calculation versions bumped** for material changes: utilization `utilization-model-e4-v1 → v2`; strength `strength-detection-e4-v1 → v2`; weakness `weakness-detection-e4-v1 → v2`; registry `ops.fleet_utilization_pct` `1.0.0 → 2.0.0` (mirrored in the shared calc-version resolver) and registry version `1.5.0 → 1.6.0`.

Full acceptance, calc-version review, and final counters: `phase3-e4-1-final-source-authority-analytics-acceptance-2026-08.md`.

## E4.2 — Detection Coverage & Temporal Signal Correction (2026-08-11)

`TESTED_CODE_SHA` = `f11b56d859bedcfdaf38ad189b76f52373464335` (base `PRE_E4_2_HEAD` = `f25b1d72`). No schema change.

- **PARTIAL input never becomes fully AVAILABLE detection evidence.** Each detection dimension is evaluated only when its source is `AVAILABLE`: FINANCE (E3 finance AVAILABLE), UTILIZATION (utilization AVAILABLE — structurally PARTIAL on current main, so skipped), BOOKINGS (org-scope only). A PARTIAL/UNAVAILABLE source dimension is skipped with a recorded reason (`PARTIAL_INPUT_TO_AVAILABLE_DETECTION_COUNT = 0`). Per-rule input authority: `phase3-e4-detection-input-authority-matrix-2026-08.csv`.
- **Honest section coverage.** Strength/Weakness sections expose `evaluatedDimensions` + `skippedDimensions` and roll up to `PARTIAL` when any configured dimension is skipped (never a silent upgrade): `DETECTION_COVERAGE_STATUS_UPGRADE_COUNT = 0`. An empty result with a skipped dimension stays `PARTIAL` — it never implies "everything was checked" (`FALSE_COMPLETE_EMPTY_DETECTION_COUNT = 0`).
- **Current telemetry is not a historical fact.** `latestState.online` is a current snapshot. The section now carries `telemetrySnapshotAsOf`; `telemetryOfflineVehicles` is surfaced only for a live/current period (period still includes "now") and is `null` for a historical period (`CURRENT_TELEMETRY_AS_HISTORICAL_FACT_COUNT = 0`). It never enters utilization/downtime math (`TELEMETRY_OFFLINE_DOWNTIME_MISCLASS_COUNT = 0`).
- **Summary preserves child detection status.** Strength/Weakness PARTIAL propagate into the summary with no upgrade (`SUMMARY_DETECTION_STATUS_UPGRADE_COUNT = 0`, `SUMMARY_DIRECT_ENDPOINT_MISMATCH_COUNT = 0`).
- **Calc versions bumped** for the material detection change: strength `v2 → v3`, weakness `v2 → v3` (rule set unchanged; input-authority/coverage semantics changed). No unrelated metric bumped; detection is section-local (no registry metric), so registry version is unchanged.
- **Stale comments corrected** (E4.1B cost currency behavior; fixed-cost formula).

Details, calc-version review, and recomputed counters: `phase3-e4-2-detection-coverage-temporal-signal-test-report-2026-08.md`.

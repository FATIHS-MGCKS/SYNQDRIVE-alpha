# Operational Issue Normalization

Status: Prompt 1 audit baseline
Date: 2026-06-25
Scope: user-facing operative hints, actions, reasons, health alerts, service alerts, dashboard insights, predictive insights, misuse/damage hints, finance/booking hints.

This document is the binding baseline for the next implementation prompts. It intentionally does not implement a normalizer, migrate UI surfaces, delete legacy helpers, or change KPI/count logic. It defines the canonical taxonomy, semantic keys, source priority, visibility rules, label rules, and rollout plan.

## Prompt 2 Implementation Baseline

Status: implemented as an isolated frontend library, without UI migration.

Implemented files:

- `frontend/src/rental/lib/operational-issues/operationalIssueTypes.ts`
- `frontend/src/rental/lib/operational-issues/operationalIssueKeys.ts`
- `frontend/src/rental/lib/operational-issues/operationalIssueLabels.ts`
- `frontend/src/rental/lib/operational-issues/operationalIssueSources.ts`
- `frontend/src/rental/lib/operational-issues/operationalIssueVisibility.ts`
- `frontend/src/rental/lib/operational-issues/normalizeOperationalIssues.ts`
- `frontend/src/rental/lib/operational-issues/index.ts`
- `frontend/src/rental/lib/operational-issues/operationalIssues.test.ts`

Final export path:

```ts
import {
  normalizeOperationalIssues,
  createVehicleIssueKey,
  formatVehicleIssueEntityLabel,
  sanitizeUserFacingIssueText,
  getDefaultOperationalIssueVisibility,
  choosePrimaryIssueSource,
} from '@/rental/lib/operational-issues';
```

Final implemented type names:

- `OperationalIssueDomain`
- `OperationalIssueSeverity`
- `OperationalIssueSourceType`
- `OperationalIssue`
- `OperationalIssueSource`
- `OperationalIssueEvidence`
- `OperationalIssueVisibility`
- `OperationalIssueNormalizationInput`
- `OperationalIssueNormalizerOptions`

Implemented normalizers in Prompt 2:

- `VehicleRuntimeState` / `RuntimeReason` normalizer for service/compliance, battery, tires, brakes, DTC, health fallback, telemetry, cleaning, rental readiness and damage suspicion categories.
- `DashboardInsight` normalizer for `SERVICE_OVERDUE`, `SERVICE_WINDOW`, `BATTERY_CRITICAL`, `TIRE_CRITICAL`, `BRAKE_CRITICAL`, `PICKUP_OVERDUE`, `RETURN_OVERDUE` and `RETURN_NEEDS_INSPECTION`.
- Predictive normalizer foundation for `SERVICE_WINDOW`, `SOFT_OFFLINE_TELEMETRY_CHECK`, `RETURN_OVERDUE_THREATENS_FOLLOWUP` and `STATION_SHORTAGE_24H`.
- Semantic-key merge with source-priority primary selection and supporting source preservation.
- Service rule: `service_window_available` is merged into/suppressed behind `service_overdue` for the same vehicle.
- User-facing label sanitization for technical source IDs and raw source strings.
- Entity label formatting for vehicles, plus booking/customer/invoice helper foundations.

Known sources not fully normalized yet:

- `VehicleHealthAlert.modules[]` and the existing ActionQueue module child actions.
- Derived operational insights beyond the current predictive foundation.
- Concrete service/damage/booking task objects.
- MisuseCase and TripBehaviorEvent objects.
- Damage cases and confirmed damage records.
- Finance invoice rows beyond the type/label foundation.
- Documents / requirements objects.

## Prompt 3 Implementation Baseline

Status: ActionQueue / Dashboard Attention now consumes `OperationalIssue[]` first.

Implemented changes:

- `frontend/src/rental/components/dashboard/actionQueueBuilder.ts`
  - `buildUnifiedActionQueue` now calls `normalizeOperationalIssues(...)` first.
  - It filters normalized issues by `visibility.dashboardAttention === true`.
  - It maps each issue through `mapOperationalIssueToActionQueueItem(issue)`.
  - RuntimeReasons/VehicleRuntimeState, VehicleHealthAlerts, supported DashboardInsights and supported PredictiveInsights no longer push parallel direct actions.
  - Legacy fallback remains only for sources not yet fully normalized: unsupported DashboardInsights, pickup/return handover rows that need existing confirm callbacks, notifications, derived insights, and unsupported predictive insights.
- `frontend/src/rental/components/dashboard/ActionQueue.tsx`
  - predictive `sourceData` is no longer rendered in normal row meta.
- `frontend/src/rental/components/dashboard/actionQueueGrouping.ts`
  - continues grouping atomic items, but now receives semantic OperationalIssue-backed `groupKey`/`semanticKey` from ActionQueueItems.
- `frontend/src/rental/components/dashboard/dashboardTypes.ts`
  - `ActionQueueItem.semanticKey?: string` added for normalized items.
- `frontend/src/rental/DashboardInsightsContext.tsx`
  - `RETURN_OVERDUE` added to the insight type union so return-overdue insights can be normalized.
- `frontend/src/rental/lib/operational-issues/normalizeOperationalIssues.ts`
  - now also normalizes `VehicleHealthAlert.modules[]`.
  - suppresses generic `health_review_required` when a concrete module issue exists for the same vehicle.
  - creates telemetry issues directly from `VehicleRuntimeState.telemetryState` for `soft_offline` and `offline`; `standby` remains non-action.

Prompt 3 rules now implemented:

- Service Overdue + `SERVICE_OVERDUE` + `SERVICE_WINDOW` + predictive Service Window becomes one visible `service_overdue` action for a vehicle.
- Service Window remains visible only when no stronger service-overdue issue exists.
- `reason.source`, `debugLabel`, raw insight type and predictive `sourceData` are not normal row title/subtitle/meta.
- Vehicle entity labels use the central formatter: `{license} · {make} {model} {year}` when data exists.
- Standby does not create an Attention action.
- Soft Offline creates at most one Attention action without `stale` wording.
- Finance and Return issues remain distinct domains/items.

Known sources still intentionally legacy after Prompt 3:

- Pickup/return tile items that need existing `handleConfirmPickup` / `handleConfirmReturn` callbacks.
- Notifications (until a canonical notification feed exists).
- DerivedOperationalInsights beyond the current normalizer scope.
- Unsupported PredictiveOperationalInsights.
- Concrete service/damage/booking task objects.
- MisuseCase and TripBehaviorEvent objects.
- Damage cases and confirmed damage records.
- Finance invoice rows beyond current dashboard-insight fallback.
- Documents / requirements objects.

## Prompt 4 Implementation Baseline

Status: dashboard/fleet-facing labels now use the central user-facing reason formatter.

Implemented changes:

- `frontend/src/rental/lib/operational-issues/operationalIssueLabels.ts`
  - added `formatUserFacingReasonLabel(reasonOrIssue, locale)`.
  - source-only, enum-like and generic health strings no longer become normal labels.
  - source/category/issueType fallback maps to user-facing labels such as `Service überfällig`, `Fehlercodes prüfen`, `Reifen beobachten`, `Batterie prüfen`, `Servicefenster verfügbar`, `Health prüfen`.
- `frontend/src/rental/components/dashboard/reasonDisplay.ts`
  - `formatRuntimeReasonLabel` now delegates to the central formatter.
  - dedupe now uses the formatted visible label, not raw title/source text.
- `frontend/src/rental/components/dashboard/DashboardDrilldownDrawer.tsx`
  - row title/subtitle/meta are sanitized before rendering.
  - reason pills continue to show max 2 visible labels with `+x Gründe`.
  - technical source remains tooltip/debug-only.
- `frontend/src/rental/components/dashboard/FleetBoardVehicleRow.tsx`
  - deprecated board row also sanitizes title/subtitle/meta and reason labels.
- `frontend/src/rental/lib/fleetVehicleDisplay.ts`
  - Fleet Command reason badges use central formatting/sanitizing.
  - `Critical vehicle health` / `Warning health status` do not win as concrete reasons.
  - generic `criticalHint` passthrough is suppressed unless the candidate reason is concrete.
- `frontend/src/rental/components/fleet-operator/FleetOperatorRow.tsx`
  - model line now includes year (`make model year`) while license remains the primary tabular label.
- `frontend/src/rental/components/dashboard/runtime/vehicleRuntimeStateBuilder.ts`
  - generic health fallback title changed from `Health review required` to `Health prüfen`; source remains `dashboard-health-risk` for debug/supporting context.

Prompt 4 rules now implemented:

- Dashboard Drawer reason pills and row text do not show normal user-facing technical source IDs.
- Fleet Command reason badges do not show normal user-facing technical source IDs.
- Service Window raw label is normalized to `Servicefenster verfügbar`; Service Window is still suppressed behind Service Overdue by Prompt 3 in Attention.
- Concrete module reasons beat generic health fallback.
- Fleet Command keeps existing status/readiness truth; only label formatting changed.
- Remaining dashboard/fleet search hits are tests, internal source fields, deprecated helpers, or data-sync terminology, not active normal labels.

Known sources still open for Prompt 5-7:

- Vehicle Detail health/service/fleet-condition detail data-quality wording (`Stale`, `DTC stale`, `Unknown confidence`).
- Trips/Misuse copy (`Prüffälle`, provenance labels like DIMO/HF/native/reconstructed).
- Finance/detail rows and document/requirements labels.
- Deprecated dashboard adapters/builders may still contain technical test/internal IDs and should be cleaned or explicitly deprecated in Prompt 7.

## Prompt 5 Implementation Baseline

Status: Vehicle Detail Overview / Health / Service cleanup applied.

Implemented changes:

- `frontend/src/rental/components/vehicle-detail/VehicleOverviewTab.tsx`
  - Overview vehicle label uses `formatVehicleIssueEntityLabel`.
  - No quick-navigation layer and no local readiness/blocked strip is rendered.
- `frontend/src/rental/components/vehicle-detail/VehicleOverviewReadinessStrip.tsx`
  - remains deprecated and must not be re-added to Overview.
- `frontend/src/rental/lib/vehicle-overview-readiness.utils.ts`
  - already canonical-only for blocked status: only `health.rentalBlocked` and canonical `blockingReasons` can produce blocked readiness.
  - missing documents, incomplete coverage, local tasks/damages/requirements and health warnings do not create a local blocked/not-ready truth.
- `frontend/src/rental/components/vehicle-detail/VehicleHealthBox.tsx`
  - compact Overview mode (`showDataBasis={false}`) hides data-basis/tracking info, findings and the compliance grid.
  - Overview still shows concrete technical health modules and the dedicated Tacho Warnleuchten quick view.
- `frontend/src/rental/components/vehicle-detail/vehicle-health-box.mapper.ts`
  - Overview DTC delayed state now says `Datenstand verzögert`, not `DTC stale`.
- `frontend/src/rental/components/HealthErrorsView.tsx`
  - old `Vehicle Health / Health Center` header copy replaced with `Tacho Warnleuchten & Fahrzeugzustand`.
  - DTC delayed/stale detail labels normalized to `Datenstand verzögert` / German monitoring copy.
  - no MisuseCasesPanel / Prüffälle box is rendered in Health.
- `frontend/src/rental/components/vehicle-detail/VehicleServiceContextPanel.tsx`
  - service context renders only when open service/maintenance tasks exist.
  - redundant top-level `Service Center` button removed; `Service-Aufgabe erstellen` remains, task rows open existing tasks, and the "Alle ... im Service Center" link appears only when more rows exist.
- `frontend/src/rental/App.tsx`
  - Vehicle Detail header SupportContextButton removed.
  - Vehicle header health tooltip uses `formatUserFacingReasonLabel` instead of raw `Blocked:`/module-key strings.
- `frontend/src/rental/lib/vehicle-service-tasks.utils.test.ts`
  - pure tests for visible service-task basis.

Prompt 5 rules now implemented:

- Missing documents do not block Vehicle Overview without a canonical rental blocker.
- Overview does not render local "Not ready / Blocked" UI.
- Health tab does not render misuse/prueffall cases.
- Tacho Warnleuchten are dedicated to warning-light status; Battery Health and battery telltale remain separate.
- Service & Wartung box is task-only and hidden when no operative service/maintenance tasks exist.
- Vehicle Detail user-facing search is clean for source IDs in the scoped Vehicle Detail files; remaining broader app hits belong to Prompt 6/7.

Known sources still open for Prompt 6-7:

- Trips/Booking/Customer misuse copy (`Prüffälle`, abuse provenance) belongs to Prompt 6.
- Finance, Documents, Requirements detail surfaces and support buttons outside Vehicle Detail header remain Prompt 7 cleanup candidates.
- Deprecated overview quick/readiness helpers remain for cleanup/deprecation audit in Prompt 7.

## Prompt 6 Implementation Baseline

Status: Trips / Misuse / Damage placement and labels cleaned up.

Implemented changes:

- `frontend/src/rental/lib/operational-issues/operationalIssueTypes.ts`
  - added `MisuseCaseLike` as a lightweight frontend normalizer input.
- `frontend/src/rental/lib/operational-issues/normalizeOperationalIssues.ts`
  - maps existing misuse cases to `misuse` / `damage` domains.
  - supported issueTypes: `cold_engine_abuse`, `harsh_acceleration`, `harsh_braking`, `suspicious_trip`, `damage_suspicion`, `impact_suspicion`.
  - semantic keys prefer trip scope: `trip:{tripId}:misuse:cold_engine_abuse`, `trip:{tripId}:damage:impact_suspicion`; vehicle fallback is used only when no trip id exists.
  - evidence is extracted only from present fields in `evidenceSummary` / case metadata: Drehzahl, Gaspedal, Kühlmittel, Geschwindigkeit, Dauer, Ereignisse, Zeitpunkt, HF-Daten.
- `frontend/src/rental/lib/operational-issues/operationalIssueLabels.ts`
  - raw misuse/damage enums (`COLD_ENGINE_ABUSE`, `POSSIBLE_IMPACT`, `MISUSE_CASE`, `UNKNOWN`, etc.) are sanitized from normal labels.
- `frontend/src/rental/components/MisuseCasesPanel.tsx`
  - panel title defaults to `Missbrauchs-/Schadensverdacht`.
  - no-org and no-case states still render a calm visible section: `Unauffällige Fahrt` / `Keine Hinweise auf Missbrauch oder Schaden für diese Fahrt.`
  - case cards render normalized issue titles, short descriptions, severity/confidence and compact evidence rows; no raw case ids/categories/sources.
- `frontend/src/rental/components/trips/TripTimelineExpanded.tsx`
  - completed trips always include the Misuse/Damage section; without org it renders the calm empty state.
- `frontend/src/rental/components/trips/TripTimelineCard.tsx`
  - removed unclear `+x` overflow chip from collapsed cards.
- `frontend/src/rental/components/trips/TripAssignmentBadge.tsx` and `utils/tripRentalContext.ts`
  - private trips / `PRIVATE_UNASSIGNED` show `Privat` and do not automatically become `Nicht zugewiesen` / `Zuordnung prüfen`.
- `frontend/src/rental/components/trips/trips-view-ui.ts`, `behavior-ui.utils.ts`, `TripMapDataQualityOverlay.tsx`
  - prominent `HF verfügbar` copy changed to `Telemetrie verfügbar`; evidence may still use `HF-Daten` when it is the actual measurement/source concept.

Final placement rules:

- Health tab remains free of MisuseCases / Prüffälle.
- Trip detail is the primary user-facing place for misuse/damage suspicion.
- BehaviorPanel shows events; MisuseCasesPanel shows the aggregated suspicion/case.
- Damage domain is used only when the case type has damage/impact/collision/DTC-after-impact/overheating damage relation.
- Booking/customer summaries remain future surfaces; mapping now carries `bookingId` / `customerId` when provided.

Evidence currently available:

- From `TripBehaviorEvent`: maxEngineRpm, maxThrottlePos, maxCoolantTemp, durationMs, start/end speed, timestamp, GPS when present.
- From `MisuseCase.evidenceSummary`: engine/rpm, throttle, coolant, speed, duration, highFrequencyAvailable if present.
- From `MisuseCase`: eventCount, firstDetectedAt/lastDetectedAt, tripId, bookingId, customerId, vehicleId.

Known evidence gaps:

- Not every persisted misuse case currently carries rpm/throttle/coolant/speed in `evidenceSummary`; missing fields are omitted, never shown as `0` or `UNKNOWN`.
- Max-trip speed remains intentionally not prominent in collapsed cards because aggregate `maxSpeedKmh` can differ from event-level speed sources.

Known sources still open for Prompt 7:

- Remaining `Prüffälle` copy outside trips in Booking/Customer aggregate surfaces, if any reappears in broader app search.
- Finance, Documents, Requirements and support-context cleanup outside this prompt.
- Deprecated / legacy helpers and tests containing raw source/debug terms.

## Prompt 7 Final Cleanup Baseline

Status: final repo-wide cleanup pass completed.

Final active sources and surfaces:

- Dashboard Runtime slices remain the canonical source for dashboard KPI counts, drawer rows and fleet-board runtime views.
- `OperationalIssue` is the canonical normalization layer for Dashboard Attention / ActionQueue and the shared label/source-priority semantics.
- Dashboard/Fleet reason display uses `formatUserFacingReasonLabel`, `sanitizeUserFacingIssueText`, `formatVehicleIssueEntityLabel`, and semantic-key dedupe where available.
- Vehicle Detail Overview/Health/Service follows canonical visibility rules: no local readiness/blocked truth, no misuse in Health, service box only for real tasks.
- Trips are the primary surface for misuse/damage suspicion; damage visibility is only enabled for damage/impact-related cases.

Final legacy / deprecated list:

- `dashboardUtils.countReadyToRent`, `dashboardUtils.isVehicleReadyToRent`, `dashboardUtils.countMaintenanceVehicles`, `dashboardUtils.buildControlCenterKpis` are deprecated legacy helpers. Active dashboard KPI/Drawer/ActionQueue surfaces must use Runtime/OperationalIssue.
- `dashboardRuntimeViewModelAdapters` remains a legacy compatibility/test adapter. It must not become the active data source for new dashboard UI.
- `VehicleOverviewReadinessStrip` and `VehicleOverviewQuickView` are deprecated and are not rendered by Vehicle Overview.
- Deprecated FleetBoard/FleetState adapters may remain for compatibility but must not introduce new user-facing source labels.

Allowed debug/source locations:

- Tests and fixtures may contain raw source IDs and enum strings to assert sanitization behavior.
- Runtime/normalizer internals may keep `source`, `debugLabel`, raw source type and enum names.
- Backend API enums, migrations, detector code, logs and docs may contain raw source types.
- Data Analyse and explicit debug/detail provenance may use technical terminology when intentionally technical.

Final normal UI bans:

- No normal UI label should render `rental-health:*`, `dashboard-insight:*`, `vehicle-runtime`, `dashboard-health-risk`, `predictive-operations`, `UNKNOWN · UNKNOWN`, raw misuse/service enums, `Health review required`, `Critical vehicle health`, `Warning health status`, or raw `Service Window Available`.
- Normal Fleet/Dashboard/Vehicle status must use Live / Standby / Soft Offline / Offline, not `stale` as primary telemetry status.
- Data-quality states in normal UI should say `Datenstand verzögert`, `Delayed data`, `Limited data` or a similarly user-facing label, not raw `data stale`.

Known intentional leftovers after Prompt 7:

- Raw source strings remain in tests, docs, runtime internals, backend enums/migrations/detectors, and Data Analyse/debug surfaces.
- `stale` remains as an internal type/field in data freshness utilities and tests; it is no longer intended as primary user-facing Fleet/Dashboard status text.
- Full Finance/Documents/Requirements migration to `OperationalIssue` is intentionally not completed here; no normal source-label leaks were found in the scoped cleanup pass, but deeper domain normalization remains future work.

Future-development acceptance rules:

1. Do not add a new user-facing operational issue without a semantic key or a clear domain.
2. Do not dedupe by title/source; dedupe by entity + domain + issueType.
3. Do not render technical source IDs in normal UI.
4. Do not infer rental blocked/not-ready locally from documents, requirements, generic health warnings or standby telemetry.
5. Do not place misuse/damage suspicion in Vehicle Health.
6. Do not show Service Window as a separate action when Service Overdue exists for the same vehicle.
7. Keep Standby neutral; Soft Offline and Offline are separate telemetry states.
8. Prefer central label helpers over ad-hoc UI strings.

## Runtime Blocker Clarification: Critical Is Not A Rental Block

Status: implemented after Prompt 7 follow-up.

Final rule:

Critical is a severity level, not an automatic rental block.

Ready-to-Rent and Blocked/Maintenance may only be affected by explicit `blocking` / `preventsReady` reasons or canonical operational status. A critical health/service/compliance module is visible and attention-relevant, but it does not block rental unless the backend/canonical source explicitly says so.

Service-specific rule:

- HM/OEM Next Service overdue may be `critical`.
- It remains visible in ActionQueue / Critical Alerts / Service & Compliance context.
- It is not automatically `blocking`.
- It is not automatically `preventsReady`.
- It does not enter `Blocked & Maintenance` unless one of these explicit blocker signals exists:
  - `VehicleHealthResponse.rental_blocked === true`
  - non-empty `VehicleHealthResponse.blocking_reasons`
  - explicit backend/canonical blocker such as TÜV/BOKraft/legal/safety reason
  - active `maintenance` / `unavailable` operational status
  - explicit damage/safety/telemetry blocker configured by Runtime

Categories that no longer auto-block by severity:

- `service`
- `compliance`
- `health`
- `battery`
- `tires`
- `brakes`
- `dtc`
- `damage`

Runtime implementation notes:

- `vehicleRuntimeStateBuilder.addHealthReasons` keeps module severity (`warning` / `critical`) but sets module `blocking:false` and `preventsReady:false` unless an explicit blocking reason is present.
- `rental_blocked` / `blocking_reasons` still produce blocking RuntimeReasons.
- `criticalReasons.length === 0` must not be used as a Ready-to-Rent condition.
- `Blocked & Maintenance` counts maintenance, unavailable and explicit blocking reasons only.

Tests added/updated:

- Service overdue critical without `rental_blocked` / `blocking_reasons` stays ready, non-blocked and absent from Blocked & Maintenance, while still visible in Critical Alerts.
- TÜV explicit blocker remains hard-blocking and appears under Blocked by Compliance.
- Generic critical health without explicit blocker remains visible but does not block.
- Service Window stays non-blocking and is still suppressed behind Service Overdue by OperationalIssue/ActionQueue.

## 1. Problem Statement

SynqDrive collects the same real-world operational problem from multiple technical sources. That is correct internally, but the normal operator UI must show one canonical user-facing issue per real-world problem.

Example:

- `rental-health:service_compliance` reports service overdue.
- `dashboard-insight:SERVICE_OVERDUE` reports service overdue.
- predictive/service-window reports a service opportunity.
- an open service task may exist.

The operator must not see three independent actions for the same vehicle. The canonical user-facing issue is `service_overdue`; other signals become supporting sources or context. Technical source IDs may remain in debug, logs, tests, and data analysis, but not in normal operative UI.

## 2. Files And Areas Audited

Dashboard/runtime:

- `frontend/src/rental/components/dashboard/runtime/*`
- `frontend/src/rental/components/dashboard/actionQueueBuilder.ts`
- `frontend/src/rental/components/dashboard/actionQueueGrouping.ts`
- `frontend/src/rental/components/dashboard/deriveOperationalInsights.ts`
- `frontend/src/rental/components/dashboard/derivePredictiveOperationsInsights.ts`
- `frontend/src/rental/components/dashboard/dashboardRuntimeViewModelAdapters.ts`
- `frontend/src/rental/components/dashboard/dashboardDrilldownBuilder.ts`
- `frontend/src/rental/components/dashboard/controlSignalsBuilder.ts`
- `frontend/src/rental/components/dashboard/FleetReadinessScore.tsx`
- `frontend/src/rental/components/dashboard/stationCommandBuilder.ts`
- `frontend/src/rental/components/dashboard/StationHealthPanel.tsx`
- `frontend/src/rental/components/dashboard/reasonDisplay.ts`
- `frontend/src/rental/DashboardInsightsContext.tsx`

Fleet and vehicle detail:

- `frontend/src/rental/lib/fleetVisualState.ts`
- `frontend/src/rental/lib/fleetVehicleDisplay.ts`
- `frontend/src/rental/lib/fleet-operator-panel.ts`
- `frontend/src/rental/lib/fleet-health-control-center.ts`
- `frontend/src/rental/lib/telemetryFreshness.ts`
- `frontend/src/rental/components/fleet-operator/*`
- `frontend/src/rental/components/FleetView.tsx`
- `frontend/src/rental/components/FleetConditionView.tsx`
- `frontend/src/rental/components/FleetConditionDetailView.tsx`
- `frontend/src/rental/FleetContext.tsx`
- `frontend/src/rental/hooks/useVehicleHealth.ts`
- `frontend/src/rental/components/vehicle-detail/*`
- `frontend/src/rental/components/HealthErrorsView.tsx`
- `frontend/src/rental/components/DocumentsView.tsx`
- `frontend/src/rental/components/rental-health/*`
- `frontend/src/rental/rental-health-ui.ts`
- `frontend/src/rental/lib/vehicle-overview-readiness.utils.ts`
- `frontend/src/rental/lib/vehicle-health-box.mapper.ts`

Trips, misuse, damage:

- `frontend/src/rental/components/trips/*`
- `frontend/src/rental/components/trips/utils/*`
- `frontend/src/rental/components/MisuseCasesPanel.tsx`
- `frontend/src/rental/components/booking-detail/BookingUsageMisuseTab.tsx`
- `frontend/src/rental/components/customer-detail/CustomerDrivingTab.tsx`
- `frontend/src/rental/components/insights/InsightsCockpit.tsx`
- `frontend/src/rental/components/handover/HandoverProtocolDialog.tsx`
- `frontend/src/rental/components/DamagesView.tsx`
- `frontend/src/rental/components/damages/DamageInsightsSection.tsx`
- `frontend/src/rental/lib/damage-insights.ts`
- `backend/src/modules/vehicle-intelligence/trips/*`
- `backend/src/modules/vehicle-intelligence/misuse-cases/*`
- `backend/src/modules/vehicle-intelligence/damages/*`

Booking, finance, service, documents:

- `backend/src/modules/bookings/*`
- `backend/src/modules/customers/customer-eligibility.service.ts`
- `backend/src/modules/documents/booking-document-bundle.service.ts`
- `backend/src/modules/business-insights/detectors/*`
- `backend/src/modules/vehicle-intelligence/service-compliance/*`
- `frontend/src/rental/components/booking-detail/*`
- `frontend/src/rental/components/vehicle-bookings/*`
- `frontend/src/rental/components/bookings/BookingRentalEligibilityCard.tsx`
- `frontend/src/rental/lib/bookingHandoverGates.ts`
- `frontend/src/rental/lib/vehicle-booking-risk.utils.ts`
- `frontend/src/rental/lib/vehicle-booking-readiness.utils.ts`
- `frontend/src/rental/components/service-center/*`
- `frontend/src/rental/components/ComplianceTaskActions.tsx`
- `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.ts`
- `frontend/src/rental/lib/financial-insights.logic.ts`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/customer-detail/CustomerFinancesTab.tsx`

## 3. Source Leak Classification

Classification:

- A: normal user-facing operative UI.
- B: debug / data analysis.
- C: tests.
- D: legacy helper / deprecated compatibility path.
- E: internal logs / developer context.

Rule: technical source IDs are forbidden in A. They are allowed in B, C, D, and E when consciously technical.

Important findings:

| Finding | Path / context | Class | Action for later prompts |
| --- | --- | --- | --- |
| `reason.description ?? reason.source` can surface technical IDs | `frontend/src/rental/components/dashboard/actionQueueBuilder.ts` | A | Prompt 3: replace with canonical `OperationalIssue` label/evidence |
| `rental-health:*`, `dashboard-insight:*`, `vehicle-runtime`, `dashboard-health-risk` in drawer pills | `DashboardDrilldownDrawer.tsx`, `FleetBoardVehicleRow.tsx` via `reasonDisplay.ts` | A, already guarded | Keep as pattern; source only tooltip/debug |
| `dashboard-health-risk` fallback title `Health review required` | `vehicleRuntimeStateBuilder.ts`, slice meta | A | Prompt 2/4: canonical label `Health prüfen`; suppress if concrete module issue exists |
| `Critical vehicle health`, `Warning health status` | `fleetVisualState.ts`, legacy/meta paths | A/D | Prompt 4/7: replace or deprecate active use |
| predictive `sourceData` such as IDs or raw key/value pairs | `derivePredictiveOperationsInsights.ts`, `ActionQueue.tsx` | A | Prompt 3: move to debug/supporting source, not primary meta |
| `Stale`, `DTC stale`, `No data`, `Unknown · Unknown confidence` | health/fleet condition views | A | Prompt 5/7: normalize to data-quality wording |
| `Prueffaelle`, `Abuse-Flags` | booking/customer/handover misuse surfaces | A | Prompt 6: rename to misuse/damage suspicion language |
| `DIMO`, `HF`, `Nativ`, `Rekonstruiert` as provenance badges | Trips behavior/map surfaces | A/C | Prompt 6: tooltip/debug unless evidence clarity requires it |
| raw backend eligibility messages in English | booking/customer eligibility services | A | Prompt 5/7: localize/normalize before display |
| `Source: ...`, `RentalHealth`, `HM/OEM` in detail/provenance | Documents/Health/Service details | A/B | Allowed only where explicitly evidence/provenance; not primary action text |
| technical source IDs in tests and architecture docs | tests, `ChangesView`, `ArchitekturView` | C/E | Allowed |

## 4. Canonical Domains

| Domain | Meaning | Allowed user-facing surfaces | Not allowed surfaces | Typical sources | User-facing language |
| --- | --- | --- | --- | --- | --- |
| `vehicle_health` | Technical vehicle condition: battery, tires, brakes, DTCs, warning lights, module data state. | Vehicle Health, Fleet Command compact health, Dashboard reasons/actions when actionable, Vehicle Overview summary. | Finance, generic booking finance, Misuse as primary label. | Rental Health modules, vehicle intelligence, DTC, warning lights. | `Batterie pruefen`, `1 aktiver Fehlercode`, `Reifen beobachten`, `Bremsen pruefen`. |
| `service_compliance` | Service/TUV/BOKraft/legal compliance and service windows. | Dashboard action queue, blocked/maintenance drawer, Service Center, Vehicle Service, Vehicle Overview summary. | Finance-only views, Trips misuse views. | Rental Health `service_compliance`, ServiceComplianceService, service tasks, service insights. | `Service ueberfaellig seit 117 Tagen`, `TUV faellig`, `Servicefenster verfuegbar`. |
| `telemetry` | Vehicle signal freshness/availability for operations. | Dashboard drawer, Fleet Command meta, Vehicle Overview compact telemetry. | Health module severity as a health defect, Finance. | Runtime telemetry state, `telemetryFreshness.ts`, last snapshot. | `Live`, `Standby`, `Soft Offline / Seit 24h kein Signal`, `Offline / Seit 48h kein Signal`, `Unbekannt`. |
| `rental_readiness` | Whether a vehicle can be rented now. | Dashboard ready drawer, Fleet Command, Vehicle Overview readiness, Booking eligibility. | Health tab as standalone technical diagnosis. | Runtime readiness, Rental Health `rental_blocked`, booking eligibility gates. | `Mietbereit`, `Verfuegbar, aber nicht bereit`, `Miete blockiert`. |
| `booking` | Pickup, active rental, booking-specific preparation and responsibility. | Booking detail, Dashboard due-soon, Operator Today, Vehicle Bookings. | Vehicle Health, Finance-only unless payment-linked. | Booking detail DTO, today pickups, handover gates. | `Abholung faellig`, `Buchung aktiv`, `Uebergabe vorbereiten`. |
| `return` | Return timing, overdue return, inspection need. | Dashboard overdue returns, Booking detail, Vehicle Bookings, Operator Today. | Vehicle Health. | Today returns, runtime return reason, booking agenda, return inspection insight. | `Rueckgabe ueberfaellig`, `Rueckgabe heute`, `Rueckgabe pruefen`. |
| `handover` | Pickup/return handover steps, cleaning, documents at handover. | Booking detail, Operator Today, Dashboard action queue, Vehicle Bookings. | Health tab as technical issue. | Handover gates, booking action rules, cleaning status. | `Reinigung erforderlich`, `Uebergabe blockiert`, `Dokument fehlt`. |
| `damage` | Confirmed damages and damage suspicion with vehicle/body context. | Damages tab, Trip detail when suspicious, Booking detail summary if booking affected, Handover. | Vehicle Health as dominant health box unless technical DTC/health evidence is separate. | Damage records, damage analytics, misuse impact suspicion. | `Schadensverdacht`, `Schaden erfassen`, `Sichtpruefung empfohlen`. |
| `misuse` | Misuse or damage suspicion from driving behavior/trip context. | Trip detail, Booking detail summary, Customer driving, Handover banner, Insights cockpit aggregation. | Vehicle Health tab as dominant health alert. | Trip behavior events, MisuseCase, HF/DIMO driving events. | `Kaltmotor-Missbrauch erkannt`, `Auffaellige Fahrt`, `Missbrauchs-/Schadensverdacht`. |
| `documents` | Vehicle, booking, or customer documents missing/expired/review-required. | Documents tab, Booking readiness, Customer/booking verification, Vehicle Overview summary. | Health tab and Finance unless directly linked. | Vehicle file summary, booking document bundle, document extraction. | `Pflichtdokument fehlt`, `Dokument laeuft ab`, `Dokument pruefen`. |
| `rental_requirements` | Effective rental rules and eligibility requirements. | Requirements tab, Booking eligibility, Vehicle Overview compact. | Health tab, Finance-only. | Rental rules engine, eligibility service. | `Mietanforderung nicht erfuellt`, `Mindestalter nicht erfuellt`. |
| `finance` | Receivables, payments, invoices, billing status. | Business Pulse, Finance, Booking payment checkpoint, Customer finances. | Vehicle Health, Trips. | Business Pulse, invoices, customer eligibility finance checks. | `Zahlung ueberfaellig`, `Zahlung fehlgeschlagen`, `Rechnung offen`. |
| `station_operations` | Station-level capacity, shortage, handover backlog, fleet distribution. | Station Command, Dashboard station panels, Action Queue. | Vehicle Health detail. | Station command builder, derived ops, station shortage insight. | `Station ausgelastet`, `Fahrzeug nachsteuern`, `Uebergabe-Rueckstau`. |
| `task` | Concrete actionable task or work item. | Service Center, Tasks, Dashboard action queue when task exists, Vehicle detail. | Pure health diagnosis without task context. | Task service, service/damage/compliance tasks. | `Aufgabe ueberfaellig`, `Serviceauftrag offen`, `Schaden nachfassen`. |
| `notification` | User/system notifications that are not already canonical actions. | Notification center/tab, Account notifications, Dashboard only after dedupe. | As duplicate action queue items. | Notifications feed, message/automation services. | `Neue Nachricht`, `Benachrichtigung pruefen`. |
| `data_quality` | Missing, delayed, stale, unsupported, or low-confidence data. | Data Analyse, Health detail data quality, subtle dashboard trust hints. | Primary operative action unless it blocks a real operation. | Module `data_stale`, telemetry gaps, failed enrichment. | `Datenbasis eingeschraenkt`, `Datenstand verzoegert`, `Nicht verfuegbar`. |
| `system_debug` | Technical source/provenance/diagnostic context. | Debug, Data Analyse, logs, tests, tooltips gated for debug. | Normal operative primary UI. | Source IDs, raw enums, detector IDs, DIMO/HF provenance. | `Source: ...`, raw IDs only in debug. |

## 5. Canonical Issue Types

Default severity values:

- `info`: informational state or positive/neutral context.
- `attention`: operator should notice, not necessarily urgent.
- `warning`: actionable soon or degraded operational state.
- `critical`: immediate blocker, overdue/legal/unsafe, or hard operational failure.

Source priority notation in the table references the matrix in section 7. Dedupe is always semantic-key based, never title/source based.

### Service And Compliance

| issueType | semanticKey format | Primary source priority | Default severity | Title | Subtitle/evidence | Allowed surfaces | Dedupe rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `service_overdue` | `vehicle:{vehicleId}:service_compliance:overdue` | Backend explicit/Rental Health > Runtime > task > insight | `critical` | `Service ueberfaellig` | days overdue, source system HM/OEM as debug/evidence | Dashboard, Service Center, Vehicle Service, blocked drawer | Suppress `SERVICE_OVERDUE` and `service_window_available` action for same vehicle |
| `service_due_soon` | `vehicle:{vehicleId}:service_compliance:due_soon` | Rental Health > ServiceCompliance > task > insight | `warning` | `Service bald faellig` | due date/km | Dashboard, Service Center, Vehicle Overview | Merge tasks/insights for same due item |
| `service_window_available` | `vehicle:{vehicleId}:service_window:available` | predictive/insight only if no overdue | `attention` | `Servicefenster verfuegbar` | booking gap/window | Action Queue, Station Operations | Hide if `service_overdue` exists for same vehicle |
| `service_before_booking` | `booking:{bookingId}:service_compliance:before_pickup` | ServiceCompliance/Insight > predictive | `warning` | `Service vor Abholung pruefen` | pickup time, service state | Booking, Dashboard Action Queue | Merge with `service_overdue` if same vehicle already overdue |
| `tuv_overdue` | `vehicle:{vehicleId}:service_compliance:tuv_overdue` | Backend explicit/Rental Health | `critical` | `TUV ueberfaellig` | date/days | Dashboard, Vehicle Service, blocked drawer | Beats generic compliance/service overdue |
| `tuv_due_soon` | `vehicle:{vehicleId}:service_compliance:tuv_due_soon` | Rental Health | `warning` | `TUV bald faellig` | date | Dashboard, Vehicle Service | Merge with TUV tasks |
| `bokraft_overdue` | `vehicle:{vehicleId}:service_compliance:bokraft_overdue` | Backend explicit/Rental Health | `critical` | `BOKraft ueberfaellig` | date/days | Dashboard, Vehicle Service, blocked drawer | Beats generic compliance/service overdue |
| `bokraft_due_soon` | `vehicle:{vehicleId}:service_compliance:bokraft_due_soon` | Rental Health | `warning` | `BOKraft bald faellig` | date | Dashboard, Vehicle Service | Merge with BOKraft tasks |

### Vehicle Health

| issueType | semanticKey format | Primary source priority | Default severity | Title | Subtitle/evidence | Allowed surfaces | Dedupe rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `error_codes_active` | `vehicle:{vehicleId}:health:error_codes_active` | Rental Health > DTC module > Runtime > insight | `warning` | `Fehlercodes pruefen` | count, critical code if known | Health, Dashboard, Fleet | One issue per vehicle/DTC summary; critical DTC may upgrade |
| `battery_warning` | `vehicle:{vehicleId}:health:battery_warning` | Rental Health battery > battery intelligence > warning light | `warning` | `Batterie pruefen` | resting/cranking/recommendation evidence | Health, Dashboard, Fleet | Do not merge resting voltage, warning light, DTC into same evidence-free title; combine as evidence |
| `battery_critical` | `vehicle:{vehicleId}:health:battery_critical` | Rental Health battery > explicit blocker | `critical` | `Batterie kritisch` | low voltage/recommendation/DTC | Health, Dashboard, Fleet, blocked if explicit | Beats `battery_warning` |
| `tire_monitor` | `vehicle:{vehicleId}:health:tires_monitor` | Rental Health tires > tire intelligence | `attention` | `Reifen beobachten` | pressure/wear/season evidence | Health, Fleet, Dashboard attention if actionable | Does not prevent ready unless explicit |
| `tire_critical` | `vehicle:{vehicleId}:health:tires_critical` | Rental Health tires > explicit critical insight | `critical` | `Reifen kritisch` | affected tire/evidence | Health, Dashboard, Fleet | Beats `tire_monitor` and `dashboard-health-risk` |
| `brake_no_data` | `vehicle:{vehicleId}:health:brakes_no_data` | Brake module data quality | `attention` | `Bremsdaten fehlen` | no baseline/data state | Health detail, data quality | Not a blocker by default |
| `brake_warning` | `vehicle:{vehicleId}:health:brakes_warning` | Rental Health brakes | `warning` | `Bremsen pruefen` | remaining km, warning reason | Health, Dashboard if actionable | Merge with brake task if same work item |
| `brake_critical` | `vehicle:{vehicleId}:health:brakes_critical` | Rental Health brakes | `critical` | `Bremsen kritisch` | remaining km/inspection | Health, Dashboard, blocked if explicit | Beats brake warning |
| `warning_light_active` | `vehicle:{vehicleId}:health:warning_light_active` | Vehicle alerts/telltales | `warning` | `Warnleuchte aktiv` | light name, timestamp | Health, Fleet, Dashboard | If battery/tire/DTC-specific, attach as evidence to specific issue |
| `health_review_required` | `vehicle:{vehicleId}:health:review_required` | Runtime fallback only | `attention` | `Health pruefen` | no concrete module reason | Dashboard/Fleet only if no concrete module | Suppress if any concrete `rental-health:*` issue exists |

### Telemetry

| issueType | semanticKey format | Primary source priority | Default severity | Title | Subtitle/evidence | Allowed surfaces | Dedupe rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `telemetry_live` | `vehicle:{vehicleId}:telemetry:live` | Runtime telemetry | `info` | `Live` | last signal | Fleet/Vehicle meta | Usually not an action |
| `telemetry_standby` | `vehicle:{vehicleId}:telemetry:standby` | Runtime telemetry | `info` | `Standby` | last signal | Fleet/Vehicle meta | Never warning/blocker |
| `telemetry_soft_offline` | `vehicle:{vehicleId}:telemetry:soft_offline` | Runtime telemetry > derived/predictive | `attention` | `Soft Offline` | `Seit 24h kein Signal` | Dashboard, Fleet | Merge predictive/derived telemetry into one issue |
| `telemetry_offline` | `vehicle:{vehicleId}:telemetry:offline` | Runtime telemetry | `critical` | `Offline` | `Seit 48h kein Signal` | Dashboard, Fleet, blocked if policy | Beats soft offline |
| `telemetry_unknown` | `vehicle:{vehicleId}:telemetry:unknown` | Runtime telemetry/data state | `attention` | `Telemetrie unbekannt` | no snapshot | Fleet/Vehicle meta, data quality | Not a health warning |

### Rental Readiness, Booking, Return, Handover

| issueType | semanticKey format | Primary source priority | Default severity | Title | Subtitle/evidence | Allowed surfaces | Dedupe rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ready_to_rent` | `vehicle:{vehicleId}:rental_readiness:ready` | Runtime | `info` | `Mietbereit` | ready evidence optional | Ready drawer, Fleet | Do not show as action pill |
| `available_not_ready` | `vehicle:{vehicleId}:rental_readiness:not_ready` | Runtime notReadyReasons | `warning` | `Verfuegbar, aber nicht bereit` | canonical blocking/preventsReady reason | Ready drawer, Fleet | Container issue; child reasons provide detail |
| `rental_blocked` | `vehicle:{vehicleId}:rental_readiness:blocked` | Backend explicit/Rental Health > Runtime | `critical` | `Miete blockiert` | blocking reason | Dashboard, Booking, Vehicle Overview | Beats generic unavailable/not-ready |
| `cleaning_required` | `vehicle:{vehicleId}:handover:cleaning_required` | Runtime/booking gates | `warning` | `Reinigung erforderlich` | cleaning status | Dashboard ready secondary, Booking, Handover | Not blocked unless explicit hard gate |
| `maintenance_active` | `vehicle:{vehicleId}:rental_readiness:maintenance_active` | Fleet/Runtime status | `critical` | `In Wartung` | maintenance status/task | Dashboard blocked, Fleet | Merge with service task only as supporting source |
| `unavailable` | `vehicle:{vehicleId}:rental_readiness:unavailable` | Fleet/Runtime status | `critical` | `Nicht verfuegbar` | status/reason | Dashboard blocked, Fleet | Suppress if more specific blocker exists |
| `pickup_due_soon` | `booking:{bookingId}:pickup:due_soon` | Booking today API | `attention` | `Abholung bald faellig` | time/customer | Dashboard, Booking, Operator Today | One per booking |
| `pickup_overdue` | `booking:{bookingId}:pickup:overdue` | Booking today API > pickup insight | `critical` | `Abholung ueberfaellig` | minutes overdue | Dashboard, Booking, Operator Today | Merge local/insight/runtime occurrences |
| `return_due_soon` | `booking:{bookingId}:return:due_soon` | Booking today API | `attention` | `Rueckgabe bald faellig` | time/customer | Dashboard, Booking, Operator Today | One per booking |
| `return_overdue` | `booking:{bookingId}:return:overdue` | Booking today API > Runtime | `critical` | `Rueckgabe ueberfaellig` | minutes/days overdue | Dashboard overdue returns, Booking | Merge predictive follow-up threat as supporting source |
| `active_rental` | `booking:{bookingId}:rental:active` | Booking status | `info` | `Aktive Miete` | end time/customer | Dashboard, Booking, Fleet | Not an action by itself |

### Misuse And Damage

| issueType | semanticKey format | Primary source priority | Default severity | Title | Subtitle/evidence | Allowed surfaces | Dedupe rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cold_engine_abuse` | `trip:{tripId}:misuse:cold_engine_abuse` | MisuseCase > TripBehaviorEvent | `warning` | `Kaltmotor-Missbrauch erkannt` | rpm, coolant temp, duration | Trips, Booking summary, Customer driving | Do not show in Health tab |
| `harsh_acceleration` | `trip:{tripId}:misuse:harsh_acceleration` | TripBehaviorEvent | `attention` | `Auffaellige Beschleunigung` | throttle, g-force | Trips | Aggregate into misuse case if one exists |
| `harsh_braking` | `trip:{tripId}:misuse:harsh_braking` | TripBehaviorEvent | `attention` | `Auffaelliges Bremsen` | deceleration/peakG | Trips | Separate from brake health |
| `suspicious_trip` | `trip:{tripId}:misuse:suspicious_trip` | Trip stress/behavior summary | `attention` | `Auffaellige Fahrt` | stress/behavior count | Trips, Booking/Customer aggregate | Do not call misuse unless abuse evidence exists |
| `damage_suspicion` | `trip:{tripId}:damage:suspicion` | MisuseCase/damage suspicion | `warning` | `Schadensverdacht` | impact/collision evidence | Trips, Damages if linked, Booking | Not confirmed damage; include disclaimer |
| `impact_suspicion` | `trip:{tripId}:damage:impact_suspicion` | Impact/DIMO collision/peakG | `warning` | `Moeglicher Aufprall` | peakG, event time | Trips, Handover, Damages | Merge into `damage_suspicion` if same trip/event |

### Finance, Documents, Requirements, Tasks

| issueType | semanticKey format | Primary source priority | Default severity | Title | Subtitle/evidence | Allowed surfaces | Dedupe rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `receivable_open` | `invoice:{invoiceId}:receivable:open` | Invoice/business pulse | `attention` | `Rechnung offen` | amount/due date | Finance, Business Pulse, Customer | One per invoice |
| `receivable_overdue` | `invoice:{invoiceId}:receivable:overdue` | Invoice state/due date | `critical` | `Zahlung ueberfaellig` | amount/days overdue | Finance, Business Pulse, Booking payment | Beats open receivable |
| `payment_failed` | `invoice:{invoiceId}:payment:failed` | Invoice/payment state | `critical` | `Zahlung fehlgeschlagen` | amount/provider if safe | Finance, Booking, Customer | Related to overdue, but not merged unless same invoice action |
| `invoice_draft` | `invoice:{invoiceId}:invoice:draft` | Invoice state | `info` | `Rechnung im Entwurf` | amount/date | Finance | Not an overdue action |
| `invoice_paid` | `invoice:{invoiceId}:invoice:paid` | Invoice state | `info` | `Rechnung bezahlt` | amount/date | Finance | Not an action |
| `required_document_missing` | `vehicle:{vehicleId}:documents:required_missing` or `booking:{bookingId}:documents:required_missing` | Document bundle/file summary | `warning` | `Pflichtdokument fehlt` | document type | Documents, Booking readiness | Keep vehicle doc vs booking doc separate by entity |
| `document_expired` | `vehicle:{vehicleId}:documents:expired` or `customer:{customerId}:documents:expired` | Document summary | `critical` | `Dokument abgelaufen` | document type/date | Documents, Booking eligibility | Beats expiring soon |
| `document_expiring_soon` | `vehicle:{vehicleId}:documents:expiring_soon` | Document summary | `warning` | `Dokument laeuft bald ab` | date | Documents, Vehicle Overview | One per document type |
| `document_review_required` | `vehicle:{vehicleId}:documents:review_required` | Document extraction/review | `attention` | `Dokument pruefen` | extraction/review status | Documents, AI Upload review | Not a rental blocker until confirmed |
| `rental_requirement_unmet` | `booking:{bookingId}:rental_requirements:unmet` | Eligibility/rules | `critical` | `Mietanforderung nicht erfuellt` | rule label | Booking, Requirements | Merge duplicate customer/booking messages if same rule |
| `task_overdue` | `task:{taskId}:task:overdue` | Task service | `critical` | `Aufgabe ueberfaellig` | task title/due date | Task list, Service Center, Dashboard if relevant | If task materializes service overdue, attach to service issue as source |
| `task_due_soon` | `task:{taskId}:task:due_soon` | Task service | `warning` | `Aufgabe bald faellig` | due date | Task list, Service Center | One per task |

## 6. Semantic Key Rules

Semantic keys are the dedupe primitive. Do not dedupe by title, source ID, or rendered label.

Rules:

1. Use the real operational entity as the key root: `vehicle`, `booking`, `trip`, `invoice`, `task`, `customer`, `station`.
2. Use the canonical domain next.
3. Use the canonical state/problem last.
4. If a source has no stable entity ID, it cannot become a primary canonical issue until mapped to one. It may be supporting evidence on a broader issue.
5. The same title may appear on multiple entities and must not dedupe across entities.
6. The same source may report multiple real issues and must not be used as the only dedupe key.

Canonical formats:

```text
vehicle:{vehicleId}:service_compliance:overdue
vehicle:{vehicleId}:service_compliance:due_soon
vehicle:{vehicleId}:service_window:available

vehicle:{vehicleId}:health:error_codes_active
vehicle:{vehicleId}:health:battery_warning
vehicle:{vehicleId}:health:battery_critical
vehicle:{vehicleId}:health:tires_monitor
vehicle:{vehicleId}:health:brakes_unknown

vehicle:{vehicleId}:telemetry:soft_offline
vehicle:{vehicleId}:telemetry:offline

vehicle:{vehicleId}:rental_readiness:ready
vehicle:{vehicleId}:rental_readiness:not_ready
vehicle:{vehicleId}:rental_readiness:blocked
vehicle:{vehicleId}:handover:cleaning_required

booking:{bookingId}:pickup:due_soon
booking:{bookingId}:pickup:overdue
booking:{bookingId}:return:due_soon
booking:{bookingId}:return:overdue
booking:{bookingId}:rental:active

trip:{tripId}:misuse:cold_engine_abuse
trip:{tripId}:misuse:harsh_acceleration
trip:{tripId}:misuse:harsh_braking
trip:{tripId}:damage:suspicion
trip:{tripId}:damage:impact_suspicion

invoice:{invoiceId}:receivable:open
invoice:{invoiceId}:receivable:overdue
invoice:{invoiceId}:payment:failed
invoice:{invoiceId}:invoice:draft
invoice:{invoiceId}:invoice:paid

vehicle:{vehicleId}:documents:required_missing
vehicle:{vehicleId}:documents:expired
vehicle:{vehicleId}:documents:expiring_soon
vehicle:{vehicleId}:documents:review_required
customer:{customerId}:documents:expired

task:{taskId}:task:overdue
task:{taskId}:task:due_soon
station:{stationId}:station_operations:shortage
```

Service-specific rule:

- `vehicle:{vehicleId}:service_compliance:overdue` beats `vehicle:{vehicleId}:service_window:available`.
- `SERVICE_WINDOW` is not shown as a second action while service is overdue. It may become evidence/context: "Servicefenster waere verfuegbar", or be suppressed.

## 7. Source Priority Matrix

Global priority when several sources report the same `semanticKey` or real-world issue:

1. Canonical backend explicit blocker/status.
2. Dashboard Runtime / `RuntimeReason`.
3. Rental Health structured module.
4. Service Task / Damage Task / Booking Task if a concrete task exists.
5. DashboardInsight.
6. PredictiveOperationalInsight.
7. DerivedOperationalInsight.
8. Legacy fallback / old helper.

Domain overrides:

| Domain | Priority detail |
| --- | --- |
| `service_compliance` | ServiceCompliance/RentalHealth explicit overdue > Runtime blocking reason > open service task > `SERVICE_OVERDUE` > `SERVICE_BEFORE_BOOKING` > `SERVICE_WINDOW` > legacy health status. |
| `vehicle_health` | Rental Health module > Runtime reason > concrete module intelligence > dashboard insight (`BATTERY_CRITICAL`, `TIRE_CRITICAL`) > legacy `vehicle.healthStatus`. |
| `telemetry` | Runtime telemetry state > canonical telemetryFreshness util > predictive/derived telemetry hints > legacy stale labels. |
| `rental_readiness` | Runtime readiness and backend `rental_blocked` > booking eligibility > dashboard insight > local UI fallback. |
| `booking` / `return` | Backend booking/today API > Runtime booking reason > booking gates > pickup/return insight > predictive follow-up risk > local date recalculation. |
| `misuse` | MisuseCase > TripBehaviorEvent > trip stress summary > booking/customer aggregate > insights cockpit aggregate. |
| `damage` | Confirmed Damage record > Damage task/case > Misuse damage suspicion > damage analytics. |
| `finance` | Invoice/payment state > Business Pulse slice > customer eligibility finance warning > local display fallback. |
| `documents` | Document/file summary or booking bundle explicit status > extraction review state > requirements/eligibility warning > legacy copy. |

Service example:

- If `rental-health:service_compliance` and `dashboard-insight:SERVICE_OVERDUE` both report overdue service, produce one `service_overdue` issue.
- Primary source: Rental Health or backend explicit compliance status.
- Supporting sources: DashboardInsight `SERVICE_OVERDUE`, matching service task, ServiceCompliance signal.
- If predictive `SERVICE_WINDOW` also exists, suppress it as an action or attach it as context.
- If no overdue/due issue exists, `service_window_available` may be visible as an opportunity.

## 8. Visibility Rules By UI Surface

Dashboard Attention / Action Queue:

- Show only canonical operative actions.
- No technical source IDs.
- No duplicate issues for the same semantic key.
- No pure data-quality hint without an operative action unless the data state blocks an operation.
- Use source priority and semantic keys; do not use `reason.source` as fallback UI text.

Dashboard Drawer:

- Slice-related rows/issues only.
- Reasons must be readable labels.
- Technical sources only in debug tooltip.
- Ready rows should not show runtime ready markers as pills.
- Available-but-not-ready rows must be based on `preventsReady`/`blocking`, not neutral watch hints.

Fleet Command:

- Compact Health/Rental/Telemetry labels.
- No technical source IDs.
- No local second readiness/blocked truth if Runtime is available.
- Telemetry is a meta state, not a health defect.

Vehicle Detail Overview:

- No local blocked/not-ready truth.
- No quick-navigation blocker language.
- Compact overview only: health summary, readiness summary, key actions.

Vehicle Detail Health:

- Technical vehicle conditions only.
- No misuse cases.
- No service-window opportunity as dominant health action.
- No "Prueffaelle".
- Data quality is allowed as a secondary technical detail.

Vehicle Detail Trips:

- Trip behavior, misuse and damage suspicion live here.
- Evidence must be visible: RPM, throttle, coolant, peakG, duration, event time when available.
- No duplicate Health Tab issue; cross-links may point to Health if DTC/technical state is relevant.

Vehicle Detail Damages:

- Confirmed damage records and damage suspicion only when there is damage context.
- Misuse impact suspicion must be labelled as suspicion, not confirmed damage.

Booking Detail:

- Booking/customer responsibility and handover readiness.
- Misuse/damage only summarized when the booking is affected, with link to trip detail.
- Finance/payment only when booking-specific.

Finance:

- Finance states only.
- No Vehicle Health/Telemetry terminology.
- Payment failed and overdue receivable may both exist for one invoice, but should be linked under one finance action where practical.

Data Analyse / Debug:

- Technical sources allowed.
- Source IDs visible allowed.
- Data quality/stale wording allowed when intentionally technical.

## 9. User-Facing Label Rules

Forbidden in normal operative UI:

- `rental-health:service_compliance`
- `rental-health:battery`
- `rental-health:error_codes`
- `dashboard-insight:SERVICE_OVERDUE`
- `dashboard-insight:SERVICE_WINDOW`
- `dashboard-health-risk`
- `vehicle-runtime`
- `predictive-operations`
- `UNKNOWN · UNKNOWN`
- raw enums such as `POSSIBLE_IMPACT`, `COLD_ENGINE_HIGH_RPM`, `SERVICE_OVERDUE`

Use readable labels:

- `Service ueberfaellig seit 117 Tagen`
- `1 aktiver Fehlercode`
- `Reifen beobachten`
- `Batterie pruefen`
- `Tacho-Warnleuchte Batterie aktiv`
- `Kaltmotor-Missbrauch erkannt`
- `Rueckgabe ueberfaellig`
- `Zahlung ueberfaellig`

Source may appear only in:

- Debug tooltip or debug mode.
- Data Analyse.
- Internal logs.
- Tests.

Telemetry labels:

- `live` -> `Live`
- `standby` -> `Standby`
- `soft_offline` -> `Soft Offline / Seit 24h kein Signal`
- `offline` -> `Offline / Seit 48h kein Signal`
- `unknown` -> `Unbekannt`

Avoid "stale" in normal operative UI. Prefer:

- `Datenbasis eingeschraenkt`
- `Datenstand verzoegert`
- `Keine belastbare Datenbasis`

## 10. Entity Label Standards

Vehicle user-facing label:

```text
{license} · {make} {model} {year}
```

Fallbacks:

```text
{license} · {make} {model}
{license}
{make} {model} {year}
{vehicleId} only in debug/fallback
```

Examples:

- `KS MX 2024 · Mercedes-Benz C 63 AMG 2016`
- `KS MS 661 · Audi A4 2016`
- `KS FH 660E · Tesla Model 3`

Booking label:

```text
{bookingNumberOrShortId} · {customerName} · {pickupDateTime}
```

Fallbacks:

- `{customerName} · {pickupDateTime}`
- `Buchung {shortBookingId}`

Customer label:

```text
{firstName} {lastName}
```

Fallbacks:

- `{companyName}`
- `Kunde {shortCustomerId}`

Invoice label:

```text
{invoiceNumber} · {customerName} · {amount}
```

Fallbacks:

- `Rechnung {shortInvoiceId} · {amount}`

Trip label:

```text
{startLocationOrTime} -> {endLocationOrTime} · {date}
```

Fallback:

- `Fahrt {shortTripId}`

Task label:

```text
{taskTitle} · {entityLabel}
```

## 11. Current Duplicate Cases

### A. Service Overdue

Sources:

- `rental-health:service_compliance`
- `dashboard-insight:SERVICE_OVERDUE`
- service/compliance task
- ServiceCompliance signal
- predictive/service-before-booking or service-window context

Decision:

- Show one `service_overdue` issue per vehicle.
- Primary source: backend/Rental Health explicit compliance.
- `SERVICE_OVERDUE` becomes supporting source.
- Existing task becomes CTA/source if it is the concrete work item.
- `SERVICE_WINDOW` is context or suppressed while overdue exists.

### B. Service Window

Decision:

- `service_window_available` is an opportunity.
- It must not appear next to critical/overdue service as a separate action.
- It is allowed only if no stronger service issue exists.

### C. Battery

Sources:

- battery health module
- battery warning light
- battery DTC
- resting voltage
- live/current voltage
- recommendations/watchpoints

Decision:

- Do not mix live voltage with resting voltage.
- `WATCH` without alertable evidence is not a warning/action.
- Battery warning light/DTC/resting voltage become evidence or specific source under one battery issue.

### D. Error Codes

Sources:

- Rental Health `error_codes`
- DTC health/detail
- Runtime reason
- Action Queue health issue
- Health tab DTC detail

Decision:

- One `error_codes_active` issue per vehicle in operative lists.
- Health tab can show detailed DTC list as evidence/deep dive.

### E. Tires

Sources:

- Rental Health tires
- tire intelligence/action state
- runtime reason
- dashboard health risk fallback
- `TIRE_CRITICAL` insight

Decision:

- Concrete tire issue suppresses generic health-risk.
- Tire warning does not prevent ready unless explicit.

### F. Telemetry

Sources:

- Runtime telemetry
- `telemetryFreshness.ts`
- predictive soft-offline
- derived fleet telemetry
- legacy stale/data stale labels

Decision:

- Runtime telemetry state is canonical.
- Standby is neutral.
- Soft Offline is attention by default.
- Offline can be critical/blocking by runtime policy.
- Do not use "stale" in normal telemetry UI.

### G. Documents

Sources:

- vehicle file summary
- booking document bundle
- booking document slots
- rental requirements
- document extraction review

Decision:

- Separate vehicle document, booking document, and customer document issues by entity.
- Missing booking document can block handover; vehicle document missing is not automatically a health issue.

### H. Misuse

Sources:

- TripBehaviorEvent
- MisuseCase
- damage suspicion
- booking/customer aggregation
- insights cockpit

Decision:

- Misuse belongs in Trips/Booking/Customer/Damages context.
- Misuse does not belong in Vehicle Health as a dominant health box.
- Stress/high load is not automatically misuse. Label as `Auffaellige Fahrt` unless abuse evidence exists.

### I. Finance

Sources:

- overdue receivables
- failed payments
- booking payment readiness
- customer eligibility finance warnings

Decision:

- `receivable_overdue` and `payment_failed` are distinct but related.
- If same invoice has both, group under one finance action where possible.
- Do not leak invoice IDs/type labels as primary action text.

## 12. OperationalIssue Type Draft

Implementation follows in Prompt 2. This is a documentation draft only.

```ts
export type OperationalIssueDomain =
  | 'vehicle_health'
  | 'service_compliance'
  | 'telemetry'
  | 'rental_readiness'
  | 'booking'
  | 'return'
  | 'handover'
  | 'damage'
  | 'misuse'
  | 'documents'
  | 'rental_requirements'
  | 'finance'
  | 'station_operations'
  | 'task'
  | 'notification'
  | 'data_quality'
  | 'system_debug';

export type OperationalIssueSeverity =
  | 'info'
  | 'attention'
  | 'warning'
  | 'critical';

export interface OperationalIssue {
  id: string;
  semanticKey: string;
  domain: OperationalIssueDomain;
  issueType: string;
  severity: OperationalIssueSeverity;
  title: string;
  subtitle?: string;
  entityLabel?: string;
  vehicleId?: string;
  bookingId?: string;
  tripId?: string;
  customerId?: string;
  invoiceId?: string;
  stationId?: string;
  primarySource: OperationalIssueSource;
  supportingSources: OperationalIssueSource[];
  evidence?: OperationalIssueEvidence[];
  recommendedAction?: string;
  cta?: {
    label: string;
    target: string;
  };
  visibility: OperationalIssueVisibility;
}

export interface OperationalIssueSource {
  sourceType:
    | 'runtime'
    | 'rental_health'
    | 'dashboard_insight'
    | 'predictive_insight'
    | 'derived_insight'
    | 'service_task'
    | 'damage_case'
    | 'misuse_case'
    | 'booking'
    | 'document'
    | 'finance'
    | 'legacy';
  sourceId?: string;
  rawType?: string;
  debugLabel?: string;
}

export interface OperationalIssueEvidence {
  label: string;
  value: string;
  unit?: string;
  source?: string;
}

export interface OperationalIssueVisibility {
  dashboardAttention: boolean;
  dashboardDrawer: boolean;
  fleetCommand: boolean;
  vehicleOverview: boolean;
  vehicleHealth: boolean;
  vehicleTrips: boolean;
  vehicleDamages: boolean;
  bookingDetail: boolean;
  finance: boolean;
  debug: boolean;
}
```

Recommended additions for Prompt 2:

```ts
export interface OperationalIssueNormalizationInput {
  runtimeReasons?: unknown[];
  rentalHealth?: unknown;
  dashboardInsights?: unknown[];
  predictiveInsights?: unknown[];
  derivedInsights?: unknown[];
  tasks?: unknown[];
  bookings?: unknown[];
  invoices?: unknown[];
  documents?: unknown[];
  misuseCases?: unknown[];
  damages?: unknown[];
}

export interface OperationalIssueNormalizerOptions {
  locale: 'de' | 'en';
  now: Date;
  debugSources?: boolean;
}
```

## 13. Roadmap For Prompts 2-7

### Prompt 2: OperationalIssue Normalizer implementieren

Likely files:

- `frontend/src/rental/lib/operational-issues/*` or `frontend/src/rental/components/dashboard/operational-issues/*`
- dashboard runtime adapters as inputs only
- unit tests for semantic keys, priority and labels

Not allowed:

- No UI migration.
- No removal of existing Runtime/ActionQueue helpers.
- No KPI/count behavior changes.

Acceptance criteria:

- Types from section 12 exist.
- Normalizer can merge Rental Health + Runtime + Insights + Predictive for service overdue/window.
- Source priority is tested.
- Technical source IDs are kept in `supportingSources`, not `title`.

### Prompt 3: Dashboard Attention / ActionQueue auf OperationalIssues umstellen

Likely files:

- `frontend/src/rental/components/dashboard/actionQueueBuilder.ts`
- `frontend/src/rental/components/dashboard/actionQueueGrouping.ts`
- `frontend/src/rental/components/dashboard/ActionQueue.tsx`
- `frontend/src/rental/components/dashboard/derivePredictiveOperationsInsights.ts`

Not allowed:

- No dashboard KPI/slice rewrite.
- No new design components.

Acceptance criteria:

- Service overdue + Service Window dedupe works.
- `reason.source` never becomes action text.
- Predictive `sourceData` moves to supporting/debug evidence.
- Action Queue uses canonical issue titles/actions.

### Prompt 4: Dashboard Drawer / FleetCommand / ReasonPills auf kanonische Labels umstellen

Likely files:

- `DashboardDrilldownDrawer.tsx`
- `FleetBoardVehicleRow.tsx`
- `FleetStateBoard.tsx`
- `reasonDisplay.ts`
- Fleet command display builders

Not allowed:

- No new readiness truth.
- No count changes.

Acceptance criteria:

- Reason pills and meta use `OperationalIssue` labels where available.
- No source IDs in normal UI.
- `blocked-maintenance` remains the slice ID.
- Standby remains neutral.

### Prompt 5: Vehicle Detail Overview / Health / Service bereinigen

Likely files:

- `VehicleOverviewTab.tsx`
- `vehicle-health-box.mapper.ts`
- `VehicleHealthBoxWired.tsx`
- `HealthErrorsView.tsx`
- `FleetConditionView.tsx`
- `FleetConditionDetailView.tsx`
- `service-center/*`
- `vehicle-overview-readiness.utils.ts`

Not allowed:

- Do not place misuse in Health.
- Do not create local blocked/not-ready truth.
- Do not hide technical health evidence from Health detail.

Acceptance criteria:

- Health tab shows vehicle health only.
- Service window is not dominant if service overdue exists.
- Stale/data-quality labels normalized.
- Overview uses canonical entity labels and issues.

### Prompt 6: Trips / Misuse / Damages einordnen

Likely files:

- `components/trips/*`
- `MisuseCasesPanel.tsx`
- `BookingUsageMisuseTab.tsx`
- `CustomerDrivingTab.tsx`
- `HandoverProtocolDialog.tsx`
- `DamagesView.tsx`
- misuse case backend label builders if needed

Not allowed:

- Do not convert suspicion into confirmed damage.
- Do not move misuse into Health.
- Do not expose raw enums as labels.

Acceptance criteria:

- `Prueffaelle` / `Abuse-Flags` replaced with misuse/damage-suspicion language.
- Evidence remains visible in trip detail.
- DTC/overheat/brake signals are separated as health evidence vs misuse context.
- DIMO/HF provenance is debug/tooltip unless intentionally evidence.

### Prompt 7: Repo-wide Cleanup und Legacy Deprecation

Likely files:

- deprecated dashboard builders/adapters
- `fleetVisualState.ts`
- source leak paths from section 3
- tests/docs for old source strings

Not allowed:

- No blind deletion.
- No destructive refactor.
- No removal of debug/data-analysis source visibility.

Acceptance criteria:

- No normal user-facing source IDs remain.
- Legacy helpers have explicit `@deprecated` or are removed only when proven inactive.
- Tests cover source-leak bans and duplicate service cases.
- Changes/Architecture docs updated if implementation changes behavior.

## 14. Non-Goals For Prompt 1

This prompt did not:

- Implement `OperationalIssue`.
- Migrate ActionQueue.
- Migrate UI surfaces.
- Delete old helpers.
- Build new design components.
- Change Runtime/KPI/count logic.

This document is the persistent baseline for Prompt 2-7.

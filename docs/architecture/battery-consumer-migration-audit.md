# Battery Consumer Migration Audit (Prompt 61/78)

## Goal

All product consumers read battery health through `CanonicalBatteryHealthService.getSummary()` /
`getDetail()` and the shared read adapter — no parallel voltage bands, freshness derivation,
legacy publication truth, or HV capacity/SOH calculation in consumers.

## Canonical read path

```
CanonicalBatteryHealthService.getSummary()
  → summary.canonical (CanonicalBatteryDto)
  → summary.lv / summary.hv (compat slices, same resolver)
  → canonical-battery-read.adapter (backend consumers)
  → canonical-battery-ui.adapter (frontend consumers)
```

## Migrated consumers

| Area | File | Change |
|------|------|--------|
| Vehicle Health API | `vehicle-intelligence.controller.ts` | `battery-health/latest`, `hv-battery-status` marked `_compat`; expose `canonical` |
| Rental Health | `rental-health.service.ts` | `evaluateBattery` → `mapRentalBatteryModule` |
| AI Health Care input | `health-summary.service.ts` | `mapHealthSummaryBatteryModule` + status-based narrative |
| Alerts / Insights / Tasks | `battery-critical.detector.ts` | `CanonicalBatteryHealthService` + `resolveBatteryAlertCandidate` |
| Monitoring / Admin | `data-analyse.service.ts` | Health trace battery section from canonical summary |
| Vehicle Detail overview | `vehicle-health-box.mapper.ts` | Canonical severity/score via UI adapter |
| Insights / forecast | `vehicle-insights-logic.ts` | `lv.healthStatus` for condition |
| Frontend types | `frontend/src/lib/api.ts` | `CanonicalBatteryDto`, `BatteryHealthSummary.canonical` |

Already canonical before P61: `battery-health-summary`, `battery-health-detail`, `ai-health-care-aggregation.service.ts`.

## Legitimate parallel derivations (kept)

| Location | Why legitimate |
|----------|----------------|
| `canonical-battery-health.service.ts` | Single domain resolver — thresholds, freshness, SOH gates |
| `battery-status.ts`, `battery-freshness.policy.ts` | Domain classification policies consumed only by resolver |
| `lv-canonical-battery-resolver.service.ts` | LV canonical sub-resolver |
| `hv-battery-health.service.ts`, `battery-v2.service.ts` | Write/ingestion + internal HV/LV pipelines |
| `document-extraction-apply.service.ts` | Write path — confirmed workshop/document apply |
| `battery-health/lv-rest-shadow-summary`, `lv-start-proxy-diagnostic` | Internal diagnostics, no user health impact |
| `data-analyse` signal trace rows | Raw signal arrival audit (not health classification) |
| `battery-display.utils.ts` `MIN/MAX_REASONABLE_LV_VOLTAGE` | UI plausibility filter only, not health bands |
| `HealthErrorsView.tsx` calibration progress UI | Display-only progress metrics during INITIAL_CALIBRATION |

## Behavioral notes

- **Alert spam guard removed from detector**: fleet alerts now follow canonical `lv.healthStatus` /
  component statuses from the resolver instead of a second Prisma batch with two-consecutive resting
  samples. Resting WARNING alerts align with canonical truth.
- **Readiness**: rental-health blocking logic unchanged in scope (no expansion); still uses
  legacy-publication safety cap via adapter.
- **Compat endpoints**: `battery-health`, `battery-health/v2`, `battery-health/latest`,
  `hv-battery-status` remain for legacy clients; new work should use `battery-health-summary`.

## Remaining follow-ups (non-blocking)

- `HealthErrorsView.tsx`: prefer `batterySummary.canonical` for HV modal instead of synthesizing
  from `HvBatteryStatus` + local SOH color thresholds.
- `FleetConditionDetailView.tsx`: migrate battery detail panel to UI adapter (partially inherits
  via shared `battery-display.utils`).
- `vehicle-logbook.service.ts`: verify battery log lines cite canonical summary where shown to users.

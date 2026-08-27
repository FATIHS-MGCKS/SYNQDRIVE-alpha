# Vehicle Operational State — Notifications / Operational Alerts Cutover (P1.7)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-26 |
| **Slice** | P1.7 — Tenant notification / operational alert presentation cutover |
| **Prerequisite** | P1.1–P1.6 merged |
| **Related audit** | `docs/audits/vehicle-operational-state-frontend-consumer-ui-projection-audit-2026-08.md` §V |

## Purpose

Cut tenant-facing operational notification eligibility and presentation to canonical P0.1 connectivity runtime + P1.2 presentation. Remove client timestamp / `isVehicleOffline()` / `resolveTelemetryFreshness()` as notification authority.

## Canonical path

```
VehicleData.connectivityRuntime + healthEvaluation
  → notification-operational-attention.ts (P1.7 adapter)
  → normalizeOperationalIssues / runtime reasons (addCanonicalConnectivityAttentionReasons)
  → actionQueueBuilder / NotificationPanel / DashboardAttentionStack
```

Backend V2 notifications (`GET /notifications?attentionScope=`) remain authoritative for durable records. Client-derived rows are advisory and must not duplicate backend connectivity events.

## Notification domains

| Domain | Category (UI) | Authority |
|--------|---------------|-----------|
| **Connectivity** | Fleet (FLEET_READINESS) | `attentionState` + P1.2 `primaryReason` / `recommendedAction` |
| **Health** | Fleet | P0.4 evaluability + rental-health modules |
| **Business / booking** | Operations (OPERATIONS) | Unchanged — handovers, returns, tariffs |
| **Maintenance / compliance** | Fleet / health modules | Service/compliance modules |

## Severity policy

- **CRITICAL / ACTION_REQUIRED** attention → `critical` notification severity
- **WATCH** attention → `warning` severity (not critical)
- **NONE** attention → no connectivity notification (even if `overallState` is OFFLINE/STANDBY/etc.)
- Do **not** re-escalate from `overallState` enum alone

## Removed / bypassed client paths

| Legacy path | P1.7 action |
|-------------|-------------|
| `derived-fleet-soft-offline-telemetry` (`deriveOperationalInsights`) | **Removed** — backend `TELEMETRY_*` covers fleet connectivity |
| `SOFT_OFFLINE_TELEMETRY_CHECK` timestamp fallback (`resolveTelemetryFreshness`) | **Removed** — canonical `connectivityRuntime` attention only |
| `telemetryStateToIssueDraft` from raw `telemetryState` | **Removed** — requires canonical attention |
| `isVehicleOffline()` notification gate | **Removed** from cross-surface regression gate |

## Notification identity

Stable client-derived connectivity identity:

```
connectivity:{vehicleId}:{activeEpisodeId|none}:{sortedReasonCodesJoined}
```

Reason codes are sorted before join so reordering does not create duplicate rows within the same episode. Runtime canonical reasons use `source: canonical:connectivity:{attentionState}` for dedup with predictive coverage suppression.

## Category mapping (Betrieb / Flotte)

Internal `ActionQueueCategory.health` maps to `NotificationDomain.vehicle-health` (UI label: Fahrzeugzustand / Vehicle condition). This is the established Fleet-side bucket (`dashboardAttention.fleetReadiness` / `FLEET_READINESS` scope) — not the mechanical Health tab label.

Connectivity `telemetry` domain issues use `category: health` → `vehicle-health` domain → Fleet notifications surface.

## Health notification evidence (P1.7 hardening)

Rental-health `ModuleHealth.evidence_type` contract (backend `rental-health.types.ts`):

`measured` | `estimated` | `provider` | `manual` | `document` | `sensor` | `complaint` | `legacy_unverified` | `unknown`

**Accepted for mechanical notifications:** `measured`, `estimated`, `provider`, `manual`, `document`, `sensor`, `complaint`

**Rejected:** `unknown`, `legacy_unverified`, absent, unsupported future values

`hasValidMechanicalHealthModuleEvidence()` requires canonical `moduleState` (`warning`|`critical`) **and** accepted `evidenceType`. Reason text is presentation-only. Alert `severity` is never synthesized into `moduleState`. `deriveVehicleHealthAlertsFromRentalHealth` propagates canonical `moduleState` + `evidenceType`.

## Health evaluability

- `NOT_EVALUABLE` / `UNKNOWN` without explicit rental-health module evidence → no fabricated mechanical-critical notification
- `PARTIALLY_EVALUABLE` → no critical mechanical notification without module evidence
- Explicit rental-health module `critical`/`warning` → allowed

## Tariff vs connectivity loading (booking P1.6 reference)

Booking `catalogLoading` remains fail-open (pricing UX). Rental-health `healthLoading` remains fail-closed (safety). Notification connectivity uses backend attention — no client timestamp loading gate.

## Category mapping (Betrieb / Flotte)

| Client `ActionQueueCategory` | Dashboard scope |
|------------------------------|-----------------|
| `health` (incl. telemetry domain after P1.7) | Fleet Readiness presentation |
| `operations`, `handover` | Operations (Betrieb) |

Backend `attentionScope` remains authoritative in split V2 mode.

## Tests

| Suite | Result |
|-------|--------|
| P1.7 focused | 24/24 |
| operationalIssues | 19/19 |
| connectivity-cross-surface | 21/21 |
| dashboardAttentionBuilder | 5/5 |
| P1.6–P1.1 regression bundles | PASS |
| build/typecheck | PASS |

## Remaining legacy (out of P1.7 scope)

- `controlSignalsBuilder.classifyTelemetry` fallback when no runtime states (KPI sync label only — not notification inbox)
- `fleetStateBuilder` telemetry labels
- Global `isVehicleOffline()` helper deletion → P1.7+ cleanup

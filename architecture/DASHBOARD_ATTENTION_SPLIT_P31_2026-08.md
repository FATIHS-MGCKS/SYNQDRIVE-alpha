# Dashboard Attention Split UI (P3.1)

**Date:** 2026-08-20  
**Status:** Frontend cutover — V2 split active when `shouldUseDashboardAttentionSplit(orgId)`

## Canonical routing

Dashboard attention is two sibling **backend-owned** projections:

| Panel | API |
|-------|-----|
| Operations | `GET /organizations/:orgId/notifications?attentionScope=OPERATIONS&stationId=…` |
| Fleet Readiness | `GET /organizations/:orgId/notifications?attentionScope=FLEET_READINESS&stationId=…` |

- **`attentionScope` is authoritative** — not `domain`, not frontend event-type tables.
- Example: `VEHICLE_NOT_READY` may have `domain=OPERATIONS` while registry routes to `FLEET_READINESS`.
- Frontend **must not** reroute, filter, or hide scoped items by domain/category.

## Canonical fleet readiness summary

Fleet Readiness panel header uses:

```
GET /organizations/:orgId/rental-health/fleet/summary?stationId=…
```

Response (canonical `rental_readiness` counts):

```json
{
  "total": 47,
  "ready": 42,
  "notReady": 3,
  "unevaluable": 1,
  "unknown": 1,
  "readyPercent": 89
}
```

**Do not** derive readiness % from:

- FleetContext / healthMap / dashboardRuntime
- `computeFleetReadiness()` / legacy `FleetReadinessScore`
- notification counts or cause rows

`FleetStateBoard` remains deprecated — not resurrected.

## Dashboard = projection only

V2 cutover path:

```
Backend producers → Notification V2 → attentionScope → dashboard projection
```

When split is active, **no** supplemental merge:

- `mergeV2WithSupplemental`
- `derivedQueueItems` / `overdueHandoverQueueItems`
- `vehicleHealthQueueItems` / `mergeV2NotificationsWithVehicleHealth`

Shadow mode keeps generic fetch + legacy single queue for comparison.  
V2 OFF preserves legacy `ActionQueue`.

## Fleet Readiness presentation

Vehicle-scoped notifications group by `vehicleId` regardless of domain.

Aggregate + cause presentation (presentation-only, no lifecycle mutation):

- `VEHICLE_NOT_READY` / `VEHICLE_READINESS_UNEVALUABLE` → parent readiness context
- Specific causes (tire, service, DTC, …) → child rows
- Aggregate-only or unevaluable-only vehicles remain visible as leaves

Implementation: `fleet-readiness-attention-projection.ts`, `AttentionScopedList`, `DashboardAttentionStack`.

## Failure isolation

Operations, Fleet notifications, and Fleet summary load and fail independently.

- Summary error → unavailable message; notifications may still render
- Fleet list error → error banner; summary may still render
- Loading → skeleton, not zero/healthy

## Rollout flag

`shouldUseDashboardAttentionSplit(orgId)` (= notifications V2 cutover on):

- Scoped OPERATIONS + FLEET_READINESS queries + fleet summary
- No generic all-notifications dashboard query when split active

## Related

- Backend gate: `architecture/FLEET_READINESS_DASHBOARD_CUTOVER_P25_2026-08.md`
- Parity audit: `docs/audits/fleet-readiness-notification-parity-2026-08.md`

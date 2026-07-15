# Vehicle operational state — legacy read endpoints

Normative contract: `docs/architecture/vehicle-operational-state-v2.md` §16.

As of **V4.9.487 (Prompt 22/43)**, these endpoints use the canonical
`deriveFleetStatusContext` pipeline via `loadFleetOperationalContext` and the
shared fleet read-model projectors:

| Endpoint | Shape | Notes |
|----------|-------|-------|
| `GET /organizations/:orgId/vehicles` | Full list + `operationalState` + `bookingContext` | Paginated fleet list / dashboard table source |
| `GET /organizations/:orgId/fleet-map` | Compact map + canonical blocks | Redis-cached; no `futureBookings[]` / `rawVehicleStatus` |
| `GET /organizations/:orgId/vehicles/:vehicleId` | Detail + `futureBookings[]` + `rawVehicleStatus` | Richest rental vehicle read model |
| `GET /admin/vehicles` | Platform list + canonical blocks | Multi-org batched context |
| `GET /admin/vehicles/:vehicleId` | Platform detail + `rawVehicleStatus` | Same derivation as org detail |
| `GET /organizations/:orgId/rental-rules/fleet-vehicles` | Compact picker + canonical blocks | Rental rules assignment UI |
| `GET /organizations/:orgId/stations/:id/fleet` | Compact station fleet + canonical blocks | Station detail tab |
| `GET /organizations/:orgId/bookings/:id` (vehicle block) | Detail embed + canonical blocks | `vehicleStatus` legacy label from engine |

**Contract rule:** For the same vehicle, organization, and evaluation time,
all migrated endpoints above MUST return identical
`operationalState.status`, `operationalState.reason`, and
`operationalState.dataQualityState` (enforced by
`vehicle-fleet-read-model.contract.spec.ts`).

---

## Remaining legacy endpoints (not yet on canonical operational state)

These surfaces still use **raw `Vehicle.status`**, **connection telemetry**, or
**separate domain models**. They are intentionally documented here until a
future prompt migrates or explicitly scopes them out.

### Raw `Vehicle.status` counts / filters

| Endpoint | Current behavior | Migration note |
|----------|------------------|----------------|
| `GET /organizations/:orgId/stations/:id/overview-stats` | Counts by raw `AVAILABLE` / `RENTED` / `IN_SERVICE` / `OUT_OF_SERVICE` | Replace with engine-derived aggregates or document as raw-diagnostic-only |
| `GET /admin/organizations/:id/stats` | `groupBy` on raw `Vehicle.status` | Platform KPI — may stay raw with label mapping |
| Business-insights detectors (`station-shortage`, `service-window`, `low-utilization`, …) | Heuristics on raw status + booking overlap | Separate insight domain; not fleet list contract |

### Different domain (not rental operational state)

| Endpoint | Domain |
|----------|--------|
| `GET /organizations/:orgId/fleet-connectivity` | Device connection (`online` / `standby` / `offline`) |
| `GET /organizations/:orgId/vehicles/:vehicleId/device-connection` | DIMO device episodes |
| `GET /organizations/:orgId/vehicles/:vehicleId/rental-health` | Rental health gate (`rental_blocked`, module states) |
| `GET /organizations/:orgId/rental-health` | Batch rental health (N× module evaluators) |
| `GET /vehicles/:vehicleId/health/summary` | Health tab aggregation |
| `GET /admin/billing/billable-vehicles` | Billing exclusion on raw `OUT_OF_SERVICE` |
| `GET /organizations/:orgId/data-analyse/vehicles` | Wraps fleet connectivity |
| High Mobility / DIMO admin vehicle lists | Provider activation status |

### No operational status in response

| Endpoint | Notes |
|----------|-------|
| `GET /organizations/:orgId/price-tariffs/unassigned-vehicles` | Pricing assignment picker |
| `POST /organizations/:orgId/bookings/eligibility-check` | Vehicle existence only |
| Chat `getOrgFleetInfo` | Identity fields only |

---

## Batching guarantee

Canonical fleet reads MUST call `VehiclesService.loadFleetOperationalContext`
(single org) or `loadFleetOperationalContextMultiOrg` (platform admin) once per
request scope — never per-vehicle booking queries.

---

## Response size profiles

| Profile | Endpoints | Omitted by design |
|---------|-----------|-------------------|
| **Compact** | `fleet-map`, `rental-rules/fleet-vehicles`, `stations/:id/fleet` | `futureBookings[]`, `rawVehicleStatus`, cost/spec joins |
| **List** | `organizations/:orgId/vehicles` | `futureBookings[]`, `rawVehicleStatus` |
| **Detail** | `organizations/:orgId/vehicles/:id`, `admin/vehicles/:id` | — |

---

*Last updated: Prompt 22/43 — V4.9.487*

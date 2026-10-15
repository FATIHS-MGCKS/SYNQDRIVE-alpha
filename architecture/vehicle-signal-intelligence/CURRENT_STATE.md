# Vehicle Signal Intelligence — Current state

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Product focus** | Per-vehicle, per-provider-source-link **signal capability profiles** (declared vs observed) |
| **Last updated** | 2026-10-15 |

## Ownership boundaries

| Module | Owns |
|--------|------|
| **Vehicle Onboarding** | Vehicle lifecycle, `VehicleDataSourceLink`, `connectionIdentity` / verified modality |
| **VDC** | Physical connectivity, monotonic VLS ingest semantics, device episodes |
| **VSI** | Signal catalog reconciliation, empirical observation status, durable capability profiles |
| **APDS** | Polling optimization (read-only VSI consumption planned P3+) |
| **VSI-03 P2C ledger** | Optional forensic per-poll observations — **not** the product profile |

## Implemented (P0+P1)

- **Declared catalog resolver** — reads cached `vehicle_driving_capabilities` / `vehicle_battery_capabilities` preflight rows only (`vsi-declared-catalog.resolver.ts`). **No DIMO HTTP** on materialization path.
- **Profile evaluator** — merges VSI-03 read-only composer empirical axes with declared catalog (`vsi-profile-evaluator.ts`).
- **Durable store** — `vehicle_signal_capability_profiles` scoped by `(organizationId, vehicleId, providerSourceLinkId)`.
- **Materialization** — non-blocking post-VLS upsert hook in `dimo-snapshot.processor.ts`.
- **Inspection** — `GET api/v1/internal/vsi/signal-profiles/organizations/:organizationId/vehicles/:vehicleId` (`MASTER_ADMIN`).
- **Recovery** — `POST .../materialize?providerSourceLinkId=` re-reads VLS + cached preflight when the snapshot hook logged failure (no DIMO calls).
- **Catalog scope** — Declared `availableSignals` evidence is **vehicle-scoped** from preflight tables (limitation `DECLARED_CATALOG_VEHICLE_SCOPED_NOT_PER_SOURCE_LINK`); empirical axes remain link-attributed via VLS `providerBindingId`.

## Explicit non-goals (this slice)

- Vehicle Onboarding activation hook (P2).
- APDS shadow wiring (P3).
- VSI03 capture / strict-advance read flags.
- Fleet UI surfacing.

## Validation

```bash
cd backend && npm test -- --testPathPattern=vehicle-signal-intelligence/vsi-profile
VSI03_READONLY_COMPOSER_PG=1 npx jest vsi-profile-materialization.postgres.integration --runInBand
bash architecture/scripts/validate-module-registry.sh
```

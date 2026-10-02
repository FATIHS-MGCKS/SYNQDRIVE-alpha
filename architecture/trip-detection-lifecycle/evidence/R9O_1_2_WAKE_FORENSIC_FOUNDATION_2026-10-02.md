# R9O-1 / R9O-2 — Wake correlation contract + durable forensic foundation

**Date (UTC):** 2026-10-02  
**Workstream:** P2.5 / LTE_R1 — R9 observability engineering (slices R9O-1, R9O-2)  
**Design input:** `P25_R9_OBSERVABILITY_DESIGN_RESULT=COMPLETE` (APD-1R-B)

## Scope delivered (repository)

| Slice | Deliverable | Runtime wired |
|-------|-------------|---------------|
| **R9O-1** | `R9ProviderWakeCorrelationContext`, `WAKE_CORRELATION_ID_VERSION=R9_WAKE_CORRELATION_V1`, deterministic `wakeCorrelationId` | **No** — contract only; snapshot job identity remains `snapshot-{vehicleId}` |
| **R9O-2** | Prisma model `R9ProviderWakeForensic` → `r9_provider_wake_forensics`, `R9ProviderWakeForensicRepository`, fail-open `runR9WakeForensicSafely` | **No** — persistence API registered in `SnapshotWakeModule`; intake/coordinator/processor not instrumented (R9O-3+) |

## Explicit non-changes

- No polling / tier / R9 threshold / subscription / Trip FSM semantic change
- No Production deploy or migration execution on Production
- No raw webhook body persistence

## Correlation identity

**Precedence:**

1. `providerDeliveryId` when present on webhook envelope (`extractProviderDeliveryId`)
2. SHA-256 fallback over org, vehicle, token, normalized signal/reason, `providerObservedAt` or `__MISSING__`, payload fingerprint or `__MISSING__`

**Degraded strategies** (`resolveR9DegradedIdentityStrategy`):

- `PROVIDER_DELIVERY_ID` | `PROVIDER_OBSERVED_AT` | `PAYLOAD_FINGERPRINT` | `DEGRADED_NO_PROVIDER_OBSERVED_AT`

`receivedAt` is **not** primary duplicate identity (provider retry may shift arrival time).

## Timestamp semantics (APD-1R-B)

Distinct persisted columns (no silent derivation):

- `providerObservedAt` — provider/signal observation time when genuinely available
- `receivedAt` — SynqDrive intake receive time
- `providerFetchedAt` — provider HTTP fetch completion (R9O-3+)
- `snapshotSourceTimestamp` — source signal timestamp on snapshot payload (R9O-3+)

## Forensic schema

- **Table:** `r9_provider_wake_forensics`
- **Unique key:** `wake_correlation_id`
- **Retention:** schema supports time-bounded delete; execution job = R9O-6 (`PROPOSED_RETENTION_DAYS=14`)
- **Tenant safety:** upsert checks `organizationId` + `vehicleId` on existing row; mismatch → `R9ProviderWakeForensicTenantConflictError`

## Tests (repository)

- Unit: correlation determinism, timestamp guards, repository upsert/coalesce, fail-open wrapper
- Gated PG: `R9_WAKE_FORENSIC_PG=1` → concurrent upsert + tenant rejection

## Next slice

**R9O-3** — wire intake/coordinator/snapshot processor to `recordIntake` / lineage patch methods without changing wake decisions.

## Related (non-blocking) policy input

P2.5 standby **device** LV cadence (~8 h configured) vs API poll cadence — mandatory for subsequent APD work, **not** a change to R9O-1/R9O-2: [VDC P25 standby battery-voltage cadence addendum](../../vehicle-device-connectivity/evidence/P25_STANDBY_BATTERY_VOLTAGE_CADENCE_ADDENDUM_2026-10-02.md).

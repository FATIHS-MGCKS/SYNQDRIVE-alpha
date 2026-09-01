# Battery V2 — Redis Vehicle Lock

**Service:** `BatteryV2VehicleLockService`  
**Gap:** `BAT-V2-GAP-LOCK-FAILOPEN-001` (rationale UNKNOWN)

## Confirmed behavior

| Property | Value |
|----------|-------|
| Key format | `battery:v2:lock:{scope}:{vehicleId}` |
| Scopes | `ingest`, `assess`, `publish`, `hv` |
| Default TTL | 120_000 ms |
| Contended | Throws `BatteryV2VehicleLockContendedError` — job does not run |
| Redis unavailable | **Fail-open** — logs warn, returns `{ token: 'redis-unavailable' }`, job proceeds |

## Scope mapping (jobs)

- `BATTERY_ASSESSMENT_RECOMPUTE` → `assess`
- `BATTERY_PUBLICATION_UPDATE` → `publish`
- `HV_RECHARGE_SESSION_RECONCILE`, `HV_CAPACITY_SHADOW_RECOMPUTE`, `HV_CAPABILITY_REFRESH` → `hv`
- Default ingest jobs → `ingest`

## Protections when lock absent

- DB idempotency keys and unique constraints remain
- `BatteryV2IdempotentExecutionService` pre-checks before handler

## Unknown

- Historical PR/decision explaining why fail-open was chosen over fail-closed
- Multi-replica race impact quantification in production

# Battery V2 — Idempotency

**Epistemic status:** CONFIRMED (key patterns)

## Session window identity

```
idempotencyKey = lv-rest:{vehicleId}:{anchorAtMs}
DB unique: (vehicleId, idempotencyKey)
createIdempotent → P2002 race → fetch existing + repairCanonicalTripBindingIfNeeded
```

## Job identity

```
jobId = buildBatteryV2JobId(idempotencyKey)
```

Producer `addIdempotent()`:

- If job exists in `waiting|delayed|active|prioritized` → suppress duplicate enqueue
- If `completed|failed` → remove then re-add (recovery path)

## REST target identity

```
battery-rest:{vehicleId}:{restWindowId}:{60m|6h}
```

## Execution deduplication

`BatteryV2IdempotentExecutionService` — session-open handler treats existing session for anchor as already completed.

## Graph

- `BAT-V2-INV-REST-WINDOW-ID-001`

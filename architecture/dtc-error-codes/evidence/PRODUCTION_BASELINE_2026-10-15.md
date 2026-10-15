# Production baseline — DTC (read-only)

**Date:** 2026-10-15  
**Deploy SHA:** `3a7cc0cc34ab5e79781ae667b8b6c68637a70c8f` (`git rev-parse` on `/opt/synqdrive/current`)  
**Replicas:** HTTP health OK on `127.0.0.1:3001` and `3002`  
**Scheduler leader (Redis):** `synqdrive:scheduler:leader` → holder id present (read-only GET)

## Migrations

```json
[
  {"migration_name":"20261015180000_vehicle_dtc_source_head_01b","applied":true},
  {"migration_name":"20261015193000_vehicle_dtc_source_head_01c_partial","applied":true}
]
```

## Outbox / heads

- Pending outbox rows: **0** (errors: **0**)
- Source heads: **0**

## P0675

One active event on `c10351f8-b6a2-4258-947f-631aeaa6d359`; VLS `obdDtcList` includes `P0675` with `lastDtcPollAt` ≈ 2026-10-15T18:46Z; provider `sourceTimestamp` 2026-10-15T17:31:14Z.

## BullMQ `dtc-poll`

wait/active/delayed/failed lengths **0** at inspection time.

## Non-DTC regression

No mutations performed; no DI/VSI/Battery health jobs triggered. Spot-check: VLS samples show recent `lastDtcPollAt` across fleet (legacy poll still running).

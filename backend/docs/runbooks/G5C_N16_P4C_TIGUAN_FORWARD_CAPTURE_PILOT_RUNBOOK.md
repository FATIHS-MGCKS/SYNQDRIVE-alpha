# G5C-N16 P4C — Tiguan forward-capture pilot (operator runbook)

**Status:** Design / local implementation only — **not** auto-executed.  
**Vehicle:** VW Tiguan WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, DIMO token `192922`).

## 1. Preflight (owner + platform)

- Confirm **production deploy is out of scope** for this document unless separately authorized.
- Confirm **CI green** on the commit that contains P4H-R7 hardening.
- Confirm **no** `BATTERY_V2_PUBLICATION_ENABLED` and **no** customer SOH publication flags.
- Verify Tiguan is the **only** UUID in `BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST`.
- Set a new opaque `BATTERY_V2_START_PROXY_PILOT_EPOCH` (owner-approved string; new epoch = new budget).
- Set `BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT` to an ISO UTC instant **strictly before** the first intended pilot trip (exclusive semantics: trips starting exactly at cutoff are **rejected**).
- Set `BATTERY_V2_START_PROXY_PILOT_MAX_TOTAL_PROVIDER_REQUESTS` (hard fleet cap for epoch).
- Set `BATTERY_V2_START_PROXY_PILOT_MAX_REQUESTS_PER_TRIP=1`.
- Keep `BATTERY_V2_START_PROXY_PILOT_REQUEST_BUDGET_KILL_SWITCH=false` until ready; set `true` for emergency stop.

## 2. Activation parameters (example — replace before use)

| Variable | Example |
|----------|---------|
| `BATTERY_V2_START_PROXY_ENABLED` | `true` (only after owner sign-off) |
| `BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED` | `true` |
| `BATTERY_V2_START_PROXY_PILOT_VEHICLE_ALLOWLIST` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `BATTERY_V2_START_PROXY_PILOT_FORWARD_CUTOFF_AT` | `2026-11-01T00:00:00.000Z` |
| `BATTERY_V2_START_PROXY_PILOT_EPOCH` | `owner-2026-11-01-tiguan-v1` |
| `BATTERY_V2_START_PROXY_PILOT_MAX_TOTAL_PROVIDER_REQUESTS` | `25` |
| `BATTERY_V2_START_PROXY_PILOT_MAX_REQUESTS_PER_TRIP` | `1` |
| `BATTERY_V2_START_PROXY_PILOT_RAW_RETENTION_DAYS` | `90` |

## 3. Safety checks before first trip

- Reconciliation **must not** enqueue start-proxy jobs when pilot scope is ON (trip-start producer only).
- Job retries for `BATTERY_START_PROXY_EXTRACT` are **1 attempt** when pilot runtime is ready.
- Raw archive row must exist in `battery_start_proxy_pilot_raw_archives` per trip before extractor proceeds.
- Provider ledger row in `battery_start_proxy_pilot_provider_requests` must show terminal state after each trip.

## 4. Ground-truth time reference (field test)

1. Park with engine off; note snapshot poll tier if known.
2. Record **independent** engine-start time (video / stopwatch).
3. Drive normally; do not claim CCA/SOH.
4. After trip, compare: ground truth, `VehicleTrip.startTime`, raw archive bucket timestamps, ingest timestamps in archive `timing` block.

## 5. Live monitoring

- Watch `battery_start_proxy_pilot_global_budget.total_attempts` vs `max_total_attempts`.
- Alert if kill-switch flipped or budget exhausted mid-campaign.
- DIMO global limiter metrics (unchanged for non-pilot traffic).

## 6. Kill-switch

Set `BATTERY_V2_START_PROXY_PILOT_REQUEST_BUDGET_KILL_SWITCH=true` → all pilot provider reserves denied (`pilot_request_budget_kill_switch`).

## 7. Rolling restart

- Budget and ledger are **durable in Postgres**; restarts do not reset counts for the same epoch.
- New epoch requires owner approval and new env values.

## 8. T+0 and T+24 audit

- T+0: SHA-256 verify each raw archive (`verifyP4cForwardRawArchive`).
- T+24: Re-check budget totals, dead-letter queue for `BATTERY_START_PROXY_EXTRACT`, no unexpected vehicles in allowlist.

## 9. Rollback

1. `BATTERY_V2_START_PROXY_ENABLED=false`
2. `BATTERY_V2_START_PROXY_PILOT_SCOPE_ENABLED=false`
3. Kill-switch `true`
4. Rolling restart workers (per deploy runbook)
5. Raw archives retained per retention policy for forensics

## 10. Integrity verification

```bash
# Application-level: run offline replay harness on exported archive JSON (no DIMO)
cd backend && npx ts-node -r tsconfig-paths/register \
  scripts/research/g5c-n16-p4h-offline-replay-from-archive.ts
```

Pilot archives: table `battery_start_proxy_pilot_raw_archives` (`archive_json` + `integrity_sha256`).

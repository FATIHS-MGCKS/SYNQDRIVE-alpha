# Production Baseline — Trip Detection & Lifecycle (Read-Only)

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` |
| **Observation window** | 2026-09-07 UTC |
| **Access path** | SSH to `srv1374778.hstgr.cloud` as `synqdrive-admin` |
| **External PostgreSQL `:5432`** | Not reachable from agent network |
| **DB access method** | SSH + `sudo` sourced `/opt/synqdrive/shared/backend.env`; `psql` with `?schema=` stripped from URI |
| **AUDIT_MODE** | `READ_ONLY` — no mutations performed |

## Deployed release

| Item | Value |
|------|--------|
| Symlink | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260906213654_v4994` |
| Deployed SHA | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |
| Health | `GET https://app.synqdrive.eu/api/v1/health` → **200** |
| Backend processes | **2** × `node …/backend/dist/src/main.js` (multi-replica) |
| PM2 JSON | Empty array returned to non-root user — process evidence from `pgrep` |

## Repository vs Production drift

| Baseline | SHA |
|----------|-----|
| `origin/main` (audit) | `06095af91ce6f58366734a182ac5962830e858db` |
| Production release | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |

Production is an **ancestor** of `main`. **`main` is 3 commits ahead**, including **R8 observability (#1549)** not deployed to observed release.

**Implication:** R8 forensic metrics/timeline fixes exist on `main` but are **not** observable on Production until next deploy.

## Redis / BullMQ (key prefix counts)

| Queue prefix | Key count (scan) |
|--------------|------------------|
| `bull:dimo.snapshot.poll:*` | 6 |
| `bull:dimo.trip-tracking:*` | 7 |

Counts are structural keys only — not job cardinality by state. No queue mutation performed.

## Trip-adjacent configuration (names only; values redacted)

Observed keys in `/opt/synqdrive/shared/backend.env`:

- `CLICKHOUSE_TRIP_ASSIST_ENABLED`
- `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED`
- `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`
- `WORKER_SNAPSHOT_CONCURRENCY`
- `WORKER_SNAPSHOT_INTERVAL_MS`
- `WORKER_TRIP_TRACKING_CONCURRENCY`

## Bounded SQL aggregates

All queries: `BEGIN READ ONLY`; `SET LOCAL statement_timeout = '10s'`; aggregate only; no row-level PII exported.

### `vehicle_trip_detection_states`

| state | count |
|-------|------:|
| RESTING | 6 |

**Limitation:** Only six FSM rows exist fleet-wide — likely a connected/telematics cohort subset, not full vehicle inventory.

### `vehicle_trips` by `trip_status`

| trip_status | count |
|-------------|------:|
| COMPLETED | 1994 |
| CANCELLED | 18 |
| ONGOING | 0 |

### Route artifacts

| table | count |
|-------|------:|
| `vehicle_trip_route_artifacts` | 94 |

~4.7% of completed trips have route artifacts (1994 completed) — coverage gap recorded as operational observation, not a defect claim.

### `trip_repairs`

| status | count |
|--------|------:|
| PROPOSED | 8472 |
| APPLIED | 1130 |
| SUPPRESSED | 379 |
| REJECTED | 25 |

| repair_type | count |
|-------------|------:|
| MISSING_TRIP | 9405 |
| INTRA_TRIP_GAP_SPLIT | 336 |
| PARTIAL_TRIP_BOUNDARY_EXTENSION | 160 |
| STALE_ONGOING | 96 |
| MISSING_END | 9 |

### `vehicle_trip_tracking_runs` (last 7 days)

| run_type | count |
|----------|------:|
| POSSIBLE_START_VALIDATION | 7012 |
| POSSIBLE_END_CHECK | 3753 |
| ACTIVE_TRACKING | 1842 |
| FINALIZATION_CHECK | 53 |
| END_VALIDATION | 2 |

**Inference:** Live FSM activity is present (thousands of tracking runs/week) despite only six persistent detection-state rows — consistent with small telematics-connected cohort.

## Not inspected this phase

- Sustained PM2 / application log forensics
- ClickHouse trip-assist mirror contents
- Per-vehicle traces, coordinates, VINs, driver identities
- DIMO provider subscription / webhook registration state
- Full env flag inventory beyond trip-adjacent sample

## Sanitization note

This file contains **aggregate counts only**. No customer, driver, VIN, coordinate, or credential values are recorded.

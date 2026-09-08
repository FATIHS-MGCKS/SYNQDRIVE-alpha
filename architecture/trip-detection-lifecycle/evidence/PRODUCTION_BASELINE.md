# Production Baseline — Trip Detection & Lifecycle (Read-Only)

## Current Production release (R9 + canary cross-ref)

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` |
| **Observation timestamp (canary)** | `2026-09-07T22:35:00Z` |
| **Production release (current)** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **R9 runtime** | **Deployed** (cross-ref [DIMO Integration PRODUCTION_BASELINE.md](../../dimo-integration/evidence/PRODUCTION_BASELINE.md)) |
| **R9 provider wiring** | **PASS** — 5/5 speed+ignition; tokenId **190497** excluded |
| **Natural R9 wake** | **Not validated** — **NEXT_GATE** `NATURAL_R9_WAKE_OBSERVATION` |

---

## Historical Production session — `2026-09-06T23:47:41Z` @ `01541c2ab…`

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` |
| **Observation timestamp** | `2026-09-06T23:47:41Z` (`date -u` at start of single read-only session) |
| **Production release (historical)** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **Note** | At this session R8/R9 were **NOT_ON_PRODUCTION** — superseded by current release above |
| **Access path** | SSH to `srv1374778.hstgr.cloud` as `synqdrive-admin` |
| **External PostgreSQL `:5432`** | Not reachable from agent network |
| **DB access method** | SSH + `sudo` sourced `/opt/synqdrive/shared/backend.env`; `psql` with URI query string stripped |
| **AUDIT_MODE** | `READ_ONLY` — no mutations performed |

All `TDL-EV-PROD-*` rows in [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) share **`2026-09-06T23:47:41Z`** unless a future re-observation explicitly replaces them.

Evidence IDs: `TDL-EV-PROD-001` … `TDL-EV-PROD-009`.

## Deployed release (TDL-EV-PROD-001) — `2026-09-06T23:47:41Z`

| Item | Value |
|------|--------|
| Symlink | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260906213654_v4994` |
| Deployed SHA | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` (read from release `.git/HEAD` ref file; no Production `git config` mutation) |

**Reproduce (sanitized):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'date -u +%Y-%m-%dT%H:%M:%SZ; readlink -f /opt/synqdrive/current; tr -d "\n" < /opt/synqdrive/current/.git/HEAD'
```

## Health (TDL-EV-PROD-002) — `2026-09-06T23:47:41Z`

`GET https://app.synqdrive.eu/api/v1/health` → **HTTP 200**

**Reproduce:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.synqdrive.eu/api/v1/health
```

## Backend processes / PM2 (TDL-EV-PROD-003) — `2026-09-06T23:47:41Z`

Read-only correlation at one timestamp:

| PM2 application | PM2 PID | `instances` | `exec_mode` | `status` | Matching Node PID |
|-----------------|--------|-------------|-------------|----------|-------------------|
| `synqdrive` | 3789590 | 1 | `fork_mode` | online | 3789590 |
| `synqdrive-b` | 3789796 | 1 | `fork_mode` | online | 3789796 |

`pgrep -f '/opt/synqdrive/.+/backend/dist/src/main\.js'` returned **exactly two PIDs** (`3789590`, `3789796`), each 1:1 with the two PM2 applications above. The pattern excludes the remote shell / `pgrep` process itself.

Both cmdlines: `node /opt/synqdrive/current/backend/dist/src/main.js`.

**Wording:** Two distinct PM2 application names, each `instances=1`. **Not** described as replicas of one application; trip-worker role split between `synqdrive` and `synqdrive-b` was **not** verified beyond PID correlation.

**Reproduce (sanitized):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'date -u +%Y-%m-%dT%H:%M:%SZ; pgrep -f "/opt/synqdrive/.+/backend/dist/src/main\.js"; sudo pm2 jlist | python3 -c "import json,sys; [print(p.get(\"name\"), p.get(\"pid\")) for p in json.load(sys.stdin) if p.get(\"name\",\"\").startswith(\"synqdrive\")]"'
```

## Repository vs Production drift

| Baseline | SHA |
|----------|-----|
| `origin/main` (audit) | `06095af91ce6f58366734a182ac5962830e858db` |
| Production release | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |

Production is an **ancestor** of `main`. **`main` is 3 commits ahead**, including **R8 observability (#1549)** not deployed to the observed release.

## Redis / BullMQ key-prefix counts (TDL-EV-PROD-004) — `2026-09-06T23:47:41Z`

| Queue prefix | Key count (`redis-cli --scan`) |
|--------------|-------------------------------:|
| `bull:dimo.snapshot.poll:*` | 5 |
| `bull:dimo.trip-tracking:*` | 7 |

Structural key-prefix counts only — not job-state cardinality. No queue mutation performed.

**Reproduce (sanitized):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'redis-cli --scan --pattern "bull:dimo.snapshot.poll:*" | wc -l; redis-cli --scan --pattern "bull:dimo.trip-tracking:*" | wc -l'
```

## Trip-adjacent configuration (names only; values redacted)

Observed keys in `/opt/synqdrive/shared/backend.env` (not re-grepped in this session; names unchanged from prior read-only sample):

- `CLICKHOUSE_TRIP_ASSIST_ENABLED`
- `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED`
- `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`
- `WORKER_SNAPSHOT_CONCURRENCY`
- `WORKER_SNAPSHOT_INTERVAL_MS`
- `WORKER_TRIP_TRACKING_CONCURRENCY`

## Bounded SQL aggregates — `2026-09-06T23:47:41Z`

All queries: `BEGIN READ ONLY`; `SET LOCAL statement_timeout = '10s'`; aggregate only; no row-level PII exported.

### `vehicle_trip_detection_states` (TDL-EV-PROD-005)

| state | count |
|-------|------:|
| RESTING | 6 |

**Query:**

```sql
SELECT state::text, count(*) FROM vehicle_trip_detection_states GROUP BY state ORDER BY count(*) DESC;
```

### `vehicle_trips` by `trip_status` (TDL-EV-PROD-006)

| trip_status | count |
|-------------|------:|
| COMPLETED | 1994 |
| CANCELLED | 18 |
| ONGOING | 0 |

**Query:**

```sql
SELECT trip_status::text, count(*) FROM vehicle_trips GROUP BY trip_status ORDER BY count(*) DESC;
```

### Route artifacts (TDL-EV-PROD-007)

| table | count |
|-------|------:|
| `vehicle_trip_route_artifacts` | 94 |

**Query:**

```sql
SELECT count(*) FROM vehicle_trip_route_artifacts;
```

### `trip_repairs` (TDL-EV-PROD-008)

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

### `vehicle_trip_tracking_runs` last 7 days (TDL-EV-PROD-009)

| run_type | count |
|----------|------:|
| POSSIBLE_START_VALIDATION | 6964 |
| POSSIBLE_END_CHECK | 3753 |
| ACTIVE_TRACKING | 1842 |
| FINALIZATION_CHECK | 53 |
| END_VALIDATION | 2 |

**Query:**

```sql
SELECT run_type::text, count(*) FROM vehicle_trip_tracking_runs
WHERE created_at > now() - interval '7 days'
GROUP BY run_type ORDER BY count(*) DESC;
```

## Not inspected this phase

- Sustained application log forensics
- ClickHouse trip-assist mirror contents
- Per-vehicle traces, coordinates, VINs, driver identities
- Full env flag inventory beyond trip-adjacent sample

## R9 provider trigger coverage (cross-ref @ `2026-09-07T22:35:00Z`)

Canonical detail: [DIMO Integration PRODUCTION_BASELINE.md](../../dimo-integration/evidence/PRODUCTION_BASELINE.md), [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](R9_FIVE_VEHICLE_CANARY_2026-09-07.md)

| Metric | Value |
|--------|---------|
| Active R9 cohort | **5** |
| subscribed_both | **5** |
| missing_both | **0** |
| tokenId 190497 R9 subscribed | **NO** |
| Natural R9 wake validated | **NO** |
| **NEXT_GATE** | `NATURAL_R9_WAKE_OBSERVATION` |

## Sanitization note

This file contains **aggregate counts and sanitized command templates only**. No customer, driver, VIN, coordinate, or credential values are recorded.

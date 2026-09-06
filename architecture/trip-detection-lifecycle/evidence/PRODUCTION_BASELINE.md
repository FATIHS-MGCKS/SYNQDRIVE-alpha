# Production Baseline — Trip Detection & Lifecycle (Read-Only)

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` |
| **Original observation window** | Bootstrap session UTC evening 2026-09-06; **exact ISO timestamp not recovered** |
| **Correction revalidation** | `2026-09-06T23:24:20Z` (`date -u` during read-only SSH re-observation) |
| **Access path** | SSH to `srv1374778.hstgr.cloud` as `synqdrive-admin` |
| **External PostgreSQL `:5432`** | Not reachable from agent network |
| **DB access method** | SSH + `sudo` sourced `/opt/synqdrive/shared/backend.env`; `psql` with URI query string stripped |
| **AUDIT_MODE** | `READ_ONLY` — no mutations performed |

Evidence IDs: [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) (`TDL-EV-PROD-*`).

## Deployed release (TDL-EV-PROD-001)

| Item | Value |
|------|--------|
| Symlink | `/opt/synqdrive/current` → `/opt/synqdrive/releases/20260906213654_v4994` |
| Deployed SHA | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |

**Reproduce (sanitized):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'readlink -f /opt/synqdrive/current && cd /opt/synqdrive/current && git rev-parse HEAD'
```

## Health (TDL-EV-PROD-002)

`GET https://app.synqdrive.eu/api/v1/health` → **200** (bootstrap session; revalidated same release path at correction time).

**Reproduce:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://app.synqdrive.eu/api/v1/health
```

## Backend processes / PM2 (TDL-EV-PROD-003)

Read-only PM2 inspection (`sudo pm2 jlist`) at `2026-09-06T23:24:20Z` found **two online PM2 applications**:

| PM2 name | `instances` | `exec_mode` | `status` |
|----------|-------------|-------------|----------|
| `synqdrive` | 1 | `fork_mode` | online |
| `synqdrive-b` | 1 | `fork_mode` | online |

`pgrep -af 'backend/dist/src/main.js'` returned **3** matching Node processes at revalidation — **not** automatically equivalent to two replicas of one application.

**Wording:** Two distinct PM2 application names were observed, each configured with `instances=1`. Matching backend Node processes were observed via `pgrep`. **PM2 replica roles for trip workers were not fully verified** (exec paths redacted/unavailable in sanitized PM2 JSON).

**Reproduce (sanitized):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'date -u +%Y-%m-%dT%H:%M:%SZ; pgrep -af "backend/dist/src/main.js" | wc -l; sudo pm2 jlist | python3 -c "import json,sys; [print(p.get(\"name\"), p.get(\"pm2_env\",{}).get(\"instances\"), p.get(\"pm2_env\",{}).get(\"exec_mode\")) for p in json.load(sys.stdin) if p.get(\"name\",\"\").startswith(\"synqdrive\")]"'
```

## Repository vs Production drift

| Baseline | SHA |
|----------|-----|
| `origin/main` (audit) | `06095af91ce6f58366734a182ac5962830e858db` |
| Production release | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` |

Production is an **ancestor** of `main`. **`main` is 3 commits ahead**, including **R8 observability (#1549)** not deployed to the observed release.

## Redis / BullMQ key-prefix counts (TDL-EV-PROD-004)

| Queue prefix | Key count (`redis-cli --scan`) |
|--------------|-------------------------------:|
| `bull:dimo.snapshot.poll:*` | 6 |
| `bull:dimo.trip-tracking:*` | 7 |

Structural key-prefix counts only — not waiting/active/completed job cardinality. No queue mutation performed.

**Reproduce (sanitized):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'redis-cli --scan --pattern "bull:dimo.snapshot.poll:*" | wc -l; redis-cli --scan --pattern "bull:dimo.trip-tracking:*" | wc -l'
```

## Trip-adjacent configuration (names only; values redacted)

Observed keys in `/opt/synqdrive/shared/backend.env`:

- `CLICKHOUSE_TRIP_ASSIST_ENABLED`
- `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED`
- `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED`
- `WORKER_SNAPSHOT_CONCURRENCY`
- `WORKER_SNAPSHOT_INTERVAL_MS`
- `WORKER_TRIP_TRACKING_CONCURRENCY`

## Bounded SQL aggregates

All queries: `BEGIN READ ONLY`; `SET LOCAL statement_timeout = '10s'`; aggregate only; no row-level PII exported. Credentials loaded on VPS from existing env file — **never commit or print connection strings**.

**Template (sanitized — run on VPS only):**

```bash
ssh synqdrive-admin@srv1374778.hstgr.cloud 'bash -s' <<'REMOTE'
set -euo pipefail
DBURL=$(sudo grep '^DATABASE_URL=' /opt/synqdrive/shared/backend.env | head -1 | cut -d= -f2- | tr -d '"')
DBURL="${DBURL%%\?*}"
psql "$DBURL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';
-- replace with one bounded aggregate query per observation
COMMIT;
SQL
REMOTE
```

### `vehicle_trip_detection_states` (TDL-EV-PROD-005)

| state | count |
|-------|------:|
| RESTING | 6 |

**Limitation:** Only six FSM rows fleet-wide — likely a connected/telematics cohort subset, not full vehicle inventory.

**Query template:**

```sql
SELECT state::text, count(*) FROM vehicle_trip_detection_states GROUP BY state ORDER BY count(*) DESC;
```

### `vehicle_trips` by `trip_status` (TDL-EV-PROD-006)

| trip_status | count |
|-------------|------:|
| COMPLETED | 1994 |
| CANCELLED | 18 |
| ONGOING | 0 |

**Query template:**

```sql
SELECT trip_status::text, count(*) FROM vehicle_trips GROUP BY trip_status ORDER BY count(*) DESC;
```

### Route artifacts (TDL-EV-PROD-007)

| table | count |
|-------|------:|
| `vehicle_trip_route_artifacts` | 94 |

~4.7% of completed trips have route artifacts (1994 completed) — operational observation only.

**Query template:**

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

**Query templates:**

```sql
SELECT status, count(*) FROM trip_repairs GROUP BY status ORDER BY count(*) DESC LIMIT 10;
SELECT repair_type, count(*) FROM trip_repairs GROUP BY repair_type ORDER BY count(*) DESC LIMIT 10;
```

### `vehicle_trip_tracking_runs` last 7 days (TDL-EV-PROD-009)

| run_type | count |
|----------|------:|
| POSSIBLE_START_VALIDATION | 7012 |
| POSSIBLE_END_CHECK | 3753 |
| ACTIVE_TRACKING | 1842 |
| FINALIZATION_CHECK | 53 |
| END_VALIDATION | 2 |

**Query template:**

```sql
SELECT run_type::text, count(*) FROM vehicle_trip_tracking_runs
WHERE created_at > now() - interval '7 days'
GROUP BY run_type ORDER BY count(*) DESC;
```

## Not inspected this phase

- Sustained application log forensics
- ClickHouse trip-assist mirror contents
- Per-vehicle traces, coordinates, VINs, driver identities
- DIMO provider subscription / webhook registration state
- Full env flag inventory beyond trip-adjacent sample

## Sanitization note

This file contains **aggregate counts and sanitized command templates only**. No customer, driver, VIN, coordinate, or credential values are recorded.

# Production Baseline — Trip Detection & Lifecycle (Read-Only)

Chronological Production baseline index. **Do not conflate** `REPO_CURRENT`, `PRODUCTION_CURRENT`, hardened-main code, and behavior validation — see [CURRENT_STATE.md](../CURRENT_STATE.md) authority axes.

---

## Current verified Production @ `2b54a357…` (Phase 5 promotion baseline)

| Field | Value | Class |
|-------|-------|-------|
| **Evidence** | **TDL-EVID-PHASE5-PROD-BASELINE-001** — [TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md](TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md) Phase 10 | — |
| **Evidence class** | `VERIFIED_READ_ONLY` (SSH `synqdrive-admin`; `readlink`, `git rev-parse`, `pm2 ls`, env `grep`, read-only SQL, Redis read commands) | — |
| **Observation window** | `2026-09-26T12:22Z` – `2026-09-26T12:27Z` | — |
| **Production release** | `2b54a357854c9d44f638ee857f72936967c04992` @ `/opt/synqdrive/releases/20260926094359_v4994` | CURRENTLY_REOBSERVED |
| **Prior TDL anchor** | `8a1d9c658…` @ `20260925182907_v4994` — ancestor; delta `8a1d9c658…` → `2b54a357…` has **no TDL runtime change** (Battery V2 / charging / config only) | CURRENTLY_REOBSERVED |
| **Repo ↔ Production** | `origin/main` `0b44b146…` = live + docs-only commits | CURRENTLY_REOBSERVED |
| **PM2** | `synqdrive` + `synqdrive-b` fork mode (1 instance each) + `pm2-logrotate`; both online | CURRENTLY_REOBSERVED |
| **Snapshot polling** | `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true` → **ACTIVITY_TIERED**; interval 30000; concurrency 8 | CURRENTLY_REOBSERVED |
| **Trip tracking concurrency** | `WORKER_TRIP_TRACKING_CONCURRENCY=5` | CURRENTLY_REOBSERVED |
| **FSM shadow** | Enabled with vehicle allowlist (value not recorded) | CURRENTLY_REOBSERVED |
| **Repair mode** | `TRIP_REPAIR_COVERAGE_MODE` unset → `shadow`; `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true` | CURRENTLY_REOBSERVED |
| **Qualified Stop threshold** | env unset → `CANONICAL_DEFAULT` 300 000 ms | CURRENTLY_REOBSERVED |
| **ClickHouse trip assist / DI V2** | `CLICKHOUSE_TRIP_ASSIST_ENABLED=true`; `DRIVING_INTELLIGENCE_V2_ENABLED=true`; `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED=false` | CURRENTLY_REOBSERVED |
| **FSM rows** | 6 — all `RESTING`; 0 with `active_trip_id`; 0 worker-locked; scheduler-eligible cohort 6 | CURRENTLY_REOBSERVED |
| **Trips** | 2284 COMPLETED / 20 CANCELLED / 0 ONGOING; 20 completed per 24 h; 105 per 7 d | CURRENTLY_REOBSERVED |
| **Tracking runs (24 h)** | 625 (ACTIVE_TRACKING 372, POSSIBLE_END_CHECK 127, POSSIBLE_START_VALIDATION 63, END_VALIDATION 47, FINALIZATION_CHECK 16) | CURRENTLY_REOBSERVED |
| **Queues** | snapshot delayed 1; trip-tracking failed 2 (retained from 2026-06-22 / 2026-07-11 — historical); handoff 0; wake mailboxes 0 | CURRENTLY_REOBSERVED |
| **TripRepair** | all-time APPLIED 1223 / PROPOSED 8595 / REJECTED 25 / SUPPRESSED 1088 | CURRENTLY_REOBSERVED |
| **ENDED rows** | 0 live / 0 tracking all-time (TDL-EVID-OQ005-ENDED-001, same release) | CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE |
| **R9 authorized provider cohort** | 5/5 speed+ignition (TDL-EVID-OQ009-R9-INGRESS-001) | CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE |
| **QS V1 natural acceptance** | `PASS_WITH_EVIDENCE_GAPS` (TDL-EVID-QS-V1-PROD-ACCEPT-001) | CARRIED_FORWARD_FROM_RECENT_VERIFIED_EVIDENCE |

**Mutations:** none. A temporary SQL file was copied to VPS `/tmp` for `psql -f` and removed in the same command.

---

## Historical — Qualified Stop V1 + post-#1750 lineage @ `8a1d9c658…` (superseded as current by Phase 5 baseline)

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` (release SHA + read-only acceptance audit) |
| **Observation window (natural QS acceptance)** | Anchored from QS-active release `2026-09-24T20:11:36+00` through rebaseline `2026-09-25` |
| **Production release (verified at the time; historical since 2026-09-26)** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `/opt/synqdrive/releases/20260925182907_v4994` |
| **Prior verified release (superseded)** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `20260924235024_v4994` |
| **Classification** | **PRODUCTION_PRESENT** (#1750, #1753 ancestors); Qualified Stop V1 acceptance **`PASS_WITH_EVIDENCE_GAPS`** |
| **Canonical detailed evidence** | [QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md](QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md) — **TDL-EVID-QS-V1-PROD-ACCEPT-001** |
| **Shadow runtime** | **PRESENT** and **ENABLED** on this release (#1648 lineage) |

Summary cross-ref only — contract thresholds, natural-case counts, regression scan, and explicit evidence gaps live in the acceptance artifact above.

---

## Historical — QS-active intermediate release @ `e30de759…`

| Field | Value |
|-------|-------|
| **Release** | `e30de7591d97868e24d6e1f379a71b52ada8a3eb` @ `/opt/synqdrive/releases/20260924201136_v4994` |
| **Classification** | **HISTORICAL** — superseded by `99d722b4…`; natural-case observation window **opens** at this deploy timestamp |
| **Note** | Qualified Stop V1 runtime present; post-#1750 finalize-quality fixes landed in later release |

---

## Historical — PRE_HARDENING_R12 @ `157b3c722…`

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` (deploy audit) |
| **Observation window** | `2026-09-09T19:08:29Z` – `2026-09-09T19:26:03Z` |
| **Production release** | `157b3c72226869e4e35d1a9398b78cab50d3fa54` @ `/opt/synqdrive/releases/20260909190912_v4994` |
| **Classification** | **HISTORICAL** — **PRE_HARDENING_R12_PRODUCTION_DEPLOYED** — CI_VALIDATED; POST_DEPLOY_HEALTH_CONFIRMED; **NOT PRODUCTION_BEHAVIOR_VALIDATED** |
| **Canonical detailed evidence** | [R12_PRODUCTION_DEPLOY_2026-09-09.md](R12_PRODUCTION_DEPLOY_2026-09-09.md) — **TDL-EV-R12-PROD-DEPLOY-001** |
| **Does not include** | PR #1594 pre-drive hardening @ `f4109e34…` (merged to main earlier; later releases supersede) |

**Not current Production.** Superseded by subsequent release chain (R12 hardening fixes, #1603/#1617/#1627/#1635/#1648/#1674, #1750/#1753) ending at `99d722b4…`.

Summary cross-ref only — full gates (CI admission, rolling deploy, scheduler, KS MS 661 T0) live in the deploy artifact above.

---

## Historical R9 Production snapshot (canary cross-ref @ `2026-09-07T22:35:00Z`)

**Not current Production.** Superseded by R10 → R11 → R12 → later releases ending at `99d722b4…`.

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` |
| **Observation timestamp (canary)** | `2026-09-07T22:35:00Z` |
| **Production release (historical @ R9)** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **R9 runtime** | **Was deployed** at this historical release (cross-ref [DIMO Integration PRODUCTION_BASELINE.md](../../dimo-integration/evidence/PRODUCTION_BASELINE.md)) |
| **R9 provider wiring** | **PASS** — 5/5 speed+ignition; tokenId **190497** excluded |
| **Natural R9 wake** | **Not validated** — **NEXT_GATE** `NATURAL_R9_WAKE_OBSERVATION` |

---

## Historical Production session — `2026-09-06T23:47:41Z` @ `01541c2ab…`

| Field | Value |
|-------|-------|
| **Evidence class** | `VERIFIED_READ_ONLY` |
| **Observation timestamp** | `2026-09-06T23:47:41Z` (`date -u` at start of single read-only session) |
| **Production release (historical)** | `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac` @ `/opt/synqdrive/releases/20260906213654_v4994` |
| **Note** | At this session R8/R9 were **NOT_ON_PRODUCTION** — superseded by later R9→R10→R11→R12→Qualified Stop releases; **current verified Production** is `99d722b4…` |
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

Observed keys in `/opt/synqdrive/shared/backend.env` (read-only @ `2026-09-25T22:43:57Z`, release `8a1d9c658…` — normalized values in [TDL_OQ_008_FEATURE_FLAG_RUNTIME_MATRIX_2026-09-25.md](TDL_OQ_008_FEATURE_FLAG_RUNTIME_MATRIX_2026-09-25.md)):

- `CLICKHOUSE_TRIP_ASSIST_ENABLED=true`
- `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true`
- `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true`
- `WORKER_SNAPSHOT_CONCURRENCY=8`
- `WORKER_SNAPSHOT_INTERVAL_MS=30000`
- `WORKER_TRIP_TRACKING_CONCURRENCY=5`
- `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true` (allowlist count **1**)
- `DRIVING_INTELLIGENCE_V2_ENABLED=true`
- `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED=false`
- `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED=true`
- `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED=true`

Absent keys use code defaults (e.g. `TRIP_REPAIR_COVERAGE_MODE=shadow`, tier MS defaults, `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=false`).

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

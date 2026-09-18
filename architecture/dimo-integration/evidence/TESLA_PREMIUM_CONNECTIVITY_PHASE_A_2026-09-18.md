# Tesla Premium Connectivity — Phase A baseline (7 days OFF)

| Field | Value |
|-------|-------|
| **Evidence ID** | DIM-EV-TESLA-PREMIUM-PHASE-A-001 |
| **Source type** | PRODUCTION_OBSERVATION (read-only) + operator ground truth |
| **Experiment** | PHASE A — Tesla Premium Connectivity **OFF** (7 complete days) |
| **Production SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| **Baseline captured (UTC)** | `2026-09-18T11:15:50.569Z` (forensic) · `2026-09-18T11:17:33.796Z` (pre-T0 rollup) |
| **Phase-A T0 (authoritative)** | ~~`2026-09-18T11:17:34.000Z`~~ **INVALID** — see recovery |
| **Phase-A end (T0 + 7d)** | ~~`2026-09-25T11:17:34.000Z`~~ **INVALID** |
| **FAILED_TESLA_PHASE_A_T0** | `2026-09-18T11:17:34.000Z` (`FAILED_TESLA_PHASE_A_T0_VALID=NO`) |
| **Recovery / authoritative T0** | [TESLA_PREMIUM_CONNECTIVITY_PHASE_A_RECOVERY_2026-09-18.md](TESLA_PREMIUM_CONNECTIVITY_PHASE_A_RECOVERY_2026-09-18.md) — T0 `2026-09-18T16:57:45.000Z` |
| **Parallel P2.5 epoch** | **Untouched** — T0 `2026-09-18T09:33:25.000Z` → `2026-09-25T09:33:25.000Z` |

## Integration architecture (fixed)

```
Tesla native cloud → DIMO Tesla integration → SynqDrive
```

- **TESLA_INTEGRATION** = `DIMO_TESLA_INTEGRATION`
- **TESLA_EXTERNAL_HARDWARE_PRESENT** = `NO` (no OBD plug/unplug semantics)
- Fleet DB label `hardwareType=LTE_R1` is taxonomy only; this vehicle is **not** in P2.5 physical-state pilot scopes.

## Vehicle identity

| Key | Value |
|-----|-------|
| TESLA_VEHICLE_NAME | Tesla Model 3 |
| TESLA_PLATE | KS FH 660E |
| TESLA_VEHICLE_UUID | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| TESLA_DIMO_TOKEN_ID | `186946` |
| Organization | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| DIMO link | ACTIVE `sourceType=DIMO` (activated `2026-08-25T18:52:48.215Z`) |
| Cross-ref audit | [docs/audits/dimo-tesla-hv-signal-capability.md](../../../docs/audits/dimo-tesla-hv-signal-capability.md) |

## Premium Connectivity ground truth

| Key | Value |
|-----|-------|
| PHASE | A |
| TESLA_PREMIUM_CONNECTIVITY | OFF |
| PREMIUM_CONNECTIVITY_STATE_SOURCE | OPERATOR_GROUND_TRUTH |

No explicit Tesla Premium subscription field was found in SynqDrive/DIMO ingestion paths during this read-only session. API-reported subscription state, if discovered later, must be recorded separately and must not override operator Phase-A ground truth without a documented transition.

## Controlled variables (frozen at Phase-A T0)

| Variable | Value at T0 |
|----------|-------------|
| PRODUCTION_SHA | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| DIMO_INTEGRATION_CONFIGURATION | `DIMO_ENV=production`; telemetry `https://telemetry-api.dimo.zone/query`; identity `https://identity-api.dimo.zone`; webhook base `https://app.synqdrive.eu`; document agent enabled |
| DIMO_POLLING_CONFIGURATION | `WORKER_SNAPSHOT_INTERVAL_MS=30000`; `WORKER_SNAPSHOT_CONCURRENCY=8`; `WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true` |
| SNAPSHOT_CADENCE | 30s base interval (activity-tier may modulate per vehicle state) |
| LIVE_CADENCE | `WORKER_LIVEMAP_INTERVAL_MS=5000`; `WORKER_LIVEMAP_CONCURRENCY=10` |
| ANALYTICS_CADENCE | No production override observed beyond repo defaults (`WORKER_DIMO_SYNC_INTERVAL_MS` template 300000 in `.env.example`; not changed this session) |
| RELEVANT_WORKER_CONFIGURATION | DIMO snapshot + livemap workers only; **no** Tesla-specific polling override |
| TESLA_PROVIDER_ADAPTER_VERSION | Deployed DIMO module @ `ca7bad8826871376a58efaa874f12992b88c4a04` (monolith; no separate adapter package version) |
| P2.5 shadow flags | `CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED=true`; `PROJECTION_WRITE=true`; `SHADOW_COMPARE=true`; pilot scopes **exclude** Tesla UUID |

**CONTROLLED_VARIABLES** (canonical list):

1. Production deploy SHA (unless recorded confounder)
2. DIMO API endpoints and `DIMO_ENV`
3. Snapshot worker interval / concurrency / activity-tier polling
4. Livemap worker interval / concurrency
5. DIMO Tesla token authorization (tokenId `186946`)
6. Experiment vehicle identity (no vehicle swap)
7. Treatment variable **excluded** from this list: `TESLA_PREMIUM_CONNECTIVITY` (OFF for Phase A)

**DIMO_POLLING_CONFIGURATION_FROZEN** = YES (documented baseline; no intentional change introduced by this workstream).

## Pre-T0 runtime baseline (reference only)

Captured read-only immediately before Phase-A T0. **PRE_T0_DATA_COUNTED_IN_PHASE_A** = NO.

| Metric | Value |
|--------|-------|
| TESLA_CURRENT_RUNTIME_STATE | VLS `sourceTimestamp` `2026-09-15T21:08:19.787Z`; `providerFetchedAt` `2026-09-18T11:11:23.629Z`; `lastSeenAt` `2026-09-15T21:08:19.787Z`; `connectionStatus=CONNECTED` |
| TESLA_PROVIDER_STATE | DIMO SNAPSHOT polls succeeding; **0** strict `sourceTimestamp` advances since last trip end (`2026-09-15T21:02:00Z` standby) in post-trip window |
| TESLA_LAST_DIMO_SOURCE_TIMESTAMP | `2026-09-15T21:08:19.787Z` |
| TESLA_SIGNALS_LATEST_LAST_SEEN | Aligns with VLS / per-signal map in forensic (e.g. SOC `2026-09-15T21:08:19.7875Z`) |
| TESLA_LAST_INGESTION_TIMESTAMP | VLS `updatedAt` `2026-09-18T11:11:23.656Z` (ingestion without fresh provider source) |
| TESLA_LAST_CLICKHOUSE_SNAPSHOT | `2026-09-15T21:08:19.787Z` (1 distinct `recorded_at` post-trip in CH) |
| TESLA_CURRENT_TELEMETRY_AGE | ~62.2 h stale vs `sourceTimestamp` at capture |
| Activity semantics | **ASLEEP_OR_OFFLINE** / long-parked stale (no `obdIsPluggedIn`; not OBD semantics); last completed trip ended `2026-09-15T21:02:00Z` |

### Pre-T0 historical window (14 days ending at capture)

| Metric | Value |
|--------|-------|
| PRE_T0_POLL_COUNT | 2445 |
| PRE_T0_UNIQUE_SOURCE_TIMESTAMP_COUNT | 1 strict advance in post-last-trip forensic window; 14d HV distinct `recordedAt` anchors: **59** |
| PRE_T0_REPEATED_SOURCE_TIMESTAMP_COUNT | Post-trip: ~348 successful SNAPSHOT polls with **0** strict source advances (stale replay pattern) |
| PRE_T0_LONGEST_SOURCE_GAP | ~60.6 h between last observed source advance and capture (parked/sleep context) |
| PRE_T0_LONGEST_SNAPSHOT_GAP | Activity-tier polling: ~30 min between successful polls while source frozen |

**Read-only tooling:**

- `backend/scripts/ops/vdc-phase2-lte-r1-production-forensic.ts` (vehicle + post-trip poll semantics)
- `backend/scripts/ops/tesla-premium-phase-a-pre-t0-readonly.cjs` (14d poll + HV rollup)

## Phase-A measurement contract (operational)

During `[TESLA_PHASE_A_T0, TESLA_PHASE_A_END)` derive from production data only:

| Area | Metrics |
|------|---------|
| A. Acquisition | `DIMO_POLL_COUNT`, `DIMO_SUCCESSFUL_RESPONSE_COUNT`, `DIMO_FAILED_RESPONSE_COUNT` (SNAPSHOT job type) |
| B. True freshness | `UNIQUE_SOURCE_TIMESTAMP_COUNT`, `REPEATED_SOURCE_TIMESTAMP_COUNT`, `STALE_RESPONSE_COUNT` — authority: **`vehicle_latest_states.source_timestamp`** (and per-signal `lastSeen` where analyzed); **not** poll success alone |
| C. Timing | `SOURCE_TIMESTAMP_GAPS`, `SNAPSHOT_GAPS`, `SIGNALS_LATEST_LAST_SEEN_GAPS` → MIN / MEDIAN / P95 / MAX when N sufficient |
| D. Signal change | Classify timestamp advanced + value changed vs unchanged vs frozen timestamp |
| E. Activity context | Natural park/sleep/wake/drive/idle — no synthetic wake |
| F. Periodicity | Report only evidenced gap modes (e.g. ~6h / ~24h if present) |

**TRUE_FRESHNESS_AUTHORITY** = `vehicle_latest_states.source_timestamp` (DIMO provider source time), with `signalsLatest.lastSeen` / ClickHouse `recorded_at` as aligned secondary witnesses.

Wake and drive event ledgers (sections 7–8 of experiment design) append to this file or sibling daily rollups during Phase A.

## Parallel P2.5 / EXP-021 isolation

| Check | Result |
|-------|--------|
| P25_T0_UNCHANGED | YES (`2026-09-18T09:33:25.000Z` on VPS shared file) |
| P25_SHADOW_STATE_UNCHANGED | YES (shadow reconciliation + compare enabled; no cutover flags) |
| P25_EPOCH_RUNNING | YES |
| EXP021_OPERATOR_RUNNING | **YES** — tmux `exp021-ks-mx-2024-operator` since `2026-09-18T10:58:21Z`; tokenId **187336** (KS MX 2024), **not** Tesla |
| PRODUCTION_DEPLOYED | NO (this workstream) |

**Confounder:** EXP-021 maturation-shadow operator is active on production during Phase-A start. It does not target Tesla token `186946` but violates the experiment start gate expectation `EXP021_OPERATOR_RUNNING=NO`.

## Phase transition (future)

- At `TESLA_PHASE_A_END`: close Phase A dataset first.
- Operator enables Premium Connectivity; record `TESLA_PREMIUM_ACTIVATION_TIME`.
- Phase B T0 = when Premium is **actually active**, not assumed at purchase time.
- Do **not** merge Phase A and B before separate closure.

## Phase-A start gate

| Gate | Result |
|------|--------|
| TESLA_PHASE_A_START_GATE | **FAIL** |

**PASS criteria met:** Tesla identified; DIMO Tesla integration confirmed; no OBD hardware semantics; Premium OFF operator ground truth; configuration baseline captured; measurement contract defined; genuine source timestamps as freshness authority; pre-T0 excluded from Phase duration; Phase-A T0/end computed; P2.5 untouched; no production deploy in this task.

**FAIL reason:** `EXP021_OPERATOR_RUNNING=YES` (required `NO` per experiment isolation contract §12–13).

Experiment observation may proceed under operator waiver; gate remains **FAIL** until EXP-021 operator stops or criterion is formally waived in writing.

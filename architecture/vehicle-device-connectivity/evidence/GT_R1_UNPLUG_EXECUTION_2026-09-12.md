# GT-R1-UNPLUG-001 — Controlled Physical Unplug/Replug Execution

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-GT-R1-EXECUTION-001 |
| **Protocol** | GT-R1-UNPLUG-001 |
| **Status** | **EXECUTED — READ-ONLY OBSERVATION COMPLETE** |
| **Target vehicle** | KS MX 2024 — Mercedes-Benz C 63 AMG |
| **SynqDrive vehicleId** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| **DIMO tokenId** | 187336 |
| **Hardware profile** | LTE_R1 |
| **Production release** | `/opt/synqdrive/releases/20260911234818_v4994` |
| **origin/main SHA (session start)** | `b8663ba8a0dc7ff2701857514ac897dcc0bd150f` |
| **Mutations** | **NONE** — read-only Production SQL; operator physical actions only |
| **Cross-ref** | [GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md](./GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md), [GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md](./GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md) |

## Epistemic banner

This artifact records **operator-authorized physical OBD unplug/replug** on Production with **read-only** SynqDrive observation. No deploy, restart, DB write, threshold change, or provider mutation was performed. PLUG webhook remained **disabled** throughout.

---

## 1. Session timeline (operator gates)

| Phase | Marker | UTC | Europe/Berlin | Notes |
|-------|--------|-----|---------------|-------|
| A | LIVE BASELINE capture | ~14:20–14:21 | ~16:20–16:21 | `READY_FOR_T0` |
| B | **PHYSICAL_T0** (unplug) | **14:27:04** | **16:27:04** | Operator-confirmed |
| B | PROVIDER_OBSERVED (obd=0) | 14:27:47 | 16:27:47 | +43 s from T0 |
| B | SYNQDRIVE_RECEIVED (UNPLUG webhook) | 14:27:51.695 | 16:27:51 | +48 s from T0 |
| B | STRICT_SOURCE_ADVANCE (unplug) | 14:27:47 | 16:27:47 | VLS `source_timestamp` |
| C | **PHYSICAL_T1** (replug) | **15:01:20** | **17:01:20** | Operator-confirmed (this message) |
| C | PROVIDER_OBSERVED (obd=1) | 15:02:29 | 17:02:29 | +69 s from T1 |
| C | STRICT_SOURCE_ADVANCE (replug) | 15:02:29 | 17:02:29 | VLS `source_timestamp` |
| C | First post-T1 SNAPSHOT poll | 15:03:34 | 17:03:34 | +74 s from T1 |
| C | `provider_fetched_at` advance | 15:04:04.544 | 17:04:04 | +104 s from T1 |

---

## 2. Phase A — Live baseline (`READY_FOR_T0`)

| Field | Value |
|-------|-------|
| `connection_status` (operational) | CONNECTED |
| `source_timestamp` | `2026-09-12T05:13:50Z` (~9.1 h old at capture) |
| `obdIsPluggedIn` | 1 |
| Open episodes | 0 |
| UNPLUG webhook provider | `enabled`, `failureCount=0` (post-recovery) |
| PLUG webhook provider | `disabled` (unchanged) |

---

## 3. Phase B — Physical unplug (`READY_FOR_T1_REPLUG`)

### 3.1 Provider webhook path — VERIFIED delivery, IGNORED canonical processing

| Field | Value |
|-------|-------|
| Inbox row | `70cb73e7-77a6-46c4-8a03-abde0d28e8f6` |
| `event_type` | `OBD_DEVICE_UNPLUGGED` |
| `processing_status` | `IGNORED_BY_POLICY` |
| `policy_ignore_reason` | `no_state_change` |
| `received_at` | `2026-09-12T14:27:51.695Z` |
| UNPLUG webhook post-delivery | `enabled`, `failureCount=0` |

**Root cause (CODE_SUPPORTED):** Last canonical `dimo_device_connection_events` rows are `OBD_DEVICE_UNPLUGGED` from **2026-08-25**. Prior episode `b256bb09-…` was resolved via `SNAPSHOT_PLUG_SIGNAL` (2026-08-26) **without** an `OBD_DEVICE_PLUGGED_IN` canonical event (PLUG webhook disabled). `shouldPersistObdPlugStateChange(false, OBD_DEVICE_UNPLUGGED)` → `no_state_change`.

### 3.2 Snapshot path — VERIFIED unplug detection

| Field | Before T0 | After unplug |
|-------|-----------|--------------|
| `obdIsPluggedIn` | 1 @ `05:13:50Z` | 0 @ `14:27:47Z` |
| `source_timestamp` | `05:13:50Z` | `14:27:47Z` (strict advance) |
| Canonical events created | — | **0** |
| Episodes opened | — | **0** |
| DEVICE_UNPLUGGED notifications | — | **0** |

### 3.3 Poll cadence during unplug window

Poll interval **stretched** during unplug (gaps up to ~5.5 min). Last poll before replug window: `14:58:04Z` SUCCESS.

---

## 4. Phase C — Physical replug (snapshot-only recovery)

### 4.1 PLUG webhook — NOT OBSERVED (expected)

| Check | Result |
|-------|--------|
| PLUG webhook inbox rows since T0 | **0** |
| PLUG provider status | **`disabled`** (constraint preserved) |

### 4.2 Snapshot replug detection — VERIFIED

Production query @ ~`15:04:27Z`:

```json
{
  "source_timestamp": "2026-09-12T15:02:29",
  "provider_fetched_at": "2026-09-12T15:04:04.544",
  "obdIsPluggedIn": { "value": 1, "timestamp": "2026-09-12T15:02:29Z" },
  "speed": { "value": 0, "timestamp": "2026-09-12T15:02:29Z" },
  "isIgnitionOn": { "value": 0, "timestamp": "2026-09-12T15:02:29Z" }
}
```

| Observation | Result |
|-------------|--------|
| `obdIsPluggedIn=true` before strict top-level advance? | **NO** — same instant `15:02:29Z` |
| Per-signal vs top-level `source_timestamp` | **Aligned** on replug wake (obd/speed/ignition all `15:02:29Z`) |
| Strict source advance `14:27:47` → `15:02:29` | **YES** |
| Post-T1 polls | `15:03:34` SUCCESS (640 ms), `15:04:04` SUCCESS (253 ms) |
| `online` (VLS) | `false` @ capture |
| Canonical events since T1 | **0** |
| Episodes opened/resolved since T0 | **0** |
| Lifecycle/resolution audits since T0 | **0** |
| Notifications (DEVICE/TELEMETRY) since T0 | **0** |

### 4.3 Recovery ordering (observed)

```
PHYSICAL_T1 (15:01:20Z)
  → provider obd=1 + strict source advance (15:02:29Z)   [~69 s]
  → first SNAPSHOT poll observing replug (15:03:34Z)     [~74 s]
  → provider_fetched_at advance (15:04:04Z)              [~104 s]
```

No webhook, episode, or notification layer activity observed on replug path.

---

## 5. GT hypothesis matrix

| # | Question | Result | Epistemic |
|---|----------|--------|-----------|
| 1 | UNPLUG webhook delivers after provider recovery (`PUT` enable)? | **CONFIRMED** — inbox row ~48 s after T0 | PRODUCTION_OBSERVATION |
| 2 | UNPLUG webhook opens device-connection episode? | **CONTRADICTED** — `IGNORED_BY_POLICY` / `no_state_change` | PRODUCTION_OBSERVATION + CODE |
| 3 | Snapshot detects `obdIsPluggedIn=0` on unplug? | **CONFIRMED** — strict advance to `14:27:47Z` | PRODUCTION_OBSERVATION |
| 4 | PLUG webhook emitted while provider PLUG disabled? | **NOT OBSERVED** (expected) | PRODUCTION_OBSERVATION |
| 5 | Replug recovery without PLUG webhook via snapshot? | **CONFIRMED** — `obd=1` @ `15:02:29Z` without inbox PLUG row | PRODUCTION_OBSERVATION |
| 6 | `obdIsPluggedIn=true` ordering vs strict source advance? | **CONCURRENT** — same timestamp on this wake | PRODUCTION_OBSERVATION |
| 7 | Per-signal timestamps advance independently on replug? | **NOT OBSERVED** — all aligned @ `15:02:29Z` | PRODUCTION_OBSERVATION (n=1 wake) |
| 8 | Episode resolution via `SNAPSHOT_PLUG_SIGNAL` without open episode? | **N/A** — no episode opened at unplug | PRODUCTION_OBSERVATION |
| 9 | `TELEMETRY_RESUMED` notification on replug? | **NOT OBSERVED** within capture window | PRODUCTION_OBSERVATION |
| 10 | `FULL_CONNECTIVITY_RECOVERED` without PLUG webhook? | **NOT PROVEN** — no runtime/notification evidence captured; `online=false` | INFERRED / INCOMPLETE |

---

## 6. Material findings for remediation

### 6.1 Canonical state drift after PLUG-free episode resolution (NEW)

When the last canonical event remains `OBD_DEVICE_UNPLUGGED` (Aug 2026) and a prior episode was resolved via `SNAPSHOT_PLUG_SIGNAL` without `OBD_DEVICE_PLUGGED_IN`, subsequent physical unplugs produce:

1. Live UNPLUG webhook delivery (provider healthy)
2. SynqDrive **ignores** webhook (`no_state_change`)
3. Snapshot updates VLS `obdIsPluggedIn` correctly
4. **No episode, no alert, no canonical event**

On replug, snapshot restores `obd=1` but **does not** repair canonical plug-state history. This is a **policy/state-machine gap** distinct from VDC-CX-010 equality upserts.

**Suggested backlog hook:** VDC-RB-002 / webhook taxonomy — reconcile canonical last-event inference with snapshot physical evidence when PLUG webhook disabled.

### 6.2 UNPLUG webhook recovery validated under live fault

Post-`PUT` enable, first live UNPLUG delivery succeeded with `failureCount=0` — closes provider-gate risk from preflight.

---

## 7. Constraints verification

| Constraint | Status |
|------------|--------|
| No Production mutations | **VERIFIED** |
| PLUG webhook stayed disabled | **VERIFIED** (0 PLUG inbox rows) |
| No deploy/restart | **VERIFIED** |
| Operator performed physical actions | **VERIFIED** (T0/T1 gates) |

---

## 8. Evidence queries (reproducible)

```sql
-- VLS at capture
SELECT source_timestamp, provider_fetched_at,
       raw_payload_json->'obdIsPluggedIn' AS obd
FROM vehicle_latest_states
WHERE vehicle_id = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';

-- Webhook inbox since unplug
SELECT id, event_type, processing_status, policy_ignore_reason, received_at
FROM device_connection_webhook_inbox
WHERE vehicle_id = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63'
  AND received_at >= '2026-09-12 14:27:00'::timestamptz
ORDER BY received_at;

-- Polls since replug
SELECT job_type, status, started_at, duration_ms
FROM dimo_poll_logs
WHERE vehicle_id = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63'
  AND started_at >= '2026-09-12 15:01:20'::timestamptz
ORDER BY started_at;
```

ClickHouse was **not available** on operator SSH path (`clickhouse-client` not installed for `synqdrive-admin`); CH corroboration deferred.

---

## 9. GT-R1 status

| Item | Status |
|------|--------|
| GT-R1-UNPLUG-001 physical execution | **COMPLETE** |
| Post-replug 26 h standby wait | **NOT REQUIRED** — primary capture checkpoints met |
| Provider mutation | **NONE** |
| Next workstream | VDC-RB-001 design (per-signal-safe equality) + canonical plug-state repair policy |

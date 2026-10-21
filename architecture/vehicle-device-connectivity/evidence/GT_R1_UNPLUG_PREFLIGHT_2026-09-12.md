# GT-R1-UNPLUG-001 — Read-Only Preflight (Provider + Production Baseline)

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-GT-R1-PREFLIGHT-001 |
| **Protocol** | GT-R1-UNPLUG-001 |
| **Status** | **PREFLIGHT COMPLETE — NOT EXECUTED** |
| **Session (UTC)** | 2026-09-12T01:53:15Z |
| **Session (Europe/Berlin)** | 2026-09-12T03:53:15+02:00 |
| **Target vehicle** | KS MX 2024 — Mercedes-Benz C 63 AMG |
| **SynqDrive vehicleId** | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| **DIMO tokenId** | 187336 |
| **assetDID** | `did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:187336` |
| **Hardware profile** | LTE_R1 |
| **Production release** | `/opt/synqdrive/releases/20260911234818_v4994` @ `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| **Mutations** | **NONE** — read-only DIMO GET + read-only Production SQL |
| **Cross-ref DIMO** | [DIM-EV-R9-CANARY-001](../../dimo-integration/evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) (historical baseline; live re-verified here) |

## Epistemic banner

This artifact records **live provider inspection** and **read-only Production state** immediately before GT-R1. It does **not** execute physical unplug/replug, does **not** promote hypotheses, and does **not** change GT-R1 status (`NOT EXECUTED`).

---

## A. Provider webhook definitions (live DIMO GET)

**API:** `GET https://vehicle-triggers-api.dimo.zone/v1/webhooks`
**Auth:** DIMO developer JWT (web3 challenge) — read-only
**Expected callback:** `https://app.synqdrive.eu/api/v1/webhooks/dimo`

**Total webhook definitions at callback (relevant):** 5 (plus 0 additional SynqDrive-callback webhooks outside this inventory)

| displayName | stableId | providerId | metricName | condition | coolDownPeriod | targetURL | status | failureCount | createdAt (UTC) | updatedAt (UTC) |
|-------------|----------|------------|------------|-----------|----------------|-----------|--------|--------------|-----------------|-----------------|
| OBD Device unplugged | `a257daa23ee5` | `49438f51-3ca5-4808-81d5-3598336c53a3` | `vss.obdIsPluggedIn` | `valueNumber == 0` | 0 | `https://app.synqdrive.eu/api/v1/webhooks/dimo` | **failed** | 11 | 2026-06-28T22:20:17.243289Z | 2026-08-25T20:42:06.479862Z |
| OBD Device Plugged in | `b977124a025a` | `7a0562d3-369a-45eb-b5ed-8d35258091dd` | `vss.obdIsPluggedIn` | `valueNumber == 1` | 0 | same | **disabled** | 0 | 2026-06-28T22:22:15.742782Z | 2026-07-08T05:06:44.718491Z |
| SynqDrive R9 Speed Wake | `9eeb7158afee` | `7a5e81bc-8f48-4b62-877a-9df104c1f42e` | `vss.speed` | `valueNumber > 3` | 30 | same | enabled | 0 | 2026-09-07T22:35:49.993442Z | 2026-09-07T22:35:49.993442Z |
| SynqDrive R9 Ignition Wake | `5d611d470eab` | `3a2fcd34-1a74-45db-bee9-75e340f36b00` | `vss.isIgnitionOn` | `valueNumber == 1` | 30 | same | enabled | 0 | 2026-09-07T22:35:50.527257Z | 2026-09-07T22:35:50.527257Z |
| High RPM Triger | `1f96faea6569` | `f6bdbe85-dec0-4e60-ad61-d9183cd55484` | `vss.powertrainCombustionEngineSpeed` | `valueNumber > 5000` | 10 | same | enabled | 0 | 2026-07-05T13:36:53.347264Z | 2026-07-05T13:36:53.347264Z |

**Historical four definitions:** all **still exist** with unchanged stableIds. OBD unplug `updatedAt` matches Aug 2026 unplug incident window.

---

## B. KS MX 2024 subscription matrix (tokenId 187336)

**API:** `GET /v1/webhooks/vehicles/{assetDID}` — 5 linked webhooks

| Webhook | stableId | exists | provider status | 187336 subscribed? | evidence source |
|---------|----------|--------|-----------------|-------------------|-----------------|
| OBD Device unplugged | `a257daa23ee5` | yes | **failed** | **yes** | DIMO GET vehicles/{assetDID} |
| OBD Device Plugged in | `b977124a025a` | yes | **disabled** | **yes** | DIMO GET vehicles/{assetDID} |
| R9 Speed Wake | `9eeb7158afee` | yes | enabled | **yes** | DIMO GET vehicles/{assetDID} |
| R9 Ignition Wake | `5d611d470eab` | yes | enabled | **yes** | DIMO GET vehicles/{assetDID} |
| High RPM Triger | `1f96faea6569` | yes | enabled | **yes** | DIMO GET vehicles/{assetDID} |

**Interpretation:** Subscription membership ≠ delivery eligibility. PLUG is subscribed but **disabled** (no PLUG deliveries expected). UNPLUG is subscribed but provider status **failed** (delivery reliability uncertain — see §Run A gate).

---

## C. OBD plug/unplug provider conditions (exact)

| Webhook | metricName | exact condition | boolean semantics |
|---------|------------|-----------------|-------------------|
| OBD Device unplugged | `vss.obdIsPluggedIn` | `valueNumber == 0` | unplug when signal equals **0** |
| OBD Device Plugged in | `vss.obdIsPluggedIn` | `valueNumber == 1` | plug when signal equals **1** |

No alternate expression observed in live provider payload (no `false`/`true` CEL; numeric equality only).

---

## D. Callback verification

| Check | Result |
|-------|--------|
| Expected SynqDrive ingress | `https://app.synqdrive.eu/api/v1/webhooks/dimo` |
| All five relevant webhooks `targetURL` | **match** |
| Production trigger registry cache `callback_url` | `https://app.synqdrive.eu/api/v1/webhooks/dimo` (synced 2026-09-12T00:56:12Z) |
| Mutation performed | **none** |

---

## E. SynqDrive ingest readiness (repository + Production read-only)

### Provider capability vs SynqDrive implementation

| Capability | Provider (live) | SynqDrive code (origin/main) |
|------------|-----------------|--------------------------------|
| OBD unplug webhook delivery | Definition exists; status **failed**; subscribed | `DimoWebhookController` → `DeviceConnectionWebhookInboxService` → `OBD_DEVICE_UNPLUGGED` |
| OBD plug webhook delivery | Definition **disabled**; subscribed | Same ingress path → `OBD_DEVICE_PLUGGED_IN` when `pluggedIn=true` |
| Snapshot `obdIsPluggedIn=true` replug | `signalsLatest` path (poll) | `dimo-snapshot.processor` → `tryResolveFromSnapshotPlugSignal` → `SNAPSHOT_PLUG_SIGNAL` |
| Sustained telemetry recovery | N/A (SynqDrive policy) | `tryResolveFromSustainedTelemetry` → `TELEMETRY_RESUMED` |
| Default recovery policy | N/A | `UNPLUG_WEBHOOK_PLUG_SNAPSHOT` — plug webhook **NOT_APPLICABLE** by policy (`device-connection-webhook-configuration.policy.ts`) |

### Production baseline @ preflight (read-only SQL)

| Field | Value (UTC unless noted) |
|-------|--------------------------|
| `connection_status` | CONNECTED |
| `source_timestamp` | 2026-09-11 05:10:42 |
| `provider_fetched_at` | 2026-09-12 01:52:33 |
| `obdIsPluggedIn` (VLS) | 1 @ 2026-09-11T05:10:42Z |
| Open episodes | **0** (last resolved 2026-08-26 via `SNAPSHOT_PLUG_SIGNAL`) |
| Recent inbox rows | 2× `OBD_DEVICE_UNPLUGGED` (Aug 2026); both `enqueue_failed` then `PROCESSED` |
| Recent polls | SNAPSHOT SUCCESS ~every 5 min (latest 2026-09-12T01:52:32Z) |

### PLUG webhook ingestion in SynqDrive

**Supported in code:** yes — `DeviceConnectionWebhookService.eventTypeForPlugState(true)` → `OBD_DEVICE_PLUGGED_IN` → `resolveFromExplicitPlugEvent`.

**Expected at runtime today:** **no PLUG webhook deliveries** — provider definition status is **disabled** (matches ops policy since 2026-07-08).

### Snapshot-only replug recovery

**Supported in code:** yes — `DeviceConnectionEpisodeResolutionService.tryResolveFromSnapshotPlugSignal` invoked from `dimo-snapshot.processor` after each successful snapshot when `obdIsPluggedIn=true` with valid per-signal timestamp.

**Production precedent:** Aug 2026 episode `b256bb09-…` resolved via `SNAPSHOT_PLUG_SIGNAL` without PLUG webhook (see VDC-EVID-LTE-R1-PROD-001).

**Caveat:** `TELEMETRY_RESUMED` policy states snapshot alone never resolves; requires sustained telemetry/trip evidence per `device-connection-telemetry-recovery.policy.ts`.

### Tables/logs to watch during GT-R1

| Layer | Store / log |
|-------|-------------|
| Provider | Webhook definitions, vehicle links, delivery metadata (if exposed) |
| Ingress | `device_connection_webhook_inbox` |
| Events | `dimo_device_connection_events` |
| Episodes | `device_connection_episodes` |
| Latest state | `vehicle_latest_states` (`source_timestamp`, `provider_fetched_at`, `raw_payload_json.obdIsPluggedIn`) |
| Poll forensics | `dimo_poll_logs` |
| Alerts | `notifications` (DEVICE_*, TELEMETRY_*) |
| History | ClickHouse `telemetry_snapshots` |
| Runtime | PM2 `synqdrive` / `synqdrive-b` — `DimoWebhookController`, snapshot processor, VLS monotonic guard |

---

## F. GT-R1 execution plan (operator sequence)

### Preflight gate (before physical test)

| Gate | Status | Action if fail |
|------|--------|----------------|
| Vehicle healthy baseline | **PASS** (CONNECTED, obd=1, recent poll) | Defer GT until baseline restored |
| PLUG webhook active delivery | **N/A** — disabled | Run A valid for PLUG-free path |
| UNPLUG webhook provider status | **WARN — failed** | Operator must decide: proceed (may miss unplug webhook) or authorize provider remediation first |
| Open unplug episode | **PASS** (none open) | Resolve/clear before GT |

### RUN A — current behavior (preferred; no newly enabled PLUG webhook)

PLUG webhook is **not active** (disabled). Run A represents webhook-free PLUG baseline without provider mutation.

**Operator sequence:**

1. **T-30 min — baseline capture** (UTC + Europe/Berlin): VLS, runtime projection API, `dimo_vehicles`, poll log tail, provider webhook GET snapshot.
2. **T0 — physical unplug** — operator removes R1; record exact wall time (photo/time.is optional).
3. **T0+0..15 min — provider path** — watch DIMO delivery (if API exposes); SynqDrive inbox/events.
4. **T0+0..2 h — stall observation** — confirm `source_timestamp` stall; polls continue.
5. **T1 — physical replug** — operator reinserts R1; record exact wall time.
6. **T1+ — replug evidence** — do **not** require PLUG webhook; capture snapshot `obdIsPluggedIn=true`, per-signal timestamps, strict top-level `sourceTimestamp` advance.
7. **Recovery ordering** — document order: unplug webhook → episode open → snapshot plug signal → strict advance → `TELEMETRY_RESUMED` → `FULL_CONNECTIVITY_RECOVERED`.
8. **Stop** — GT complete at checkpoints or abort per TEST_STRATEGY stop conditions.

**Max windows:** unplug observe ≤2 h; post-replug wait ≤26 h (standby cycle + jitter).

### RUN B — optional comparison (NOT authorized; design only)

**Purpose:** measure PLUG webhook impact on presence detection, episode resolution, and recovery latency.

**Requires explicit operator authorization:**

1. Enable provider webhook `b977124a025a` (OBD Device Plugged in) — status `disabled` → `enabled`.
2. Re-verify subscription for 187336 (already subscribed).
3. Repeat controlled unplug/replug with PLUG path instrumented.

**Do not execute Run B during Run A.**

### UNPLUG webhook failed-status note

Provider status `failed` + `failureCount=11` on unplug webhook is a **preflight risk**. GT-R1 may observe snapshot-only unplug detection or delayed/missing webhook delivery. Document actual provider behavior; do not assume Aug 2026 ~4.7s delivery without live confirmation.

---

## G. Observability — read-only watch queries

Replace `$VEHICLE_ID` = `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, `$TOKEN_ID` = `187336`.

**Timestamp discipline:** record operator T0/T1 in **UTC** and **Europe/Berlin** (`AT TIME ZONE 'Europe/Berlin'` in SQL).

### PostgreSQL (Production VPS)

```sql
-- Baseline / recovery: latest state
SELECT source_timestamp,
       source_timestamp AT TIME ZONE 'Europe/Berlin' AS source_ts_berlin,
       provider_fetched_at,
       provider_fetched_at AT TIME ZONE 'Europe/Berlin' AS fetched_berlin,
       raw_payload_json->'obdIsPluggedIn' AS obd
FROM vehicle_latest_states
WHERE vehicle_id = '$VEHICLE_ID';

-- Poll forensics (5 min cadence expected)
SELECT job_type, status, started_at,
       started_at AT TIME ZONE 'Europe/Berlin' AS started_berlin,
       error_code, duration_ms
FROM dimo_poll_logs
WHERE vehicle_id = '$VEHICLE_ID'
ORDER BY started_at DESC
LIMIT 20;

-- Webhook inbox
SELECT id, event_type, processing_status, last_error_code,
       received_at, received_at AT TIME ZONE 'Europe/Berlin' AS received_berlin,
       processed_at
FROM device_connection_webhook_inbox
WHERE vehicle_id = '$VEHICLE_ID'
ORDER BY received_at DESC
LIMIT 20;

-- Canonical events
SELECT event_type, observed_at, observed_at AT TIME ZONE 'Europe/Berlin' AS observed_berlin,
       received_at, processed_at
FROM dimo_device_connection_events
WHERE vehicle_id = '$VEHICLE_ID'
ORDER BY observed_at DESC
LIMIT 20;

-- Episodes
SELECT status, opened_at, resolved_at, resolution_method, resolution_evidence_at
FROM device_connection_episodes
WHERE vehicle_id = '$VEHICLE_ID'
ORDER BY opened_at DESC
LIMIT 5;

-- Notifications
SELECT type, status, first_seen_at, resolved_at
FROM notifications
WHERE vehicle_id = '$VEHICLE_ID'
  AND type::text ~* 'DEVICE|TELEMETRY'
ORDER BY first_seen_at DESC
LIMIT 20;
```

### ClickHouse (when available on operator path)

```sql
SELECT recorded_at,
       maxIf(value, signal_name = 'obdIsPluggedIn') AS obd,
       maxIf(value, signal_name = 'speed') AS speed
FROM telemetry_snapshots
WHERE vehicle_id = '$VEHICLE_ID'
  AND recorded_at >= toDateTime64('$T0_UTC', 3)
ORDER BY recorded_at;
```

### Provider (read-only; Cloud Agent / VPS with backend.env)

```bash
# Pattern: backend/scripts/ops/r9-post-get-audit.mjs (GET only)
# GET /v1/webhooks
# GET /v1/webhooks/vehicles/did:erc721:137:0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF:187336
```

### Runtime logs (read-only PM2)

```bash
pm2 logs synqdrive --lines 200 --nostream | rg -i 'DimoWebhookController|device_connection|monotonic|snapshot completed'
pm2 logs synqdrive-b --lines 200 --nostream | rg -i 'DimoWebhookController|device_connection|monotonic|snapshot completed'
```

---

## H. Operator vs authorization matrix

| Item | Operator action now? | Provider mutation authorization? |
|------|---------------------|----------------------------------|
| GT-R1 physical unplug/replug | **yes** (when authorized) | no |
| Read-only provider GET | done in preflight | no |
| Read-only Production SQL | operator/VPS | no |
| Enable PLUG webhook (Run B) | no | **yes — explicit** |
| Fix UNPLUG `failed` status | no | **yes — explicit** (recommended before GT if webhook path required) |
| Disable PLUG subscription | no | **yes** (unnecessary — already disabled) |
| Deploy / restart / threshold change | **no** | n/a |

---

## I. Related repository read-only scripts

| Script | Purpose |
|--------|---------|
| `backend/scripts/ops/r9-post-get-audit.mjs` | GET webhooks + per-vehicle subscriptions |
| `backend/scripts/ops/r9-preflight-check.mjs` | R9 cohort preflight (mutations if misused — **do not run subscribe path**) |
| `backend/src/modules/dimo/dimo-triggers.service.ts` | `listWebhooksDetailed`, `getVehicleWebhookSubscriptions` |
| `backend/scripts/ops/vdc-phase2-lte-r1-production-forensic.ts` | Phase 2 forensic queries (read-only pattern) |

**Not documented as canonical DIMO mutation procedure** — post-GT authority update deferred per operator instruction.

---

## J. GT status

| Field | Value |
|-------|-------|
| GT-R1-UNPLUG-001 | **NOT EXECUTED** |
| VDC-VAL-GT-001 | unchanged |
| Hypothesis promotions | **none** from this preflight |

# R22 — R9 preflight & R2.1 evidence corrections

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R22-PREFLIGHT-001`, `DIM-EV-R22-EVIDENCE-FIX-001` |
| **AUDIT_MODE** | `READ_ONLY` |
| **Production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **Observed at (UTC)** | `2026-10-11T19:38:39Z` (preflight curls) |

## Phase A — Metric contradictions corrected

### A1 — nginx POST count 2026-10-09

| Source | Total POST | 200 | 503 | Notes |
|--------|------------|-----|-----|-------|
| **R2.1 (wrong)** | 381 cited in daily table | 751 cited in prose | 40 | Filter `Oct/2026:09` = **hour 09 only** |
| **R2.2 (correct)** | **791** | **751** | **40** | Filter `09/Oct/2026:` = full UTC day |

**Reproducible method:**

```bash
sudo bash architecture/dimo-integration/scripts/r22-nginx-dimo-webhook-aggregate.sh 2026-10-09
```

Data: nginx `access.log` + rotated `access.log.*` on Production VPS.

### A2 — Snapshot / telemetry freshness (cohort @ 2026-10-11)

**Data source:** `dimo_vehicles.last_signal`, `dimo_vehicles.synced_at` (read-only SQL).  
**Semantics:**

| Column | Meaning |
|--------|---------|
| `last_signal` | Last mirrored provider signal timestamp on `DimoVehicle` row |
| `synced_at` | Last SynqDrive DIMO sync job touch — **not** proof of fresh hardware data |

| tokenId | last_signal (UTC) | synced_at (UTC) | Same calendar day as audit (2026-10-11)? |
|---------|-------------------|-----------------|----------------------------------------|
| 186946 | 2026-10-01 13:46:44 | 2026-10-11 09:46:11 | **NO** |
| 187336 | 2026-09-29 17:25:26 | 2026-10-01 09:46:11 | **NO** |
| 187361 | 2026-10-11 08:45:19 | 2026-10-11 09:46:11 | **YES** |
| 187784 | 2026-10-11 09:26:30 | 2026-10-11 09:46:11 | **YES** |
| 192922 | 2026-10-11 07:08:53 | 2026-10-11 09:46:11 | **YES** |

**Corrected KPI:** **3/5** vehicles with `last_signal` on audit date (**60%**), not 4/5 (80%).  
R2.1 incorrectly counted **186946** as same-day fresh.

### A3 — RCA confidence layering (replaces single CONFIRMED)

| Layer | Statement | Confidence |
|-------|-----------|------------|
| **L1 Provider mechanism** | `failed` after delivery failures; delivery stops while `failed` | **CONFIRMED** (source + GET) |
| **L2 HTTP 503 series** | 40 DIMO webhook POSTs → 503 on 2026-10-09 15:21–15:22 UTC | **CONFIRMED** (nginx) |
| **L3 503 body** | Sample line: 32-byte response; orchestrator maintenance stub text | **CONFIRMED** (orchestrator script) |
| **L4 Temporal correlation** | Provider `updatedAt` within seconds of 503 burst | **CONFIRMED** (timestamps) |
| **L5 Deploy participation** | Public maintenance enabled by VO5C orchestrator Phase 1 @ 15:20Z; rolling @ 15:38Z **after** provider `failed` | **CONFIRMED** (deploy logs) |
| **L6 Per-failure attribution** | Each of 40 nginx 503 lines = one DIMO increment | **INFERRED** |
| **L7 Rolling restart caused 15:21 503** | — | **REJECTED** (timing) |

## Phase B — Deploy incident

See [R9_DEPLOYMENT_AVAILABILITY_RCA.md](../research/R9_DEPLOYMENT_AVAILABILITY_RCA.md).

## Phase C — Current callback health (@ 2026-10-11T19:38Z)

| Check | Result |
|-------|--------|
| `https://app.synqdrive.eu/api/v1/health` | **200** `{"status":"ok",...}` |
| `https://app.synqdrive.eu/api/v1/webhooks/dimo/health` | **200** — verification + HMAC configured |
| PM2 replicas | synqdrive + synqdrive-b **online** |
| nginx upstream | `127.0.0.1:3001` + `3002` (normal proxy, not maintenance stub) |
| Current access.log webhook POST | **289×200**, **0** non-2xx (since log rotation — not full 7d) |
| R9 provider status | Speed + Ignition still **`failed`** (GET @ 19:39Z) |

**Conclusion:** **HTTP transport suitable for recovery PUT** if no concurrent deploy maintenance. **R9 wake path inactive** until provider `PUT`.

## Phase D — Cohort authorization

### tokenId 187336 — **AUTHORIZATION_INCONSISTENCY_SUSPECTED**

| Signal | Finding |
|--------|---------|
| Registry | ACTIVE / AVAILABLE / CONNECTED |
| Consent | ACTIVE |
| Provider R9 subs | Present |
| `last_signal` | **2026-09-29** (stale) |
| `device_connection_episodes` | **OPEN** `OBD_DEVICE_UNPLUGGED_WEBHOOK` opened **2026-09-29 17:25:26** (matches last_signal) |

**Owner gate:** Do not infer valid **current** owner consent from DB CONNECTED alone. See [R9_RECOVERY_OWNER_GATE.md](../research/R9_RECOVERY_OWNER_GATE.md) GATE-B.

### tokenId 186946 — freshness

| Finding |
|---------|
| `last_signal` **2026-10-01** but `synced_at` **2026-10-11** — sync runs, **no new provider signals** mirrored |
| No recent unplug episode in last 8 episodes query (empty for 186946) |
| **INFERRED:** parked / low activity / device not reporting — not same as 187336 unplug episode |

### tokenId 190497

R9 speed/ignition **absent** on provider — **CONFIRMED** exclusion.

## Phase E — Recovery preflight

Documented in [R9_RECOVERY_OWNER_GATE.md](../research/R9_RECOVERY_OWNER_GATE.md). **RECOVERY_PAYLOAD_DIFF_READY=YES**. **RECOVERY_EXECUTED=NO**.

## Mutations

**None.**

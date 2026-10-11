# R21 — R9 provider state & SynqDrive ingress forensics

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R21-PROVIDER-001`, `DIM-EV-R21-INGRESS-001` |
| **AUDIT_MODE** | `READ_ONLY` |
| **Production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |
| **Observed at (UTC)** | `2026-10-11T19:26:34Z` (provider GET); nginx window `2026-10-04`–`2026-10-11` |
| **PR branch head (pre-R21 commit)** | `f4e9862faec4d184f78720a8acf0cbfb2f95ef87` |
| **origin/main @ audit** | `0633d08311803b1473c6e7a274e5074e4cb69a08` |

## 1. Provider GET — R9 definitions (sanitized)

| Field | R9 Speed `9eeb7158afee` | R9 Ignition `5d611d470eab` |
|-------|-------------------------|----------------------------|
| Provider UUID | `7a5e81bc-8f48-4b62-877a-9df104c1f42e` | `3a2fcd34-1a74-45db-bee9-75e340f36b00` |
| `status` | **`failed`** | **`failed`** |
| `failureCount` | **28** | **12** |
| `updatedAt` (UTC) | **2026-10-09T15:22:50.698667Z** | **2026-10-09T15:22:29.991375Z** |
| `createdAt` (UTC) | 2026-09-07T22:35:49.993442Z | 2026-09-07T22:35:50.527257Z |
| `service` | `signals` | `signals` |
| `metricName` | `vss.speed` | `vss.isIgnitionOn` |
| `condition` (CEL) | `valueNumber > 3` | `valueNumber == 1` |
| `coolDownPeriod` | 30 | 30 |
| `targetHost` | `app.synqdrive.eu` | `app.synqdrive.eu` |
| `subscriberCount` | **5** | **5** |
| `subscriberTokenIds` | 186946, 187336, 187361, 187784, 192922 | same |

**Not available via GET:** last delivery time, last HTTP status, per-failure reason, delivery inbox.

### Contrast webhook (same session)

| stableId | displayName | status | failureCount | updatedAt (UTC) |
|----------|-------------|--------|--------------|-----------------|
| `a257daa23ee5` | OBD UNPLUG | **enabled** | 0 | 2026-10-11T17:01:40Z (post GT-R1 pattern) |

## 2. Before / after matrix (authorized cohort)

| Timestamp / baseline | Speed def status | Ignition def status | Subscriptions 5/5 | Notes |
|----------------------|------------------|---------------------|-------------------|-------|
| 2026-09-07 canary (`DIM-EV-R9-CANARY-001`) | **enabled** | **enabled** | PASS | Bootstrap + GET |
| 2026-09-12 GT-R1 forensics | **enabled**, fc=0 | **enabled**, fc=0 | PASS | [GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md) |
| 2026-09-08 / 09 natural R9 delivery | enabled (assumed) | enabled (assumed) | PASS | KS MS 661 wakes `DIM-EV-KS-MS-661-R9-*` |
| 2026-10-11 R2 GET (`DIM-EV-R2-R9-GET-001`) | **failed** | **failed** | PASS | First doc snapshot of failed defs |
| 2026-10-11 R21 GET (this) | **failed**, fc=28 | **failed**, fc=12 | PASS | `updatedAt` pins transition **2026-10-09 ~15:22 UTC** |

**Configuration drift:** metric/condition/cooldown/host **UNCHANGED** vs canary; **only** `status`, `failureCount`, `updatedAt` diverge.

## 3. Ingress chain (reference)

```text
DIMO Vehicle Triggers API → HTTPS POST app.synqdrive.eu/api/v1/webhooks/dimo
  → nginx → Nest DimoWebhookController → normalize → speed|ignition → SnapshotWakeIntakeService
  → SnapshotWakeCoordinator → BullMQ snapshot.wake → snapshot worker / dimo.snapshot.poll
```

## 4. Nginx aggregate — `POST /api/v1/webhooks/dimo` (UTC days)

| Date (UTC) | POST count |
|------------|------------|
| 2026-10-04 | 237 |
| 2026-10-05 | 466 |
| 2026-10-06 | 73 |
| 2026-10-07 | 31 |
| 2026-10-08 | 199 |
| 2026-10-09 | 381 (**751×200 + 40×503** on that day) |
| 2026-10-10 | 1424 |
| 2026-10-11 | 1257 (partial day) |

**Oct 9 15:xx UTC:** burst of **40× HTTP 503** between `15:21:03` and `15:21:30` (sampled); aligns with provider `updatedAt` **15:22:29 / 15:22:50** and release folder `20261009152645_v4994` @ **15:27**.

**Oct 10–11:** sampled nginx lines show **200** only for webhook POST (no non-2xx in sample).

**Limitation:** nginx access log **does not** label metric (speed vs RPM vs OBD); cannot attribute counts to R9 alone.

## 5. PM2 application logs (7-day window)

| Search | Result |
|--------|--------|
| `Received DIMO webhook` | **0** lines in rotated `synqdrive-out*` / `synqdrive-b-out*` |
| `SnapshotWake` / `wakeOutcome` | **0** non-route lines Oct 2026 |
| `webhooks/dimo` route mapping | Present on each deploy restart only |

**Interpretation:** Retained PM2 logs **do not** provide R9 wake audit trail for Oct 2026. **Absence is not proof** of zero provider attempts. Historical Sept KS 661 session **did** capture `Received DIMO webhook` lines (`DIM-EV-KS-MS-661-R9-001`).

## 6. UTC timeline (merged)

| UTC | Source | Event |
|-----|--------|-------|
| 2026-09-07 22:35 | Provider | R9 defs created |
| 2026-09-08 / 09 | PM2 (historical) | Natural R9 triggers → wakes for 187361 |
| 2026-09-12 | Provider GET | R9 enabled, fc=0 |
| 2026-10-09 ~15:21 | nginx | 40× webhook POST **503** |
| 2026-10-09 15:22:29 | Provider | Ignition → **failed**, fc=12 |
| 2026-10-09 15:22:50 | Provider | Speed → **failed**, fc=28 |
| 2026-10-09 15:27 | VPS | Deploy release `20261009152645_v4994` |
| 2026-10-10 – 11 | nginx | High volume webhook POST **200** (all webhooks) |
| 2026-10-11 19:26 | Provider GET | R9 still **failed**, subs **5/5** |

## 7. Natural delivery KPI (R21, evidence-bounded)

States A–D per mission; numerators/denominators explicit.

| KPI | Numerator | Denominator | Result | Notes |
|-----|-----------|-------------|--------|-------|
| **A Subscription coverage** | 5 vehicles with speed+ignition link | 5 authorized cohort | **100%** | `DIM-EV-R21-PROVIDER-001` |
| **B Provider trigger fired (R9)** | — | — | **INSUFFICIENT_EVIDENCE** | No provider trigger log API |
| **C HTTP acceptance (all DIMO webhooks)** | nginx 2xx POST | nginx all POST Oct 9 | **751/791 ≈ 94.9%** (Oct 9 only) | Includes non-R9 |
| **C HTTP acceptance Oct 10–11** | all sampled 200 | sampled | **~100%** | No non-2xx in sample |
| **D Wake admission (R9 Oct 4–11)** | 0 PM2 `Received DIMO webhook` | — | **INSUFFICIENT_EVIDENCE** | Logging/retention gap |
| **Wake→snapshot (R9)** | — | — | **INSUFFICIENT_EVIDENCE** | No correlated wake logs |
| **Snapshot freshness (cohort)** | 4/5 `last_signal` on 2026-10-11 | 5 vehicles | **80% same-day** | See cohort review; 187336 stale |
| **Polling fallback** | Scheduler tier polling **enabled** @ Production | `DIM-EV-R2-PROD-RUNTIME-001` | **ACTIVE** | Trip start may lag vs R9 wake |

## 8. Mutations

**None** (provider GET + auth POST + read-only SQL/nginx/pm2).

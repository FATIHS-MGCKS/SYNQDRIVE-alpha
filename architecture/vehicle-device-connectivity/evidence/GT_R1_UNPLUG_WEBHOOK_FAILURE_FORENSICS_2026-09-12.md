# GT-R1 — OBD UNPLUG Webhook Provider `failed` State Forensics

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-GT-R1-UNPLUG-FAILURE-001 |
| **Related protocol** | GT-R1-UNPLUG-001 (still **NOT EXECUTED**) |
| **Session (UTC)** | 2026-09-12T02:21:03Z |
| **Session (Europe/Berlin)** | 2026-09-12T04:21:03+02:00 |
| **Target vehicle** | KS MX 2024 — `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` / tokenId **187336** |
| **UNPLUG webhook UUID** | `49438f51-3ca5-4808-81d5-3598336c53a3` |
| **UNPLUG stableId** | `a257daa23ee5` |
| **Mutations** | **NONE** — read-only DIMO GET + read-only Production SQL/log review |
| **Cross-ref** | [GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md](./GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md), [connectivity-production-processing-gate-2026-08.md](../../../docs/audits/connectivity-production-processing-gate-2026-08.md), [DIM webhook ops](../../dimo-integration/operations/WEBHOOK_OPERATIONS.md) |

## Epistemic banner

Forensics + remediation **design only**. No provider mutation, no Production mutation, no GT execution.

---

## 1. Raw provider state (live GET 2026-09-12)

### UNPLUG — list entry (`GET /v1/webhooks`)

```json
{
  "id": "49438f51-3ca5-4808-81d5-3598336c53a3",
  "service": "signals",
  "metricName": "vss.obdIsPluggedIn",
  "condition": "valueNumber == 0",
  "targetURL": "https://app.synqdrive.eu/api/v1/webhooks/dimo",
  "coolDownPeriod": 0,
  "status": "failed",
  "description": "Driver unplugged OBD Device",
  "createdAt": "2026-06-28T22:20:17.243289Z",
  "updatedAt": "2026-08-25T20:42:06.479862Z",
  "failureCount": 11,
  "displayName": "OBD Device unplugged"
}
```

**No additional provider error/reason/retry metadata** exposed beyond `status` and `failureCount`.

### UNPLUG — subscribed vehicles (`GET /v1/webhooks/{webhookId}`)

Returns **7 assetDIDs** (includes 187336). Full list redacted to tokenIds:

`186946`, `187336`, `187361`, `187784`, `189118`, `190497`, `192922`

### Comparison — same callback, different provider health

| Webhook | stableId | status | failureCount | updatedAt (UTC) |
|---------|----------|--------|--------------|-----------------|
| OBD unplug | `a257daa23ee5` | **failed** | **11** | 2026-08-25T20:42:06.479862Z |
| OBD plug | `b977124a025a` | disabled | 0 | 2026-07-08T05:06:44.718491Z |
| R9 speed | `9eeb7158afee` | enabled | 0 | 2026-09-07T22:35:49.993442Z |
| R9 ignition | `5d611d470eab` | enabled | 0 | 2026-09-07T22:35:50.527257Z |

**Conclusion:** Failure is **definition-specific**, not callback-wide. Same `targetURL`; R9 webhooks healthy (`failureCount=0`, `enabled`).

### tokenId 187336 subscriptions (`GET /v1/webhooks/vehicles/{assetDID}`)

UNPLUG subscribed since `2026-06-28T22:20:24.376283Z`. PLUG subscribed but **disabled** at definition level (must remain disabled).

---

## 2. Reconstructing `failureCount=11`

### Provider domain vs SynqDrive domain

| Domain | What it measures | Evidence |
|--------|------------------|----------|
| **A — DIMO `failureCount`** | Provider-side HTTP callback delivery health counter | Live GET; `updatedAt` aligns with Aug 2026 unplug window |
| **B — SynqDrive inbox `last_error_code=enqueue_failed`** | BullMQ enqueue failure after HTTP accepted | Production rows; **not** the same counter |
| **C — SynqDrive canonicalization delay** | Async scheduler retry after fix deploy | ~100 min Aug 2026; separate from DIMO counter |

**Do not conflate A/B/C.**

### Production inbox corpus (all vehicles, read-only)

| inbox id (prefix) | tokenId | observed (UTC) | received (UTC) | status | last_error_code |
|-------------------|---------|----------------|----------------|--------|-----------------|
| `da2601ce…` | 187784 | 2026-07-28 07:56:47 | 2026-07-28 07:56:52 | RECEIVED | null |
| `c19d5eed…` | 187784 | 2026-08-08 06:59:18 | 2026-08-08 06:59:20 | RECEIVED | null |
| `38e7951d…` | **187336** | 2026-08-25 20:41:54 | 2026-08-25 20:41:58.738 | PROCESSED | enqueue_failed |
| `0d4cc578…` | **187336** | 2026-08-25 20:42:02 | 2026-08-25 20:42:06.258 | PROCESSED | enqueue_failed |

**Total persisted OBD unplug inbox rows:** 4 (fleet-wide). **`failureCount=11` cannot be explained by inbox row count alone** — it is a provider cumulative HTTP failure counter (likely multiple delivery attempts and/or multiple subscribed vehicles over time). **Exact per-attempt provider log: NOT RECONSTRUCTABLE FROM RETAINED LOGS.**

### Aug 2026 KS MX 2024 sequence (CONFIRMED)

| Marker | UTC | Evidence |
|--------|-----|----------|
| Physical unplug (operator) | ~20:39–20:42 | connectivity-production-processing-gate |
| Provider `observedAt` #1 / #2 | 20:41:54 / 20:42:02 | inbox + events |
| SynqDrive HTTP receive | 20:41:58.738 / 20:42:06.258 | inbox `received_at` |
| Provider UNPLUG `updatedAt` | **20:42:06.479862Z** | DIMO GET — matches second delivery |
| BullMQ enqueue | **FAIL** (`Custom Id cannot contain :`) | connectivity-production-processing-gate |
| Fix deploy | 22:21:40 | commit `655f9dbe` |
| Inbox → PROCESSED | 22:22:30 | scheduler retry after fix |
| Canonical events + episode | 22:22:30 | 2 events; 1 OPEN episode |

**INFERRED (strong):** DIMO received **non-success HTTP** on at least the Aug 25 deliveries because SynqDrive throws after inbox persist when enqueue fails (see §3). Provider marked definition `failed` and incremented `failureCount`. SynqDrive later recovered **asynchronously** — provider state **did not** auto-clear.

---

## 3. Callback / HTTP forensics (code + Production)

### Ingress path (current code)

```
DIMO POST → HTTPS → app.synqdrive.eu → /api/v1/webhooks/dimo
  → DimoWebhookController (@HttpCode(200))
  → verification / payload normalize
  → DeviceConnectionWebhookInboxService.intakeDeviceConnectionWebhook
       → inbox row INSERT (RECEIVED)
       → enqueueOrMarkRetryableFailed
       → if failed: throw Error('enqueue_failed')  ← HTTP becomes 5xx
  → (async) connectivity.webhook.process worker
```

| Question | Answer | Class |
|----------|--------|-------|
| Expected method | POST | CODE_SUPPORTED |
| Auth | `DIMO_WEBHOOK_VERIFICATION_TOKEN` at registration; optional HMAC if secret+signature present | CODE_SUPPORTED |
| Success status if intake completes | 200 JSON | CODE_SUPPORTED |
| ACK before enqueue? | Inbox row persisted **before** enqueue attempt | CODE_SUPPORTED |
| Enqueue failure → HTTP non-2xx? | **Yes** — `throw new Error('enqueue_failed')` propagates (unit test confirms) | **CONFIRMED** (code + test) |
| Aug 2026 root enqueue bug | BullMQ v5 rejects `jobId` containing `:` | **CONFIRMED** (deploy record) |
| Aug 2026 fix | `connectivity-webhook__${inboxId}` | **CONFIRMED** on main |
| Retained PM2/nginx logs for Aug 25 exact status codes | **NOT RECONSTRUCTABLE FROM RETAINED LOGS** | — |

### Current endpoint health (without forged unplug)

| Check | Result |
|-------|--------|
| `GET /api/v1/health` | 200 `{"status":"ok"}` @ 2026-09-12T02:21:26Z |
| R9 natural wake on Production | Observed KS MS 661 tokenId 187361 (DIM-EV-KS-MS-661-R9-002) |
| R9 webhooks same callback | `failureCount=0`, `enabled` |
| UNPLUG webhook | `failed`, `failureCount=11` — **stale provider state** |

---

## 4. DIMO `failed` status semantics

| Question | Classification | Answer |
|----------|----------------|--------|
| Official create statuses | **PROVIDER_SUPPORTED** | `enabled` \| `disabled` only ([DIMO Vehicle Triggers API](https://www.dimo.org/docs/api-references/vehicle-triggers-api)) |
| `failed` in live API | **PROVIDER_SUPPORTED** (observation) | Third runtime status on aged definitions |
| `failureCount` meaning | **PROVIDER_SUPPORTED** (observation) | Integer on webhook list; increments on callback delivery failures |
| Threshold `failureCount=11` | **UNKNOWN** | No published threshold in DIMO docs |
| FAILED equivalent to disabled? | **INFERRED** | No deliveries expected while `failed`; distinct from intentional `disabled` on PLUG |
| Auto-recovery on successful delivery? | **UNKNOWN** | No post-Aug-25 unplug events to test; counter unchanged since preflight |
| Explicit recovery operation | **PROVIDER_SUPPORTED** | `PUT /v1/webhooks/{webhookId}` with full payload (incl. `status`) |
| `PUT` resets `failureCount`? | **UNKNOWN** | Not documented — must verify via GET after authorized PUT |
| Recreate loses subscriptions? | **PROVIDER_SUPPORTED** | `DELETE` requires unsubscribe all first; recreate needs re-subscribe |
| Preserve UUID/stableId on `PUT`? | **PROVIDER_SUPPORTED** | Same `id` / stableId hash of UUID |

---

## 5. Root-cause matrix

| Hypothesis | For | Against | Status | Confidence |
|------------|-----|---------|--------|------------|
| **A** Historical HTTP failures caused `failed` | `updatedAt` = Aug 25; enqueue throw → 5xx; `failureCount` > 0 | Exact HTTP codes not in retained logs | **LIKELY** | High |
| **B** Callback still broken | — | Health 200; R9 deliveries; natural wake | **REJECTED** | High |
| **C** Healthy now; `failed` is stale | R9 control; fix deployed Aug 25 22:21; no new unplug to refresh | Provider may still block while `failed` | **LIKELY** | High |
| **D** Enqueue failure caused HTTP failure | Code path + Aug 25 timing | — | **CONFIRMED** (mechanism) | High |
| **E** HTTP OK but async failed only | Inbox received timestamps prove HTTP reached server | Throw after persist still yields 5xx to DIMO | **PARTIAL** | Medium — both HTTP fail **and** async fail |
| **F** Subscription inconsistency | — | 187336 subscribed; 7 vehicles on definition | **REJECTED** | High |
| **G** Multi-replica routing | Possible Aug 25 | No current evidence; R9 works on same path | **UNKNOWN** | Low |
| **H** Provider-side opaque failure | `failed` status exists | Cannot access provider delivery logs | **POSSIBLE** | Low |

### Bounded conclusion

**Strongest bounded conclusion:** On **2026-08-25**, SynqDrive accepted UNPLUG webhooks into inbox but returned **HTTP error** to DIMO when BullMQ enqueue failed (`jobId` colon bug). DIMO marked the UNPLUG definition **`failed`** with **`failureCount=11`**. SynqDrive fixed enqueue (**`655f9dbe`**) and processed inbox rows asynchronously, but **did not** clear DIMO provider status. **Today the callback path is healthy** (R9 control), but the UNPLUG definition remains **`failed`** — a **stale provider gate** blocking GT-R1 webhook-path observation until authorized remediation.

---

## 6. Minimum safe remediation (NOT EXECUTED)

**Preferred:** `PUT` existing definition to `status: "enabled"` preserving UUID `49438f51-3ca5-4808-81d5-3598336c53a3` and all subscriptions.

See [DIM webhook ops runbook](../../dimo-integration/operations/WEBHOOK_OPERATIONS.md) § Recovery — UNPLUG `failed` state.

**Do NOT** enable PLUG webhook `b977124a025a` (must remain `disabled`).

**Operator authorization required before execution.**

---

## 7. GT status

| Item | Value |
|------|-------|
| GT-R1-UNPLUG-001 | **NOT EXECUTED** |
| Provider mutation | **NOT EXECUTED** |
| Recommended pre-GT gate | Remediate UNPLUG `failed` → `enabled` via authorized `PUT`, then GET verify |

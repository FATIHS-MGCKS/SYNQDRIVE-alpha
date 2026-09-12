# GT-R1 — OBD UNPLUG Webhook Authorized Provider Recovery

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-GT-R1-UNPLUG-RECOVERY-001 |
| **Related protocol** | GT-R1-UNPLUG-001 — **physical execution NOT STARTED** |
| **Authorization scope** | **Single** authorized mutation: `PUT /v1/webhooks/49438f51-3ca5-4808-81d5-3598336c53a3` with `status: enabled` |
| **origin/main SHA** | `a21bff2b68888c9aedb86452758109d22b64e22b` (PR #1614 merged) |
| **Session (UTC)** | 2026-09-12T03:39:02Z – 2026-09-12T03:39:04Z |
| **Target vehicle** | KS MX 2024 — `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` / tokenId **187336** |
| **Ops script** | `backend/scripts/ops/gt-r1-unplug-webhook-recovery.mjs` (hardened safe-by-default post-recovery; original execution was manual authorized session) |
| **Cross-ref** | [GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md](./GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md), [DIM webhook ops](../../dimo-integration/operations/WEBHOOK_OPERATIONS.md) |

## Epistemic banner

**Authorized provider recovery executed.** No other provider mutations. No deploy, no DB change, no physical unplug.

---

## 1. Before state (VERIFIED — live GET)

| Field | Value |
|-------|-------|
| **UUID** | `49438f51-3ca5-4808-81d5-3598336c53a3` |
| **stableId** | `a257daa23ee5` |
| **service** | `signals` |
| **metricName** | `vss.obdIsPluggedIn` |
| **condition** | `valueNumber == 0` |
| **coolDownPeriod** | `0` |
| **displayName** | OBD Device unplugged |
| **description** | Driver unplugged OBD Device |
| **targetURL** | `https://app.synqdrive.eu/api/v1/webhooks/dimo` |
| **status** | **`failed`** |
| **failureCount** | **11** |
| **createdAt** | 2026-06-28T22:20:17.243289Z |
| **updatedAt** | 2026-08-25T20:42:06.479862Z |

### Subscriptions before (VERIFIED)

| Count | tokenIds |
|-------|----------|
| **7** | 186946, **187336**, 187361, 187784, 189118, 190497, 192922 |

**tokenId 187336 subscribed:** YES (VERIFIED via `GET /v1/webhooks/vehicles/{assetDID}`)

### Control webhooks before (VERIFIED)

| Webhook | stableId | status |
|---------|----------|--------|
| PLUG | `b977124a025a` | **disabled** |
| R9 speed | `9eeb7158afee` | enabled |
| R9 ignition | `5d611d470eab` | enabled |

---

## 2. Authorized PUT (VERIFIED)

| Field | Value |
|-------|-------|
| **Endpoint** | `PUT https://vehicle-triggers-api.dimo.zone/v1/webhooks/49438f51-3ca5-4808-81d5-3598336c53a3` |
| **startedUtc** | 2026-09-12T03:39:03.636Z |
| **completedUtc** | 2026-09-12T03:39:03.695Z |
| **HTTP status** | **200** |
| **Response body** | `{ "id": "49438f51-3ca5-4808-81d5-3598336c53a3", "message": "Webhook updated successfully" }` |
| **Intended transition** | `failed` → `enabled` |
| **Semantic fields changed** | **NONE** (only `status` + required `verificationToken` in payload) |

---

## 3. After state (VERIFIED — immediate GET audit)

| Field | Before | After | Preserved |
|-------|--------|-------|-----------|
| UUID | `49438f51-…` | `49438f51-…` | **YES** |
| stableId | `a257daa23ee5` | `a257daa23ee5` | **YES** |
| service | signals | signals | **YES** |
| metricName | vss.obdIsPluggedIn | vss.obdIsPluggedIn | **YES** |
| condition | valueNumber == 0 | valueNumber == 0 | **YES** |
| coolDownPeriod | 0 | 0 | **YES** |
| displayName | OBD Device unplugged | OBD Device unplugged | **YES** |
| description | Driver unplugged OBD Device | Driver unplugged OBD Device | **YES** |
| targetURL | https://app.synqdrive.eu/api/v1/webhooks/dimo | (same) | **YES** |
| **status** | **failed** | **enabled** | intended |
| **failureCount** | **11** | **0** | **RESET_TO_ZERO** |
| updatedAt | 2026-08-25T20:42:06.479862Z | 2026-09-12T03:39:03.663896Z | expected |

### Subscriptions after (VERIFIED)

| Count | tokenIds |
|-------|----------|
| **7** | 186946, **187336**, 187361, 187784, 189118, 190497, 192922 |

**Subscriptions unchanged:** YES (same 7 tokenIds)
**tokenId 187336 subscribed:** YES

### Control webhooks after (VERIFIED)

| Webhook | stableId | status | Untouched |
|---------|----------|--------|-----------|
| PLUG | `b977124a025a` | **disabled** | YES |
| R9 speed | `9eeb7158afee` | enabled | YES |
| R9 ignition | `5d611d470eab` | enabled | YES |

---

## 4. failureCount classification

**RESET_TO_ZERO** — `failureCount` went from 11 → 0 on successful `PUT` enable.

---

## 5. Callback health (read-only post-mutation)

| Check | Result | Classification |
|-------|--------|----------------|
| `GET https://app.synqdrive.eu/api/v1/health` | HTTP 200 `{"status":"ok"}` @ 2026-09-12T03:39:08Z | **VERIFIED** |
| PUT HTTP 200 + `"Webhook updated successfully"` | Provider accepted webhook update | **VERIFIED** |
| Resulting `status=enabled` after immediate GET | Observed post-PUT | **VERIFIED** |
| DIMO callback verification handshake at PUT instant (`DimoWebhookController`) | Not found in retained PM2 log window | **NOT INDEPENDENTLY OBSERVED** / **NOT RECONSTRUCTABLE FROM RETAINED LOGS** |
| Successful PUT consistent with successful callback verification | DIMO update API semantics | **INFERRED** / **PROVIDER-SEMANTICALLY SUPPORTED** — not independently verified without direct callback log evidence |

---

## 6. Provider behavior newly verified (for runbook)

| Behavior | Classification |
|----------|----------------|
| `PUT` recovers `failed` → `enabled` on existing UUID | **VERIFIED** (this session) |
| `PUT` resets `failureCount` to 0 | **VERIFIED** (this session) |
| Subscriptions survive `PUT` | **VERIFIED** (7/7 unchanged) |
| PLUG and R9 definitions unaffected by UNPLUG `PUT` | **VERIFIED** |
| Auto-recovery without `PUT` after SynqDrive fix | **NOT TESTED** — stale `failed` persisted until this `PUT` |

---

## 7. GT status

| Item | Value |
|------|-------|
| **GT-R1-UNPLUG-001 physical execution** | **NOT STARTED** |
| **Provider gate** | **CLEARED** — UNPLUG webhook `enabled`, `failureCount=0` |
| **Next step** | Operator initiates physical unplug per GT-R1 protocol when ready |

**HARD STOP:** Do not proceed to physical unplug until operator explicitly confirms vehicle has been unplugged.

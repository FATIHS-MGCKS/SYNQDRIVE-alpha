# DIMO Integration — Vehicle Triggers / Webhook Operations (Verified)

| Field | Value |
|-------|-------|
| **Authority** | DIMO Integration (`AUDIT_IN_PROGRESS`) |
| **API base** | `https://vehicle-triggers-api.dimo.zone` |
| **Last updated** | 2026-09-12 |
| **Epistemic rule** | Document **VERIFIED** workflows only. Do not treat guessed API calls as canonical. |

## Scope boundary

| Owns | Does not own |
|------|----------------|
| DIMO auth, provider API, webhook CRUD, subscriptions, callback URL | Connectivity semantics, episode meaning, GT protocols (→ Vehicle & Device Connectivity) |

## Prerequisites (Cloud Agent / ops)

| Requirement | Notes |
|-------------|-------|
| `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY` | Developer license credentials — **never commit** |
| `DIMO_DOMAIN` / `DIMO_REDIRECT_URI` | Web3 challenge domain |
| `DIMO_WEBHOOK_VERIFICATION_TOKEN` | Required in create/update payload |
| `DIMO_VEHICLE_NFT_CONTRACT` | Default `0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF` |
| Production callback | `https://app.synqdrive.eu/api/v1/webhooks/dimo` |
| **Authorization gate** | Provider mutations require **explicit operator authorization** per task |

Reference scripts (ops, not auto-run): `backend/scripts/ops/r9-post-get-audit.mjs`, `r9-five-vehicle-canary-bootstrap.mjs` (mutations), `r9-webhook-status-probe.mjs` (create+delete probe).

## Authentication (VERIFIED)

Pattern used in R9 canary and GT-R1 preflight:

1. `POST https://auth.dimo.zone/auth/web3/generate_challenge` with `client_id`, `domain`, `address=clientId`
2. Sign challenge with developer wallet private key
3. `POST https://auth.dimo.zone/auth/web3/submit_challenge` → `developer_jwt`
4. `Authorization: Bearer {developer_jwt}` on Vehicle Triggers API

## stableId vs provider UUID

| Concept | Rule |
|---------|------|
| **Provider UUID** | `id` field from API (e.g. `49438f51-3ca5-4808-81d5-3598336c53a3`) — use in API paths |
| **stableId** | `sha256(id).hex.slice(0,12)` — SynqDrive evidence shorthand only |
| **assetDID / tokenDID** | `did:erc721:137:{contract}:{tokenId}` |

## VERIFIED read operations

| Operation | Method | Path | Evidence |
|-----------|--------|------|----------|
| List definitions | GET | `/v1/webhooks` | R9 canary pre/post GET; GT-R1 preflight |
| Get subscribed vehicles for webhook | GET | `/v1/webhooks/{webhookId}` | Returns assetDID array |
| List vehicle subscriptions | GET | `/v1/webhooks/vehicles/{assetDID}` | GT-R1 preflight |
| List triggerable signals | GET | `/v1/webhooks/signals` | fleet-connectivity audit |

## VERIFIED write operations (require authorization)

| Operation | Method | Path | Evidence |
|-----------|--------|------|----------|
| Create definition | POST | `/v1/webhooks` | R9 canary `2026-09-07` |
| Update definition | PUT | `/v1/webhooks/{webhookId}` | [DIMO docs](https://www.dimo.org/docs/api-references/vehicle-triggers-api) — **not executed in SynqDrive production yet** |
| Delete definition | DELETE | `/v1/webhooks/{webhookId}` | R9 rollback — requires unsubscribe all first |
| Subscribe vehicle | POST | `/v1/webhooks/{webhookId}/subscribe/{assetDID}` | R9 canary (empty body) |
| Unsubscribe vehicle | DELETE | `/v1/webhooks/{webhookId}/unsubscribe/{assetDID}` | R9 rollback |
| Subscribe all | POST | `/v1/webhooks/{webhookId}/subscribe/all` | DIMO docs — **not executed in SynqDrive** |
| Unsubscribe all | DELETE | `/v1/webhooks/{webhookId}/unsubscribe/all` | DIMO docs — **not executed in SynqDrive** |

### Create payload shape (VERIFIED — R9 speed example)

```json
{
  "service": "signals",
  "metricName": "vss.speed",
  "condition": "valueNumber > 3",
  "coolDownPeriod": 30,
  "description": "...",
  "displayName": "SynqDrive R9 Speed Wake",
  "targetURL": "https://app.synqdrive.eu/api/v1/webhooks/dimo",
  "status": "enabled",
  "verificationToken": "<DIMO_WEBHOOK_VERIFICATION_TOKEN>"
}
```

### Callback verification (VERIFIED)

On create/update, DIMO probes `targetURL` with verification handshake. Production PM2 logs showed `DimoWebhookController` URL verification success during R9 create window.

## Post-mutation discipline (VERIFIED pattern)

1. GET `/v1/webhooks` — compare stableIds, status, failureCount, callback
2. GET `/v1/webhooks/{webhookId}` — subscription list
3. Per-vehicle GET `/v1/webhooks/vehicles/{assetDID}` for cohort audit
4. Record evidence artifact; append CHANGE_LEDGER
5. Rollback plan documented **before** mutation

## Recovery — UNPLUG `failed` state (DESIGNED, NOT EXECUTED)

Context: [VDC GT-R1 unplug failure forensics](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md)

| Field | Value |
|-------|-------|
| Webhook UUID | `49438f51-3ca5-4808-81d5-3598336c53a3` |
| stableId | `a257daa23ee5` |
| Before | `status=failed`, `failureCount=11` |
| Proposed | `PUT` with **unchanged** semantic fields + `status: "enabled"` |
| PLUG webhook | **DO NOT MODIFY** (`b977124a025a` must stay `disabled`) |

**Proposed call (NOT EXECUTED):**

```
PUT https://vehicle-triggers-api.dimo.zone/v1/webhooks/49438f51-3ca5-4808-81d5-3598336c53a3
Authorization: Bearer <developer_jwt>
Content-Type: application/json

{
  "service": "signals",
  "metricName": "vss.obdIsPluggedIn",
  "condition": "valueNumber == 0",
  "coolDownPeriod": 0,
  "description": "Driver unplugged OBD Device",
  "displayName": "OBD Device unplugged",
  "targetURL": "https://app.synqdrive.eu/api/v1/webhooks/dimo",
  "status": "enabled",
  "verificationToken": "<DIMO_WEBHOOK_VERIFICATION_TOKEN>"
}
```

| Aspect | Expectation |
|--------|-------------|
| Subscriptions | **Should survive** — PUT updates definition, not subscription table (INFERRED; verify GET) |
| failureCount reset | **UNKNOWN** — verify GET after PUT |
| Rollback | Authorized `PUT` with `status: "disabled"` **or** operator-console equivalent — document before/after GET |
| Risks | Wrong webhook UUID; accidental PLUG enable; verification token mismatch |

**If PUT does not clear `failed`:** STOP — do not guess. Escalate to DIMO support or evaluate recreate+re-subscribe (7 vehicles) as separate authorized workstream.

## Cross-references

| Artifact | Role |
|----------|------|
| [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](../evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) | Verified create + subscribe |
| [R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md](../evidence/R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md) | Rollback discipline |
| [GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_PREFLIGHT_2026-09-12.md) | Live baseline |
| [GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md) | Failure analysis |

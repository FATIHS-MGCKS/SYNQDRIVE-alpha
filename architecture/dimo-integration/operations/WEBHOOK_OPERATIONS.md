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

### Safe-by-default mutation scripts (mandatory)

| Rule | Detail |
|------|--------|
| **Default mode** | Provider mutation helper scripts are **READ-ONLY by default** — auth handshake (POST) + GET inspection only; **no** Vehicle Triggers webhook mutation |
| **READ_ONLY means** | No PUT webhook update, no POST webhook create, no DELETE webhook, no subscribe/unsubscribe mutation; authentication calls and GET inspection are allowed |
| **Script ≠ authorization** | A script existing in the repository is **NOT** authorization to execute a mutation |
| **Fresh authorization** | Every provider mutation requires **fresh explicit operator authorization** in the task/chat |
| **Explicit mutation mode** | Mutation must be explicitly selected via documented CLI flags (e.g. `--execute` + `--confirm-webhook=<uuid>`) |
| **Never auto-rerun** | Do not repeat PUT/create/delete because a prior session succeeded |

Example: `gt-r1-unplug-webhook-recovery.mjs` — default prints `MODE=READ_ONLY` and performs read-only provider inspection (auth handshake + GET inspection only; no webhook mutation); PUT requires `--execute --confirm-webhook=49438f51-3ca5-4808-81d5-3598336c53a3`.

Reference scripts (ops, not auto-run): `backend/scripts/ops/r9-post-get-audit.mjs`, `r9-five-vehicle-canary-bootstrap.mjs` (mutations), `r9-webhook-status-probe.mjs` (create+delete probe), `gt-r1-unplug-webhook-recovery.mjs` (READ_ONLY default: auth + GET inspection; mutation gated).

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
| Update definition | PUT | `/v1/webhooks/{webhookId}` | [DIMO docs](https://www.dimo.org/docs/api-references/vehicle-triggers-api); **VERIFIED** GT-R1 UNPLUG recovery 2026-09-12 |
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

### Callback verification

On create/update, DIMO probes `targetURL` with a verification handshake ([DIMO docs](https://www.dimo.org/docs/api-references/vehicle-triggers-api)).

| Claim | Classification | Evidence |
|-------|----------------|----------|
| R9 create window showed `DimoWebhookController` URL verification success in PM2 logs | **VERIFIED** | R9 canary session |
| UNPLUG recovery PUT instant showed `DimoWebhookController` verification in retained logs | **NOT INDEPENDENTLY OBSERVED** | VDC-EVID-GT-R1-UNPLUG-RECOVERY-001 |
| PUT HTTP 200 on update | **VERIFIED** | GT-R1 recovery session |
| PUT success implies callback verification passed | **INFERRED** / **PROVIDER-SEMANTICALLY SUPPORTED** — not independently verified without direct callback log |

## Post-mutation discipline (VERIFIED pattern)

1. GET `/v1/webhooks` — compare stableIds, status, failureCount, callback
2. GET `/v1/webhooks/{webhookId}` — subscription list
3. Per-vehicle GET `/v1/webhooks/vehicles/{assetDID}` for cohort audit
4. Record evidence artifact; append CHANGE_LEDGER
5. Rollback plan documented **before** mutation

## Recovery — UNPLUG `failed` state (VERIFIED 2026-09-12)

Context: [VDC GT-R1 unplug failure forensics](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_FAILURE_FORENSICS_2026-09-12.md), [recovery evidence](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md)

| Field | Value |
|-------|-------|
| Webhook UUID | `49438f51-3ca5-4808-81d5-3598336c53a3` |
| stableId | `a257daa23ee5` |
| Before (2026-09-12) | `status=failed`, `failureCount=11` |
| After (2026-09-12) | `status=enabled`, `failureCount=0` — **VERIFIED** |
| Subscriptions | 7 vehicles — **unchanged** after `PUT` |
| PLUG webhook | **DO NOT MODIFY** (`b977124a025a` must stay `disabled`) — verified still disabled |

**Verified behaviors from execution:**

| Behavior | Status |
|----------|--------|
| `PUT` with unchanged semantics recovers `failed` → `enabled` | **VERIFIED** |
| `failureCount` resets to `0` on successful `PUT` | **VERIFIED** |
| Vehicle subscriptions survive `PUT` | **VERIFIED** |
| Auto-recovery without `PUT` after callback fix | **UNKNOWN** — stale `failed` persisted until authorized `PUT` |

**Reference call shape (executed 2026-09-12):**

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
| Subscriptions | **Survive** — VERIFIED 7/7 unchanged (GT-R1 recovery 2026-09-12) |
| failureCount reset | **Resets to 0** — VERIFIED on successful `PUT` enable |
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
| [GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md](../../vehicle-device-connectivity/evidence/GT_R1_UNPLUG_WEBHOOK_RECOVERY_2026-09-12.md) | Authorized recovery execution |

# R9 Scoped DIMO Trigger Bootstrap — Production Provider Mutation Record

| Field | Value |
|-------|-------|
| **Session** | `2026-09-07T22:04:00Z` – `2026-09-07T22:10:00Z` (UTC) |
| **Authorization** | Explicit user authorization for narrowly scoped provider mutations only |
| **origin/main** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` |
| **Production release** | `0ba96e03fc2f1551db79d2dae151c928a9fd936a` @ `/opt/synqdrive/releases/20260907204434_v4994` |
| **Outcome** | **ROLLED_BACK** — partial create/subscribe succeeded; fail-closed on `tokenId=190497`; rollback verified |
| **Production DB / Redis** | **NONE** |
| **Registry cache refresh** | **NOT performed** |
| **DIMO_TRIGGER_BOOTSTRAP_ENABLED** | **NOT enabled** |

## Strategy (CREATE_DEDICATED)

Per completed dry-run contract — **not** legacy `DimoTriggersService` `POST …/vehicles/{tokenId}` (returns **404** on current swagger).

| # | displayName | metricName | condition | coolDownPeriod | targetURL |
|---|-------------|------------|-----------|----------------|-----------|
| 1 | SynqDrive R9 Speed Wake | `vss.speed` | `valueNumber > 3` | 30s | `https://app.synqdrive.eu/api/v1/webhooks/dimo` |
| 2 | SynqDrive R9 Ignition Wake | `vss.isIgnitionOn` | `valueNumber == 1` | 30s | same |

Subscribe path: `POST /v1/webhooks/{webhookId}/subscribe/{assetDID}` with empty body.

Rollback path (swagger): `DELETE …/unsubscribe/{assetDID}` per vehicle, then `DELETE /v1/webhooks/{webhookId}` for new R9 IDs only.

## Pre-mutation GET snapshot (sanitized)

| Check | Result |
|-------|--------|
| DIMO auth (developer JWT) | PASS |
| Eligible cohort (DB query) | **6** tokenIds: 186946, 187336, 187361, 187784, 190497, 192922 |
| Production callback | `https://app.synqdrive.eu/api/v1/webhooks/dimo` — **matches** |
| Conflicting R9 definitions at callback | **0** |
| R9 speed / ignition coverage | subscribed_speed=**0**, subscribed_ignition=**0**, subscribed_both=**0**, missing_both=**6** |
| Legacy callback webhooks (by stableId + metric — **not** callback URL alone) | see table |

| stableId | displayName | metricName | status | failureCount |
|----------|-------------|------------|--------|--------------|
| `a257daa23ee5` | OBD Device unplugged | `vss.obdIsPluggedIn` | failed | 11 |
| `b977124a025a` | OBD Device Plugged in | `vss.obdIsPluggedIn` | disabled | 0 |
| `1f96faea6569` | High RPM Triger | `vss.powertrainCombustionEngineSpeed` | enabled | 0 |

**Untouched by design:** OBD unplug/plug + High RPM definitions and their existing vehicle links.

## Mutation attempts

Three bootstrap executions; each rolled back on failure.

| Attempt | Failure | Ephemeral R9 stableIds (deleted on rollback) |
|---------|---------|-----------------------------------------------|
| 1 | HTTP 403 (undifferentiated) after both creates | `6c84dc03fe79`, `e5d6c0a3a11a` |
| 2 | Webhook list polling timeout (GET-by-id returns `{}`; list propagation slow) | `3dc5c89d5b06`, `684b3bd75ce8` |
| 3 | Subscribe `403 Insufficient vehicle permissions` at **tokenId=190497** after prior vehicles subscribed | `9eb2012bd902`, `8eede7783dbf` |

### Root cause (attempt 3 — authoritative)

`POST …/subscribe/{assetDID}` for **tokenId=190497** returned:

```json
{"message":"Insufficient vehicle permissions","code":403}
```

Permission probe on existing RPM webhook (`stableId=1f96faea6569`) confirms the same **403** for tokenId=190497 (other five return `400 Already subscribed` when re-subscribing RPM).

**Interpretation:** Developer-license API subscribe permission is **missing for tokenId=190497** under current DIMO privilege state. Cohort remains **6 vehicles in DB** but **not all 6 are API-subscribable** — fail-closed before partial durable state.

### Callback verification

Production PM2 logs (read-only): multiple `DimoWebhookController` **URL verification handshake succeeded** entries during create windows (`2026-09-07T22:04:34Z` … `22:08:57Z`). **No new callback rejection errors.**

## Post-rollback GET verification

| Metric | Value |
|--------|-------|
| R9 trigger definitions | **0** |
| subscribed_speed | **0** |
| subscribed_ignition | **0** |
| subscribed_both | **0** |
| missing_both | **6** |
| Legacy three webhooks | **unchanged** (stableIds + failureCount preserved) |

## Rollback procedure (executed)

1. `DELETE /v1/webhooks/{speedId}/unsubscribe/{assetDID}` for each vehicle subscribed in failing run
2. `DELETE /v1/webhooks/{ignitionId}/unsubscribe/{assetDID}` likewise
3. `DELETE /v1/webhooks/{speedId}` and `DELETE /v1/webhooks/{ignitionId}`
4. GET audit confirms R9 absent + legacy unchanged

## Remaining gap

**NATURAL_R9_WAKE_OBSERVATION** — no R9 speed/ignition triggers remain subscribed; R9 wake ingress on Production (post-#1553) cannot be validated until provider subscribe permission is restored for **all six** cohort vehicles and bootstrap is re-executed to completion.

## Ops script (not committed — Production VPS only)

Ephemeral helper: `backend/scripts/ops/r9-scoped-dimo-trigger-bootstrap.mjs` (workspace copy; executed via `sudo node` on VPS with `/opt/synqdrive/shared/backend.env`).

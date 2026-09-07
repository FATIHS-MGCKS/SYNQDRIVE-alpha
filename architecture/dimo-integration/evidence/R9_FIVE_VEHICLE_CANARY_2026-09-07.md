# R9 Five-Vehicle Canary — Production Provider Mutation Record

| Field | Value |
|-------|-------|
| **Session** | `2026-09-07T22:35:00Z` (UTC) |
| **Authorization** | Explicit owner clarification + five-vehicle scoped provider mutation |
| **Outcome** | **PASS** |
| **Production DB / Redis / runtime** | **NONE** |
| **DIMO_TRIGGER_BOOTSTRAP_ENABLED** | **NOT enabled** |

## Active cohort policy

| Class | tokenIds |
|-------|----------|
| **Active R9 cohort (5)** | 186946, 187336, 187361, 187784, 192922 |
| **Excluded former fleet** | **190497** — `FORMER_FLEET_VEHICLE` / `EXCLUDED_FROM_ACTIVE_R9_COHORT` |

tokenId **190497** must **not** be reauthorized, reconnected, or included in R9 coverage. Stale SynqDrive mirrors (AVAILABLE, CONNECTED, active consent, active link) are a **separate data-integrity gap** — not remediated in this task.

## Preflight (fail-closed)

| Check | Result |
|-------|--------|
| DIMO Identity `privileged` list | **Exactly 5** — matches allowlist |
| tokenId 190497 absent from privileged | **PASS** |
| R9 speed/ignition definitions pre-existing | **0** |
| Legacy OBD/RPM webhooks | **unchanged** (3 stableIds) |
| Callback | `https://app.synqdrive.eu/api/v1/webhooks/dimo` |
| DIMO developer JWT auth | **PASS** |

## Created R9 triggers (sanitized stableIds)

| Trigger | stableId | metricName | condition | coolDownPeriod |
|---------|----------|------------|-----------|----------------|
| SynqDrive R9 Speed Wake | `9eeb7158afee` | `vss.speed` | `valueNumber > 3` | 30s |
| SynqDrive R9 Ignition Wake | `5d611d470eab` | `vss.isIgnitionOn` | `valueNumber == 1` | 30s |

Subscribe path: `POST /v1/webhooks/{webhookId}/subscribe/{assetDID}` (Swagger contract).

## Subscriptions (post-GET verification)

| Metric | Active cohort (5) |
|--------|-------------------:|
| subscribed_speed | **5** |
| subscribed_ignition | **5** |
| subscribed_both | **5** |
| missing_both | **0** |
| tokenId 190497 R9 subscribed | **NO** |

All five tokenIds subscribed to both new trigger stableIds.

## Legacy webhooks (unchanged)

| stableId | displayName | status | failureCount |
|----------|-------------|--------|--------------|
| `a257daa23ee5` | OBD Device unplugged | failed | 11 |
| `b977124a025a` | OBD Device Plugged in | disabled | 0 |
| `1f96faea6569` | High RPM Triger | enabled | 0 |

## Callback post-check

PM2 read-only: `DimoWebhookController` URL verification handshake **succeeded** during create window (`2026-09-07T22:35:50Z`). **No new callback rejection errors.**

## Rollback

**NOT required** — mutation completed successfully.

Rollback procedure (documented): unsubscribe five vehicles from both R9 stableIds, delete both R9 webhook definitions, verify legacy unchanged and active cohort R9 coverage zero.

## Natural wake validation

**NOT claimed** — provider wiring complete; natural R9 wake observation requires an actual drive/ignition event.

**NEXT_GATE:** `NATURAL_R9_WAKE_OBSERVATION`

## Stale internal vehicle data gap

**OPEN** — tokenId **190497** retains stale SynqDrive operational mirrors; excluded from cohort; cleanup deferred.

## Provider mutations (sanitized)

- `POST /v1/webhooks` — SynqDrive R9 Speed Wake → stableId `9eeb7158afee`
- `POST /v1/webhooks` — SynqDrive R9 Ignition Wake → stableId `5d611d470eab`
- `POST …/subscribe/{assetDID}` × 10 (5 vehicles × 2 triggers)

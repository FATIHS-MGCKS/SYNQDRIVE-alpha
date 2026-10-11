# R9 — DIMO Vehicle Triggers `status: failed` semantics

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R21-FAILED-SEM-001` |
| **AUDIT_MODE** | `READ_ONLY` (provider source + docs; no mutations) |
| **Observed at (UTC)** | `2026-10-11T19:26:34Z` (live GET aligns with R21 forensics) |
| **Provider API repo** | [DIMO-Network/vehicle-triggers-api](https://github.com/DIMO-Network/vehicle-triggers-api) @ `main` (commit tree read `2026-10-11`) |
| **Official API docs** | [Vehicle Triggers API](https://www.dimo.org/docs/api-references/vehicle-triggers-api) (cross-check subscribe/PUT; failure semantics primarily from source) |

## Executive summary

`failed` is a **provider-side webhook definition lifecycle state** reached after **cumulative HTTP callback delivery failures** cross a configured threshold (`MAX_WEBHOOK_FAILURE_COUNT`). It is **not** a per-vehicle subscription flag. While `failed`, the metric listener **does not attempt delivery** (`ShouldAttemptWebhook` requires `status == enabled`). **Subscriptions remain** on the definition until explicitly removed. Recovery in SynqDrive is **VERIFIED** for UNPLUG via authorized `PUT` (resets `failureCount`, sets `enabled`); R9 recovery is **planned only** (see [R9_RECOVERY_PLAN.md](R9_RECOVERY_PLAN.md)).

## Source-backed answers (R2.1 questionnaire)

| # | Question | Answer | Confidence | Primary source |
|---|----------|--------|------------|----------------|
| 1 | What sets `status=failed`? | `IncrementTriggerFailureCount` sets `StatusFailed` when `failureCount >= maxFailureCount` after a delivery classified as `WebhookFailureCode` | **CONFIRMED** (source) | `internal/services/triggersrepo/triggersrepo.go` (`IncrementTriggerFailureCount`) |
| 2 | Config vs delivery vs lifecycle? | **Lifecycle / circuit-breaker on the definition** driven by **delivery outcome**; distinct from `disabled` (operator) and from subscription rows | **CONFIRMED** (source + GET fields) | `triggersrepo` status constants; GET `status`, `failureCount`, `updatedAt` |
| 3 | Does `failed` stop delivery? | **Yes** — `ShouldAttemptWebhook` returns false when `trigger.Status != enabled` | **CONFIRMED** (source) | `internal/controllers/metriclistener/metric_listener.go` |
| 4 | HTTP codes / timeouts / validation? | Delivery fails on: network error (except canceled context), **HTTP status ≥ 400**, invalid URL; **30s** client timeout default | **CONFIRMED** (source) | `internal/services/webhooksender/webhook_sender.go` |
| 5 | Retries / backoff / auto-recovery? | Each failed delivery increments counter; **no auto re-enable** in source reviewed; successful delivery **resets failure count to 0** while still `enabled` | **CONFIRMED** (source) | `metric_listener.go` `handleTriggeredWebhook`; `ResetTriggerFailureCount` |
| 6 | Correct reactivation? | **Authorized `PUT /v1/webhooks/{id}`** with full definition payload; OpenAPI comment: **failure count reset to 0 on update** | **CONFIRMED** (source + SynqDrive UNPLUG **VERIFIED** 2026-09-12) | `webhook_controller.go` `UpdateWebhook`; [operations/WEBHOOK_OPERATIONS.md](../operations/WEBHOOK_OPERATIONS.md) |
| 7 | GET-only diagnostic fields? | `id`, `displayName`, `service`, `metricName`, `condition`, `coolDownPeriod`, `status`, `failureCount`, `createdAt`, `updatedAt`, `targetURL` (host only in evidence), subscriber list via `GET /v1/webhooks/{id}` | **CONFIRMED** (R21 GET) | `DIM-EV-R21-PROVIDER-001` |
| 8 | What does recovery PUT change? | Updates configurable fields; **forces `failureCount = 0`** in controller before persist; can set `status` back to `enabled` when included in payload | **CONFIRMED** (source); R9 field diff **PREPARED** in recovery plan | `UpdateWebhook` |
| 9 | Re-callback verification required? | **On create** — `RegisterWebhook` validates URL with verification token. **On PUT** — source reviewed does **not** re-run `verifyWebhookURL` in `UpdateWebhook` (unlike create) | **CONFIRMED** (source) vs **INFERRED** for PUT | `webhook_controller.go` create vs update handlers |
| 10 | Risks to subscriptions / trigger IDs? | **UNPLUG recovery VERIFIED**: subscriptions preserved, same UUID. Delete still requires unsubscribe-first per ops runbook | **VERIFIED** (SynqDrive); provider delete semantics **CONFIRMED** (docs/ops) | GT-R1 recovery evidence; WEBHOOK_OPERATIONS |

## `maxFailureCount` threshold

| Fact | Status |
|------|--------|
| Config key `MAX_WEBHOOK_FAILURE_COUNT` (`uint`) on provider service | **CONFIRMED** (source) `internal/config/settings.go` |
| Default in struct | **No `envDefault`** — runtime value is deployment-specific |
| Listener fallback if `< 1` | Sets `maxFailureCount = 1` | **CONFIRMED** (source) |
| DIMO production numeric threshold | **UNKNOWN** (not exposed via public GET) |
| R21 observation | Ignition `failureCount=12`, Speed `failureCount=28` at `failed` | **PRODUCTION_OBSERVED** |

**INFERRED:** Ignition crossed into `failed` near **12** consecutive counted failures (consistent with low-teens threshold). Speed’s **28** may reflect additional increments during a rapid 503 burst while cache/rows were still `enabled`, or stale cache windows — exact per-attempt log **NOT AVAILABLE** on SynqDrive side.

## Delivery failure taxonomy (provider)

```text
Signal/Event → evaluate → ShouldAttemptWebhook (enabled + failureCount < max)
  → POST targetURL (30s timeout, expect HTTP < 400)
    → success: ResetTriggerFailureCount + trigger log
    → WebhookFailureCode: IncrementTriggerFailureCount (maybe → status failed)
```

Non-counting case: request canceled because **provider consumer context** canceled (shutdown) — **does not** increment (`webhook_sender.go` comment).

## API evolution (historical SynqDrive Nest client vs current API)

| Topic | Historical code path | Current provider + ops | Change? |
|-------|---------------------|------------------------|---------|
| Subscribe URL | `POST .../vehicles/{tokenId}` + body | `POST .../subscribe/{assetDID}` | **CONFIRMED** drift (`DIM-CX-002`); Nest path **dormant** on Production |
| Create payload | `{name,url}` | `service`, `metricName`, `condition`, `targetURL`, `verificationToken`, … | **CONFIRMED** (`DIM-CX-003`) |
| Failure semantics | Not implemented locally | Provider-side counter + `failed` | **No SynqDrive change** — behavior from provider service |

## SynqDrive production correlation (R21)

| Event (UTC) | Observation |
|-------------|-------------|
| `2026-10-09 ~15:21` | Nginx **40× HTTP 503** on `POST /api/v1/webhooks/dimo` (deploy window) |
| `2026-10-09 15:22:29` | R9 Ignition definition `updatedAt`, `status=failed`, `failureCount=12` |
| `2026-10-09 15:22:50` | R9 Speed definition `updatedAt`, `status=failed`, `failureCount=28` |
| `2026-10-09 15:27` | Release dir `20261009152645_v4994` on VPS |

**INFERRED (strong):** Provider marked R9 definitions `failed` due to **callback HTTP failures** during an **application/proxy unavailable** window, not due to subscription loss.

## Limits of evidence

- Provider does **not** expose last delivery timestamp, last HTTP status, or per-failure reason on GET.
- DIMO MCP was **not** used (auth unavailable); semantics above are from **public Go source** + SynqDrive GET/nginx.
- Auto-recovery to `enabled` on later successful delivery **NOT FOUND** in reviewed source (UNPLUG required explicit PUT in 2026-09).

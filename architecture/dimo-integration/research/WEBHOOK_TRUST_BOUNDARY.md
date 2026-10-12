# R2 — Webhook trust boundary

## Chain

`DIMO Vehicle Triggers` → (HTTPS) → `app.synqdrive.eu` reverse proxy → Nest `DimoWebhookController` → validation → domain services → BullMQ.

## Controls (CONFIRMED_FROM_CODE @ `0633d0831`)

| Control | Present | Notes |
|---------|---------|-------|
| URL verification challenge | YES | Plain-text echo of `DIMO_WEBHOOK_VERIFICATION_TOKEN` |
| Per-trigger POST authentication | **Weak** | Verification token used at registration, **not** re-checked on each POST |
| HMAC `x-dimo-signature` | Optional | Validated only if `DIMO_WEBHOOK_SECRET` **and** header set |
| Payload shape gate | YES | `isDimoTriggerPayload` |
| tokenId resolution | YES | Reject/ignore if missing |
| Tenant mapping | Prisma lookups in inbox/DTC paths | **Partial audit** — requires per-handler review |
| Replay / event-id dedupe at edge | **Not observed** at controller | Downstream may coalesce (R9 wake) |
| Rate / body size limits | **UNKNOWN** at Nest layer | Assume reverse proxy limits |

## DIM-SEC-R1 reassessment

| ID | R1 | R2 |
|----|----|----|
| DIM-SEC-R1-001 | Unsigned POST accepted | **CONFIRMED** — by design when secret absent; mitigated by URL obscurity + network ACL (**INFERRED**) |
| DIM-SEC-R1-002 | Replay risk | **OPEN** — no global dedupe at ingress |
| DIM-SEC-R1-003 | Tenant mapping | **PARTIAL** — needs vehicle-link invariant audit |

## Fail mode

| Scenario | Behavior |
|----------|----------|
| Missing verification token on challenge | HTTP 503 |
| Invalid payload | `{ status: rejected }` |
| Invalid HMAC when secret configured | rejected |
| Unknown tokenId | ignored / rejected per path |

**No active penetration testing performed.**

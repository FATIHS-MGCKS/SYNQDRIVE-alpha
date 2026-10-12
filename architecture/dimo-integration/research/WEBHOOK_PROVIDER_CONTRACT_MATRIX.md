# R2 — Webhook provider contract matrix

Provider doc date: **2026-10-11** — https://dimo.org/docs/api-references/vehicle-triggers-api

| Operation | Official API | `DimoTriggersService` | R9 ops scripts | Production @ R2 |
|-----------|--------------|----------------------|----------------|-----------------|
| List webhooks | `GET /v1/webhooks` | YES | YES | used in audit |
| Create webhook | `POST /v1/webhooks` (CEL schema) | Legacy `{name,url}` | CEL fields | R9 defs exist (ops) |
| Subscribe vehicle | `POST …/subscribe/{tokenDID}` | Legacy `POST …/vehicles/{tokenId}` + signals body | YES | subscriptions 5/5 |
| Vehicle subscriptions | `GET …/vehicles/{tokenDID}` | YES (DID subject) | YES | YES |
| Unsubscribe | `DELETE …/unsubscribe/{tokenDID}` | not in service | YES (rollback scripts) | — |

## Classification

| Issue | Type |
|-------|------|
| Nest create/subscribe shapes | **API_SCHEMA_CONTRADICTION** (`DIM-CX-002/003`) |
| R9 `status: failed` on definitions | **PRODUCTION_OBSERVED** delivery health — see `R2_R9_PROVIDER_READ_AUDIT` |
| Natural wake not proven by GET | **UNKNOWN** — separate from subscription links |

## Remediation options (not implemented)

| Option | Risk | Breaking |
|--------|------|----------|
| Deprecate `DimoTriggersService` mutators; document ops-only | Low | None if bootstrap stays off |
| Re-implement service using `/subscribe/{tokenDID}` | Medium | Ops scripts must stay aligned |
| Fix failed R9 webhook status via provider PUT (ops) | Delivery risk | Requires owner-authorized mutation |

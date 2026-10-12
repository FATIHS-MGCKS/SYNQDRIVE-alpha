# R1 — DIMO provider capabilities vs SynqDrive

| Provider research date | **2026-10-11** |
| DIMO MCP | **UNAVAILABLE** — `mcp_auth` timed out; web docs used |

## API surfaces catalogued

| API | Base URL (prod) | SynqDrive integration | Maturity |
|-----|-----------------|----------------------|----------|
| Authentication | `https://auth.dimo.zone` | `DimoAuthService` developer JWT | **IMPLEMENTED** |
| Token exchange | `https://token-exchange-api.dimo.zone` | Vehicle JWT | **IMPLEMENTED** |
| Telemetry GraphQL | `https://telemetry-api.dimo.zone/query` | Primary data plane | **IMPLEMENTED** |
| Identity | `https://identity-api.dimo.zone` | Vehicle sync, VIN | **PARTIAL** |
| Vehicle Triggers | `https://vehicle-triggers-api.dimo.zone` | Webhook ingress + ops scripts | **PARTIAL** — runtime Nest client legacy paths |
| Fetch API | per dimo.org/docs | Not central in dimo module | **NOT_IMPLEMENTED** / unknown consumers |
| Attestation / Device definitions | docs | Indirect via identity | **UNKNOWN** |
| DIMO Agent API | env `DIMO_DOCUMENT_AGENT_*` on Production | Separate agent surface | **PARTIAL** — not deep-audited in R1 |

## Vehicle Triggers (official @ 2026-10-11)

**Source:** https://dimo.org/docs/api-references/vehicle-triggers-api

- Webhook definitions include CEL `condition`, `metricName`, `coolDownPeriod`, `verificationToken`
- Subscription: `POST /v1/webhooks/:webhookId/subscribe/:tokenDID`
- Callback payloads: CloudEvents (`type: dimo.trigger`)

**SynqDrive:** Production R9 uses ops scripts matching subscribe API; `DimoTriggersService` retains **legacy** create/subscribe shapes — see [`WEBHOOK_AND_TRIGGER_ARCHITECTURE.md`](WEBHOOK_AND_TRIGGER_ARCHITECTURE.md).

## Telemetry GraphQL (official introduction)

**Source:** https://dimo.org/docs/api-references/telemetry-api/introduction (not fully inlined in R1 — fetch for R2)

SynqDrive uses roots: `signalsLatest`, windowed `signals`, `segments`, `events`, `availableSignals`, `dataSummary` (**CONFIRMED_FROM_CODE**).

## Token exchange

**Source:** https://dimo.org/docs/api-references/token-exchange-api

SynqDrive sends `{ nftContractAddress, privileges, tokenId }` (**CONFIRMED** `dimo-auth.service.ts`).

## Feature classification legend

`IMPLEMENTED` · `PARTIAL` · `DORMANT` · `NOT_IMPLEMENTED` · `DEPRECATED` · `UNKNOWN` · `NOT_APPLICABLE`

## R2 research backlog

- Full Fetch API mapping
- Privilege ID official matrix
- Rate limits / 429 semantics per API (partially in `DimoProviderBudgetService`)
- Live GraphQL introspection artifact refresh

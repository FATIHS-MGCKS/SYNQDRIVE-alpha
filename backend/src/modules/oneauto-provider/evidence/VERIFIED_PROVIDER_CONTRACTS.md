# One Auto API — verified vs unverified contracts (SynqDrive P1)

Sources consulted (2026-10-31, no live paid calls from this workstream):

| Source | URL |
|--------|-----|
| Knowledge base | https://docs.oneautoapi.com |
| Swagger UI | https://swagger.oneautoapi.com (OpenAPI JSON not publicly fetchable without auth) |
| Sandbox Postman guide | https://docs.oneautoapi.com/knowledgebase/making-sandbox-api-calls-postman/ |
| Async methods | https://docs.oneautoapi.com/knowledgebase/working-with-asynchronous-api-methods/ |
| Status codes | https://docs.oneautoapi.com/knowledgebase/understanding-status-codes/ |
| API keys | https://docs.oneautoapi.com/knowledgebase/creating-api-keys/ |

## Verified (implementation may rely on these)

- **Authentication:** API key sent on requests (dashboard → API Admin → API Keys); same key for sandbox and live per vendor docs.
- **Sandbox base URL:** `https://sandbox.oneautoapi.com`
- **Live base URL:** vendor docs reference live calls separately; SynqDrive uses `ONEAUTO_BASE_URL` override (default live host `https://api.oneautoapi.com` when `ONEAUTO_SANDBOX=false`).
- **HTTP async:** `202 Accepted` / `202 In Progress` → poll same endpoint or use optional callback URL; re-call for `200` when complete (vendor async guide).
- **Partial content:** `206` may include corrective hints (vendor status guide).
- **No automatic sandbox→live fallback** in SynqDrive client (config-bound base URL).

## Unverified (blocked or stubbed in P1)

- **Exact REST paths** per SKU (`OE_SERVICE_HISTORY_EU`, etc.) — not extracted from authenticated Swagger/Postman in this environment.
- **Query parameter names** per EU service (UK docs use `vehicle_registration_mark`; EU VIN parameter names UNKNOWN).
- **Response JSON field shapes** — stored opaquely; never mapped into vehicle specs automatically.
- **Published DE pricing page** — `https://oneautoapi.com/pricing/de/` returned 404 at audit time; indicative prices require `ONEAUTO_INDICATIVE_PRICE_<SKU>_MINOR` env configuration.
- **Actual billed amounts** — UNKNOWN until provider billing/audit evidence exists.
- **Inbound webhook authentication** — not implemented (no verified callback contract wired in P1).

## SynqDrive P1 safety

- Feature flag `ONEAUTO_ENABLED=false` by default.
- HTTP allowlist built **only** from `ONEAUTO_VERIFIED_PROVIDER_CONTRACTS` (empty → no outbound paths).
- Catalog placeholders are **not** executable (`CONTRACT_UNVERIFIED`) until attestation entry exists.
- VIN-only request parameters (verified param name required on contract entry).
- Cost confirmation + quote TTL + idempotency before enqueueing billable work.
- Master Admin MFA step-up on execute (`MASTER_ONEAUTO_PROVIDER_EXECUTE`) when IAM MFA flags enforce step-up.
- External responses persisted in `OneAutoProviderResponse` only — no auto-write to vehicle specification or service history.

# IAM Endpoint Enforcement Triage (Prompt 13/22)

**Date:** 2026-07-21

## Scope

Manual triage of 152 static P0/P1 candidates from `docs/audits/data/iam-endpoint-enforcement-matrix-2026-07.csv`.

Full disposition: `docs/audits/iam-endpoint-enforcement-triage-2026-07.md`

## Confirmed fixes

| Surface | Issue | Fix |
|---------|-------|-----|
| Chat (`/organizations/:orgId/chat/*`) | Missing `OrgScopingGuard` | Added org + `ai-assistant` permissions |
| WhatsApp org routes | Missing `OrgScopingGuard` | Added org + module permissions; connect/disconnect require `data-authorization.manage` |
| Integrations connect/disconnect | Any org member could mutate secrets | `data-authorization.manage` |
| Fines upload/read/update | Missing permission guard + IDOR on `findById` | `fines.read/write` + org-scoped service queries |
| Document download/metadata | Any org member could fetch PDFs | `bookings.read` |
| Vehicle org writes | Several handlers missing org/permission guards | `fleet.read/write/manage` + `OrgScopingGuard` |

## Not changed (by design)

- Public invites (`/invites/accept`, `/invites/validate`)
- Auth endpoints (`/auth/login`, `/auth/refresh`, …)
- Signed webhooks (`/webhooks/whatsapp`)
- Voice MCP gateway (`/mcp/voice/:orgId`) — bearer token service auth
- MASTER_ADMIN `/admin/*` routes
- Tenant org profile — `assertCanWriteOrgProfile` (ORG_ADMIN)
- Legal documents — `@Roles('ORG_ADMIN', 'MASTER_ADMIN')` on mutations
- Bookings/pricing/workflows bulk surfaces — flagged `REQUIRES_TEST` for domain-specific permission mapping

## Tests

`backend/src/shared/auth/iam-endpoint-enforcement-triage.security.spec.ts`

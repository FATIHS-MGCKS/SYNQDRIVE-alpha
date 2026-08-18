# Master Admin — Security & Governance Hub (UI-9.3)

**Datum:** 2026-08-18

## Zusammenfassung

Kanonischer Hub **Identität & Zugriff** (`?view=security-access`) ersetzt separate Sidebar-Einträge `users` und `activity-log`.

## Backend (bereits vorhanden)

- `SecurityGovernanceController` unter `GET/POST /admin/security/*`
- Erweitertes `GET /admin/activity-log` (Filter: `auditDomain`, `securityOnly`, `from`, `to`, `actorUserId`, `search`)
- `GET /admin/activity-log/:id` Detail mit Diff / Correlation
- `GET /admin/activity-log/export` mit Step-up `MASTER_AUDIT_EXPORT`

## Frontend

- `frontend/src/master/security-access/SecurityAccessHub.tsx` — 7 Primärtabs
- URL-Contract: `securityAccess`, `userId`, `roleId`, `roleScope`, `auditId`, `ownSecurityTab`, …
- Legacy-Redirects: `?view=users` → `securityAccess=users`; `?view=activity-log` → `securityAccess=audit`
- Nav-Badge: `security-attention` aus `GET /admin/security/attention-summary`
- `MasterAccountSheet` MFA → `own-security` Tab
- Settings Integrations: ehrlicher Empty State (keine Fake DIMO/Stripe Credentials)

## Signalfluss

```
SecurityGovernanceService / ActivityLogService
  → GET /admin/security/* , GET /admin/activity-log*
  → useSecurityAccess hooks
  → SecurityAccessHub (server-authoritative MFA, Attention, Audit)
```

## Docs

- Blueprint: `docs/ui/master-admin-canonical-security-governance-blueprint.md`
- Page Framework: `docs/ui/master-admin-canonical-page-framework.md`

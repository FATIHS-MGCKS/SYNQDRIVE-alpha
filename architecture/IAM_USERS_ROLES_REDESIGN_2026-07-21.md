# IAM Users & Roles UI Redesign (2026-07-21)

## Summary

Prompt 21 introduces a **canonical IAM team API** and redesigns the Access Control Center to three areas: **Team**, **Roles & Access**, **Security & Audit**.

## Canonical API (`/organizations/:orgId/iam/*`)

| Endpoint | Purpose |
|----------|---------|
| `GET /iam/team/kpis` | Server-computed KPIs (active users, open invites, privileged, review required) |
| `GET /iam/team` | Team list contract (members + pending invites) |
| `GET /iam/team/members/:membershipId` | Detail with effective access, sessions, audit, available actions |
| `POST /iam/team/members/:id/send-reset-link` | Admin reset link (step-up) |
| `GET /iam/roles` | Role list with assignments, risk, version |
| `GET /iam/roles/:roleId` | Role detail + impact preview |
| `GET /iam/security` | Org security overview (MFA summary, sessions, audit, privileged) |

Effective access is computed server-side via `IamAccessReviewSnapshotService` — no frontend permission inference.

## UI structure

1. **Team** — member list (desktop table / mobile cards), integrated invites, KPIs
2. **Roles & Access** — role versions, assignments, impact preview, permission accordion
3. **Security & Audit** — MFA posture, sessions, IAM audit, privileged accounts

## Dangerous actions

- Reset link (not password entry)
- Session revoke (step-up via existing MFA admin route)
- Suspend membership with last-admin server gate
- Reason + impact preview in sticky action bar

## Tests

- `iam-team.security.spec.ts` (backend)
- `iam-team.ui.test.ts` (frontend i18n + utils)

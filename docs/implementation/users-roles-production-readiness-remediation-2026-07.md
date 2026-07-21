# Users & Roles — Production Readiness Remediation (2026-07)

| Field | Value |
|-------|-------|
| **Audit** | `docs/audits/users-roles-production-readiness-2026-07.md` |
| **Audit branch** | `audit/users-roles-production-readiness-2026-07` @ `0f99ce41` |
| **Implementation branch** | `cursor/iam-org-switch-fb6e` |
| **Verdict (audit)** | **NOT_READY** (28× P0, 27 production blockers) |
| **Mode** | Identity & session truth → roles & audit → governance & UI (22 prompts) |

---

## Audit-Ausgangslage (konsolidierte Root Causes)

| Thema | Befund | Finding |
|-------|--------|---------|
| Org-Admin setzt globales Passwort | `changeOrgUserPassword` schreibt `User.passwordHash` | UR-P1-ID-01 |
| Multi-Org-Session nicht org-gebunden | Refresh `take:1` ohne `organizationId`/`membershipId` | UR-P1-SE-01 |
| Invite-Token in Admin-API | `inviteToken`/`inviteUrl` in create/resend Response | UR-P1-IN-01 |
| Rollen-Drift | `updateRole` propagiert nicht zu Memberships | UR-P3-RC-01 |
| IAM-Audit fire-and-forget | `void userAudit.record` nicht transaktional | UR-P6-AU-01 |
| Last-Admin nur `ORG_ADMIN` | Custom Admin-äquivalente Rollen ignoriert | UR-P4-AD-01 |
| Suspendierung global | `updateOrgUser` setzt `User.status` global | UR-P1-MO-01 |
| Effective Access Split | Guard vs `permissionPreview` vs Frontend | UR-P3-EA-11 |

---

## Prompt-Status (22 Schritte)

| Prompt | Ziel | Status | Commit |
|--------|------|--------|--------|
| 1 | Remediation baseline (Branch, Inventar, Fortschrittsdokument) | ✅ (audit-Artefakte + Branch) | — |
| 2 | Security regression test harness (A–K) | ✅ | `284aaf6b` |
| 3 | Bootstrap/seed admin hardening | ⬜ | — |
| 4 | Isolate org membership admin from global identity | ✅ | `ceae35bb` |
| 5 | Central session invalidation policy | ✅ | `6e320e44` |
| 6 | Secure password self-service reset | ✅ | `778353b2` |
| 7 | Org-bound refresh tokens | ✅ | `09c8f0a2` |
| 8 | Explicit organization session switching | ✅ | (this commit) |
| 9 | Versioned roles + assignment link | ⬜ | — |
| 10 | Role propagation + drift detection | ⬜ | — |
| 11 | Endpoint/Guard hardening | ⬜ | — |
| 12 | Stop invite plaintext in API | ⬜ | — |
| 13 | Secure invite accept for existing users | ⬜ | — |
| 14 | Transactional IAM audit outbox | ⬜ | — |
| 15 | JML deprovisioning orchestrator | ⬜ | — |
| 16 | MFA + step-up for privileged IAM | ⬜ | — |
| 17 | Access review campaigns | ⬜ | — |
| 18 | Retention / erase / anonymize IAM | ⬜ | — |
| 19 | Security Activity real sessions/MFA | ⬜ | — |
| 20 | IAM API contract stabilization | ⬜ | — |
| 21 | Users & Roles UI redesign | ⬜ | — |
| 22 | IAM observability + staging replay / security tests | ⬜ | — |

---

## Prompt 2 — Security Regression Harness

**Datum:** 2026-07-21 UTC

### Neue Test-Artefakte

| Pfad | Rolle |
|------|-------|
| `backend/src/modules/users/policies/iam-session-invalidation.policy.ts` | Ziel-Session-Invalidierungsmatrix (pure domain) |
| `backend/src/modules/users/policies/iam-effective-access.policy.ts` | Effective-Access-Vergleichslogik für Tests (delegiert an EffectiveAccessEngine) |
| `backend/src/modules/users/policies/effective-access-engine.ts` | Canonical EffectiveAccessEngine (Prompt 9) |
| `backend/src/modules/users/policies/iam-global-identity.policy.ts` | Globale Identität vs Org-Grenze (Ziel) |
| `backend/src/modules/users/iam-security-regression.harness.ts` | Shared mocks / IDs |
| `backend/src/modules/users/iam-security-regression.spec.ts` | Szenarien A–D, F–K |
| `backend/src/modules/users/iam-multi-org-refresh.e2e.regression.spec.ts` | Szenario E (Multi-Org Refresh) |
| `backend/src/modules/users/users.controller.security.characterization.spec.ts` | Guard/Endpoint-Metadaten |
| `backend/src/modules/users/organization-invites.controller.security.characterization.spec.ts` | Invite-API-Exposure |
| `backend/src/shared/auth/iam-tenant-isolation.security.regression.spec.ts` | OrgScopingGuard Tenant-Isolation |

### Testausführung

```bash
cd backend && npm run test:iam:security
```

**Erwartung (nach Prompt 4):** Szenarien **A/C** (Identitätsgrenze, Passwort-Deprecation) **grün**; verbleibende `TARGET RED` (E, F, G, H, I, J, …) rot bis spätere Prompts.

---

## Prompt 4 — Membership vs Global Identity Isolation

**Datum:** 2026-07-21 UTC

### Geänderte Runtime-Pfade

| Endpoint | Vorher | Nachher |
|----------|--------|---------|
| `PATCH /organizations/:orgId/users/:id` | Schrieb `User.email`, Profil, globalen `User.status` | Nur `OrganizationMembership` (Rolle, Permissions, Status, Stations-Scope, …) |
| `PATCH` mit `status: SUSPENDED` | `User.status = SUSPENDED` global | `Membership.status = SUSPENDED` org-scoped |
| `POST .../change-password` | Klartext → `passwordHash` | `410 Gone` + Migrationshinweis |
| `POST .../request-password-reset` | — | Audit `USER_PASSWORD_RESET_REQUESTED` (kein Hash-Write) |
| `POST .../users` (bestehender User) | Profil/Passwort global überschrieben | Nur Membership; Passwort abgelehnt |

### Neue Dateien

- `backend/src/modules/users/policies/org-membership-admin.policy.ts`
- `backend/src/modules/users/iam-membership-identity-isolation.spec.ts`
- `architecture/IAM_MEMBERSHIP_IDENTITY_ISOLATION_2026-07-21.md`

### Client-Übergangsvertrag

Siehe Architektur-Dokument — **keine** stille Weiterleitung auf globale User-Updates. Frontend (`changePasswordByOrg`, Profil-Felder in `UserDetailDrawer`) muss in Prompt 20 angepasst werden.

### Self-Service unverändert

`POST /account/me/change-password` — weiterhin für eingeloggte Nutzer.

---

## Prompt 5 — Central Session Invalidation Policy

**Datum:** 2026-07-21 UTC

- `IamSessionPolicyService` + `iam_session_revocation_intents` outbox (intent in IAM transaction, execution post-commit)
- Scopes: `USER_ALL_SESSIONS`, `ORGANIZATION_MEMBERSHIP_SESSIONS`, `TOKEN_FAMILY`, `PRIVILEGED_SESSIONS`, …
- `User.sessionVersion`, `OrganizationMembership.membershipVersion`, JWT claims on access tokens
- Refresh tokens store `organizationId` for multi-org scoped revocation
- Wired: membership suspend/remove/role/permission/station, password change, refresh reuse
- `architecture/IAM_SESSION_INVALIDATION_POLICY_2026-07-21.md`

---

## Prompt 6 — Secure Password Self-Service Reset

**Datum:** 2026-07-21 UTC

- `PasswordResetService` — admin request → email token → user confirm (global identity)
- Org admin API: neutral `{ status: accepted }` only — no password, token, or URL
- Public `POST /auth/password-reset/request|confirm`
- `PasswordPolicyService` central validation; rate limits per IP/email/org
- Confirm triggers `PASSWORD_CHANGED` session revocation + `USER_PASSWORD_RESET_COMPLETED` audit
- `architecture/IAM_PASSWORD_RESET_SELF_SERVICE_2026-07-21.md`

---

## Prompt 7 — Org-Bound Refresh Sessions

**Datum:** 2026-07-21 UTC

- `RefreshToken` binding fields + `RefreshTokenScope` (`ORG_MEMBERSHIP_BOUND` / `LEGACY_UNSCOPED`)
- Login org resolution: single membership auto; multi-org requires `organizationId` or `lastAuthOrganizationId`
- Refresh preserves `organizationId` + `membershipId`; version snapshots validated on rotate
- Legacy unscoped tokens: controlled grace via `ENABLE_IAM_LEGACY_UNSCOPED_REFRESH_GRACE`
- `architecture/IAM_ORG_BOUND_REFRESH_SESSIONS_2026-07-21.md`
- Scenario **E** regression tests green

---

## Prompt 8 — Explicit Organization Session Switching

**Datum:** 2026-07-21 UTC

- `POST /auth/switch-organization` + `GET /auth/memberships`
- Login multi-org returns `requiresOrganizationSelection` without tokens until explicit org chosen
- `User.lastSelectedOrganizationId` (renamed from `lastAuthOrganizationId`) — explicit user selection only
- `/auth/me` uses JWT session membership (no `take:1`)
- Frontend org picker on login + `OrganizationSwitcher` in TopBar
- `architecture/IAM_ORG_SESSION_SWITCHING_2026-07-21.md`

---

## Prompt 9 — Canonical EffectiveAccessEngine

**Datum:** 2026-07-21 UTC

- `EffectiveAccessEngine` — pure domain service (module permissions, station scope, privileged capabilities, decision reasons)
- `EffectiveAccessLoaderService` — DB adapter (membership + organization role template)
- Wired: `PermissionsGuard`, `assertMembershipPermission`, `StationAccessService.resolve`, `OrganizationRoleService.permissionPreview`
- Central admin bypass (MASTER_ADMIN, SERVICE_ACCOUNT, ORG_ADMIN); default deny; no controller-level bypasses
- `architecture/IAM_EFFECTIVE_ACCESS_ENGINE_2026-07-21.md`

---

## Prompt 2 — Security Regression Harness (Szenarien)

- **A** Globale Identität (Passwort, E-Mail, globaler Status)
- **B** Membership-Suspendierung / Session-Revoke-Ziel
- **C** Admin-Passwortreset vs Klartext-Setzen
- **D** Session-Invalidierung bei IAM-Änderungen
- **E** Multi-Org-Refresh (`take:1`, kein Org-Binding)
- **F** Rollen-Drift / fehlende Propagation
- **G** Effective Access Guard vs Preview
- **H** Invite-Secret-Exposure + Accept ohne Re-Auth
- **I** Nicht-transaktionales IAM-Audit
- **J** Last-Admin (nur `ORG_ADMIN`, nicht Custom-Admin)
- **K** Tenant-Isolation (OrgScopingGuard + fremde Role/Station IDs)

### Keine Produktivlogik geändert

Nur Tests, Policy-Hilfsmodule (nicht in Runtime verdrahtet) und Dokumentation.

---

## Rollback

Branch revert / Tests entfernen — keine Migration, kein Feature-Flag.

---

## Offene Production Blockers (unverändert)

Siehe `docs/audits/data/users-roles-production-readiness-verdict-2026-07.json` → `goLiveBlockers`.

# Users & Roles — Production Readiness Remediation (2026-07)

| Field | Value |
|-------|-------|
| **Audit** | `docs/audits/users-roles-production-readiness-2026-07.md` |
| **Audit branch** | `audit/users-roles-production-readiness-2026-07` @ `0f99ce41` |
| **Implementation branch** | `cursor/iam-session-invalidation-policy-fb6e` |
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
| 5 | Central session invalidation policy | ✅ | (this commit) |
| 6 | Org-bound refresh tokens | ⬜ | — |
| 7 | Central EffectiveAccessEngine | ⬜ | — |
| 8 | Versioned roles + assignment link | ⬜ | — |
| 9 | Role propagation + drift detection | ⬜ | — |
| 10 | Endpoint/Guard hardening | ⬜ | — |
| 11 | Stop invite plaintext in API | ⬜ | — |
| 12 | Secure invite accept for existing users | ⬜ | — |
| 13 | Transactional IAM audit outbox | ⬜ | — |
| 14 | JML deprovisioning orchestrator | ⬜ | — |
| 15 | MFA + step-up for privileged IAM | ⬜ | — |
| 16 | Access review campaigns | ⬜ | — |
| 17 | Retention / erase / anonymize IAM | ⬜ | — |
| 18 | Security Activity real sessions/MFA | ⬜ | — |
| 19 | IAM API contract stabilization | ⬜ | — |
| 20 | Users & Roles UI redesign | ⬜ | — |
| 21 | IAM observability + missing-audit alerts | ⬜ | — |
| 22 | Staging replay + security/tenant tests | ⬜ | — |

---

## Prompt 2 — Security Regression Harness

**Datum:** 2026-07-21 UTC

### Neue Test-Artefakte

| Pfad | Rolle |
|------|-------|
| `backend/src/modules/users/policies/iam-session-invalidation.policy.ts` | Ziel-Session-Invalidierungsmatrix (pure domain) |
| `backend/src/modules/users/policies/iam-effective-access.policy.ts` | Effective-Access-Vergleichslogik für Tests |
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

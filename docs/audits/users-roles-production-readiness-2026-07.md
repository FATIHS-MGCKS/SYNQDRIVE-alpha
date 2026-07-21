# Users & Roles / IAM Production-Readiness Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `users-roles-production-readiness-2026-07` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `audit/users-roles-production-readiness-2026-07` |
| **Phase** | **2 of 8 — Identity / membership / session / password / MFA** |
| **Verdict (interim)** | **NOT READY** (preliminary — full verdict in Phase 8) |
| **Status** | **Phases 1–2 complete** — Phases 3–8 outlined, not executed |
| **Production data modified** | **No** — code read + prior VPS/DB/Redis diagnostics were read-only |
| **Analysis window (VPS)** | 2026-07-20 UTC (Phase 1); Phase 2 code-complete 2026-07-21 |

---

## Document map

| Artifact | Path | Phase |
|----------|------|-------|
| Main report (this file) | `docs/audits/users-roles-production-readiness-2026-07.md` | 1–8 |
| Code map CSV | `docs/audits/data/users-roles-code-map-2026-07.csv` | 1 |
| Runtime snapshot (anonymized) | `docs/audits/data/users-roles-runtime-snapshot-2026-07.json` | 1 |
| Phase-1 script result | `docs/audits/data/users-roles-audit-phase-1-result-2026-07.json` | 1 (generated) |
| Identity vs membership model | `docs/audits/data/iam-identity-membership-model-2026-07.csv` | 2 |
| Multi-org session flow | `docs/audits/data/iam-multi-org-session-flow-2026-07.csv` | 2 |
| Session invalidation matrix | `docs/audits/data/iam-session-invalidation-matrix-2026-07.csv` | 2 |
| Password / MFA flow matrix | `docs/audits/data/iam-password-mfa-flow-2026-07.csv` | 2 |
| Read-only orchestrator | `scripts/audits/audit-users-roles-production-readiness.ts` | 1–8 |

Planned later-phase artifacts (not yet generated):

| Artifact | Path | Phase |
|----------|------|-------|
| Threat / control matrix | `docs/audits/data/users-roles-control-matrix-2026-07.csv` | 2 residual / 8 |
| Effective-permission replay | `docs/audits/data/users-roles-effective-permissions-2026-07.csv` | 3 |
| Invite lifecycle evidence | `docs/audits/data/users-roles-invite-lifecycle-2026-07.csv` | 5 |
| UI/UX security audit | `docs/audits/data/users-roles-ui-ux-audit-2026-07.csv` | 7 |
| DSGVO / ISO 27001 mapping | `docs/audits/data/users-roles-compliance-mapping-2026-07.csv` | 7–8 |
| Final verdict JSON | `docs/audits/data/users-roles-production-readiness-verdict-2026-07.json` | 8 |

---

## Anonymization contract

Stable, non-reversible aliases used in all Git artifacts:

| Alias | Meaning |
|-------|---------|
| `ORG_001` | Organization slot |
| `USER_001` | Global user identity slot |
| `MEMBERSHIP_001` | Organization membership slot |
| `ROLE_001` | Organization role template slot |
| `INVITE_001` | Invite slot |
| `SESSION_GROUP_001` | Refresh-token family / session group |

**Never committed:** names, emails, phones, IPs, full user agents, password/token hashes, plaintext tokens, real UUIDs, JWTs, cookies, reset/invite links, `DATABASE_URL`, secrets, person-identifying audit payloads.

---

# Eight-phase audit outline

## Phase 1 — Architecture map & IAM runtime inventory *(this document)*

- Git branch + report skeleton
- Full code map (identity → membership → role → permissions → stations → token → guards → FE → audit)
- Invite flow map
- Actual production runtime (PM2, Postgres aggregates, Redis, headers, token config)
- Preliminary P0/P1 suspicions against the 11 audit hypotheses

## Phase 2 — Identity / membership / session / password / MFA *(complete below)*

- Global identity vs organization membership field boundaries
- Multi-org login / refresh / (missing) switch reconstruction
- Access vs refresh binding, TTLs, cookies/CSRF, invalidation matrix
- Password admin/self/forgot flows and MFA/assurance gaps
- Residual threat/control synthesis deferred to Phase 8 (CSV matrices hold Phase-2 evidence)

## Phase 3 — Effective permission computation & parallel truths

- Formalize effective permission algorithm
- Diff: `OrganizationRole.permissions` vs `OrganizationMembership.permissions` vs JWT `membershipRole` vs FE `hasPermission`
- Station scope + fieldAgentAccess interaction
- ORG_ADMIN bypass paths
- Replay fixtures with anonymized ROLE/MEMBERSHIP slots

## Phase 4 — Authentication hardening & lockout (follow-on)

- Login failure / throttle / lockout gaps (deeper than Phase 2)
- Brute-force / CAPTCHA / progressive delay
- Correlation of AUTH_FAIL with session anomalies

## Phase 5 — Joiner / Mover / Leaver (invites, role moves, suspend, remove)

- Invite create → deliver → accept → membership
- Existing-user accept without re-auth
- Role assign / template edit propagation
- Suspend / remove / reactivate
- Last-active-admin protection
- Session & audit side effects per lifecycle event

## Phase 6 — Multi-organization users & org switching (deep dive)

- Build on Phase-2 multi-org CSV with fixture replay when multi-org users exist
- OrgScopingGuard mismatch attacks
- Recommended switch protocol

## Phase 7 — UI/UX, Security Activity, MFA placeholders, DSGVO readiness

- `frontend/src/rental/components/users-roles/*`
- Clipboard of invite URLs and temporary passwords
- Missing accept-invite SPA route
- Security Activity / MFA / activeSessionCount placeholders
- Retention, deletion, anonymization, access-review gaps

## Phase 8 — Final synthesis & production-readiness verdict

- Consolidate P0/P1/P2 findings
- Go / No-Go with remediation prompt sequence
- Compliance residual risk statement
- Explicit confirmation of no production mutations

---

# Phase 1 findings

## 1. Executive summary

SynqDrive IAM is a **custom JWT + PostgreSQL refresh-token** system (not Clerk at runtime) centered on:

1. **Global** `User` identity (email, `passwordHash`, `platformRole`, `status`)
2. **Tenant** `OrganizationMembership` (role, copied `permissions` JSON, station scope, status)
3. **Template** `OrganizationRole` (defaults copied at assign/invite — **not** live-joined at guard time)
4. **Guards** in `backend/src/shared/auth/` (`AuthGuard`, `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`)
5. **Frontend** login-time permission snapshot in `localStorage` via `hasPermission`

Phase-1 code and production runtime evidence already support several of the stated audit hypotheses as **confirmed or strongly evidenced**. Interim verdict: **NOT READY** for production-grade IAM under least-privilege, session revocation, invite hygiene, and multi-org determinism expectations. Full scoring waits for Phases 2–8.

### Preliminary P0 suspicions (Phase 1)

| ID | Hypothesis | Status | One-line evidence |
|----|------------|--------|-------------------|
| UR-P0-01 | H1 Org admin changes global password | **Confirmed in code** | `UsersService.changeOrgUserPassword` updates `User.passwordHash` |
| UR-P0-02 | H2 Sessions not revoked on admin password/suspend/remove | **Confirmed in code** | No `revokeAllForUser` on those paths; prod JWT TTL `24h` |
| UR-P0-03 | H3 Role edits do not propagate | **Confirmed in code** | `updateRole` updates template only; membership keeps snapshot |
| UR-P0-04 | H4 Multi-org org selection non-deterministic | **Confirmed in code** | Login/`me` `take:1` no `orderBy`; refresh uses newest membership |
| UR-P0-05 | H5 Refresh not bound to org/membership | **Confirmed in schema+runtime** | `refresh_tokens` has no `organization_id`; 70 active families |
| UR-P0-06 | H6 Invite plaintext URL to FE/clipboard | **Confirmed in code** | API returns `inviteToken`/`inviteUrl`; FE `clipboard.writeText` |
| UR-P0-07 | H7 Existing user accepts invite without re-auth | **Confirmed in code** | Public `acceptInvite`; password only if user missing |
| UR-P0-08 | H8 IAM audits fire-and-forget | **Confirmed in code+runtime** | `void this.userAudit.record`; prod `iamAuditActionRows=0` |
| UR-P0-09 | Runtime seed-admin enabled | **Runtime confirmed** | `ENABLE_SEED_ADMIN=true` + token set on VPS |
| UR-P0-10 | Invite delivery not production-wired | **Confirmed in code+runtime** | `TransactionalMailService` log fallback; SMTP unset; no invite Bull queue |

### Preliminary P1 suspicions

| ID | Hypothesis | Status | Notes |
|----|------------|--------|-------|
| UR-P1-01 | H9 MFA/sessions placeholders | **Confirmed** | Account MFA hard-false; security activity `twoFactorEnabled/activeSessionCount = null` |
| UR-P1-02 | H10 Parallel access truths | **Confirmed** | Template vs membership JSON vs JWT role vs FE snapshot vs station scope |
| UR-P1-03 | H11 Retention/anonymization/access review | **Confirmed gap** | Soft `REMOVED` only; no user erase; activity_logs default retain forever |
| UR-P1-04 | Accept-invite SPA missing | **Confirmed** | No `accept-invite` route under `frontend/src` |
| UR-P1-05 | SPA ignores refresh tokens | **Confirmed** | Only `synqdrive_token` access JWT in localStorage |
| UR-P1-06 | Session pile-up | **Runtime** | 70 active refresh families, 0 revoked rows; both users multi-session |

---

## 2. Scope and methodology (Phase 1)

| Dimension | Detail |
|-----------|--------|
| **Mode** | Read-only — no IAM mutations, no Prisma migrate, no Redis writes, no session revoke |
| **Code** | `backend/src/modules/{auth,users,account,activity-log,organizations,stations}` + `backend/src/shared/auth` + Prisma + FE users-roles |
| **Runtime** | SSH diagnostics to production VPS; `psql` SELECT aggregates; Redis SCAN prefixes; HTTPS response headers |
| **Not in Phase 1** | Deep threat scoring, permission replay fixtures, UI walkthrough recordings, compliance attestation |

**Modules noted absent (prompt paths vs repo):**

- `backend/src/modules/audit/` → use `activity-log` + `UserAccessAuditService`
- `backend/src/modules/security/` → **does not exist**
- `backend/src/modules/email/` → use `outbound-email` (product mail) + `users/transactional-mail` (invites)
- `backend/src/common/guards/` → guards live in `backend/src/shared/auth/`

---

## 3. Actual IAM runtime

### 3.1 Process topology

| Component | Observation |
|-----------|-------------|
| PM2 | Single app `synqdrive` (fork) + `pm2-logrotate` |
| API + workers | Co-located in Nest process (BullMQ processors + cron schedulers) |
| PostgreSQL 16 | Canonical IAM store (`users`, `organization_memberships`, `organization_roles`, `organization_user_invites`, `refresh_tokens`, `activity_logs`) |
| Redis | BullMQ only (`bull:*`); **no** session/refresh/auth keys |
| Invite email | Synchronous `TransactionalMailService` — **not** Resend/`OutboundEmail`/Bull |
| IAM-specific queue | **None** |

### 3.2 Token / cookie / header configuration

| Setting | Production value / shape |
|---------|--------------------------|
| `JWT_EXPIRES_IN` | `24h` |
| `JWT_SECRET` | set (length observed, value not stored) |
| Refresh TTL | 30 days (code constant) |
| Refresh storage | PostgreSQL `refresh_tokens` (SHA-256 lookup hash) |
| Auth transport | `Authorization: Bearer` from SPA `localStorage` |
| Auth cookies | **None** |
| Helmet / CSP | Present on `/api/v1/health` |
| CORS credentials | `true` |
| Global throttle | 200 / 60s (header observed) |
| Login throttle | 10 / 60s (code) |
| `ENABLE_SEED_ADMIN` | **true** (token set) |

### 3.3 Aggregate data plane (anonymized)

See `docs/audits/data/users-roles-runtime-snapshot-2026-07.json`.

Highlights:

- 2 users (1 `MASTER_ADMIN`, 1 `USER`), 1 active membership (`ORG_ADMIN`), 2 orgs
- 10 system role templates seeded; active membership has **null** `organization_role_id` and **null** permissions JSON
- 0 invites
- 80 refresh rows / **70 active** / **0 revoked** / 10 expired-unrevoked
- Activity: LOGIN=129, AUTH_FAIL=10; **0** rows with `metaJson.auditAction`
- Multi-org active users: **0** in this environment (code risk remains)

### 3.4 Which component holds which IAM truth

| Concern | Source of truth | Notes |
|---------|-----------------|-------|
| Identity | `User` | Global email/password/platformRole/status |
| Password | `User.passwordHash` | **Not** per-organization |
| Tenant link | `OrganizationMembership` | unique `(userId, organizationId)` |
| Coarse org role | `Membership.role` + JWT `membershipRole` | JWT can be stale |
| Fine permissions (API) | `Membership.permissions` via `PermissionsGuard` | Live DB; `ORG_ADMIN` bypass |
| Role templates | `OrganizationRole` | Defaults at assign/invite only |
| Station scope | `Membership.stationScope` / `stationIds` + `StationAccessService` | Parallel to module permissions |
| Access token | JWT signed by `RefreshTokenService.signAccessToken` | Role+org claims; **no** module permissions |
| Refresh session | `RefreshToken` family | User-bound only |
| FE visibility | Login `user.permissions` in `localStorage` | Stale until re-login |
| IAM audit codes | `ActivityLog.metaJson.auditAction` via `UserAccessAuditService` | Fire-and-forget; unused in prod so far |
| Auth events | `ActivityLog` entity `AUTH_EVENT` | LOGIN / AUTH_FAIL present |
| Invite capability | `OrganizationUserInvite` | Hashed at rest; plaintext returned once to admin API |

---

## 4. End-to-end data flows

### 4.1 Identity → effective access → audit

```text
User (global identity)
  → OrganizationMembership (org-scoped snapshot: role, permissions JSON,
      organizationRoleId, stationScope, stationIds, fieldAgentAccess, status)
  → OrganizationRole template (copied at create/assign/invite; NOT live-joined)
  → optional per-user permission / station overrides on membership
  → effective API authz:
       AuthGuard (JWT)
       OrgScopingGuard (JWT org + ACTIVE membership)
       RolesGuard (JWT platform/membership role)
       PermissionsGuard (DB membership.permissions; ORG_ADMIN bypass)
       StationAccessService (role + stationIds/scope)
  → Access Token (JWT: membershipRole + organizationId; no module permissions)
  → Refresh Session (DB: userId + family; no org/membership FK)
  → Frontend Visibility (RentalContext.hasPermission from login snapshot)
  → Audit Event (UserAccessAuditService → ActivityLog; void / best-effort)
  → Security Activity (ActivityLog slice + MFA/session placeholders)
```

### 4.2 Invite lifecycle

```text
CreateUserWizard / InvitesTab
  → OrganizationInvitesController (users-roles.write/manage)
  → OrganizationInviteService.createInvite
       ensureDefaultRoles → resolveRoleForInvite → copy fields onto invite
       generateInviteToken (plain + bcrypt hash + sha256 lookup)
       persist PENDING (7-day expiry)
       TransactionalMailService.sendOrganizationInvite (log fallback)
       return inviteToken + inviteUrl to caller
  → FE clipboard.writeText(inviteUrl) on resend/create paths
  → Public GET/POST /invites/validate|accept (AuthGuard public)
  → acceptInvite:
       if no User: require password, create User
       if User exists: NO password / NO session proof
       upsert OrganizationMembership ACTIVE (transaction with invite ACCEPTED)
       void audit USER_INVITE_ACCEPTED (+ CREATED / REACTIVATED)
  → No automatic login/token issuance; FE accept page missing
```

---

## 5. Step-level flow notes (Phase 1)

For CSV-level fields (file, class/function, I/O, org scope, writes, transactions, session/audit impact, idempotency, consumers, tests, risk) see:

`docs/audits/data/users-roles-code-map-2026-07.csv`

### 5.1 Critical write paths (session/audit impact)

| Path | Session impact | Audit impact |
|------|----------------|--------------|
| Login | New refresh family | `LOGIN` / `AUTH_FAIL` |
| Refresh rotate | Replace token; reuse → family revoke | `REFRESH` |
| Self password change | Optional revoke others | AUTH UPDATE (void) |
| Org admin password change | **None** | `USER_PASSWORD_RESET_BY_ADMIN` (void) |
| MASTER_ADMIN password change | **None** | **None** |
| Suspend / role change / remove | **None** (JWT until expiry; refresh until login/refresh checks user/membership) | void IAM codes |
| Role template update | **None** (membership snapshot unchanged) | void `ROLE_UPDATED` |
| Invite accept | **None** (no tokens issued) | void invite/user codes |

### 5.2 Idempotency / locks observed

| Mechanism | Where |
|-----------|-------|
| Refresh family + `replacedBy` | Rotation / reuse detection |
| Invite `tokenLookup` unique | Token load |
| One pending invite per email | Prior PENDING revoked on create |
| Last-ORG-ADMIN count guard | Demote/remove/accept demotion |
| Retention `running` flag | DataRetentionScheduler re-entrancy |
| Seed-admin exists → noop | `seedAdmin` |

No distributed lock for invite accept user-create (user create is **outside** the membership/invite transaction).

---

## 6. Parallel access truths (confirmed)

| Layer | Authz input | Live? |
|-------|-------------|-------|
| Role template | `OrganizationRole.*` | Defaults only |
| Membership snapshot | `OrganizationMembership.permissions/role/station*` | Yes (API guards) |
| JWT | `membershipRole`, `organizationId` | Snapshot until refresh/re-login |
| FE UI | Login `permissions` + `userRole` | Stale until re-login |
| Station access | Separate service over membership station fields | Yes |
| ORG_ADMIN bypass | Membership.role == ORG_ADMIN | Yes (PermissionsGuard) |

This is multiple concurrent “access truths.” Backend module checks are fresher than FE, but JWT org/role and FE menus can disagree after mover events.

---

## 7. Production runtime signals tied to hypotheses

| Signal | Implication |
|--------|-------------|
| `ENABLE_SEED_ADMIN=true` | Privileged bootstrap endpoint may be reachable if token leaks |
| JWT 24h | Suspend/password/role changes leave bearer usable up to a day |
| 70 active refresh families / 0 revoked | Logout/revoke paths unused; session inventory grows |
| Redis has no auth keys | Session revoke must target Postgres refresh rows (or JWT wait-out) |
| 0 `auditAction` rows | Either IAM admin flows unused, or fire-and-forget/audit path not exercised — Phase 5/8 must distinguish |
| Invite mail log-only | Joiner process not email-production-ready despite Resend being configured for other mail |
| Active membership without `organizationRoleId` | Prod org admin operates on coarse role bypass, not template-linked permissions |

---

## 8. Test coverage snapshot (Phase 1)

| Area | Spec | Gap |
|------|------|-----|
| Last admin / reactivate | `users.service.spec.ts` | Partial |
| Invite create/accept/revoke | `organization-invite.service.spec.ts` | No explicit “existing user, no password, no session” security assertion |
| Roles assign/delete | `organization-role.service.spec.ts` | No “update does not propagate” test |
| Permissions normalize | `permissions.guard.spec.ts` | Present |
| Account password/sessions | `account.service.spec.ts` | Present |
| Auth login/refresh | — | No dedicated controller/service specs found |
| Frontend users-roles | — | No tests |
| Audit durability | — | Only `toHaveBeenCalled`, not failure/rollback |

---

## 9. Read-only audit script

`scripts/audits/audit-users-roles-production-readiness.ts`

- Phase 1: validates required artifacts exist; writes anonymized phase result JSON
- Refuses if write-allow env flags are set
- Phases 2–8: exit code 2 until implemented in later prompts

---

## 10. Phase 1 exit criteria checklist

| Criterion | Status |
|-----------|--------|
| Audit branch created | Done |
| Main report with 8-phase outline | Done |
| Code map CSV | Done |
| Runtime snapshot anonymized | Done |
| Read-only script skeleton | Done |
| No production mutations | Confirmed |
| No PII/secrets in artifacts | Confirmed by construction + scan |
| Prompt 2 not started | Confirmed |

---

# Phase 2 findings — Identity, sessions, multi-org, password, MFA

Detailed matrices:

- `docs/audits/data/iam-identity-membership-model-2026-07.csv`
- `docs/audits/data/iam-multi-org-session-flow-2026-07.csv`
- `docs/audits/data/iam-session-invalidation-matrix-2026-07.csv`
- `docs/audits/data/iam-password-mfa-flow-2026-07.csv`

## P2.1 Global identity versus membership

### Answers (Teil 1)

| # | Question | Answer |
|---|----------|--------|
| 1 | Global identity fields | `User`: email (unique), `passwordHash`, `platformRole`, `status`, profile/contact/locale, `mustChangePassword`, last-login metadata. **No** `organizationId` on `User`. |
| 2 | Organization fields | `OrganizationMembership`: role, `organizationRoleId`, permissions JSON, station scope/ids, `fieldAgentAccess`, membership `status`. Plus per-org account/notification preferences. |
| 3 | Can org admin change global identity? | **Yes** — email, name, phones, address, locale, **and** `User.status`; plus global `passwordHash` via change-password. |
| 4 | Can Org A affect Org B access? | **Yes** — shared password; global suspend blocks all logins; email rewrite moves login identity. |
| 5 | Suspend org-scoped or global? | **Global `User.status`**. Org UI `status=SUSPENDED` does **not** set `membership.status=SUSPENDED` (enum unused by this path; membership stays `ACTIVE`). |
| 6 | Delete = membership remove or user delete? | Org UI = soft `REMOVED` membership. MASTER_ADMIN `/admin/users` = hard `User` delete. |
| 7 | Data responsibility / history | Soft remove keeps User + historical `ActivityLog` refs. No user anonymization job. Hard delete cascades FKs. |
| 8 | Same email → multiple users? | **No** — `@unique` on `User.email`. |
| 9 | Normalized email constraints? | App-layer `toLowerCase().trim()` on login/update; DB unique (not citext). |
| 10 | Email change / verification? | Immediate rewrite; **no** verification model, confirmation mail, or `emailVerified` field. |

### Critical model defect — dual status

Org deactivate (`UsersTab` → `updateByOrg({ status: 'SUSPENDED' })`) sets **`User.status = SUSPENDED`** and leaves **`OrganizationMembership.status = ACTIVE`**. UI badge then shows Suspended via `USER_STATUS_MAP[u.status]`. Consequence: one tenant’s “deactivate” is a **global account lockout**.

---

## P2.2 Login and organization selection (Teil 2)

| # | Question | Answer |
|---|----------|--------|
| 1 | First login org | First `ACTIVE` membership `take: 1` **without `orderBy`** — non-deterministic. |
| 2 | Refresh org | **Newest** `ACTIVE` membership `orderBy createdAt desc`. |
| 3 | Org change without user action? | **Yes** — refresh can rebind to a different org than login. |
| 4 | Removed/suspended membership reselected? | `REMOVED`/`INVITED` excluded. Org-UI “suspend” does **not** clear membership `ACTIVE` (uses `User.status` instead). |
| 5 | Membership in refresh token? | **No**. |
| 6 | Org in token family state? | **No** — family is a UUID only. |
| 7 | Session bound to user+org+membership? | **Only `userId`** (+ family). |
| 8 | Explicit org switch? | **Not implemented**. `OrgScopingGuard` requires JWT `organizationId` == `:orgId`. |
| 9 | Switch creates new family? | N/A. Login always creates a **new** family (explains session pile-up). |
| 10 | Refresh from Org A → access for Org B? | **Yes** — user-global refresh re-selects newest ACTIVE membership. |

**Three incompatible selection algorithms:**

1. Login / `me`: unordered `take: 1`
2. Refresh: newest by `createdAt`
3. Account fallback: oldest by `createdAt` (if JWT org missing)

SPA currently stores **only** the access token, so refresh rebind is latent for the main UI—but any client using `/auth/refresh` inherits the cross-org issue. Access tokens remain valid up to **24h** (prod).

---

## P2.3 Access / refresh token properties (Teil 3)

| Property | Finding |
|----------|---------|
| Access TTL | Prod `JWT_EXPIRES_IN=24h` (code default also `24h`) |
| Refresh TTL | 30 days (code constant) |
| Rotation | Yes — consume old, issue new in same family |
| Family reuse detection | Yes — revoked+replaced reuse → revoke family |
| Revocation helpers | `revoke`, `revokeAllForUser`, `revokeSessionById`, `revokeOtherSessionsForUser` |
| Cookies / SameSite / Secure / HttpOnly | **No auth cookies** — Bearer in `localStorage` |
| CSRF | No cookie session → classic CSRF N/A; XSS steals bearer |
| Device/session metadata | `ipAddress` + `userAgent` on refresh rows; last-login IP/UA on User |
| Org / membership binding | **Absent** on refresh |
| Role / permission version | **Absent** |
| Authentication assurance | Password-only; no `amr`/`aal`/`auth_time` |

### Teil-3 checks

| # | Question | Answer |
|---|----------|--------|
| 1 | How fast do role/permission changes apply? | **PermissionsGuard**: immediate (DB). **RolesGuard / FE / JWT role**: until refresh/re-login (up to 24h). |
| 2 | Access after suspend? | **Yes** until JWT expiry — `AuthGuard` does not re-check `User.status`. |
| 3 | Access after membership removal? | Org-scoped routes **403**; other routes may work until expiry. |
| 4 | Refresh after password reset? | **Yes** — admin/self reset does not revoke refresh (self may optionally revoke others). |
| 5 | All families on compromise? | Only if someone calls `logout-all` / `revokeAllForUser` — **not** wired to password reset. |
| 6 | Org-scoped session revoke? | **No**. |
| 7 | Global session revoke? | **Yes** via `logout-all` / `revokeAllForUser`. |
| 8 | Admins see/revoke foreign sessions? | **No** — self-service only. |
| 9 | IP/UA storage? | Yes in Postgres; returned to account owner; no IAM anonymization policy. |
| 10 | Session fixation? | Low for classic cookie fixation; stolen refresh remains the main risk (family revoke on reuse). |

---

## P2.4 Session invalidation matrix (Teil 4)

See `iam-session-invalidation-matrix-2026-07.csv`.

**Largest gaps:** admin password reset, org suspend, membership remove, role demotion — **no refresh revoke**; access JWT lingers; `mustChangePassword` **not enforced** by LoginPage or API middleware.

---

## P2.5 Password admin flow (Teil 5)

| Flow | Verdict |
|------|---------|
| Self change | Works; current password required; FE defaults `revokeOtherSessions=true`; policy **min 10** (weaker than admin **min 12**) |
| Forgot password | UI stub → “contact support”; **no backend** |
| Reset link | **Missing** (no token model) |
| Org admin reset | `UsersTab` modal → `POST .../change-password` (`users-roles.manage`); **global** hash; admin sees plaintext; **no** session revoke; **no** notify; `mustChangePassword` set but **unenforced** |
| Master admin reset | Same gaps + **no IAM audit** |
| Temporary password | CreateUserWizard clipboard copy of plaintext |
| Global credential mgmt | Single `User.passwordHash` — **not** multi-org safe |

---

## P2.6 MFA and assurance (Teil 6)

| Capability | Status |
|------------|--------|
| TOTP / WebAuthn / Passkeys / Recovery codes | **Not implemented** (no schema, no routes) |
| `twoFactorEnabled` / `passkeysAvailable` | Hardcoded `false` in account security DTO |
| Security activity MFA/session counts | `null` placeholders |
| Step-up / recent authentication | **Absent** — high-risk admin actions unprotected |
| MFA claims in tokens | **Absent** |
| MFA reset auditability | N/A (no MFA) |

---

## P2.7 Confirmed Phase-2 P0 / P1 findings

| ID | Sev | Finding |
|----|-----|---------|
| UR-P2-ID-04 / UR-P0-01 | P0 | Org admin mutates global password/email/status with cross-org blast radius |
| UR-P2-ID-05 | P0 | “Suspend” is global `User.status`, not membership suspend |
| UR-P2-ID-10 | P0 | Email change without verification |
| UR-P2-MO-01/02/13 | P0 | Non-deterministic login; refresh can mint Org B access from user-global refresh |
| UR-P2-SI-02/04/05 | P0 | No session revoke on admin password reset / suspend / membership remove |
| UR-P2-SI-16 | P0 | `mustChangePassword` ineffective |
| UR-P2-PW-07 | P0 | Credentials are global, not tenant-scoped |
| UR-P2-MFA-05 | P0 | No step-up for high-risk IAM actions |
| UR-P2-TOK-02 | P0 | 24h access TTL amplifies invalidation gaps |
| UR-P2-PW-01 | P1 | Password policy mismatch (10 vs 12) |
| UR-P2-MFA-01..04 | P1 | MFA entirely placeholder |
| UR-P2-MFA-08 | P1 | Admins cannot remotely revoke a user’s sessions |
| UR-P2-PW-02/03 | P1 | No forgot-password / reset-link |

---

## P2.8 Phase 2 exit criteria

| Criterion | Status |
|-----------|--------|
| Identity vs membership answered | Done |
| Multi-org login/refresh reconstructed | Done |
| Token binding / invalidation matrix | Done |
| Password + MFA flows documented | Done |
| CSVs committed | Done |
| No production mutations | Confirmed |
| Prompt 3 not started | Confirmed |

---

## Appendix A — Hypothesis tracker (living)

| # | Hypothesis | Phase-1 result | Follow-up phase |
|---|------------|----------------|-----------------|
| 1 | Org admins can change global password | **Confirmed** (Phase 2 deepened: also email/status) | 5, 6, 8 |
| 2 | Password/suspend/role revoke sessions unreliable | **Confirmed** + invalidation matrix | 5, 8 |
| 3 | Role values copied; later edits don’t propagate | **Confirmed** | 3, 5 |
| 4 | Multi-org login/refresh non-deterministic | **Confirmed** + three selection algorithms | 6, 8 |
| 5 | Refresh not bound to org/membership | **Confirmed**; refresh A→access B | 6, 8 |
| 6 | Invite plaintext to FE/clipboard | **Confirmed** | 5, 7 |
| 7 | Existing users accept invite without re-auth | **Confirmed** | 5, 7 |
| 8 | Critical IAM audits fire-and-forget | **Confirmed**; master password reset has **no** audit | 5, 8 |
| 9 | MFA/sessions/security activity partial | **Confirmed — not implemented** | 7, 8 |
| 10 | Parallel access truths | **Confirmed** (+ dual User/Membership status) | 3, 7 |
| 11 | Retention/deletion/anonymization/access review incomplete | **Confirmed gap** | 7, 8 |

---

## Appendix B — Changes / Architektur

**Not updated** (Phases 1–2). Audit documentation only; no product implementation or architecture behavior change was made.

---

## Appendix C — Production mutation attestation

| Action | Performed? |
|--------|------------|
| Create/suspend/remove/reactivate users | No |
| Change roles/permissions | No |
| Reset passwords | No |
| Revoke sessions | No |
| Create/send/revoke/accept invites | No |
| Change MFA state | No |
| Prisma migrate / infra config change | No |
| Redis writes | No |
| Commit of PII/secrets | No |

All VPS access was diagnostic/read-only (`psql` SELECT aggregates, Redis SCAN/DBSIZE, `curl -I` headers, PM2 status, env key **presence/shape** only).

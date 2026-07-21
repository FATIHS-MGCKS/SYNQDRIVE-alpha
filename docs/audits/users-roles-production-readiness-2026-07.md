# Users & Roles / IAM Production-Readiness Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `users-roles-production-readiness-2026-07` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `audit/users-roles-production-readiness-2026-07` |
| **Phase** | **1 of 8 — Architecture map & IAM runtime inventory** |
| **Verdict (interim)** | **NOT READY** (preliminary — full verdict in Phase 8) |
| **Status** | **Phase 1 complete** — Phases 2–8 outlined, not executed |
| **Production data modified** | **No** — code read + VPS/DB/Redis diagnostics were read-only |
| **Analysis window (VPS)** | 2026-07-20 UTC |

---

## Document map

| Artifact | Path | Phase |
|----------|------|-------|
| Main report (this file) | `docs/audits/users-roles-production-readiness-2026-07.md` | 1–8 |
| Code map CSV | `docs/audits/data/users-roles-code-map-2026-07.csv` | 1 |
| Runtime snapshot (anonymized) | `docs/audits/data/users-roles-runtime-snapshot-2026-07.json` | 1 |
| Phase-1 script result | `docs/audits/data/users-roles-audit-phase-1-result-2026-07.json` | 1 (generated) |
| Read-only orchestrator | `scripts/audits/audit-users-roles-production-readiness.ts` | 1–8 |

Planned later-phase artifacts (not yet generated):

| Artifact | Path | Phase |
|----------|------|-------|
| Threat / control matrix | `docs/audits/data/users-roles-control-matrix-2026-07.csv` | 2 |
| Effective-permission replay | `docs/audits/data/users-roles-effective-permissions-2026-07.csv` | 3 |
| Session lifecycle matrix | `docs/audits/data/users-roles-session-lifecycle-2026-07.csv` | 4 |
| Invite lifecycle evidence | `docs/audits/data/users-roles-invite-lifecycle-2026-07.csv` | 5 |
| Multi-org / switch matrix | `docs/audits/data/users-roles-multi-org-matrix-2026-07.csv` | 6 |
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

## Phase 2 — Threat model, trust boundaries & control matrix

- Actor classes: MASTER_ADMIN, ORG_ADMIN, SUB_ADMIN, WORKER, DRIVER, invited outsider, stolen refresh, stolen invite link
- Trust boundaries: global User vs org Membership vs JWT vs FE snapshot
- Map each hypothesis to ISO/IEC 27001-aligned control families (A.5, A.5.15, A.5.16, A.5.17, A.5.18, A.8.2, A.8.5, A.8.15, A.8.16)
- Abuse cases: cross-org password reset, invite token theft, session fixation/reuse, last-admin bypass attempts

## Phase 3 — Effective permission computation & parallel truths

- Formalize effective permission algorithm
- Diff: `OrganizationRole.permissions` vs `OrganizationMembership.permissions` vs JWT `membershipRole` vs FE `hasPermission`
- Station scope + fieldAgentAccess interaction
- ORG_ADMIN bypass paths
- Replay fixtures with anonymized ROLE/MEMBERSHIP slots

## Phase 4 — Authentication, password & session lifecycle

- Login failure / throttle / lockout gaps
- Password change (self vs org admin vs MASTER_ADMIN)
- `mustChangePassword` enforcement surfaces
- Refresh rotation, reuse detection, revokeAll wiring gaps
- Access-token TTL vs revocation expectation
- Missing forgot-password flow

## Phase 5 — Joiner / Mover / Leaver (invites, role moves, suspend, remove)

- Invite create → deliver → accept → membership
- Existing-user accept without re-auth
- Role assign / template edit propagation
- Suspend / remove / reactivate
- Last-active-admin protection
- Session & audit side effects per lifecycle event

## Phase 6 — Multi-organization users & org switching

- Membership selection on login / me / refresh / account
- Absence of org-switch API
- Refresh token unbound to org/membership
- Cross-org data access risk with stale JWT `organizationId`
- OrgScopingGuard behavior under multi-membership

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

## Appendix A — Hypothesis tracker (living)

| # | Hypothesis | Phase-1 result | Follow-up phase |
|---|------------|----------------|-----------------|
| 1 | Org admins can change global password | **Confirmed** | 4, 6 |
| 2 | Password/suspend/role revoke sessions unreliable | **Confirmed** (code); runtime TTL/session pile-up supports | 4, 5 |
| 3 | Role values copied; later edits don’t propagate | **Confirmed** | 3, 5 |
| 4 | Multi-org login/refresh non-deterministic | **Confirmed** in code; no multi-org users in prod yet | 6 |
| 5 | Refresh not bound to org/membership | **Confirmed** | 4, 6 |
| 6 | Invite plaintext to FE/clipboard | **Confirmed** | 5, 7 |
| 7 | Existing users accept invite without re-auth | **Confirmed** | 5, 7 |
| 8 | Critical IAM audits fire-and-forget | **Confirmed**; prod unused | 5, 8 |
| 9 | MFA/sessions/security activity partial | **Confirmed** | 7 |
| 10 | Parallel access truths | **Confirmed** | 3, 7 |
| 11 | Retention/deletion/anonymization/access review incomplete | **Confirmed gap** | 7, 8 |

---

## Appendix B — Changes / Architektur

**Not updated.** This prompt is audit documentation only; no product implementation or architecture behavior change was made.

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

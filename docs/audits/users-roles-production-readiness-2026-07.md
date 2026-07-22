# Users & Roles / IAM Production-Readiness Audit — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `users-roles-production-readiness-2026-07` |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Branch** | `audit/users-roles-production-readiness-2026-07` |
| **Phase** | **8 of 8 — Final synthesis** |
| **Verdict** | **NOT READY** |
| **Mode** | Read-only — no production mutations; no product implementation |
| **Legal / ISO** | Technical assessment only — **not** legal advice; **not** an ISO/IEC 27001 certification |

---

## Artifact completeness (Teil 1)

All Prompt-8 required paths exist (34/34). Additional supporting artifacts also present: runtime snapshot, endpoint summary, `iam-vps-integrity-readonly.py`, phase result JSONs, remediation plan, verdict JSON.

Missing from the required list: **none**.

Anonymization contract: aliases only (`ORG_00N`, `USER_00N`, `MEMBERSHIP_00N`, `ROLE_00N`, `INVITE_00N`, `SESSION_GROUP_00N`). No names, emails, phones, IPs, full UAs, raw UUIDs, tokens, JWTs, or secrets in Git.

---

# 1. Executive Summary

SynqDrive IAM is a **custom JWT + PostgreSQL refresh-token** system (not Clerk at runtime) with global `User` identity and tenant `OrganizationMembership` snapshots. Code review (Phases 1–3, 5–7) and anonymized VPS aggregates (Phase 4; 90-day session/auth window; full entity history) show **systemic production blockers**.

**Verdict: NOT READY** for production-grade multi-tenant IAM under least-privilege, session integrity, invite hygiene, audit reliability, and privileged-access expectations.

| Signal (anonymized VPS) | Value |
|-------------------------|-------|
| Organizations | 2 |
| Users / Memberships | 2 / 1 |
| Multi-org active users | 0 |
| Roles (system on ORG_001) | 10 (0 assignments) |
| Invites | 0 |
| Refresh active / revoked | **70 / 0** |
| Linked role↔membership drift | 0 (`NO_ROLE_LINK` = 1) |
| Privileged drift | 0 |
| Org writes without `PermissionsGuard` | **122** (static) |
| Findings | **46** (**28×P0**, 14×P1, 4×P2, 0×P3); **27** production blockers |

Top blockers: global credential control by org admins; sessions not revoked on password/leaver events; user-only refresh; non-propagating role snapshots; no EffectiveAccessEngine; invite secret exposure; existing-user accept without re-auth; fire-and-forget audits; no MFA/step-up; last-admin enum-only; Security UI placeholders.

---

# 2. Scope und Methodik

| Item | Detail |
|------|--------|
| In scope | Identity, membership, multi-org, tokens/sessions, password/MFA, invites, roles/permissions/stations, effective access, endpoint guards, privileged/last-admin, JML, access reviews, audit reliability, DSGVO **technical** capability, ISO-**oriented** alignment, Users & Roles UI/UX targets |
| Out of scope | Product fixes; production writes; legal advice; ISO certification; penetration testing execution |
| Methods | Static code inspection; decorator-level endpoint scan; SELECT-only VPS aggregates; UI code audit; textual wireframes |
| VPS window | Sessions/AUTH activity: **90 days**; users/memberships/roles/invites/audit entities: **full available history** (Phase 4 capture 2026-07-21 UTC) |
| Evidence grades | `CONFIRMED` / `STRONG_EVIDENCE` / `SUSPECTED` / `NOT_ENOUGH_DATA` — never present suspicion as confirmation |

---

# 3. IAM Runtime

| Runtime fact | Evidence |
|--------------|----------|
| Process | PM2 `synqdrive` |
| Sessions store | Postgres `refresh_tokens` (not Redis session store) |
| Access JWT TTL | **24h** (prod config) |
| Refresh TTL | ~30d family model |
| `ENABLE_SEED_ADMIN` | **true** on VPS (Phase 1) |
| Invite mail | Log fallback — not production-wired |
| Auth product | Custom Nest guards in `backend/src/shared/auth/` |

Artifacts: `users-roles-runtime-snapshot-2026-07.json`, code map CSV.

---

# 4. Globale Benutzeridentität

Global `User` holds email (unique), `passwordHash`, `platformRole`, `status`, profile, `mustChangePassword`, last-login metadata. **No `organizationId` on User.**

**CONFIRMED:** Org admin paths can mutate global email/status/`passwordHash` (`UsersService.updateOrgUser` / `changeOrgUserPassword`). That is **not** tenant-local credential control.

---

# 5. Organisationsmitgliedschaften

`OrganizationMembership` holds `role`, optional `organizationRoleId`, copied `permissions` JSON, station scope/ids, `fieldAgentAccess`, status (`ACTIVE|INVITED|SUSPENDED|REMOVED`).

VPS: 1 ACTIVE membership on `ORG_001` (`ORG_ADMIN`, **null** `organization_role_id`, empty permissions JSON, all-stations). `ORG_002` empty. Suspend via org UI sets **global** `User.status`, not reliably `membership.status=SUSPENDED`.

---

# 6. Multi-Organisations-Zugriff

Architecture allows one user → many memberships. VPS: **0** multi-org active users. Residual risk remains because refresh is user-global and org selection is non-deterministic (Phase 2).

---

# 7. Login und Organisation Selection

| Path | Algorithm |
|------|-----------|
| Login / `me` | First ACTIVE membership `take:1` **without** stable `orderBy` |
| Refresh | Newest ACTIVE membership |
| Account fallback | Oldest membership |

**CONFIRMED:** Non-deterministic org selection; no first-class switch API (Phase 2/5).

---

# 8. Access- und Refresh-Token

Access JWT carries `sub`, email, name, `platformRole`, `membershipRole`, `organizationId`, `organizationName` — **no** `membershipId`, `roleVersion`, `permissionVersion`, `amr`/`aal`/`auth_time`.

Refresh: SHA-256 hashed; **no** `organization_id` / `membership_id` columns. VPS: **80/80** sessions unbound; classification `USER_ONLY_SESSION`.

---

# 9. Session Lifecycle

Login creates new families; SPA largely discards refresh → pile-up (USER_002: 56 active families; USER_001 MASTER_ADMIN: 14 without membership).

| Event | Session revoke? |
|-------|-----------------|
| Self password change | Optional other-sessions only |
| Admin password reset | **None** |
| Suspend / remove / role downgrade | **None** |
| Refresh reuse | Family revoke + **warn log only** (no ActivityLog) |

VPS: **0** revoked tokens; password-related UPDATEs=89 with survivors.

---

# 10. Passwort- und Credential-Lifecycle

| Flow | Status |
|------|--------|
| Forgot / self-service token reset | **Missing** |
| Admin direct password set | **Present** (org + master) |
| Policy | Length-only; self min 10 vs admin min 12 |
| History / breach check | **None** |
| `mustChangePassword` | Stored; **not enforced** on login/API |
| Target policy (audit-only) | Admin requests reset → short-lived token → user sets password → revoke sessions → audit+notify — **not implemented** |

---

# 11. MFA und Step-up Authentication

**NOT IMPLEMENTED.** Account flags hardcoded `false`; UI placeholders; no TOTP/WebAuthn/recovery/remembered devices; no step-up/`auth_time`. Privileged IAM actions = JWT + permission guards only.

---

# 12. Invitations

Token: 32-byte base64url; bcrypt hash + sha256 lookup; **7-day** expiry; resend **rotates** (old links die). Delivery: mail fallback logs URL; API returns **plaintext** `inviteToken`/`inviteUrl`; resend **auto-clipboards**.

Accept: public endpoints; new user sets password; **existing user needs no login/re-auth**; can reactivate `REMOVED`; no SPA `/accept-invite` route. VPS: **0** invite rows (empirical integrity unvalidated; code risks CONFIRMED).

---

# 13. Rollenmodell

`OrganizationRole` = template. Assign/invite **copies** permissions onto membership. `updateRole` does **not** cascade. No `roleVersion`. VPS: 10 system roles unassigned; live admin has `NO_ROLE_LINK`.

---

# 14. Permission-Semantik

Modules with `read` / `write` / `manage` (manage implies write/read). Default deny for non-admins. `ORG_ADMIN` bypasses module checks. FE `hasPermission` uses **login-time** snapshot in `localStorage`.

---

# 15. Stations- und Zugriffsscope

Station axis separate from module permissions (`stationScope` / `stationIds` / `fieldAgentAccess`). All-stations common for admin. Invalid station ID refs: **0** in VPS snapshot.

---

# 16. Effective Access

Canonical formula (audit-defined, **not implemented** as engine):

`MASTER_ADMIN bypass → ACTIVE membership → ORG_ADMIN module bypass → else membership.permissions` (+ station axis).

Parallel truths today: template · membership JSON · JWT claims · FE snapshot · station fields. Drift detector idle without role links.

---

# 17. Endpoint Enforcement

Static scan: **525** matrix rows; **122** org-scoped writes without `PermissionsGuard`; **151** P0 risk classifications; `RolesGuard` without `@Roles` is a **no-op**. Users & Roles module itself relatively well guarded. Webhooks under `:orgId` intentionally different.

Artifact: `iam-endpoint-enforcement-matrix-2026-07.csv` + summary JSON.

---

# 18. Privileged Accounts und Last-Admin-Schutz

Last-admin protection uses **`MembershipRole.ORG_ADMIN` enum only**. Custom `users-roles.manage` bypasses. No break-glass model; seed-admin enabled. VPS: `ORG_001` **single admin**; `ORG_002` empty.

---

# 19. Joiner-Mover-Leaver

No central `DeprovisioningService`. Joiner: invite or direct password (clipboard). Mover: role/scope patches without session invalidation or impact API. Leaver: `REMOVED` without session/invite cleanup; suspend is global user status; REMOVED reactivatable via invite.

---

# 20. Access Reviews

**MISSING** end-to-end (no model/jobs/attestation/export). VPS `accessReviewsFound=0`. Minimum model documented in Phase 5 CSV; depends on EffectiveAccessEngine.

---

# 21. Audit Logging

`UserAccessAuditAction` codes cover many IAM mutations; auth uses `ActivityAction` LOGIN/AUTH_FAIL/LOGOUT/REVOKE. **All** critical paths use `void` + `AuditService` swallow-errors. No outbox/retry/DLQ. `AuditService` bypasses PII scrub used by `ActivityLogService.log`. Refresh reuse unaudited. Master password reset unaudited. Logs deletable via retention/platform prune — not append-only. VPS: **0** `metaJson.auditAction` rows despite 89 password UPDATEs.

---

# 22. DSGVO-technische Fähigkeit und Retention

Technical only — **not legal advice**.

| Capability | Readiness |
|------------|-----------|
| Remove membership without deleting User | YES |
| Global erase/anonymize orchestration | NO |
| DSAR / portability package | NO |
| Invite prune job | NO |
| `activity_logs` retention default | Disabled (keep forever) |
| Refresh token prune | ~30d after expiry |
| Legal hold for IAM | NO (documents only elsewhere) |
| Privacy by default | WEAK (invite secrets, verbose audits, no MFA) |

---

# 23. ISO/IEC-27001-orientierte Kontrollausrichtung

Technical alignment only — **not certification**.

| Topic | Readiness |
|-------|-----------|
| Identity / Authn / Access provision-modify-remove | PARTIAL |
| Privileged access / Secure auth / Logging / Monitoring / Deletion / Masking / PII / Incident | PARTIAL |
| Segregation of Duties | **MISSING** |
| Periodic Access Review | **MISSING** |

---

# 24. UI/UX, Mobile, i18n und Accessibility

Current: 5 inner tabs; 5+3 KPIs; DE-hardcoded island; password modal; clipboard secrets; MFA/session placeholders; weak tab/dialog a11y.

Target (Phase 7, **not implemented**): Team · Roles & Access · Security & Audit; 4 KPIs; 6-column list; drawer A–E; Impact Preview; security state enum; mobile cards/accordion; full i18n.

---

# 25. Findings P0–P3

Full machine-readable catalog: `docs/audits/data/iam-integrity-findings-2026-07.json` (46 findings). Each entry includes id, severity, evidenceConfidence, category, title, code/VPS evidence, affected counts, impact, reproduction, recommendation, requiredTests, dependencies, productionBlocker.

### Counts

| Severity | Count |
|----------|------:|
| P0 | 28 |
| P1 | 14 |
| P2 | 4 |
| P3 | 0 |
| Production blockers | 27 |

### Representative CONFIRMED P0 blockers

| ID | Title | Confidence |
|----|-------|------------|
| UR-P5-PW-03 / UR-P2 lineage | Org admin sets global password | CONFIRMED |
| UR-P4-F01 / UR-P5-PW-09 | Sessions survive password events; 0 revoked | CONFIRMED |
| UR-P4-F02 | Refresh user-only (no org binding) | CONFIRMED |
| UR-P3 / UR-P5-JML-05 | Role snapshot non-propagation | CONFIRMED |
| UR-P8-EP-01 | 122 org writes without PermissionsGuard | CONFIRMED |
| UR-P5-INV-01/05/16 | Invite plaintext + clipboard; existing-user accept | CONFIRMED |
| UR-P6-FF-01/03/04 | Fire-and-forget / non-transactional / no outbox | CONFIRMED |
| UR-P3-PA / UR-P5 | Last-admin enum-only; no MFA/step-up | CONFIRMED |
| UR-P5-JML-10 | Leaver does not revoke sessions | CONFIRMED |
| UR-P7-UI / UR-P5-MFA | Security placeholders | CONFIRMED |

`NOT_ENOUGH_DATA`: empirical invite accept/resend races (0 invite rows) — **code path still CONFIRMED** for exposure/accept flaws.

---

# 26. Production-Readiness-Verdict und Umsetzungsplan

## 26.1 Category scores

| Cat | Name | Score |
|-----|------|-------|
| A | Identity Integrity | **NOT_READY** |
| B | Tenant Isolation | **NOT_READY** |
| C | Authentication Security | **NOT_READY** |
| D | Session Security | **NOT_READY** |
| E | Role and Permission Correctness | **NOT_READY** |
| F | Effective Access Consistency | **NOT_READY** |
| G | Invite Security | **NOT_READY** |
| H | Privileged Access Governance | **NOT_READY** |
| I | Audit Reliability | **NOT_READY** |
| J | Joiner-Mover-Leaver | **NOT_READY** |
| K | Privacy and Retention | **NOT_READY** |
| L | ISO-Control Alignment | **NOT_READY** |
| M | User Experience | **NOT_READY** |
| N | Mobile/i18n/Accessibility | **NOT_READY** |
| O | Test Readiness | **CONDITIONALLY_READY** (audit scripts exist; product regression suite incomplete) |
| P | Observability | **NOT_READY** |

## 26.2 Overall verdict

# NOT_READY

Go-live blocked until identity/session/role/audit truths are repaired (see remediation prompts 1–12 minimum before UI redesign).

## 26.3 Canonical IAM target model (define only — not implemented)

**A. Global identity** — User; verified email; global credentials; MFA; global security events.  
**B. Org membership** — status; role assignment; scope; JML state.  
**C. Versioned roles** — `OrganizationRole` + `RoleVersion`; dynamic assign; explicit overrides; Impact Preview.  
**D. Effective access** — one server `EffectiveAccessEngine` for guards, API, UI.  
**E. Org-bound session** — `userId` + `organizationId` + `membershipId` + `roleVersion` + `permissionVersion` + `assuranceLevel` + `tokenFamilyId`.  
**F. Credential reset** — admin requests → user sets → revoke sessions → audit+notify (no routine admin hash set).  
**G. Audit outbox** — same DB transaction as mutation → immutable worker → retry/DLQ.  
**H. Governance** — access reviews; privileged controls; step-up; JML; retention; erase/anonymize.

## 26.4 Remediation plan

**22** short Cursor implementation prompts in `docs/audits/data/users-roles-remediation-prompt-plan-2026-07.csv`.

Order principle: **Baseline → credentials → sessions → EffectiveAccess → roles → guards → invites → audit outbox → JML → MFA/step-up → AR → retention → security UX → API → UI → observability → VPS reconcile → pen/tenant tests.**

UI redesign is prompt **19** — after truth layers.

Approx. **8** phase groups / **22** prompts preferred over few large rewrites.

## 26.5 Attestation

| Action | Performed? |
|--------|------------|
| Production data modified | **No** |
| Sessions revoked | **No** |
| User/role/invite mutations | **No** |
| Infrastructure changed | **No** |
| UI implemented | **No** |
| Secrets/PII committed | **No** (final scan) |

## 26.6 Changes / Architektur

**Not updated** across Phases 1–8. Audit documentation and read-only scripts only.

---

## Appendix — Artifact index

| Artifact | Path |
|----------|------|
| Main report | `docs/audits/users-roles-production-readiness-2026-07.md` |
| Verdict JSON | `docs/audits/data/users-roles-production-readiness-verdict-2026-07.json` |
| Findings JSON | `docs/audits/data/iam-integrity-findings-2026-07.json` |
| Remediation plan | `docs/audits/data/users-roles-remediation-prompt-plan-2026-07.csv` |
| Code map | `docs/audits/data/users-roles-code-map-2026-07.csv` |
| Runtime snapshot | `docs/audits/data/users-roles-runtime-snapshot-2026-07.json` |
| Phase 2–7 matrices | `docs/audits/data/iam-*.csv`, `users-roles-ui-*.csv` (see completeness list) |
| Orchestrator | `scripts/audits/audit-users-roles-production-readiness.ts` |
| Effective-access helper | `scripts/audits/audit-effective-access.ts` |
| VPS integrity (SELECT-only) | `scripts/audits/iam-vps-integrity-readonly.py` |

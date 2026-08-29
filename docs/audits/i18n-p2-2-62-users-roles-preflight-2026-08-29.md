# P2.2.62 — Users & Roles Strict Read-Only Pre-Flight / Target Certification

**Date:** 2026-08-29  
**Campaign:** Rental  
**Mode:** STRICT READ-ONLY PRE-FLIGHT — implementation NOT started  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Audit branch:** `cursor/p2262-users-roles-preflight-3c10`  
**Baseline SHA:** `2bc7fe0f856f365b42f689a54457b5053a6ffe6f`

---

## PART A — P261 Freeze Verification

| Check | Result |
|-------|--------|
| PR #1406 merged | ✅ `state=MERGED`, `closed=true` |
| Merge commit | ✅ `2bc7fe0f856f365b42f689a54457b5053a6ffe6f` |
| P261 implementation HEAD | ✅ `b6905fe793af0ecdce34950a372732d2fcce494c` (squash-merge; not direct ancestor of merge commit — expected) |
| PR #1419 smoke verdict | ✅ **A — P2.2.61 SMOKE CERTIFIED — MERGE #1406** (open draft audit PR; not merged) |
| Campaign baseline branch | ✅ `p239-p238-merge-baseline-3c10` @ `2bc7fe0f` |
| P216–P261 enforce-clean | ✅ 0 findings (recomputed on baseline) |
| Data Analyse | ✅ DEFERRED — PLANNED REMOVAL; zero diff required |

### Baseline health (recomputed 2026-08-29)

| Metric | Value |
|--------|-------|
| EN keys | 9564 |
| DE keys | 9564 |
| Parity | 100% |
| Orphans | 0 |
| Global scanner | 1282 |
| Rental scanner | 185 |
| Finance/Billing scanner | 25 |
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |

---

## PART B — Baseline / Main Drift

| Ref | SHA |
|-----|-----|
| Campaign baseline | `2bc7fe0f856f365b42f689a54457b5053a6ffe6f` |
| Current `main` | `a212edec7c35e7a534e1c1ec3ae9eb0dccfadeac` |

### Baseline strategy

**DIRECT FROM P261 CAMPAIGN BASELINE**

Rationale: Active retained Users & Roles mount paths show only LOW cosmetic drift on `main` (border-radius class tweaks, two new permission-module constants). No semantic, routing, or mutation drift. `SettingsView.tsx` has large unrelated account/company refactor on `main` but the `activeTab === 'users'` mount is unchanged.

### Per-path drift (active retained surface only)

| Path | Drift |
|------|-------|
| `users-roles/UsersRolesTab.tsx` | NONE |
| `users-roles/TeamTab.tsx` | LOW (rounded-2xl → rounded-lg) |
| `users-roles/RolesAccessTab.tsx` | LOW (rounded-2xl → rounded-lg) |
| `users-roles/SecurityAuditTab.tsx` | LOW (rounded-2xl → rounded-lg) |
| `users-roles/CreateUserWizard.tsx` | LOW (shadow class removal) |
| `users-roles/constants.ts` | LOW (+2 permission modules: communication, voice-assistant) |
| `users-roles/TeamMemberDrawer.tsx` | NONE |
| `users-roles/PermissionEditor.tsx` | NONE |
| `users-roles/IamBadges.tsx` | NONE |
| `users-roles/useIamTeam.ts` | NONE |
| `users-roles/iam-team.utils.ts` | NONE |
| `users-roles/utils.ts` | NONE |
| `UsersRolesTab.tsx` (re-export) | NONE |
| `SettingsView.tsx` (users mount) | LOW (parent shell refactor; users panel wiring identical) |

### Legacy / dead paths (changed on main but NOT mounted — excluded from P262)

`UsersTab.tsx`, `InvitesTab.tsx`, `RolesTab.tsx`, `AccessScopesTab.tsx`, `SecurityActivityTab.tsx`, `UserDetailDrawer.tsx` — MEDIUM file drift, **no production mount**.

### Active collision (open PRs)

No open PR touches `frontend/src/rental/components/users-roles/**`. DIMO P1.3 PRs (#1420, #1418, etc.) are backend-only + master docs. **NO-GO collision: none.**

---

## PART C — Mount Topology

### Route / navigation ownership

| Layer | Detail |
|-------|--------|
| Shell | Rental SPA (`frontend/src/rental/App.tsx`) |
| View state | `currentView === 'settings'` + `settingsTab === 'users'` |
| Parent | `SettingsView` → `AdministrationTabPanel tab="users"` |
| Surface | `UsersRolesTab` → internal IAM tabs |
| Nav entry | `Sidebar.tsx`: Administration → Users & Roles (`nav.usersRoles`) |
| Tab bar | `AdministrationTabBar.tsx`: `adminTab.users` |
| Ownership | **Rental settings / administration-owned** (organization-scoped, not Master Admin) |

No URL segment routing; view-state only. Master Admin has separate `SecurityAccessHub` surfaces — **out of P262 rental scope**.

### Component classification

| Component | Classification |
|-----------|----------------|
| `users-roles/UsersRolesTab.tsx` | ACTIVE MOUNTED |
| `users-roles/TeamTab.tsx` | ACTIVE MOUNTED |
| `users-roles/RolesAccessTab.tsx` | ACTIVE MOUNTED |
| `users-roles/SecurityAuditTab.tsx` | ACTIVE MOUNTED |
| `users-roles/TeamMemberDrawer.tsx` | ACTIVE MOUNTED |
| `users-roles/CreateUserWizard.tsx` | ACTIVE MOUNTED |
| `users-roles/PermissionEditor.tsx` | ACTIVE SHARED (read-only in drawer/roles; editable only in legacy) |
| `users-roles/IamBadges.tsx` | ACTIVE SHARED |
| `users-roles/useIamTeam.ts` | ACTIVE SHARED |
| `users-roles/iam-team.utils.ts` | ACTIVE SHARED |
| `users-roles/constants.ts` | ACTIVE SHARED (host taxonomy) |
| `users-roles/utils.ts` | ACTIVE SHARED (legacy helpers + host copy) |
| `UsersRolesTab.tsx` | ACTIVE MOUNTED (re-export) |
| `SettingsView.tsx` | ACTIVE SHARED (parent mount) |
| `users-roles/UsersTab.tsx` | LEGACY DEAD |
| `users-roles/InvitesTab.tsx` | LEGACY DEAD |
| `users-roles/RolesTab.tsx` | LEGACY DEAD |
| `users-roles/AccessScopesTab.tsx` | LEGACY DEAD |
| `users-roles/SecurityActivityTab.tsx` | LEGACY DEAD |
| `users-roles/UserDetailDrawer.tsx` | LEGACY DEAD |
| `users-roles/useAccessControlCenter.ts` | LEGACY DEAD |
| `users-roles/badges.tsx` | LEGACY DEAD |

### Surface map (active mount)

| Block | Location | Content type |
|-------|----------|--------------|
| A — header | `UsersRolesTab` | presentation (`iam.title`) |
| B — member list | `TeamTab` DataTable + mobile cards | presentation + raw user data |
| C — search | `TeamTab` search input | presentation + machine query |
| D — role badge | `TeamTab` `effectiveRoleLabel` | raw backend/custom role name |
| E — status badge | `IamBadges` MFA/Risk | machine-derived tone + presentation |
| F — invite user | `TeamTab` → `CreateUserWizard` | mutation |
| G — edit user | **not mounted** (legacy `UserDetailDrawer`) | — |
| H — assign/change role | invite-time only (`organizationRoleId`) | mutation at invite |
| I — activate/deactivate | `TeamMemberDrawer` suspend | mutation |
| J — remove/delete | **not in active drawer** | — |
| K — resend invitation | `TeamTab` invite list | mutation |
| L — permission matrix | `RolesAccessTab`, `CollapsiblePermissions` | presentation (read-only) |
| M — role editor | **not mounted** (legacy `RolesTab`) | — |
| N — detail drawer | `TeamMemberDrawer` | presentation + mutations |
| O — empty/loading/error | all tabs | presentation |
| P — confirmation | drawer reason field (inline, not modal) | presentation |
| Q — security audit | `SecurityAuditTab` | presentation |

---

## PART D — Scanner / Hidden Debt

### Scanner census (recomputed on baseline)

| Bucket | Count |
|--------|-------|
| Visible scanner — active mounted | **25** |
| Visible scanner — legacy/dead in subtree | **42** |
| Total users-roles subtree (scanner) | **67** |
| **Total actionable active debt** | **~120–130** (25 visible + ~95–105 hidden host) |

### Active mounted scanner by file

| File | Findings |
|------|----------|
| `CreateUserWizard.tsx` | 16 |
| `TeamMemberDrawer.tsx` | 3 |
| `PermissionEditor.tsx` | 2 |
| `RolesAccessTab.tsx` | 2 |
| `UsersRolesTab.tsx` | 1 |
| `SecurityAuditTab.tsx` | 1 |
| `TeamTab.tsx` | 0 (scanner) — **1 hardcoded gap:** `"sessions"` |

### Hidden host copy (not fully scanner-visible)

| Source | Est. strings | Notes |
|--------|-------------|-------|
| `constants.ts` `PERMISSION_MODULES` | 35 labels + 17 groups | Dominant hidden debt |
| `constants.ts` `AUDIT_ACTION_LABELS` | 17 | Used in drawer timeline |
| `constants.ts` `MEMBERSHIP_ROLE_LABELS` | 4 | Built-in only |
| `utils.ts` permission/invite helpers | ~15 | Template strings with `{mod.label}` |
| `CreateUserWizard.tsx` | ~42 | German wizard copy |
| `TeamMemberDrawer.tsx` | ~17 | English host gaps |
| `PermissionEditor.tsx` | ~8 | Collapsible header, preview templates |
| `useIamTeam.ts` | 5 | Error fallback strings |

Unique host presentation strings across active files: **~147** (many collapsible via adapter).

---

## PART E — Roles / Status / Permissions

### Built-in role machines (Prisma `MembershipRole`)

| Machine | Display source | API use |
|---------|---------------|---------|
| `ORG_ADMIN` | `MEMBERSHIP_ROLE_LABELS` / backend `effectiveRoleLabel` | `membershipRole`, invite payload |
| `SUB_ADMIN` | same | same |
| `WORKER` | same | same |
| `DRIVER` | same | same |

### Custom roles

Organization roles via `api.organizationRoles.*`. `role.name` / `role.description` are **backend/custom — raw, never translate**. `isSystemTemplate` marks built-in templates; name still displayed raw.

System template keys (backend): `org_admin`, `sub_admin`, `disposition`, `accounting`, etc.

### User status machines (`MembershipStatus`)

`INVITED`, `ACTIVE`, `SUSPENDED`, `OFFBOARDING`, `REMOVED`, `REACTIVATION_REQUIRED`

### Invitation status machines (`OrganizationInviteStatus`)

`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`

### Permission authority

`RentalContext.hasPermission(module, level)` — canonical frontend gate.  
Module key for this surface: **`users-roles`** with levels `read | write | manage`.

### Permission IDs (module keys in `PERMISSION_MODULES`)

35 modules including `users-roles`, `dashboard`, `bookings`, `fleet`, `billing`, `data-analyse` (deferred), etc. Levels: `read`, `write`, `manage` (machine booleans).

### Role hierarchy

`ORG_ADMIN` bypasses all permission checks in `hasPermission`. No sort-by-translated-label in active mount. Role list ordered by API.

### Self / last-admin guards

Backend-enforced via `availableActions.*.enabled` / `blockedReason` on `IamTeamMemberDetailDto`. Drawer disables actions when `!enabled`. `isLastOrgAdminError()` in `utils.ts` detects backend message pattern.

---

## PART F — Raw Ownership

| Field | Source | Logic? | Display? | Localize? |
|-------|--------|--------|----------|-----------|
| firstName, lastName | user input / backend | no | yes | **NO — raw** |
| displayName | backend computed | no | yes | **NO — raw** |
| email | user/backend | no | yes | **NO — raw** |
| phone, department, position | user input | no | yes (wizard) | **NO — raw** |
| organizationRoleId | machine UUID | yes | no | **NO** |
| role.name (custom) | backend | no | yes | **NO — raw** |
| effectiveRoleLabel | backend | no | yes | built-in map only; custom raw |
| stationScopeSummary | backend | no | yes | **NO — raw** |
| station names | backend | no | yes | **NO — raw** |
| audit description | backend | no | yes | **NO — raw** (action label may localize) |
| reasonCodes | backend machine | yes | yes | taxonomy only |

### Identity fields (never translate)

`userId`, `membershipId`, `organizationId`, `inviteId`, `roleId`, permission module keys.

---

## PART G — Mutations

| Action | Hook/UI | Endpoint | Method | Payload machines |
|--------|---------|----------|--------|------------------|
| Invite user | `CreateUserWizard` | `POST /organizations/:orgId/invites` | POST | `email`, `organizationRoleId`, `membershipRole`, `permissions`, `stationIds` |
| Create user (password) | `CreateUserWizard` | `POST /organizations/:orgId/users` | POST | same + `password`, `role` |
| Resend invite | `TeamTab` | `POST .../invites/:id/resend` | POST | `inviteId` |
| Send reset link | `TeamMemberDrawer` | `POST .../iam/team/members/:id/send-reset-link` | POST | `membershipId` |
| Revoke sessions | `TeamMemberDrawer` | `POST .../users/:userId/sessions/revoke-all` | POST | `userId`, `idempotencyKey` |
| Suspend | `TeamMemberDrawer` | `PATCH .../users/:userId` | PATCH | `status: 'SUSPENDED'` |
| Revoke invite | legacy `InvitesTab` | `DELETE .../invites/:id` | DELETE | not in active mount |
| Role change | legacy | `POST .../assign-role` | POST | not in active mount |
| Remove user | legacy | `DELETE .../users/:id` | DELETE | not in active mount |
| Custom role CRUD | legacy `RolesTab` | `api.organizationRoles.*` | various | not in active mount |

Permission gate: invite/resend require `users-roles.write`; suspend/reset/revoke use backend `availableActions` eligibility.

---

## PART H — Same-Mount Contract

### State to preserve

`activeTab` (team/roles/security), `search`, `wizardOpen`, `drawerMembershipId`, `drawerTab`, `selectedRoleId` (roles tab), `actionReason`, form fields in wizard, raw email/name in list.

### Locale side-effect risk

| Risk | Assessment |
|------|------------|
| `key={locale}` | **None found** in users-roles subtree |
| Business refetch on locale | **Low** — `useIamTeam` loads on `orgId` only, not locale |
| `utils.ts` `formatDateTime` | **BUG RISK** — hardcoded `de-DE` in legacy `utils.ts`; active path uses `iam-team.utils.formatDateTime(locale)` ✅ |
| Permission checks | Machine-only ✅ |

### Same-mount test plan

1. Mount `UsersRolesTab` with mocked `api.iam.*`
2. Set search, open drawer, partial wizard form, select roles tab + role
3. DE → EN → DE via `setLocale`
4. Assert: search value, drawer open, membershipId, form state, no extra API mutation calls

---

## PART I — Key / Reuse / Split

### Existing keys

48 `iam.*` keys in EN/DE (tabs, KPIs, columns, MFA, risk, drawer, security).

### Canonical reuse opportunities

| Proposed | Classification |
|----------|----------------|
| `common.cancel`, `common.save`, `common.loading` | EXACT REUSE |
| `settings.inviteUser` | SAFE SHARED (nav context) |
| `nav.usersRoles`, `adminTab.users` | EXACT REUSE (already exist) |
| `tasks.*` | WRONG CROSS-DOMAIN |
| `team.*` | NEW REQUIRED (if not using `iam.*`) |

### Adapter strategy

**Required:** `frontend/src/rental/lib/rental-organization-users-roles-i18n.ts` (or equivalent)

Allowed mappings:
- Built-in `MembershipRole` labels
- `OrganizationInviteStatus` labels
- `PermissionLevel` labels
- `PERMISSION_MODULES` label/group keys (`iam.permission.module.{key}`, `iam.permission.group.{group}`)
- `AUDIT_ACTION_LABELS` → `iam.audit.{action}`
- Date wrappers delegating to `Intl` + active locale

Forbidden in adapter: permission checks, hierarchy, payloads, sorting/filtering.

### Projected new keys

| Scope | Estimate |
|-------|----------|
| P262a — Member management slice | **55–70** |
| P262b — Roles/permission taxonomy slice | **45–55** |
| Full one-shot complete | **95–110** (exceeds 71–100 reassess gate) |

### Split options evaluated

| Option | Verdict |
|--------|---------|
| A — Complete one slice | Key budget too high; permission taxonomy dominates |
| B — Member management first | **SELECTED** |
| C — Invitations separate | Rejected — invites embedded in Team tab |
| D — Role assignment separate | N/A — no active post-invite role change UI |
| E — Permission matrix separate | **P263 candidate** |
| F — Read-only first | Partially satisfied — roles/security already mostly read-only |

### Split decision

**SPLIT — USERS / MEMBER MANAGEMENT FIRST**

P262 target: `UsersRolesTab` shell gaps, `TeamTab`, `CreateUserWizard`, `TeamMemberDrawer`, shared badges/utils error strings.  
Defer to P263: `RolesAccessTab` deep copy, `PermissionEditor` + `constants.ts` taxonomy, `SecurityAuditTab` residual English.

---

## PART J — Governance / Tests

### Enforce-clean boundary (P262a)

```
frontend/src/rental/components/users-roles/UsersRolesTab.tsx
frontend/src/rental/components/users-roles/TeamTab.tsx
frontend/src/rental/components/users-roles/TeamMemberDrawer.tsx
frontend/src/rental/components/users-roles/CreateUserWizard.tsx
frontend/src/rental/components/users-roles/IamBadges.tsx
frontend/src/rental/components/users-roles/iam-team.utils.ts
frontend/src/rental/components/users-roles/useIamTeam.ts
frontend/src/rental/components/UsersRolesTab.tsx
```

Explicitly **excluded**: legacy dead tabs, `constants.ts` permission taxonomy (P263), `PermissionEditor.tsx` (P263), `RolesAccessTab.tsx` (P263), `SecurityAuditTab.tsx` (P263 unless trivial gaps bundled).

### Category E feasibility

**FEASIBLE** for P262a member-management slice with adapter for built-in statuses only. Permission-module taxonomy deferred to P263 to avoid semantic risk in CollapsiblePermissions.

### Test plans

- **Presentation:** DE/EN for wizard, drawer, KPIs; raw `Provider User Name X7` unchanged; unknown MFA/risk keys fallback
- **Same-mount:** mandatory DE→EN→DE per Part H
- **Mutations:** invite payload tests (role ID not label), resend, suspend, reset, revoke — mock `api.*`
- **Permissions:** locale switch does not alter `canWrite` button visibility
- **P261 regression:** Vehicle Damages enforce-clean remains 0
- **P260–P216:** all enforce-clean scopes remain 0
- **Data Analyse:** zero diff

---

## PART K — Campaign Progress (post-P261 recomputed)

| Metric | Value | Denominator / notes |
|--------|-------|---------------------|
| A. Retained-product active mounted coverage | **~46 slices certified / ~52 estimated** ≈ **88%** | Excludes Data Analyse, Master, Operator sub-campaigns |
| B. Literal mounted coverage (incl. deferred Data Analyse) | **~46 / ~53** ≈ **87%** | Data Analyse still mounted but deferred |
| C. Actionable presentation debt cleared (Rental) | **~1097 of ~1282 global; ~0 of 25 active users-roles** | Global includes Master 1049 |
| D. Rental scanner remaining | **185** | `other Rental areas` 159 + Finance/Billing 25 + shell 1 |

Users & Roles active actionable debt: **~120** (25 visible + ~95 hidden). Legacy dead in subtree: **42** (do not localize).

---

## PART L — Next Target Ranking

| Rank | Target | Scanner active | Hidden est. | Visibility | Mutation risk | Keys est. |
|------|--------|---------------|-------------|------------|---------------|-----------|
| 1 | **Users & Roles (member mgmt)** | 25 | ~95 | High | Medium | 55–70 |
| 2 | Users & Roles (permission taxonomy) | 3 | ~80 | Medium | Low | 45–55 |
| 3 | Data Analyse | — | — | — | — | **DEFERRED** |
| 4 | Finance/Billing residual | 25 | ~10 | High | Low | 30–40 |
| 5 | Rental shell / misc | 1+ | — | Medium | Low | 10–20 |

**Users & Roles is the correct P262 campaign target** (highest customer-visible administration debt after P261).

### Likely P263

**P2.2.63 — Users & Roles: Roles & Permission Taxonomy** (`RolesAccessTab`, `PermissionEditor`, `constants.ts`, `SecurityAuditTab` residuals)

---

## Machine Freeze Matrix (summary)

| Domain | Machine values | May localize display? | Payload/tone |
|--------|---------------|----------------------|--------------|
| MembershipRole | ORG_ADMIN, SUB_ADMIN, WORKER, DRIVER | Built-in labels only | Payload exact |
| MembershipStatus | INVITED…REACTIVATION_REQUIRED | Built-in labels only | Payload exact |
| InviteStatus | PENDING, ACCEPTED, EXPIRED, REVOKED | Built-in labels only | — |
| Permission module | 35 string keys | Label via adapter | Key exact |
| Permission level | none/read/write/manage | Label only | Boolean exact |
| MFA state | ENABLED…NOT_SUPPORTED | `iam.mfa.*` | Tone from machine |
| Risk | LOW…CRITICAL | `iam.risk.*` | Tone from machine |

---

## Final Verdict

**B — GO, BUT SPLIT — P2.2.62 TARGET SELECTED**

```
P2.2.62: Users & Roles — Member Management (Team tab, invite wizard, member drawer)

SPLIT: USERS / MEMBER MANAGEMENT FIRST (permission taxonomy → P263)

BASELINE: 2bc7fe0f856f365b42f689a54457b5053a6ffe6f

P216–P261: FROZEN

DATA ANALYSE: DEFERRED — PLANNED REMOVAL

PROJECTED NEW KEYS: 55–70 (P262a); 95–110 if unsplit

IMPLEMENTATION NOT STARTED.
```

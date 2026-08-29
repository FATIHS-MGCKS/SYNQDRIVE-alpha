# P2.2.63 — Permission Management / Role Taxonomy — Strict Read-Only Pre-Flight

**Date:** 2026-08-30  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Campaign:** RENTAL  
**Authoritative campaign baseline:** `4b89ad8015fdb4183b8d130eea02cb4fb8f07a58` (merged PR #1422 — P2.2.62)  
**P262 implementation HEAD:** `abb018f6d91e8e205e8203b10110b2a9ba5fffc8`  
**P262 final audit:** PR #1425 — **A — P2.2.62 CERTIFIED — READY TO MERGE**  
**Current `origin/main`:** `87bbaf8bfb035ffef94e1019d3aa5a32e3b75efa` (DIMO P1.3 line — **does not contain P262**)

---

## PART A — P262 Freeze

| Check | Result |
|-------|--------|
| PR #1422 merged | ✅ `state=MERGED`, `closed=true`, `mergedAt=2026-08-29T22:17:39Z` |
| Merge commit SHA | ✅ `4b89ad8015fdb4183b8d130eea02cb4fb8f07a58` |
| Implementation HEAD | ✅ `abb018f6d91e8e205e8203b10110b2a9ba5fffc8` (squashed into merge; tree-identical) |
| PR #1425 verdict | ✅ **A — P2.2.62 CERTIFIED — READY TO MERGE** |
| P216–P262 | **FROZEN** — do not reopen |
| Data Analyse | **DEFERRED — PLANNED REMOVAL** — zero touch |
| P262 keys | 90 (`rental.iamMember.{en,de}.ts`) |
| P262 enforce-clean | 11 exact paths / **0 findings** |
| Active mounted Member Management debt | **0** |

### P262 enforce-clean boundary (frozen)

```
rental/components/users-roles/UsersRolesTab.tsx
rental/components/users-roles/TeamTab.tsx
rental/components/users-roles/TeamMemberDrawer.tsx
rental/components/users-roles/CreateUserWizard.tsx
rental/components/users-roles/PermissionEditor.tsx
rental/components/users-roles/IamBadges.tsx
rental/components/users-roles/iam-team.utils.ts
rental/components/users-roles/iam-member-payload.ts
rental/components/users-roles/useIamTeam.ts
rental/components/UsersRolesTab.tsx
rental/lib/rental-organization-users-roles-i18n.ts
```

---

## PART B — Baseline / Drift

### Baseline health @ `4b89ad8` (recomputed)

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| EN keys | ~9654 | **9654** | ✅ |
| DE keys | ~9654 | **9654** | ✅ |
| Parity | 100% | **100%** | ✅ |
| Orphans | 0 | **0** | ✅ |
| Global scanner | ~1263 | **1263** | ✅ |
| Rental scanner | ~166 | **166** | ✅ |
| Finance/Billing scanner | ~25 | **25** | ✅ |
| `npm run i18n:check` | PASS | **PASS** | ✅ |
| `npm run check:surface` | PASS | **PASS** | ✅ |
| P262 enforce-clean | 0 | **0** | ✅ |

**No baseline regression. Pre-flight may proceed.**

### Current main drift

`origin/main` (`87bbaf8`) is **not** an ancestor of P262 merge. P262 landed on `origin/p239-p238-merge-baseline-3c10` only. All users-roles / IAM adapter drift vs main reflects the **entire P262 slice missing from main**, not post-P262 permission edits.

| Path | Drift vs main | Classification | Notes |
|------|---------------|----------------|-------|
| `RolesAccessTab.tsx` | Present (P262 line) | **DIRECT** | Entire IAM shell absent on main |
| `SecurityAuditTab.tsx` | Present | **DIRECT** | Same |
| `PermissionEditor.tsx` | +149 diff lines | **DIRECT** | P262 localized child |
| `rental-organization-users-roles-i18n.ts` | +234 diff lines | **DIRECT** | P262 adapter |
| `UsersRolesTab.tsx` | +30 diff lines | **DIRECT** | 3-tab IAM shell |
| `constants.ts` | +29 diff lines | **MEDIUM** | Taxonomy data; labels bypassed in mounted path |
| `TeamTab.tsx`, `CreateUserWizard.tsx`, etc. | Large diffs | **DIRECT** | P262 freeze — not P263 scope |
| DIMO / Trip Route paths | Unrelated | **NONE** | Ignore per instructions |

### Baseline strategy

**DIRECT FROM P262 CAMPAIGN BASELINE** (`4b89ad8015fdb4183b8d130eea02cb4fb8f07a58`)

Rationale: Role/permission mounted paths are unchanged on main (main lacks P262 entirely). Campaign baseline is authoritative post-P262 certified state. Do **not** branch P263 from `origin/main`.

---

## PART C — Mount Topology

Production mount (repository truth):

```
SettingsView
└── UsersRolesTab (orgId)
    ├── Tab: team → TeamTab                    [P262 FROZEN]
    ├── Tab: roles → RolesAccessTab            [P263 ACTIVE — read-only]
    └── Tab: security → SecurityAuditTab       [P263 ACTIVE]
```

`RolesAccessTab` detail panel:

```
role list (api.iam.rolesList)
  → select role → api.iam.roleDetail(orgId, roleId)
    → raw name / description
    → version, assignments, impact preview (partially localized)
    → CollapsiblePermissions (disabled, P262-localized matrix child)
```

`SecurityAuditTab`:

```
api.iam.securityOverview(orgId) via useIamTeam.loadSecurity
  → MFA summary (IamBadges — P262 localized)
  → privileged members list (raw names/emails)
  → iamAudit feed (raw row.description — NOT wired to resolveAuditActionLabel)
```

**Not mounted in production IAM shell:**

- `RolesTab.tsx` (full custom-role CRUD + interactive PermissionEditor)
- `UsersTab.tsx`, `InvitesTab.tsx`, `AccessScopesTab.tsx`, `SecurityActivityTab.tsx`
- `UserDetailDrawer.tsx`, `useAccessControlCenter.ts`, `badges.tsx` (legacy)

---

## PART D — P262 Overlap Map

| Component / concern | P262 status | P263 status |
|---------------------|-------------|-------------|
| `UsersRolesTab` shell + tabs | **P262 OWNED — FROZEN** | Touch only if extending tab keys |
| `TeamTab`, `CreateUserWizard`, `TeamMemberDrawer` | **P262 OWNED — FROZEN** | Must not regress |
| `PermissionEditor` / `PermissionPreview` / `CollapsiblePermissions` | **P262 OWNED — FROZEN** | Shared — must not regress; matrix labels via adapter |
| `resolvePermissionModuleLabel/Group/Level` | **P262 OWNED** | Extend adapter only for gaps |
| `resolveAuditActionLabel` | **P262 OWNED** | **P263 REMAINING:** wire in `SecurityAuditTab` |
| `iam.audit.*` (18 actions) | **P262 OWNED** | Reuse exact keys |
| `iam.permission.level.*` | **P262 OWNED** | Reuse exact |
| `iam.permission.module.*` (10 specific) | **P262 OWNED** | +1 gap: `legal-documents-audit` |
| `nav.*` module mapping (22 modules) | **P262 OWNED** | Reuse — do not duplicate |
| `RolesAccessTab` host copy | Not in P262 scope | **P263 REMAINING** |
| `SecurityAuditTab` empty + audit feed | Not in P262 scope | **P263 REMAINING** |
| `constants.ts` German labels | Bypassed at render | Dead-data for mounted path; do not translate file in place |
| `RolesTab` CRUD | Never mounted | Out of P263 Phase 1 |

---

## PART E — Scanner / Hidden Debt

### Scanner census (`users-roles/`)

| Bucket | Count |
|--------|------:|
| Total folder findings | 48 |
| Legacy/dead (unmounted) | 45 |
| **Mounted active P263** | **3** |
| P262 enforce-clean overlap | 0 (clean) |

**Mounted scanner debt (actionable P263):**

| File | Line | Sample |
|------|------|--------|
| `RolesAccessTab.tsx` | 39 | `No roles` |
| `RolesAccessTab.tsx` | 66 | `Select a role` |
| `SecurityAuditTab.tsx` | 30 | `No security data` |

**Hidden host debt (not in scanner):**

| Location | String | Class |
|----------|--------|-------|
| `RolesAccessTab.tsx:56` | `pinned` | Host meta label |
| `RolesAccessTab.tsx:57` | `follows latest` | Host meta label |
| `RolesAccessTab.tsx:88` | `Scope:` prefix | Host label; value raw |
| `SecurityAuditTab.tsx:81` | `row.description` only | Should use `resolveAuditActionLabel(row.auditAction)` → raw fallback |
| `constants.ts` | `MEMBERSHIP_ROLE_LABELS`, `AUDIT_ACTION_LABELS` | Legacy DE maps — superseded by adapter where wired |
| `utils.ts` | `de-DE` hardcoded dates, German fallbacks | **LEGACY DEAD** in mounted IAM path (`iam-team.utils` used instead) |

**Total actionable P263 debt (mounted active):** **~8 presentation items** (~3 scanner + ~5 hidden)

---

## PART F — Role Machines

| Machine | Values | Display keys exist? | Customizable? |
|---------|--------|-------------------|---------------|
| Built-in membership role | `ORG_ADMIN`, `SUB_ADMIN`, `WORKER`, `DRIVER` | **No** `iam.role.membership.*` yet; legacy `MEMBERSHIP_ROLE_LABELS` DE-only in constants | Machine frozen; labels host-owned |
| IAM role template | `isSystemTemplate`, `isDefault`, `pinned`, `followsLatest` | Partial — meta strings hardcoded EN | Flags machine; only host labels localize |
| Role identity | `id`, `organizationId`, `membershipRole` | N/A | Never translate as IDs |
| Risk classification | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` | ✅ `iam.risk.*` (P262) | Machine |
| Custom role name/description | User-provided | **RAW** | Never translate |

### Built-in role protection (dead `RolesTab` reference — not mounted)

- `isSystemTemplate` → cannot edit name/description/permissions; cannot delete
- Delete guard: `if (role.isSystemTemplate) return`
- `permissionsFromRoleTemplate`: ORG_ADMIN → all modules manage

### Role hierarchy

- No explicit rank sort in mounted `RolesAccessTab`; list order from API
- **Must not** sort/filter by translated labels

### Custom role ownership

| Field | Ownership |
|-------|-----------|
| `name` | **RAW** (fixture: `Provider Custom Role X7`) |
| `description` | **RAW** |
| `notes` | **RAW** if exposed |

---

## PART G — Permission Taxonomy

### Permission modules (34 keys in `PERMISSION_MODULES`)

| Module key | Label source (mounted) | Class |
|------------|------------------------|-------|
| 22 modules | `nav.*` via `PERMISSION_MODULE_NAV_KEYS` | **EXACT EXISTING REUSE** |
| 10 modules | `iam.permission.module.*` | **P262 OWNED** |
| `legal-documents-audit` | constants DE only | **NEW P263 REQUIRED** (~1 key) |

### Permission groups (17 stable host groups)

German string keys in `PERMISSION_GROUP_LABEL_KEYS` → `nav.*` / `nav.finance` / `nav.insights` / `nav.administration`. **EXACT EXISTING REUSE** — no new group keys if adapter used.

### Permission levels

| Machine | Key | Status |
|---------|-----|--------|
| `none` | `iam.permission.level.none` | P262 |
| `read` | `iam.permission.level.read` | P262 |
| `write` | `iam.permission.level.write` | P262 |
| `manage` | `iam.permission.level.manage` | P262 |

### Permission IDs

Module keys (`dashboard`, `bookings`, …) are **machine IDs** — never localize. Payload uses `{ read, write, manage }` booleans per module key.

---

## PART H — Custom Role CRUD

**Status: NOT MOUNTED** in production IAM shell.

Reference implementation in dead `RolesTab.tsx`:

| Action | Endpoint | Method | Payload |
|--------|----------|--------|---------|
| Create | `/organizations/:orgId/roles` | POST | `{ name, description?, membershipRole, permissions?, stationScopeDefault?, defaultStationIds?, fieldAgentAccessDefault? }` |
| Update | `/organizations/:orgId/roles/:roleId` | PATCH | Same fields partial |
| Duplicate | `/organizations/:orgId/roles/:roleId/duplicate` | POST | `{}` |
| Delete | `/organizations/:orgId/roles/:roleId` | DELETE | — |

Guards: system template non-deletable; name required; `hasPermission('users-roles', 'manage')`.

**P263 Phase 1:** read-only `RolesAccessTab` only — **no CRUD mutations**.

Re-exposing CRUD requires product decision to wire dead `RolesTab` or new IAM mutations → **split to P264+**.

---

## PART I — Security Audit

### Mounted surface (`SecurityAuditTab`)

| Area | Localized? | Notes |
|------|------------|-------|
| KPI cards | ✅ P262 keys | `iam.security.*`, `iam.kpi.*` |
| MFA summary badges | ✅ `IamBadges` | Machine `IamMfaState` |
| Privileged members | Raw names/emails | **RAW** |
| Audit feed titles | ❌ `row.description` only | Wire `resolveAuditActionLabel` |
| Audit dates | ✅ `formatDateTime(value, locale)` | |

### Audit action machines (18 known — P262 keys)

`USER_CREATED` … `ROLE_ASSIGNED` — all have `iam.audit.*` keys. Unknown actions → raw `description` fallback (same pattern as `TeamMemberDrawer`).

### Audit raw ownership (preserve)

| Field | Localize? |
|-------|-----------|
| `actor` name/email | **RAW** |
| `target` name | **RAW** |
| `description` (unknown action) | **RAW** |
| `ip`, `userAgent`, `requestId`, metadata | **RAW** |
| `auditAction` machine | Label via resolver only |

### Filters / sort / pagination

Mounted tab has **no** audit filters or pagination — read-only list `max-h-[360px]`. No machine filter values to protect in Phase 1.

---

## PART J — Same-Mount / Refetch

### Same-mount state inventory

| State | Owner | Locale-sensitive? |
|-------|-------|-------------------|
| `activeTab` | `UsersRolesTab` | No |
| `selectedId` / role detail | `RolesAccessTab` | No |
| `CollapsiblePermissions` open | `PermissionEditor` child | No |
| `security` overview | `useIamTeam` | No |
| Team search / member drawer | P262 frozen | No |

### Locale refetch gate (P262 architecture)

`useIamTeam.loadTeam` / `loadSecurity` deps: **`[orgId]` only** — ✅ no `t` in fetch identity.

`RolesAccessTab` role detail effect: **`[orgId, selectedId]`** — ✅ safe.

**P263 risk:** Low for Phase 1 (presentation-only). Flag if `t` added to any new fetch effect.

### Locale mutation counters (required zero on DE→EN→DE)

`createRole=0`, `editRole=0`, `deleteRole=0`, `updatePermissions=0`, `assignRole=0`, `security mutation=0`, `business refetch=0`

### React identity

No `key={locale}`, `key={t(...)}`, or translated permission/role keys. Use stable `role.id`, `mod.key`, `row.id`.

---

## PART K — Key / Reuse / Split

### Canonical reuse audit (high-signal)

| Prefix | Reuse in P263 |
|--------|---------------|
| `iam.roles.*` | Partial — `impact`, `assignments`, `version` exist; add empty/select/meta/scope |
| `iam.security.*` | Add empty state; rest exists |
| `iam.audit.*` | **EXACT REUSE** for known actions |
| `iam.permission.*` | **EXACT REUSE** levels + 10 modules; +1 gap |
| `iam.risk.*`, `iam.mfa.*` | **EXACT REUSE** |
| `nav.*` | **EXACT REUSE** for modules/groups |
| `common.*` | Retry/loading if needed |

### Projected new keys

| Scope | Estimate |
|-------|----------|
| **Phase 1 — mounted active only** | **15–28** (ideal ≤50) |
| Phase 2 — dead CRUD re-wire (`RolesTab`) | +55–75 |
| Full taxonomy + CRUD + audit filters | 81–110 → **must split** |

### Split options evaluated

| Option | Verdict |
|--------|---------|
| A — Complete permission mgmt + security audit | Too large while CRUD unmounted |
| **B — Roles + permission matrix first** | ✅ **Recommended Phase 1** |
| C — Custom role CRUD first | Blocked — not mounted; needs wiring |
| D — Security audit separate | Too small alone; combine with RolesAccessTab |
| E — Permission taxonomy first | Mostly done in P262 adapter |
| F — Role management first | Same as B for read surface |
| G — Architectural prerequisite | Only if product mandates CRUD re-exposure first |

### Split decision

**SPLIT — ROLE MANAGEMENT + PERMISSION MATRIX FIRST**

Phase 1 (P263): Mounted `RolesAccessTab` + `SecurityAuditTab` presentation + adapter gaps.  
Phase 2 (P264+): Custom role CRUD re-exposure (dead `RolesTab` reference; product wiring required).

### Adapter strategy

**Extend** `rental-organization-users-roles-i18n.ts` (do not alter P262 semantics).

Optional alias file `rental-permission-management-i18n.ts` only if boundary clarity needed — prefer single adapter to maximize reuse.

Add: `resolveMembershipRoleLabel`, wire audit in tab, any missing module key.

**Forbidden in adapter:** permission evaluation, payloads, hierarchy, guards.

---

## PART L — Governance / Tests

### P263 enforce-clean boundary (proposed)

```
rental/components/users-roles/RolesAccessTab.tsx
rental/components/users-roles/SecurityAuditTab.tsx
```

Shared files (`PermissionEditor`, adapter) remain P262 enforce-clean — **no new scanner debt** in P262 paths.

### Category E feasibility

✅ **Feasible for Phase 1** — presentation-only; no permission ID / payload / evaluation changes.

⚠️ **Not feasible** for full CRUD in one slice without product wiring.

### Test plan — presentation

- DE/EN `RolesAccessTab` empty, select prompt, pinned/follows meta, scope label
- DE/EN `SecurityAuditTab` empty; known audit action localized; unknown raw preserved
- Custom role name/description raw in detail panel
- Permission matrix labels via existing P262 adapter (regression)

### Test plan — same-mount

Extend `rental-member-management-localization.test.tsx`:

1. `UsersRolesTab` persistent root
2. Switch to `roles` tab → select role → expand permissions
3. Switch to `security` tab
4. DE → EN → DE: selected tab/role/expand state preserved; API refetch counters = 0

### Test plan — mutations

Phase 1: **none** (read-only mounted surface).  
Phase 2: create/edit/delete role API parity tests when CRUD mounted.

### Test plan — permission parity

DE/EN: same disabled matrix, same levels in `CollapsiblePermissions`, same module keys.

### Test plan — security audit

Known `auditAction` → localized; unknown → raw `description`; order unchanged; no locale refetch.

### P262 regression

Run `rental-member-management-localization.test.tsx` — zero semantic regression.

### P261–P216 freeze

All enforce-clean = 0 required; no changes in frozen paths.

### Data Analyse

Zero diff required.

### Active collision

| PR | Overlap |
|----|---------|
| #1421 (P262 preflight doc) | Docs only — LOW |
| #1425 (P262 final audit) | Docs only — LOW |
| DIMO P1.3 (#1420 on main) | **NONE** on users-roles paths |
| IAM backend PRs (#626, etc.) | Backend — **NONE** on frontend mount |

**Collision: NO-GO not triggered.**

---

## PART M — Progress / P264

### Campaign progress (post-P262, recomputed)

| Metric | Value |
|--------|------:|
| Global scanner | 1263 |
| Rental scanner | 166 |
| Finance/Billing | 25 |
| Data Analyse scanner (deferred) | 32 |
| Retained-product rental (excl. Data Analyse) | 134 |
| users-roles total | 48 (45 dead / 3 mounted actionable) |
| P262 actionable cleared | Member Management mounted = **0** remaining |
| Rental scanner remaining | **166** (expected) |

### Coverage estimate

| Lens | Notes |
|------|-------|
| Retained-product active mounted | P262 closed Team/Wizard/Drawer; P263 leaves **~8 items** on 2 tabs |
| Literal mounted incl. Data Analyse | Data Analyse 32 deferred |
| Actionable presentation debt cleared (P262) | **100%** of P262 enforce-clean scope |

### Top 5 remaining targets (post-P263 analysis)

1. **Permission Management Phase 2** — custom role CRUD re-exposure (dead `RolesTab`)
2. **Finance/Billing residual** — 25 scanner findings
3. **Help Center / Support rental** — active mounted clusters
4. **Rental shell / misc** — ~86 non-users-roles, non-Data-Analyse findings
5. **WhatsApp Business** — historical high-debt cluster (if still active)

### Likely P264 forecast

**Custom Role CRUD + interactive permission editor management** (wire `organizationRoles` API into IAM shell) **OR** next largest retained-product rental cluster (Finance/Billing) if product defers CRUD wiring.

---

## Machine Freeze Matrix (summary)

| Domain | Machine values | Payload? | Logic? | May localize display? |
|--------|----------------|----------|--------|----------------------|
| Membership role | ORG_ADMIN, SUB_ADMIN, WORKER, DRIVER | ✅ | ✅ | ✅ host labels only |
| Permission module | 34 string keys | ✅ | ✅ | ✅ via adapter |
| Permission level | none/read/write/manage | ✅ | ✅ | ✅ `iam.permission.level.*` |
| Permission group | 17 stable DE host names | ❌ | ❌ | ✅ via `nav.*` map |
| Audit action | 18 known + unknown | ❌ | ❌ | ✅ known only |
| MFA state | 6 enums | ❌ | ❌ | ✅ `iam.mfa.*` |
| Risk | 4 enums | ❌ | ❌ | ✅ `iam.risk.*` |
| Role ID / permission ID | UUID / string key | ✅ | ✅ | ❌ never |

## Raw Ownership Matrix (summary)

| Field | Source | May localize? |
|-------|--------|---------------|
| Custom role name/description | Org/user | ❌ RAW |
| User displayName/email | Backend | ❌ RAW |
| `privilegedCapabilities[]` | Backend impact | ❌ RAW |
| `stationScopeImpact` | Backend | ❌ RAW |
| Unknown audit description | Backend | ❌ RAW |
| Known audit action code | Machine | ✅ label only |

## Mutation Freeze Matrix (summary)

| Action | Mounted? | Hook/API |
|--------|----------|----------|
| List roles | ✅ | `api.iam.rolesList` |
| Role detail | ✅ | `api.iam.roleDetail` |
| Security overview | ✅ | `api.iam.securityOverview` |
| Create role | ❌ dead | `api.organizationRoles.create` |
| Update role | ❌ dead | `api.organizationRoles.update` |
| Delete role | ❌ dead | `api.organizationRoles.delete` |
| Update permissions | ❌ (disabled UI) | Would be in CRUD payload |

## State Freeze Matrix (summary)

| State | Same-mount? | Query-bearing? | Mutation-bearing? |
|-------|-------------|--------------|-------------------|
| activeTab | ✅ | No | No |
| selectedId (role) | ✅ | Yes (detail fetch) | No |
| permissions expand | ✅ | No | No |
| security data | ✅ | Yes (overview) | No |

---

## Final Verdict

**B — GO, BUT SPLIT — P2.2.63 TARGET SELECTED**

```
P2.2.63:
Mounted Roles Access + Security Audit presentation (RolesAccessTab, SecurityAuditTab, adapter audit wiring + taxonomy gaps)

SPLIT:
Phase 1 — Roles + Permission Matrix read surface (this slice)
Phase 2 — Custom role CRUD re-exposure (P264+; requires product wiring; dead RolesTab reference)

BASELINE:
4b89ad8015fdb4183b8d130eea02cb4fb8f07a58

P216–P262:
FROZEN

DATA ANALYSE:
DEFERRED — PLANNED REMOVAL

PROJECTED NEW KEYS:
15–28 (Phase 1 mounted); 75–95 if dead CRUD included (must not combine)

IMPLEMENTATION NOT STARTED.
```

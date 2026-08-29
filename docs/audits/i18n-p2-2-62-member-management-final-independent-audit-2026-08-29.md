# P2.2.62 — Users & Roles Member Management — Final Independent Audit

**Date:** 2026-08-29  
**Mode:** STRICT READ-ONLY INDEPENDENT AUDIT  
**Implementation PR:** #1422 (Draft, unmerged)  
**Preflight PR:** #1421 (not merged; not in implementation ancestry)  
**Baseline:** `2bc7fe0f856f365b42f689a54457b5053a6ffe6f`  
**Audited HEAD:** `8658e18ab085f83f5c6cef38c207777f501652ba`  
**Audit branch:** `cursor/p2262-member-management-final-audit-3c10`

---

## 1. Topology

| Check | Result |
|-------|--------|
| PR #1422 open | YES |
| Draft | YES |
| Unmerged | YES |
| Mergeable | MERGEABLE |
| Base OID | `2bc7fe0f856f365b42f689a54457b5053a6ffe6f` ✓ |
| Head OID | `8658e18ab085f83f5c6cef38c207777f501652ba` ✓ |
| Implementation commits | `bae4c93b7` (implementation), `8658e18ab` (whitespace fix) |
| #1421 audit ancestry | NO — preflight branch is not an ancestor of implementation HEAD |

---

## 2. Changed paths (18 files)

| Path | Class |
|------|-------|
| `architecture/I18N_RENTAL_IAM_MEMBER_MANAGEMENT_P2_2_62_2026-08-29.md` | H |
| `docs/audits/i18n-p2-2-62-member-management-implementation-2026-08-29.md` | H |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | F |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | F |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | F |
| `frontend/src/i18n/translations/de.ts` | B |
| `frontend/src/i18n/translations/en.ts` | B |
| `frontend/src/i18n/translations/rental.iamMember.de.ts` | B |
| `frontend/src/i18n/translations/rental.iamMember.en.ts` | B |
| `frontend/src/master/components/ArchitekturView.tsx` | H |
| `frontend/src/master/components/ChangesView.tsx` | H |
| `frontend/src/rental/components/rental-member-management-localization.test.tsx` | G |
| `frontend/src/rental/components/users-roles/CreateUserWizard.tsx` | A |
| `frontend/src/rental/components/users-roles/TeamMemberDrawer.tsx` | A |
| `frontend/src/rental/components/users-roles/TeamTab.tsx` | A |
| `frontend/src/rental/components/users-roles/UsersRolesTab.tsx` | A |
| `frontend/src/rental/components/users-roles/useIamTeam.ts` | E |
| `frontend/src/rental/lib/rental-organization-users-roles-i18n.ts` | C |

**I / J / K = 0** ✓ (no frozen-surface semantic changes, no Data Analyse, no DIMO/Trip)

---

## 3. 70-key inventory (complete)

All 70 keys are P262-owned (`iam.member.*` / `iam.wizard.*` / `iam.audit.*`). EN=DE parity verified. None are P263 leaks. All are mounted and used. No duplicates. No unused.

| # | Key | EN | DE | Callsite | Host-owned | Mounted | Reuse? |
|---|-----|----|----|----------|------------|---------|--------|
| 1 | `iam.member.noOrg` | No organization loaded. | Keine Organisation geladen. | `UsersRolesTab.tsx` | yes | yes | no |
| 2 | `iam.member.sessions` | {count} sessions | {count} Sitzungen | `TeamTab.tsx` | yes | yes | no |
| 3 | `iam.member.status.INVITED` | Invited | Eingeladen | adapter → `TeamTab.tsx` | yes | yes | no |
| 4 | `iam.member.status.ACTIVE` | Active | Aktiv | adapter | yes | yes | no |
| 5 | `iam.member.status.SUSPENDED` | Suspended | Suspendiert | adapter | yes | yes | no |
| 6 | `iam.member.status.OFFBOARDING` | Offboarding | Offboarding | adapter | yes | yes | no |
| 7 | `iam.member.status.REMOVED` | Removed | Entfernt | adapter | yes | yes | no |
| 8 | `iam.member.status.REACTIVATION_REQUIRED` | Reactivation required | Reaktivierung erforderlich | adapter | yes | yes | no |
| 9 | `iam.member.error.loadTeam` | Failed to load team | Team konnte nicht geladen werden | `useIamTeam.ts` | yes | yes | no |
| 10 | `iam.member.error.loadSecurity` | Failed to load security overview | Sicherheitsübersicht konnte nicht geladen werden | `useIamTeam.ts` | yes | yes | no |
| 11 | `iam.member.error.loadMember` | Failed to load member | Mitglied konnte nicht geladen werden | `useIamTeam.ts`, `TeamMemberDrawer.tsx` | yes | yes | no |
| 12 | `iam.member.error.actionFailed` | Action failed | Aktion fehlgeschlagen | `TeamMemberDrawer.tsx` | yes | yes | no |
| 13 | `iam.member.error.rolesLoadFailed` | Could not load roles. | Rollen konnten nicht geladen werden. | `CreateUserWizard.tsx` | yes | yes | no |
| 14 | `iam.member.drawer.role` | Role | Rolle | `TeamMemberDrawer.tsx` | yes | yes | no |
| 15 | `iam.member.drawer.allStations` | All stations | Alle Stationen | `TeamMemberDrawer.tsx` | yes | yes | no |
| 16 | `iam.member.drawer.fieldAgentEnabled` | Field agent access enabled | Field-Agent-Zugriff aktiviert | `TeamMemberDrawer.tsx` | yes | yes | no |
| 17 | `iam.member.drawer.sessionsTitle` | Sessions | Sitzungen | `TeamMemberDrawer.tsx` | yes | yes | no |
| 18 | `iam.member.drawer.unknownDevice` | Unknown device | Unbekanntes Gerät | `TeamMemberDrawer.tsx` | yes | yes | no |
| 19 | `iam.member.drawer.actionReason` | Reason (required for dangerous actions) | Begründung (für kritische Aktionen erforderlich) | `TeamMemberDrawer.tsx` | yes | yes | no |
| 20 | `iam.member.resendInvite` | Resend invitation | Einladung erneut senden | `TeamTab.tsx` aria-label | yes | yes | no |
| 21–37 | `iam.audit.*` (17 keys) | audit action labels | German equivalents | adapter → `TeamMemberDrawer.tsx` timeline | yes | yes | no |
| 38 | `iam.wizard.stepProgress` | Step {current} of {total} — {step} | Schritt {current} von {total} — {step} | `CreateUserWizard.tsx` | yes | yes | no |
| 39–43 | `iam.wizard.step.*` (5) | Person/Role/Access/Invitation/Summary | Person/Rolle/Zugriff/Einladung/Zusammenfassung | wizard + adapter | yes | yes | no |
| 44–49 | `iam.wizard.field.*` (6) | field labels | German field labels | `CreateUserWizard.tsx` | yes | yes | no |
| 50 | `iam.wizard.rolesLoading` | Loading roles… | Rollen werden geladen… | `CreateUserWizard.tsx` | yes | yes | no |
| 51 | `iam.wizard.rolesEmpty` | No role templates available. | Keine Rollenvorlagen verfügbar. | `CreateUserWizard.tsx` | yes | yes | no |
| 52 | `iam.wizard.systemRole` | System | System | `CreateUserWizard.tsx` | yes | yes | no |
| 53 | `iam.wizard.rolePreview` | Preview for this role | Vorschau für diese Rolle | `CreateUserWizard.tsx` → PermissionPreview title | yes | yes | no |
| 54–61 | `iam.wizard.access.*` (8) | access step copy | German access copy | `CreateUserWizard.tsx` | yes | yes | no |
| 62–67 | `iam.wizard.invite.*` (6) | invite method copy | German invite copy | `CreateUserWizard.tsx` | yes | yes | no |
| 68 | `iam.wizard.summary.stationsSelected` | {count} selected | {count} ausgewählt | `CreateUserWizard.tsx` summary | yes | yes | no |
| 69 | `iam.wizard.summary.approach` | Approach | Vorgehen | `CreateUserWizard.tsx` summary | yes | yes | no |
| 70–71 | `iam.wizard.submit.*` (2) | Send invitation / Create user | Einladung senden / Benutzer erstellen | `CreateUserWizard.tsx` | yes | yes | no |

**Canonical reuses (not counted in 70):** `common.cancel`, `common.back`, `common.next`, `common.yes`, `common.no`, `common.loading`, `iam.action.invite`, existing `iam.*` shell keys (tabs, KPIs, columns, drawer tabs, MFA/risk badges).

### Key verdict: **A — 70 KEYS JUSTIFIED**

Exactly 70 net-new keys at preflight ceiling. No exact reuse misses among the 70 new keys. No P263 keys leaked into P262 dictionary namespaces.

---

## 4. Primary gate — payload builder in i18n adapter

### Baseline location

Inline in `CreateUserWizard.tsx` `handleSubmit` at baseline `2bc7fe0f` (lines ~113–149).

### Final location

`rental-organization-users-roles-i18n.ts`: `buildInviteUserPayload()`, `buildCreateUserPayload()`.

### Semantic comparison

Field-by-field comparison confirms **zero semantic delta** vs baseline for invite and create:

- `email`, `organizationRoleId`, `membershipRole`, `permissions`, `stationScope`, `stationIds`, `fieldAgentAccess`, `department`, `position`, `roleLabel` (raw `selectedRole?.name`), `firstName`, `lastName`, `password`, `phone`, `role`, ORG_ADMIN → `permissions: undefined` — all identical logic.

### Translation dependency

`buildInviteUserPayload` / `buildCreateUserPayload` consume **no** `t`, `locale`, or translated labels. `roleLabel` remains raw `selectedRole?.name`. `stationScope` remains raw station `.name`.

### Classification

**A — PURE EXTRACTION OF PRE-EXISTING PAYLOAD LOGIC WITH ZERO SEMANTIC CHANGE, but architecturally misplaced**

### Payload-builder location verdict

**SEMANTICALLY SAFE BUT ARCHITECTURALLY MISPLACED — MOVE REQUIRED**

Preflight explicitly forbade mutation payload construction in the presentation adapter. Builders should live in a domain/mutation module (e.g. `iam-team.utils.ts` or wizard-local helper), not `*-i18n.ts`.

### Invite payload parity grade: **SOURCE-ONLY**

Tests call `buildInviteUserPayload()` directly twice — no DE/EN wizard interaction → API wiring test.

### Create payload parity grade: **SOURCE-ONLY**

Same limitation as invite.

---

## 5. Primary gate — locale-triggered business refetch

### `t` identity behavior

`LanguageContext.tsx`: `t` is `useCallback(..., [translate])` and `translate` depends on `[locale]`. **`t` identity changes on every locale switch.** YES.

### useIamTeam dependency graph

```
locale change
  → t identity changes (YES)
  → loadTeam identity changes ([orgId, t])
  → loadSecurity identity changes ([orgId, t])
  → openMember identity changes ([orgId, t])
  → openRole identity changes ([orgId, t])
  → refreshAll identity changes ([loadTeam, loadSecurity])
  → useEffect([loadTeam, loadSecurity]) re-runs
  → api.iam.teamKpis + teamList + rolesList + securityOverview REFETCH
```

Baseline `useIamTeam` callbacks depended only on `[orgId]` — **locale switch did not refetch at baseline.**

### Additional locale-refetch surfaces introduced by P262

| Surface | Effect deps | Locale refetch |
|---------|-------------|----------------|
| `CreateUserWizard` roles `useEffect` | `[orgId, t]` | `api.organizationRoles.list` refetch |
| `TeamMemberDrawer` detail `useEffect` | `[open, orgId, membershipId, t]` | `api.iam.teamMember` refetch when drawer open |

### Business-refetch verdict: **BLOCKING**

Locale-triggered additional reads ≠ 0 for mounted `UsersRolesTab` topology.

| API | Locale-triggered refetch |
|-----|------------------------|
| `teamKpis` | YES (+1 per switch) |
| `teamList` | YES (+1 per switch) |
| `rolesList` | YES (+1 per switch) |
| `securityOverview` | YES (+1 per switch) |
| `teamMember` | YES when drawer open |
| `organizationRoles.list` | YES when wizard mounted |
| `roleDetail` | Only if `openRole` called (callback identity changes; no auto-effect) |

### Minimal correction architecture (DO NOT IMPLEMENT)

1. Remove `t` from `useCallback` dependency arrays in `useIamTeam`.
2. Store host error **keys** (`iam.member.error.loadTeam`) in state; resolve with `t()` at render/toast boundary.
3. Same pattern for `TeamMemberDrawer` fetch effect and `CreateUserWizard` roles effect.
4. Keep fetch callbacks locale-independent: `[orgId]` only.

### openRole error label

Baseline: `t('Failed to load role')` equivalent string. Final: `t('iam.member.error.loadMember')`.

**Verdict: MINOR COPY BUG** (semantically wrong fallback for role-detail failures; not blocking alone).

---

## 6. PermissionPreview / deferred boundary

### PermissionPreview mount in P262 invite wizard

| String | File | Line | Mounted in wizard? | Scanner? | P262 enforce-clean? |
|--------|------|------|--------------------|----------|---------------------|
| Title (localized) | `CreateUserWizard.tsx` | 223 | YES | N/A (uses key) | YES |
| `Keine Berechtigungsdaten.` | `PermissionEditor.tsx` | 97 | YES (null perms) | debt | NO |
| `Darf ${mod.label} nicht nutzen` / level sentences | `PermissionEditor.tsx` | 103–108 | YES | debt (template) | NO |
| `mod.label` from `PERMISSION_MODULES` | `constants.ts` | various | YES | debt | NO (P263) |
| `Kein Modulzugriff konfiguriert.` | `PermissionEditor.tsx` | 126 | YES | debt | NO |

### CollapsiblePermissions in P262 member drawer

| String | Mounted? | Scanner? |
|--------|----------|----------|
| `Erweiterte Berechtigungen` | YES (access tab) | debt |
| `PermissionEditor` group/module labels | YES when expanded | debt |

### Deferred copy rule verdict: **ACTIVE P262 PRESENTATION DEBT — BLOCKING**

#1421 split permission taxonomy to P263, but `PermissionPreview` and `CollapsiblePermissions` are **actively mounted inside P262 surfaces** and render German host copy in EN locale. P262 claim of active debt = 0 is **incorrect**.

Scanner detects `PermissionEditor.tsx` as debt (not enforce-clean blind spot).

---

## 7. Enforce-clean boundary

### 9 exact paths

1. `rental/components/users-roles/UsersRolesTab.tsx`
2. `rental/components/users-roles/TeamTab.tsx`
3. `rental/components/users-roles/TeamMemberDrawer.tsx`
4. `rental/components/users-roles/CreateUserWizard.tsx`
5. `rental/components/users-roles/IamBadges.tsx`
6. `rental/components/users-roles/iam-team.utils.ts`
7. `rental/components/users-roles/useIamTeam.ts`
8. `rental/components/UsersRolesTab.tsx`
9. `rental/lib/rental-organization-users-roles-i18n.ts`

### Boundary verdict: **BOUNDARY INCOMPLETE**

`PermissionEditor.tsx` (imported child of wizard + drawer) is outside boundary but renders mounted host copy inside P262 flows. Enforce-clean passes for listed paths only because child is excluded.

---

## 8. Same-mount test quality

Test mounts `TeamTab` directly with mocked props — **not** `UsersRolesTab` / `useIamTeam`.

Missing from test state: drawer open, wizard open, `useIamTeam` mounted, API refetch instrumentation.

**Grade: WEAK** — proves search preservation and mutation-counter zero on mocked callbacks only; does not prove locale-refetch gate.

---

## 9. Permission parity

Test covers invite CTA visibility only. Drawer dangerous actions, open member, resend — not tested.

**Grade: WEAK** (partial; insufficient for full P262 permission surface claim).

Self/last-admin guards: **out of scope** — P262 did not modify guard logic.

---

## 10. Formatter mapping

`iamMemberFormattingLocale()` uses `getFormattingLocale(locale)` for supported locales → correct BCP47 (`de-DE`, `en-GB`, etc.).

Invalid locale fallback returns `DEFAULT_PRODUCT_LOCALE` (`'en'`) instead of `getFormattingLocale('en')` (`'en-GB'`). Intl accepts `'en'`; minor canonical deviation — **non-blocking**.

All 9 official locales map through `getFormattingLocale` when valid.

---

## 11. Scanner accounting (independently verified)

| Scanner | Baseline | Final | Delta |
|---------|----------|-------|-------|
| Global | 1282 | 1265 | −17 |
| Rental | 185 | 168 | −17 |
| Finance/Billing | 25 | 25 | 0 |

No suppression added. Delta attributable to P262 surface localization.

---

## 12. Dictionary

| Metric | Value |
|--------|-------|
| EN | 9634 |
| DE | 9634 |
| Parity | 100% |
| Orphans | 0 |
| Unused P262 | 0 |

---

## 13. Validation (independently run on audited HEAD)

| Check | Result |
|-------|--------|
| P262 focused tests (7) | PASS |
| P261 regression | PASS |
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `npx tsc -b` | PASS |
| `npm run build` | PASS |
| `git diff --check` baseline...HEAD | PASS (zero output) |

---

## 14. P263 deferred inventory (P263 preflight input)

- `RolesAccessTab.tsx` — full roles & access surface
- `PermissionEditor.tsx` — editor + `PermissionPreview` + `CollapsiblePermissions`
- `SecurityAuditTab.tsx`
- `constants.ts` — `PERMISSION_MODULES`, `PERMISSION_GROUPS`, German taxonomy
- `utils.ts` — `permissionLevelLabel`
- Custom-role CRUD flows in roles tab

**Note:** Items above are still **mounted inside P262** via imports; deferral is architectural intent, not current runtime isolation.

---

## 15. Correction required

**YES** — multiple blocking findings:

1. **Locale-triggered business refetch** (`useIamTeam` `t` deps + drawer/wizard effects)
2. **Payload builders in `*-i18n.ts` adapter** (architecturally misplaced)
3. **Active P262 presentation debt** via mounted `PermissionPreview` / `CollapsiblePermissions` German copy in EN locale
4. **Enforce-clean boundary incomplete** relative to mounted children
5. **Same-mount / mutation parity tests insufficient** for true topology

### Smallest correction set

1. Decouple `t` from fetch callback identities; resolve error keys at presentation boundary.
2. Move `buildInviteUserPayload` / `buildCreateUserPayload` out of `rental-organization-users-roles-i18n.ts`.
3. Either localize `PermissionPreview` permission lines for P262 OR extract to lazy P263-only sub-surface not mounted in EN wizard until P263.
4. Add true-topology same-mount test with `UsersRolesTab` + API call counters proving zero locale refetch.
5. Fix `openRole` to use role-specific error key.

---

## 16. Final verdict

# **D — LOCALE-TRIGGERED REFETCH CORRECTION REQUIRED**

P262 introduces `t` into `useCallback` dependency arrays for data-fetching hooks, causing `loadTeam` / `loadSecurity` / `refreshAll` effect to re-fire on locale switch. This violates the P262 contract (`business refetch caused solely by locale = 0`) and is a behavioral regression vs baseline where callbacks depended only on `[orgId]`.

PR #1422 must **not** be merged until locale-independent fetch callbacks are restored.

Additional non-merge corrections documented above (payload adapter placement, active permission-preview debt, test topology).

**DO NOT MERGE PR #1422.**  
**DO NOT MERGE THIS AUDIT PR** (audit-only).

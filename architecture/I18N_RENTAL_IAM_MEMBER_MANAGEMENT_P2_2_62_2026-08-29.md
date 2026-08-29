# I18N — Rental Users & Roles Member Management (P2.2.62)

## Scope

Localized the P262 Member Management slice from preflight audit #1421 and closed audit #1424 correction gaps:

- `UsersRolesTab` (no-org guard)
- `TeamTab` (KPIs, search, member list, invite CTA, pending invites)
- `CreateUserWizard` (invite/create flow)
- `TeamMemberDrawer` (member detail, sessions, audit timeline, actions)
- Mounted read-only permission preview (`PermissionPreview`, `CollapsiblePermissions` headings/levels)
- `useIamTeam` with locale-independent fetch identity

## Adapter

`frontend/src/rental/lib/rental-organization-users-roles-i18n.ts` — **presentation-only**

- Namespaces: `iam.member.*`, `iam.wizard.*`, `iam.audit.*`, `iam.permission.*` (preview subset)
- Built-in membership status / audit machines → translation keys; unknown stays raw
- Permission module labels via `nav.*` reuse + `iam.permission.module.*` for unmapped modules
- Wizard step labels and locale-aware `formatIamMemberDateTime` (`getFormattingLocale` fallback)

## Mutation payloads

`frontend/src/rental/components/users-roles/iam-member-payload.ts`

- `buildInviteUserPayload` / `buildCreateUserPayload`
- Semantics frozen; locale-independent

## Locale refetch architecture

Fetch callbacks depend on `[orgId]` only. Host error keys stored in state; `t()` applied at render/toast via `localeRef` (no callback identity change).

## Mutation safety

- Role IDs, membership IDs, machine role/status values, payloads unchanged
- Custom organization role names remain raw
- Raw user identity fields preserved
- Permission checks, self/last-admin guards frozen

## Enforce-clean

`P262_ENFORCE_CLEAN_EXACT` — 11 paths in `i18n-hardcoded-scan.mjs` and `hardcoded-copy-guard.test.ts`

## Deferred (P2.2.63)

- `RolesAccessTab`, full `PermissionEditor` interactive management chrome
- `SecurityAuditTab`, custom-role CRUD
- Remaining `constants.ts` taxonomy not required by P262 mounts

## Out of scope

- `DataAnalyseView.tsx`
- Legacy dead tabs (`UsersTab`, `InvitesTab`, etc.)

## Keys

90 P262-owned keys (+20 correction for permission preview + loadRole). EN=DE=9654, parity 100%.

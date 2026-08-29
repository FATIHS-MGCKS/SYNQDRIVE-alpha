# I18N — Rental Users & Roles Member Management (P2.2.62)

## Scope

Localized the P262 Member Management slice from preflight audit #1421:

- `UsersRolesTab` (no-org guard)
- `TeamTab` (KPIs, search, member list, invite CTA, pending invites)
- `CreateUserWizard` (invite/create flow)
- `TeamMemberDrawer` (member detail, sessions, audit timeline, actions)
- `useIamTeam` host error fallbacks

## Adapter

`frontend/src/rental/lib/rental-organization-users-roles-i18n.ts`

- Namespaces: `iam.member.*`, `iam.wizard.*`, `iam.audit.*`
- Built-in membership status machines → translation keys; unknown stays raw
- Audit action machines → translation keys; unknown falls back to raw description
- Wizard step labels and locale-aware `formatIamMemberDateTime`
- `buildInviteUserPayload` / `buildCreateUserPayload` extracted for mutation parity tests

## Mutation safety

- Role IDs, membership IDs, machine role/status values, payloads unchanged
- Custom organization role names remain raw (never passed through `t()`)
- Raw user identity fields (name, email, phone, department, position) preserved
- Permission checks, self/last-admin guards, action eligibility frozen

## Enforce-clean

`P262_ENFORCE_CLEAN_EXACT` — 9 paths in `i18n-hardcoded-scan.mjs` and `hardcoded-copy-guard.test.ts`

## Deferred (P2.2.63)

- `RolesAccessTab`, `PermissionEditor`, `SecurityAuditTab`
- Permission taxonomy in `constants.ts`
- `PermissionPreview` German lines inside wizard (P263 surface)

## Out of scope

- `DataAnalyseView.tsx`
- Legacy dead tabs (`UsersTab`, `InvitesTab`, etc.)

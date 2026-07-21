# IAM Invite Acceptance — Prompt 15 (2026-07)

## Goal

Secure invite acceptance for new and existing users with verified identity, explicit confirmation, transactional membership changes, and idempotent token consumption.

## New user flow

1. `POST /invites/validate` — preview org, role, scope, privileged flags
2. `POST /invites/accept` with `confirmed: true`, password, optional profile fields
3. Transaction creates user + membership, consumes token hash, writes audit outbox + notification activity

## Existing user flow

1. Must present valid JWT (`Authorization: Bearer`) matching invite email
2. `confirmed: true` required
3. Wrong logged-in account → `403 INVITE_IDENTITY_MISMATCH`
4. Unauthenticated → `401 INVITE_AUTHENTICATION_REQUIRED`

## Removed / suspended membership

- No implicit reactivation
- Requires `acknowledgeRejoin: true`
- Audited as `USER_REACTIVATED` with previous status in metadata

## Privileged roles

- ORG_ADMIN / SUB_ADMIN / manage permissions flagged in validate response
- `acknowledgePrivilegedRole: true` required on accept
- `requiresStepUp` + `mfaRequired` returned (MFA wiring prepared)

## Transactional accept

Single Prisma transaction:

- Membership create/update
- Invite status → ACCEPTED + token hash invalidation
- `iam_audit_outbox` rows (accepted, created/reactivated)
- Security activity log notification row

Post-commit: audit outbox processor emits durable `UserAccessAuditService` records.

## Idempotency

- Duplicate accept by same user → `{ accepted: true, idempotent: true }`
- Consumed token (invalid bcrypt) → rejected
- Already accepted by another user → `INVITE_ALREADY_CONSUMED`

## Central email normalization

`normalizeIdentityEmail()` in `utils/identity-email.util.ts` used for invite create and identity matching.

## Tests

- `iam-invite-acceptance.security.spec.ts`
- `policies/invite-accept.policy.spec.ts`

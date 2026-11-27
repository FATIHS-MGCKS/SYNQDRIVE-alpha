# USR-P2E E2 — MFA session-bound step-up grants (PR #2534)

**Status:** E2 session-binding closeout **PASS** on disposable PostgreSQL (33/33 E2 spec + full `usr-p2-postgres-gate.sh`).

## Grant binding (Step 1)

- Extended `UserMfaStepUpGrant` with `token_family`, org/membership scope, `session_version`, `security_version`, `membership_version` (migration `20261127140000_iam_step_up_grant_session_binding`).
- `createGrant` requires trusted `StepUpGrantBinding`; MFA challenge derives binding from authoritative session + membership rows.
- `validateGrant` enforces user, action, binding, live user versions, active refresh head, and atomic single consumption.
- **Legacy policy:** rows with null `token_family` fail closed at validation (no silent promotion).
- Guards pass `StepUpGrantValidationContext` from AuthGuard-validated JWT user only.

## Session invalidation (Step 2)

- `revokeSessionByIdInTransaction` deletes unconsumed grants for the revoked family.
- `revokeAllActiveForUser` / `revokeAllActiveForUserInTransaction` delete all unconsumed user grants.
- `revokeOtherSessionsForUser` deletes grants per revoked family.
- Existing password change / MFA reset `deleteMany` paths preserved.

## Request-local combined guard reuse

- `StepUpGrantRequestCache` on the HTTP request prevents double consumption when MasterAdmin + StepUp guards both honor the same header grant in one request (action scope still checked per guard).

## Evidence matrix (`usr-p2e-e2-mfa-seal.postgres.integration.spec.ts`)

| Area | Coverage |
|------|----------|
| G07–G09 | Cross-family, cross-org, per-session revoke + revoke-all grant purge |
| G10 | Password admin change + MFA reset grant denial |
| D09 / HTTP | Real `AuthGuard` + `MasterAdminMfaGuard` on `/api/v1/...` probe routes |
| Combined | HTTP grant single consume + procedural dual-guard reuse |
| Password reset | `PasswordResetService.confirmReset` stale pending + fresh MFA login + concurrent orders |

**Gate artifact:** `/opt/cursor/artifacts/usr-p2-postgres-gate-e2-binding-r5.log` (`Tests: 33 passed`; `USR_P2_PG_EXECUTED=1`).

## Preserved corrections

- P2-R22 monotonic TOTP via `resolveAcceptedTotpStep`
- P2-R23 conservative MFA downgrade on refresh rotation
- P2-R25 idempotency conflict + atomic consumption

## Out of scope (unchanged)

- E3–E5, production migration deploy, R-008 remains OPEN until full P2E program closeout.
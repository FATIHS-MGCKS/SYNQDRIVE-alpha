# USR-P2D — Bounded residual (record-only, not executed in P2C)

## Audit actor attribution (P2D)

**Finding:** `UsersController.adminChangePassword` calls `UsersService.changePasswordAdmin(id, body.password)` without passing the authenticated Master Admin actor id.

**Effect:** `changePasswordAdmin` falls back to `actorUserId ?? userId` (target user), so durable revocation intent metadata may attribute the mutation to the target instead of the operator.

**Location:** `backend/src/modules/users/users.controller.ts` (`adminChangePassword`).

**Status:** Recorded for P2D repair — **not** claimed as accepted in P2B/P2C.

## Other P2D scope (unchanged)

- P1A true lost-commit acknowledgement paths
- Full TOTP and recovery-code login matrix
- MFA refresh assurance and pending-context replay proofs

No P2D implementation in PR #2534 P2C tranche.
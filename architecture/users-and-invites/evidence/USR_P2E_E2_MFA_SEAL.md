# USR-P2E E2 — MFA final seal (PR #2534)

**Status:** E2 **PASS** on disposable PostgreSQL (gate + targeted E2 spec).  
**HEAD evidence:** post-commit `usr-p2e-e2-mfa-seal` + gate run.

## Code corrections (preserved)

| Requirement | Change |
|-------------|--------|
| P2-R22 | `resolveAcceptedTotpStep()` uses `authenticator.checkDelta` so `lastTotpStep` matches the verified window (not wall-clock step alone). |
| P2-R25 | `createGrant` idempotency replay throws `STEP_UP_IDEMPOTENCY_REPLAY` — never returns a new raw token without persisted hash. |
| Grant invalidation | Unconsumed step-up grants cleared on admin/self-service password change and `revokeAllActiveForUser`. |

## Executed PostgreSQL evidence

| ID | Test file — name |
|----|------------------|
| P2-R22 | `usr-p2e-e2-mfa-seal.postgres.integration.spec.ts` — monotonic TOTP step persistence / subsequent step / older step rejection |
| P2-R23 | same — `P2-R23 recovery login refresh assurance downgrades conservatively`; P2D — `MFA refresh assurance downgrades MFA claims after rotation` |
| P2-R25 / E2-G01–G11 | `usr-p2e-e2-mfa-seal.postgres.integration.spec.ts` — step-up grant matrix |
| D09 / guards | same — `D09 MasterAdminMfaGuard accepts fresh MFA JWT`; `COMBINED StepUpGuard accepts fresh MFA without consuming grant header` |
| Isolation | P2D — `MFA_DEVICE_ISOLATION`, `MFA_ORG_ISOLATION`; extended `D10` with org memberships |
| Stale pending | P2D — admin password + MFA reset; E2 — self-service password, platform downgrade authority |
| Concurrent | E2 — `CONCURRENT_RESET_MFA`; P2D — D05/D06 |

**Gate:** `backend/scripts/test/usr-p2-postgres-gate.sh` includes `usr-p2e-e2-mfa-seal.postgres.integration.spec.ts`.

## E5 residuals (unchanged)

- Org offboarding contention vs issuance/refresh/legacy (E1 bounded note).
- Vehicle lifecycle + Vehicle Detail CI workflows (no changes in E2).
- **R-008 OPEN** until full P2E closeout.
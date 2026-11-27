# USR-P2D — MFA and audit accountability

**Operation:** `SYNQDRIVE_MASTER_USERS_P2D_MFA_AUDIT_ACCOUNTABILITY`  
**PR:** #2534

## Production fixes

| Area | Change |
|------|--------|
| Admin password actor | `UsersController.adminChangePassword` passes `req.user.id` to `changePasswordAdmin` (fail closed without actor) |
| Lost-ack retry | `SecurityGovernanceSessionAuditService` accepts optional `securityOperationId` for idempotent client retry after committed txn |
| MFA credential consumption | `IamMfaChallengeService` uses conditional `updateMany` for TOTP step and recovery `usedAt` |
| MFA refresh assurance | `RefreshTokenService.buildSessionClaimsForStored` conservative downgrade on MFA row rotation (no fabricated MFA freshness) |

## Tests

| Suite | Opt-in | Coverage |
|-------|--------|----------|
| `usr-p2d-mfa-audit-accountability.postgres.integration.spec.ts` | `USR_P2D_MFA_AUDIT_PG=1` | D01–D10, device isolation (one family), refresh assurance, stale pending, admin actor |
| `usr-p1a-session-audit-certification.postgres.integration.spec.ts` | `USR_P1A_SESSION_AUDIT_PG=1` | P1A_B single + revoke-all lost ack (updated) |
| `usr-p2b-atomic-security-mutations.postgres.integration.spec.ts` | `USR_P2B_ATOMIC_SECURITY_PG=1` | ADMIN actor attribution |

Gate: `usr-p2-postgres-gate.sh` P2D shards (14) before P1A.

**P2E deferrals (not re-run here):** org-scoped MFA isolation, full stale-pending matrix (suspend / platform downgrade), live `AuthGuard` HTTP harness for D09 (PG uses access JWT validator), `allowUnboundReissue` caller audit.

## P2D verdict

**P2D_VERDICT=PASS** for scoped MFA consumption, login matrix, admin actor, P1A_B lost ack, and refresh assurance policy **in disposable PostgreSQL**.

**P2E_READY=PARTIAL** — see [`USR_P2E_FINAL_RESIDUALS.md`](USR_P2E_FINAL_RESIDUALS.md).

**R-008=REMEDIATED_REPO** — P2D scope **PASS**; full repository acceptance on product HEAD `7da011d72` (USR-P2 gate run `46006709524`).
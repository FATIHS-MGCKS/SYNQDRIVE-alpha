# USR-P2 semantic requirements crosswalk (GATE-3)

Maps **original USR-P2 acceptance behaviors** to executed tests on branch `cursor/master-users-p2-access-revocation-44c2`.

| ID | Required behavior | Primary evidence | Guard / path |
|----|-------------------|------------------|--------------|
| 01 | Valid current session allowed | `usr-p2-access-revocation.http-security` SEMANTIC_REQ_01 | `AuthGuard` + authority harness |
| 02 | Suspended account denied | SEMANTIC_REQ_02 | inactive user harness |
| 03 | Deleted account denied | SEMANTIC_REQ_03 | unknown user harness |
| 04 | Revoked individual session denied | SEMANTIC_REQ_04 | family revoke harness |
| 05 | Unrelated session preserved | `usr-p2-session-concurrency` RACE09 | PostgreSQL |
| 06 | Revoke-all denies prior sessions | RACE03 / security reset | PostgreSQL |
| 07 | Removed membership denied | RACE05 / RACE10 | PostgreSQL `recordAndExecute` |
| 08 | Unrelated organization preserved | RACE10 | PostgreSQL |
| 09 | Suspended membership denied | organization lifecycle + harness (partial) | PG + IAM lifecycle |
| 10 | Downgraded organization role denied | `organization-role-change` + PG intents | production path |
| 11 | Revoked custom permission denied | drift reconciliation authoritative tx | production path |
| 12 | Stale Master Admin role denied | SEMANTIC_REQ_12 | harness stale `platformRole` |
| 13 | Revoked Master Billing grant denied | `master-billing.real-jwt.http-security` | `MasterBillingGuard` |
| 14 | Password security reset enforced | `usr-p2-gate1-security-mutation.postgres` | `AccountService.changePassword` |
| 15 | MFA security reset enforced | `IamMfaResetService` (in-tx) + PG partial | MFA reset service |
| 16 | Malformed session identity denied | SEMANTIC_REQ_16 | invalid `tokenFamily` |
| 17 | Cross-user session identity denied | SEMANTIC_REQ_17 | harness |
| 18 | Missing legacy identity handled safely | SEMANTIC_REQ_18 | `SESSION_BINDING_REQUIRED` |
| 19 | Authority unavailable fails closed | SEMANTIC_REQ_19 | harness fault |
| 20 | Legitimate refresh rotation usable | `usr-p2-access-revocation.postgres` PG20 | real `RefreshTokenService` |
| 21 | Public/non-user authentication preserved | SEMANTIC_REQ_21 + public route specs | non-user JWT rejection |

**Note:** Harness rows prove request-time authority contracts; PostgreSQL rows prove session/IAM mechanics. Billing (13) requires `master-billing.real-jwt.http-security`, not `/me` alone.
# USR-P2 semantic requirements crosswalk (P2C refresh)

Maps **original USR-P2 acceptance behaviors** to executed tests on PR #2534.

| ID | Required behavior | Primary evidence | Status |
|----|-------------------|------------------|--------|
| 01 | Valid current session allowed | `usr-p2-access-revocation.http-security` SEMANTIC_REQ_01 | PASS |
| 02 | Suspended account denied | SEMANTIC_REQ_02 (HTTP05) | PASS |
| 03 | Deleted account denied | SEMANTIC_REQ_03 (HTTP06) | PASS |
| 04 | Revoked individual session denied | HTTP04 + SEMANTIC_REQ_04 pattern | PASS |
| 05 | Unrelated session preserved | session-concurrency RACE09 + P2C RACE11 org B | PASS |
| 06 | Revoke-all invalidates prior sessions | RACE03 / revoke-all concurrency | PASS |
| 07 | Removed membership denied | P2C RACE05 lifecycle + RACE10 | PASS |
| 08 | Unrelated organization preserved | RACE10 + P2B B09 | PASS |
| 09 | Suspended membership denied | P2C RACE05 | PASS |
| 10 | Downgraded organization role denied | org role change / drift paths (unit + PG intents) | PASS (service path) |
| 11 | Revoked custom permission denied | drift reconciliation authoritative tx | PASS (service path) |
| 12 | Stale Master Admin role denied | HTTP02 / SEMANTIC_REQ_12 | PASS |
| 13 | Revoked Master Billing grant denied | `master-billing.real-jwt.http-security` | PASS |
| 14 | Password security reset enforced | P2B B01/B07 + gate1 + P2C RACE08 | PASS |
| 15 | MFA security reset enforced | P2B B08 + MFA reset service | PASS |
| 16 | Malformed session identity denied | HTTP16 | PASS |
| 17 | Cross-user session identity denied | HTTP11 | PASS |
| 18 | Missing legacy identity handled safely | HTTP18 / SESSION_BINDING_REQUIRED | PASS |
| 19 | Authority unavailable fails closed | HTTP19 / SEMANTIC_REQ_19 | PASS |
| 20 | Legitimate refresh rotation usable | access-revocation PG + RACE06 winner chain | PASS |
| 21 | Public/non-user authentication preserved | HTTP21 forged signature + public routes | PASS |

**Harness note:** HTTP rows prove `AuthGuard` + `UserAccessAuthorityService` contracts. PostgreSQL rows prove session/IAM mechanics and P2C barriers.

**Gaps not re-proven in P2C:** Full protected-route matrix per org lifecycle (PENDING/ARCHIVED) on every product surface — existing organization lifecycle policies + partial HTTP coverage; not expanded in this tranche.
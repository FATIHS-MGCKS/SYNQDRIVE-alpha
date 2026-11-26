# USR-P2 semantic requirements crosswalk (P2C targeted seal)

Maps **USR-OWN-02 acceptance behaviors** to **exact test file + test name** executed for PR #2534 P2C seal. Do not infer PASS from labels alone.

| ID | Required behavior | Primary evidence (file — test name) | P2C seal |
|----|-------------------|-------------------------------------|----------|
| 01 | Valid current session allowed | `usr-p2-access-revocation.http-security.integration.spec.ts` — `SEMANTIC_REQ_01 valid current session allowed (HTTP01)` | Prior P2A |
| 02 | Suspended account denied | same — `SEMANTIC_REQ_02 suspended/inactive account denied (HTTP05)` | Prior P2A |
| 03 | Deleted account denied | same — `SEMANTIC_REQ_03 deleted/unknown account denied (HTTP06)` | Prior P2A |
| 04 | Revoked individual session denied | same — `HTTP04 revoked session denied on refresh rotate` | Prior P2A |
| 05 | Unrelated session preserved | `usr-p2-session-concurrency.postgres.integration.spec.ts` — `RACE09 two families remain isolated under concurrent rotate` | Prior P2C |
| 06 | Revoke-all invalidates prior sessions | `usr-p2c-deterministic-race.postgres.integration.spec.ts` — `RACE03 revoke-all with concurrent refresh on second family` | P2C |
| 07 | Removed membership denied | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `SEMANTIC_REQ_07 membership remove denies org-bound session` | P2C seal |
| 08 | Unrelated organization preserved | `usr-p2c-deterministic-race.postgres.integration.spec.ts` — `RACE11 tenant suspension revokes bound sessions; unrelated org preserved` | P2C |
| 09 | Suspended membership denied | `usr-p2c-deterministic-race.postgres.integration.spec.ts` — `RACE05 membership suspend via lifecycle denies org JWT` | P2C |
| 10 | Downgraded organization role denied | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `SEMANTIC_REQ_10 permission downgrade via lifecycle.move denies stale JWT` | P2C seal |
| 11 | Revoked custom permission denied | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `SEMANTIC_REQ_11 custom permission revocation via lifecycle.move denies stale JWT` | P2C seal |
| 12 | Stale Master Admin role denied | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `SEMANTIC_REQ_12 platform role downgrade bumps securityVersion and denies JWT` | P2C seal |
| 13 | Revoked Master Billing grant denied | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `SEMANTIC_REQ_13 master billing grant revoke fails MasterBillingGuard` (+ `platform-permission.master-billing.postgres.integration.spec.ts` — DB revoke / guard) | P2C seal |
| 14 | Password security reset enforced | `usr-p2c-deterministic-race.postgres.integration.spec.ts` — `RACE08 AccountService password change denies concurrent refresh` | P2C seal |
| 15 | MFA security reset enforced | same — `B10 MFA reset contends with refresh via user advisory lock` | P2C seal |
| 16 | Malformed session identity denied | `usr-p2-access-revocation.http-security.integration.spec.ts` — `HTTP16 malformed token rejected` | Prior P2A |
| 17 | Cross-user session identity denied | same — `HTTP11 cross-user refresh rejected` | Prior P2A |
| 18 | Missing legacy identity handled safely | same — `HTTP18 legacy binding required` | Prior P2A |
| 19 | Authority unavailable fails closed | same — `SEMANTIC_REQ_19 authority unavailable fails closed (HTTP19)` | Prior P2A |
| 20 | Legitimate refresh rotation usable | `usr-p2-session-concurrency.postgres.integration.spec.ts` — `RACE06 concurrent rotation yields one successor` | Prior P2C |
| 21 | Public/non-user authentication preserved | `core-app-m2m-token.http-security.integration.spec.ts` — `token endpoint is reachable without user JWT when runtime configured`; `accepts valid user JWT on entitlements route` (not forged-JWT rejection) | Cited regression |

**Lifecycle route boundaries (representative, not exhaustive matrix):**

| Probe | Evidence |
|-------|----------|
| PENDING tenant operational denied | `high-mobility-vehicle-register.http-security.integration.spec.ts` — pending org register denied |
| SUSPENDED / ARCHIVED tenant denied | `vehicle-ownership-lifecycle.http-security.integration.spec.ts` — `2 — same JWT shape after org SUSPENDED denies GET and PATCH`; `4 — PENDING org denies operational vehicle GET` |
| Strict session scope | `usr-p2-access-revocation.http-security.integration.spec.ts` — `HTTP18` / binding mismatch family |

**P2C concurrency lock observation:** `pg_blocking_pids` + `pg_locks` (class `913104`, user advisory) via `usr-p2-deterministic-concurrency.helper.ts`; holder transaction proves wait before release — not phase-barrier-only.

**Count:** 21 requirements mapped; **20** directly exercised in this PR’s PostgreSQL/HTTP paths; **21** includes cited M2M/user-JWT regression (not re-run in usr-p2 gate shard).
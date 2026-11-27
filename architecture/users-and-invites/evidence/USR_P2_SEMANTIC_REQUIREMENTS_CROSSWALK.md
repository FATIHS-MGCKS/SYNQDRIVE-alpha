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

---

## P2E E1 — C01–C08 acceptance crosswalk (2026-11-26)

| ID | Required behavior | Executed test (file — name) | E1 verdict |
|----|-------------------|----------------------------|------------|
| C01 | Rotation-first vs `revokeAllActiveForUser` contention | `usr-p2c-deterministic-race.postgres.integration.spec.ts` — `RACE01 rotation-first: revoke waits on rotate fence; successor denied after both commit` | PASS |
| C02 | Production org offboarding vs org-bound + legacy refresh | `usr-p2e-e1-org-lifecycle.postgres.integration.spec.ts` — `E1_C02` baseline + **E5C** `C02-A/B/C` (execute lock witness; post-offboard denial for issued/rotated credentials in either race order; unrelated org preserved) | PASS (E1+E5C implemented; **PENDING_CI** on `e2119608d`) |
| C03 | B10 concurrent mutation invariants | `usr-p2b-atomic-security-mutations.postgres.integration.spec.ts` — `B10 password mutation serializes against concurrent refresh rotation`; `B10 MFA reset serializes…`; `B10 membership mutation serializes…` | PASS |
| C04 | Role downgrade + RolesGuard | `usr-p2c-semantic-guard.postgres.integration.spec.ts` — `E1_C04 organization role downgrade denies RolesGuard for stale membershipRole` | PASS |
| C05 | Permission revoke + PermissionsGuard | same — `E1_C05 custom permission revocation denies PermissionsGuard for stale JWT` | PASS |
| C06 | Platform role authority | same — `E1_C06 platform role downgrade denies RolesGuard for stale MASTER_ADMIN JWT` (no production MA downgrade HTTP path; guard + authority on persisted role) | PASS |
| C07 | Public/M2M regressions | `core-app-m2m-token.http-security.integration.spec.ts` (gate tail) | PASS |
| C08 | Lifecycle + binding | `org-scoping.organization-status.http-security.integration.spec.ts` (gate tail) | PASS |

**Full usr-p2 PostgreSQL gate:** `backend/scripts/test/usr-p2-postgres-gate.sh` (includes E1 org lifecycle + C07/C08 HTTP shards).
# USR-P2E — Final repository acceptance residuals (record-only in P2D)

Mandatory P2E scope from P2C seal; **not** re-executed as full P2C cycle in P2D.

| ID | Requirement | Status in P2D | Evidence pointer |
|----|-------------|---------------|------------------|
| C01 | True rotation-first revocation contention complete | **OPEN (P2E)** | P2C RACE01 partial; needs production-path rotation vs `revokeAll` ordering proof |
| C02 | Organization lifecycle offboarding vs bound issuance + legacy upgrade | **OPEN (P2E)** | RACE11 uses org SUSPENDED; not full archival/offboarding lifecycle |
| C03 | B10 mutation success + exact security denial assertions | **OPEN (P2E)** | B10 PASS with `Promise.allSettled`; tighten denial message contracts in P2E |
| C04 | SEMANTIC 10 actual role downgrade + RolesGuard | **OPEN (P2E)** | `lifecycle.move` permission PG; not org role enum downgrade + route guard |
| C05 | SEMANTIC 11 PermissionsGuard after revocation | **OPEN (P2E)** | custom permission PG; not HTTP PermissionsGuard matrix |
| C06 | SEMANTIC 12 production platform role mutation + RolesGuard | **OPEN (P2E)** | PG transaction demotion; not admin API + RolesGuard |
| C07 | Legitimate Public/M2M regressions on final HEAD | **OPEN (P2E)** | cited crosswalk; CI execution on release branch |
| C08 | Representative lifecycle routes + strict session binding | **OPEN (P2E)** | cited HTTP security specs; not usr-p2 gate shard |

**R-008** remains **OPEN** until P2E closes the above and owner attestation.
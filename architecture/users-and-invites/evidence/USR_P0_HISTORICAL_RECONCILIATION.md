# USR_P0 — Historical IAM reconciliation

Audited main: `a5664ac105cc43ee4cd12da22bb4cffc1ffb50f6`.

| Item | PR / evidence | IMPLEMENTED | TESTED (repo) | MERGED | DEPLOYED | PROD_VERIFIED |
|------|---------------|-------------|---------------|--------|----------|---------------|
| Delegated Master Billing permission | #2469, #2468, P3B docs | YES | YES (permission http-security) | YES | **UNKNOWN** | **NO** |
| Master Billing MFA delegate flag | P3B | YES (off by default) | partial | YES | **UNKNOWN** | **NO** |
| Mandatory privileged audit (billing) | P3B | YES | YES | YES | **UNKNOWN** | **NO** |
| Atomic MA org onboarding | #2474, P4 | YES | org tests | YES | **UNKNOWN** | **NO** |
| Organization invitation lifecycle | org module | YES | partial | YES | **UNKNOWN** | **NO** |
| REMOVED membership identity isolation | #2481, P6B2 | YES | `iam-removed-membership` **pass** | YES | **UNKNOWN** | **NO** |
| Master Admin Security & Access UI | P6B1, P6B2 branch history | YES | partial FE | YES | **UNKNOWN** | **NO** |
| MFA enforcement (MA) | master-admin-mfa guard | YES | jest **pass** | YES | **UNKNOWN** | **NO** |
| Org offboarding | P6D* | YES | extensive | YES | **UNKNOWN** | **NO** |

## Additional PRs (discovered)

| PR | Topic |
|----|--------|
| #2481 | P6B2 IAM REMOVED re-provision |
| #2474 | P4 atomic onboarding |
| #2468 / #2469 | P3B billing delegate + MFA foundation |
| Master org IAM UI | organizations-p6b1-ma-ui-operational (merged via main history) |

**Rule applied:** MERGED ≠ DEPLOYED ≠ PRODUCTION_VERIFIED.
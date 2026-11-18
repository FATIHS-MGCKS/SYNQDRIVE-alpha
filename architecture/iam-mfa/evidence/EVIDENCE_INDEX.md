# IAM MFA — Evidence index

| ID | Type | Source | Epistemic | Summary |
|----|------|--------|-----------|---------|
| IAM-MFA-EVID-REPO-001 | CODE | `backend/src/modules/iam-mfa/` | CONFIRMED | Module implementation on `59182a9de` |
| IAM-MFA-EVID-REPO-002 | CODE | `backend/.env.example` | CONFIRMED | All `IAM_MFA_*` default **false** / empty |
| IAM-MFA-EVID-REPO-003 | TEST | `iam-mfa.security.spec.ts` | CONFIRMED | Security unit tests present |
| IAM-MFA-EVID-PROD-001 | PRODUCTION_OBSERVATION | SSH env read attempt 2026-11-18 | BLOCKED | `.env` permission denied — flags **UNKNOWN** |
| IAM-MFA-EVID-HIST-001 | HISTORICAL | P2-PR4A change record | HISTORICAL | MFA active only when flags on — default off |
| IAM-MFA-EVID-P5B2-001 | DOCUMENT | `P5_B2_MA_MFA_ROUTE_COVERAGE_2026-11-18.md` | CONFIRMED | MA route MFA metadata inventory |
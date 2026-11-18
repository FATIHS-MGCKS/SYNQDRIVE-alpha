# IAM MFA — Production baseline

**Inspection date:** 2026-11-18 (Europe/Berlin)  
**Method:** Read-only VPS SSH (Path A)  
**Deploy path:** `/opt/synqdrive/current/` (standard DSRG layout)

## Production access

| Item | Result |
|------|--------|
| `bash .cursor/scripts/cloud-agent-ssh-preflight.sh` | **PASS** |
| Principal | `synqdrive-admin@srv1374778.hstgr.cloud` |
| Read `backend/.env` for `IAM_MFA_*` | **FAILED** — `grep: Permission denied` |

## Runtime flag state

| Variable class | Epistemic state |
|----------------|-----------------|
| `IAM_MFA_ENROLLMENT_ENABLED` | **UNKNOWN** at Production |
| `IAM_MFA_STEP_UP_ENFORCED` | **UNKNOWN** |
| `IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED` | **UNKNOWN** |
| `IAM_MFA_MASTER_ADMIN_ENABLED` | **UNKNOWN** |
| `IAM_MFA_ORG_ALLOWLIST` | **UNKNOWN** |

**Historical record (retained):** Prior audits observed Production IAM MFA variables **unset or off**. This PR does **not** contradict or upgrade that to `CONFIRMED` without readable operator attestation.

## Schema / migration (indirect)

Repository confirms migration `20260722110000_iam_mfa_step_up` on `main`. Presence of MFA tables on Production PostgreSQL is **INFERRED** from routine deploy migrations but **not** attested via SQL in this audit (no DB credentials used).

## Production validation status

**NOT_PRODUCTION_VALIDATED** for MFA enforcement behavior.
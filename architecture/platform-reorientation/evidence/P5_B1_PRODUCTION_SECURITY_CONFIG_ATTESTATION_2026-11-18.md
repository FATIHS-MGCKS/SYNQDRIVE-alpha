# P5-B1 — Production security configuration attestation

**Operation:** `SYNQDRIVE_ALPHA_P5_B1_PRODUCTION_SECURITY_CONFIG_ATTESTATION`  
**Mode:** STRICT_READ_ONLY (recorded 2026-11-18 Europe/Berlin)  
**Host:** `srv1374778.hstgr.cloud` (`synqdrive-admin` SSH)

## Method

PM2 status, localhost health, process `environ` for six keys only, `grep` in `/opt/synqdrive/shared/backend.env`. **No writes. No secret values captured.**

## Deploy baseline

| Item | Value |
|------|-------|
| PM2 | `synqdrive` :3001 online; `synqdrive-b` :3002 online |
| Health | Both `status=ok` |
| `/opt/synqdrive/current` Git | `1e6a267c8c7951e2a11633e89ab96714844ea846` (both replicas) |
| `origin/main` at P5 closeout | `59182a9dec80b35d805cf64dd6252172c2fc4ba9` — Production **behind** repo (drift **not** re-validated in this closeout) |

## Flag attestation (effective)

| Variable | 3001 | 3002 | `shared/backend.env` | Interpretation |
|----------|------|------|----------------------|----------------|
| `IAM_MFA_MASTER_ADMIN_ENABLED` | **UNSET** | **UNSET** | no match | Effective MA MFA **OFF** |
| `IAM_MFA_ENROLLMENT_ENABLED` | **UNSET** | **UNSET** | no match | **OFF** |
| `IAM_MFA_STEP_UP_ENFORCED` | **UNSET** | **UNSET** | no match | **OFF** |
| `IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED` | **UNSET** | **UNSET** | no match | **OFF** |
| `CORE_APP_M2M_ENABLED` | **UNSET** | **UNSET** | no match | **OFF** (fail-closed default) |
| `CORE_APP_M2M_PRODUCTION_READY` | **UNSET** | **UNSET** | no match | **OFF** |

Replicas **aligned** (no 3001/3002 divergence on these keys).

## Resolver semantics (repository — CONFIRMED)

`resolveIamMfaFeatureFlagsForPrincipal()`: unset `IAM_MFA_MASTER_ADMIN_ENABLED` ⇒ no enforced Master Admin MFA step-up in Production attestation window.

## Closeout reconciliation (owner decisions 2026-11-18)

| Decision | Attestation alignment |
|----------|----------------------|
| MFA activation **deferred** | **CONSISTENT** — all IAM MFA keys UNSET |
| M2M production activation **not authorized** | **CONSISTENT** — M2M keys UNSET |

**Not a security PASS for MFA enforcement** — deferred risk documented in P5 closeout.
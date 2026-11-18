# IAM MFA (Core platform)

| Field | Value |
|-------|-------|
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | Bootstrap audit V1 (2026-11-18) |
| **Maturity** | Implemented in repository; **production activation not validated** |
| **Runtime impact** | Backend global module; Master Admin + org-privileged step-up |
| **Last updated** | 2026-11-18 (P5-B4 PR1 authority bootstrap) |

## Purpose

Core **IAM multi-factor authentication**: TOTP enrollment and challenge, recovery codes, step-up grants, org-admin MFA reset, and integration with `StepUpGuard` / `MasterAdminMfaGuard` across privileged routes.

## Scope

| In scope | Out of scope |
|----------|----------------|
| `backend/src/modules/iam-mfa/*` | Clerk primary login (Auth API module) |
| `StepUpGuard`, `MasterAdminMfaGuard` contracts | Full WebAuthn factor lifecycle (schema-ready; TOTP primary) |
| `account/mfa/*` self-service APIs | VO5C owner MFA exception (Vehicle Onboarding authority) |
| Org user MFA admin reset | IAM Data Retention module |
| Feature flags + org allowlist rollout | Production flag values (read blocked — see evidence) |

## Mandatory entry documents

1. This `README.md`
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
4. [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md)
5. [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md)

## Validation

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/iam-mfa/scripts/validate-graph.sh
cd backend && npx jest --testPathPatterns=iam-mfa
```

## Neighboring authorities

- **Auth API** — JWT / session claims carrying `assuranceLevel` and `mfaAuthenticatedAt`
- **Activity Log** — `MasterAdminAuditService.recordMfaStepUp`, privileged mutation audit
- **Platform product catalog** — Master Admin mutations gated when `IAM_MFA_MASTER_ADMIN_ENABLED`
- **Users & Invites** — org-scoped admin routes using `StepUpGuard`

## Supporting evidence (non-authority)

- `architecture/platform-reorientation/evidence/P5_B2_MA_MFA_ROUTE_COVERAGE_2026-11-18.md`
- `architecture/platform-product-catalog/CHANGE_RECORD_P2_PR4A_2026-11-16.md` (MFA default-off note)
- `docs/audits/*` migration catalog references (`20260722110000_iam_mfa_step_up`)

## Promotion gate

`AUTHORITY_ACTIVE` **not** claimed: Production IAM MFA flag state unresolved; WebAuthn enrollment path incomplete; privileged placeholder endpoints (`NOT_IMPLEMENTED`).
# USR_P0-F-003 / harness remediation spec

## Root cause

`security-governance-session-audit.http-security.spec.ts` `createApp()` omits Nest providers required by `SecurityGovernanceController` constructor:

| Dependency | Session spec | Billing spec (reference) |
|------------|--------------|---------------------------|
| `SecurityGovernancePlatformPermissionAuditService` | **missing** | present |
| `PlatformPermissionService` | **missing** | mocked |
| Others | present | present |

Failure mode: Nest cannot instantiate controller → **5/5 tests fail at compile/bootstrap**.

## Remediation (USR-P1 — no change in P0 closeout)

Add to `providers` in `createApp()`:

```typescript
SecurityGovernancePlatformPermissionAuditService,
{ provide: PlatformPermissionService, useValue: { grantMasterBillingWithMandatoryAudit: jest.fn(), revokeMasterBillingWithMandatoryAudit: jest.fn() } },
```

Do **not** weaken assertions. Do **not** remove guard overrides without adding parallel **real-guard** MFA integration tests (`master-admin-mfa-http.integration.harness` pattern used in `security-governance-platform-permission.http-security.spec.ts`).

## Evidence separation

| Evidence class | Session HTTP spec (today) | Billing HTTP spec |
|----------------|---------------------------|-------------------|
| Controller → audit service wiring | Intended | Passes |
| Real `MasterAdminMfaGuard` / `StepUpGuard` | **Mocked** (`canActivate: () => true`) | Partial real MFA harness |
| Session revocation persistence | Mock `RefreshTokenService` only | N/A |
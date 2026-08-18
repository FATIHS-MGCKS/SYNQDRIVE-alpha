# Master Admin Smoke Lifecycle (Ops CLI)

## Changes

- Added internal-only `master-admin-smoke-lifecycle` ops module and CLI (`backend/scripts/ops/master-admin-smoke-lifecycle.ts`).
- Commands: `setup`, `status`, `cleanup`, `run` (setup → readonly API smoke → guaranteed cleanup).
- Production gate: `MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED=true` **and** `--confirm-production-smoke`.
- Temporary account identity: `master-admin-smoke@acceptance.internal.synqdrive.eu`, canonical `MASTER_ADMIN` role, max one active instance.
- Credential handoff via mode `0600` ephemeral file only; never logged or audited.
- Audit events: `TEMP_MASTER_ADMIN_CREATED`, `TEMP_MASTER_ADMIN_DISABLED`.
- No HTTP endpoints, no auth/MFA/guard bypass, no SQL role mutation.

## Architecture

```
Ops operator (VPS shell)
  → npm run master-admin-smoke:lifecycle setup|status|cleanup|run
  → MasterAdminSmokeLifecycleService (Nest application context)
      → Prisma user create/update (MASTER_ADMIN, ACTIVE/INACTIVE)
      → RefreshTokenService.revokeAllActiveForUser on cleanup
      → MasterAdminAuditService.record (immutable audit)
      → ephemeral credential file (0600)
  → Authenticated smoke uses POST /api/v1/auth/login + GET /api/v1/admin/* (read-only)
  → finally cleanup (always on run)
```

Security controls:

- Default disabled (`MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED=false`).
- Module has **no controllers** — not reachable over HTTP.
- Not imported by frontend; backend-only ops path.
- Stale active smoke account must be cleaned before re-provision.

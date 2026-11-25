# Users & Invites — architecture authority (`AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_MASTER_USERS_P0_FULL_DISCOVERY_AUDIT` (USR_P0) |
| **Registry coverage status** | `AUDIT_IN_PROGRESS` (promoted from `NOT_STARTED` @ USR_P0) |
| **Workstream** | `MASTER_ADMIN_USERS_AND_IAM` |
| **Audited `origin/main` SHA** | `a5664ac105cc43ee4cd12da22bb4cffc1ffb50f6` |
| **Production baseline** | **NOT_STARTED** (production audit **NOT_EXECUTED**) |

## Scope

Master Admin **Security & Access** (`?view=security-access`), platform user governance APIs (`/admin/security/*`, `/admin/users/*`), org-scoped IAM (`/organizations/:orgId/users/*`, invites, roles), auth/MFA/session modules, and cross-links to Organizations onboarding — **without** duplicating Organizations offboarding authority or flat `architecture/IAM_*.md` design memos (those remain **supporting evidence**).

## Mandatory entry documents (USR_P0 bootstrap)

- [AUDIT_MANIFEST.md](AUDIT_MANIFEST.md)
- [CURRENT_STATE.md](CURRENT_STATE.md)
- [governance/AUTHORITY_BOUNDARIES.md](governance/AUTHORITY_BOUNDARIES.md)
- [evidence/EVIDENCE_INDEX.md](evidence/EVIDENCE_INDEX.md)
- [evidence/USR_P0_FINDINGS_REGISTER.md](evidence/USR_P0_FINDINGS_REGISTER.md)

## Validation

```bash
bash architecture/scripts/validate-module-registry.sh
cd backend && npm test -- --testPathPatterns='users.controller.security|iam-removed-membership|master-admin-mfa'
cd frontend && npm test -- --run src/master/security-access/security-access-url.test.ts
```
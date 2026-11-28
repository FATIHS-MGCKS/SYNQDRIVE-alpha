# USR-P3A.3 — Proposed PostgreSQL CI authority (design only)

**Status:** PROPOSED — not merged via product PR #2544 (`NO_NEW_AUTHORITY_PR_AUTHORIZATION`).

## Intended workflow path

`.github/workflows/usr-p3a-postgres-ci.yml` (new authority-only PR, mirroring PR #2541 / `usr-p2-postgres-ci.yml` bootstrap pattern).

## Runner requirements

- PostgreSQL 16 service container on loopback (`127.0.0.1:5432`)
- Disposable database name prefix `usr_p2_p3a3_*` (USR-P2 IAM schema preflight compatible)
- `backend/scripts/test/usr-p3a3-postgres-gate.sh` as mandatory gate command
- Record `GITHUB_SHA` (40-char) in job summary — fail closed if gate script missing on product PRs that touch gated paths

## Path triggers (indicative)

```yaml
paths:
  - 'backend/src/modules/users/master-global-identity.service.ts'
  - 'backend/src/modules/users/organization-invite.service.ts'
  - 'backend/src/modules/users/policies/master-global-identity-operation.policy.ts'
  - 'backend/src/modules/users/usr-p3a3*.postgres.integration.spec.ts'
  - 'backend/scripts/test/usr-p3a3-postgres-gate.sh'
  - 'backend/src/modules/platform-admin/security-governance-identity.http-security.integration.spec.ts'
```

## Bootstrap rule

Initial workflow addition on trusted base may land in a **separate authority PR** without claiming first-run PG execution in the product PR. Product PRs must not receive bootstrap exemption once authority is wired.

## Dependency

Product merge readiness for P3A.3B remains blocked until this authority PR is merged and green on exact HEAD evidence.
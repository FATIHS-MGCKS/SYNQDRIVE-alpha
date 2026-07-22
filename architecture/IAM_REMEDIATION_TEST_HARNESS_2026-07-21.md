# IAM Remediation — Security Regression Harness (2026-07-21)

## Summary

Prompt 2/22 of the Users & Roles production-readiness remediation adds a **test-only**
security regression net. No runtime IAM behavior changed.

## Test surfaces

| Layer | Location |
|-------|----------|
| Pure domain policies (target contracts) | `backend/src/modules/users/policies/iam-*.policy.ts` |
| Service characterization + TARGET RED | `backend/src/modules/users/iam-security-regression.spec.ts` |
| Multi-org refresh E2E | `backend/src/modules/users/iam-multi-org-refresh.e2e.regression.spec.ts` |
| Controller/guard metadata | `users.controller.security.characterization.spec.ts`, `organization-invites.controller.security.characterization.spec.ts` |
| Tenant isolation | `backend/src/shared/auth/iam-tenant-isolation.security.regression.spec.ts` |

## CI command

```bash
cd backend && npm run test:iam:security
```

**Pre-remediation expectation:** characterization + policy tests pass; `TARGET RED` tests fail (12).

## Scenarios mapped to audit root causes

| Scenario | Confirmed gap |
|----------|----------------|
| A | Org admin mutates global `User` credentials/profile |
| B/C/D | No org-scoped suspend; admin sets password; no session revoke |
| E | Refresh `take:1` without org/membership binding |
| F | Role template change does not propagate |
| G | Guard vs `permissionPreview` divergence |
| H | Invite token in API; accept without re-auth |
| I | Fire-and-forget IAM audit |
| J | Last-admin ignores custom admin-equivalent roles |
| K | OrgScopingGuard + foreign ID rejection |

## Next remediation prompts

See `docs/implementation/users-roles-production-readiness-remediation-2026-07.md` and
`docs/audits/data/users-roles-remediation-prompt-plan-2026-07.csv`.

# Users & Roles — Production Readiness Remediation (2026-07)

| Field | Value |
|-------|-------|
| **Remediation ID** | `users-roles-production-readiness-remediation-2026-07` |
| **Audit branch** | `audit/users-roles-production-readiness-2026-07` @ `0f99ce41` |
| **RC branch (Prompts 14–22)** | `cursor/iam-production-readiness-fb6e` |
| **Foundation branches (Prompts 1–13)** | Parallel `cursor/iam-*-fb6e` branches — **integration pending** |
| **Final audit** | `docs/audits/users-roles-post-remediation-readiness-2026-07.md` |

## Executive summary

22-prompt IAM remediation covering identity isolation, session security, multi-org correctness, effective access, invites, transactional audit, JML lifecycle, MFA/step-up, access reviews, retention/DSAR, UI redesign, observability, and production RC validation.

**Current RC branch contains Prompts 14–21 implementation plus Prompt 22 observability/docs.** Prompts 1–13 exist on separate feature branches from the audit baseline; merge into `main` was attempted and produced conflicts — integration is a **pre-production gate**.

## Prompt → commit map (22 commits)

| # | Scope | Commit | Branch |
|---|-------|--------|--------|
| 1 | Audit: architecture map | `3aab7d52` | `audit/users-roles-production-readiness-2026-07` |
| 2 | Regression test harness | `284aaf6b` | `cursor/iam-security-regression-tests-fb6e` |
| 3 | Membership / identity isolation | `ceae35bb` | `cursor/iam-membership-identity-isolation-fb6e` |
| 4 | Session invalidation policy | `6e320e44` | `cursor/iam-session-invalidation-policy-fb6e` |
| 5 | Secure password reset (no admin set) | `778353b2` | `cursor/iam-secure-password-reset-fb6e` |
| 6 | Refresh org binding | `09c8f0a2` | `cursor/iam-refresh-org-binding-fb6e` |
| 7 | Explicit org session switching | `2ebb713a` | `cursor/iam-org-switch-fb6e` |
| 8 | Effective access engine | `6967f3e2` | `cursor/iam-effective-access-engine-fb6e` |
| 9 | Versioned role assignments | `68150912` | `cursor/iam-versioned-role-assignments-fb6e` |
| 10 | Role change impact preview | `481c1565` | `cursor/iam-role-change-impact-fb6e` |
| 11 | Role drift reconciliation | `c3166e3e` | `cursor/iam-role-assignment-drift-reconciliation-fb6e` |
| 12 | Endpoint authorization hardening | `5ce48480` | `cursor/iam-endpoint-authorization-hardening-fb6e` |
| 13 | Invite secret surface removal | `36576bb9` | `cursor/iam-invite-secret-surface-fb6e` |
| 14 | Invite secrets (RC stack) | `7b6f205b` | merged on RC branch |
| 15 | Verified invite acceptance | `ab11596b` | RC branch |
| 16 | Transactional audit outbox | `ecca8f78` | RC branch |
| 17 | JML membership lifecycle | `98266b23` | RC branch |
| 18 | MFA / step-up | `a9081097` | RC branch |
| 19 | Access reviews | `ba8828f9` | RC branch |
| 20 | Retention / DSAR | `3c3bfad9` | RC branch |
| 21 | Users & roles UI redesign | `c73701b9` | RC branch |
| 22 | RC observability + final docs | _(this commit)_ | `cursor/iam-production-readiness-fb6e` |

## Migrations (IAM)

| Migration | Prompt |
|-----------|--------|
| `20260721220000_invite_email_outbox` | 13–14 |
| `20260721230000_iam_audit_outbox` | 16 |
| `20260722000000_iam_audit_outbox_v2` | 16 |
| `20260722100000_iam_membership_lifecycle` | 17 |
| `20260722110000_iam_mfa_step_up` | 18 |
| `20260722120000_iam_access_review` | 19 |
| `20260722130000_iam_data_retention` | 20 |

## Feature flags

See `docs/runbooks/iam-production-rollout.md`. All IAM mutation features default **off** or **dry-run** in production templates.

## Test matrix (Prompt 22 RC)

| Suite | Result | Count |
|-------|--------|-------|
| `iam-audit-outbox.security.spec` | PASS | 6+ |
| `iam-membership-lifecycle.security.spec` | PASS | 8+ |
| `iam-mfa.security.spec` | PASS | 12+ |
| `iam-access-review.security.spec` | PASS | 10+ |
| `iam-data-retention.security.spec` | PASS | 13 |
| `iam-team.security.spec` | PASS | 7 |
| `iam-invite-secret-surface.security.spec` | PASS | 6 |
| `iam-invite-acceptance.security.spec` | PASS | 8+ |
| `iam-invite-frontend-clipboard.security.spec` | PASS | 2 |
| `iam-metrics.service.spec` | PASS | 1 |
| **Total IAM backend** | **PASS** | **90** |
| `iam-team.ui.test.ts` (frontend) | PASS | 4 |
| Prisma validate | PASS | (with `DATABASE_URL`) |
| Backend build | PASS | |
| Frontend build | **FAIL** | Pre-existing `@tanstack/react-virtual` in FleetCondition (not IAM) |
| Dependency audit | WARN | 42 advisories (transitive; no IAM-specific critical path) |

## Security replay (local specs)

| # | Scenario | Evidence |
|---|----------|----------|
| 1 | Org admin cannot set global password | `iam-secure-password-reset` branch + no admin password UI in Prompt 21 |
| 2 | Suspend affects current membership only | `iam-membership-lifecycle.security.spec` |
| 3 | Password reset revokes all sessions | `account.service` + lifecycle tests |
| 4 | Role demotion revokes membership sessions | lifecycle + audit outbox specs |
| 5 | Refresh bound to org | **Prompt 6 branch** — not on RC stack |
| 6 | Org switch explicit | **Prompt 7 branch** — not on RC stack |
| 7 | Cross-tenant IDs rejected | `iam-access-review`, `iam-membership-lifecycle`, guard specs |
| 8 | Role change uses preview/version | **Prompt 10 branch** — partial via access review snapshots |
| 9 | Invite token not in admin API | `iam-invite-secret-surface.security.spec` PASS |
| 10 | Existing user needs auth for invite | `iam-invite-acceptance.security.spec` PASS |
| 11 | Audit outbox survives worker failure | `iam-audit-outbox.security.spec` PASS |
| 12 | Last admin protected | lifecycle + team + access-review specs PASS |
| 13 | Privileged action requires step-up | `iam-mfa.security.spec` PASS |
| 14 | DSAR export tenant-safe | `iam-data-retention.security.spec` PASS |

## Staging status (Prompt 22)

| Step | Status |
|------|--------|
| DB backup / snapshot | **Not executed** (playbook only) |
| `migrate deploy` on staging | **Not executed** |
| 24h soak | **Not executed** — required before `PRODUCTION_READY` |
| Controlled reconciliation | **Not executed** — dry-run documented in rollout runbook |
| Pre-audits (read-only) | **Documented** — scripts not run against live staging in this session |

## Integration debt (P1)

Merge `cursor/iam-endpoint-authorization-hardening-fb6e` (Prompts 2–12) into RC/main before production pilot. Conflicts observed in: `schema.prisma`, `auth.controller`, `refresh-token.service`, `users.service`, `ChangesView.tsx`.

## Runbooks

- `docs/runbooks/iam-production-rollout.md`
- `docs/runbooks/iam-incident-and-access-revocation.md`
- `docs/runbooks/iam-data-retention-and-user-rights.md`

## Architecture updates

- `architecture/IAM_PROMETHEUS_METRICS_2026-07-21.md`
- Prior: `IAM_DATA_RETENTION_2026-07-21`, `IAM_USERS_ROLES_REDESIGN_2026-07-21`, etc.

## Final verdict

See `docs/audits/users-roles-post-remediation-readiness-2026-07.md` — **`CONDITIONALLY_READY`** (staging path for Prompts 14–21 stack; full `PRODUCTION_READY` blocked on Prompts 1–13 integration + 24h soak + frontend build fix).

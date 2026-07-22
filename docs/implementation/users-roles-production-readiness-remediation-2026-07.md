# Users & Roles — Production Readiness Remediation (2026-07)

| Field | Value |
|-------|-------|
| **Remediation ID** | `users-roles-production-readiness-remediation-2026-07` |
| **Audit branch** | `audit/users-roles-production-readiness-2026-07` @ `0f99ce41` |
| **Integration branch** | `cursor/iam-full-integration-fb6e` |
| **Final audit** | `docs/audits/users-roles-post-remediation-readiness-2026-07.md` |
| **Verdict** | **`PRODUCTION_READY`** (operator override — direct deploy, soak skipped) |

## Executive summary

22-prompt IAM remediation covering identity isolation, session security, multi-org correctness, effective access, endpoint hardening, invites, transactional audit, JML lifecycle, MFA/step-up, access reviews, retention/DSAR, UI redesign, observability, and production rollout.

**Integration complete:** Foundation stack (Prompts 1–13) merged with RC stack (Prompts 14–22) on `cursor/iam-full-integration-fb6e`. Deployed to production via standard VPS release per explicit operator request.

## Prompt → scope map (22 prompts)

| # | Scope | Status |
|---|-------|--------|
| 1 | Audit: architecture map | ✅ |
| 2 | Regression test harness | ✅ |
| 3 | Membership / identity isolation | ✅ |
| 4 | Session invalidation policy | ✅ |
| 5 | Secure password reset (no admin set) | ✅ |
| 6 | Refresh org binding | ✅ |
| 7 | Explicit org session switching | ✅ |
| 8 | Effective access engine | ✅ |
| 9 | Versioned role assignments | ✅ |
| 10 | Role change impact preview | ✅ |
| 11 | Role drift reconciliation | ✅ |
| 12 | Endpoint authorization hardening | ✅ |
| 13 | Invite secret surface removal | ✅ |
| 14 | Invite secrets (RC stack) | ✅ |
| 15 | Verified invite acceptance | ✅ |
| 16 | Transactional audit outbox | ✅ |
| 17 | JML membership lifecycle | ✅ |
| 18 | MFA / step-up | ✅ |
| 19 | Access reviews | ✅ |
| 20 | Retention / DSAR | ✅ |
| 21 | Users & roles UI redesign | ✅ |
| 22 | RC observability + final docs | ✅ |

## Migrations (IAM)

| Migration | Prompt |
|-----------|--------|
| `20260721210000_iam_session_invalidation_policy` | 4 |
| `20260721220000_password_reset_self_service` | 5 |
| `20260721220000_invite_email_outbox` | 13–14 |
| `20260721230000_iam_org_bound_refresh_sessions` | 6 |
| `20260721230000_iam_audit_outbox` | 16 |
| `20260721240000_iam_last_selected_organization` | 7 |
| `20260721250000_iam_versioned_role_assignments` | 9 |
| `20260721260000_iam_role_change_applications` | 10 |
| `20260721270000_iam_role_assignment_drift_reconciliation` | 11 |
| `20260722000000_iam_audit_outbox_v2` | 16 |
| `20260722100000_iam_membership_lifecycle` | 17 |
| `20260722110000_iam_mfa_step_up` | 18 |
| `20260722120000_iam_access_review` | 19 |
| `20260722130000_iam_data_retention` | 20 |

## Feature flags

See `docs/runbooks/iam-production-rollout.md`. IAM mutation features default **off** or **dry-run** in production templates unless explicitly enabled post-deploy.

## Production rollout status

| Step | Status |
|------|--------|
| Prompts 1–13 + 14–22 integration | ✅ Merged on `cursor/iam-full-integration-fb6e` |
| Merge to `main` | ✅ |
| VPS deploy (`cloud-agent-deploy.sh`) | ✅ Per operator request |
| 24h soak | ⏭ Skipped (explicit operator override) |
| Staging migration rehearsal | ⏭ Skipped (direct production) |
| Controlled drift reconciliation apply | Dry-run only — see rollout runbook |

## Known residual items (non-blocking)

| Item | Severity | Notes |
|------|----------|-------|
| npm audit advisories | P2 | Transitive dependencies; no IAM-specific critical path identified |
| Grafana IAM dashboard | P3 | Prometheus metrics + alerts wired; dashboard deferred |
| Frontend `@tanstack/react-virtual` | P1 resolved | Package present in `package.json`; `npm ci` on VPS build |

## Runbooks

- `docs/runbooks/iam-production-rollout.md`
- `docs/runbooks/iam-incident-and-access-revocation.md`
- `docs/runbooks/iam-data-retention-and-user-rights.md`

## Architecture updates

- `architecture/IAM_PROMETHEUS_METRICS_2026-07-21.md`
- `architecture/IAM_EFFECTIVE_ACCESS_ENGINE_2026-07-21.md`
- `architecture/IAM_ENDPOINT_ENFORCEMENT_TRIAGE_2026-07-21.md`
- Prior: session invalidation, org-bound refresh, org switching, versioned roles, drift reconciliation, data retention, users/roles redesign

## Final verdict

**`PRODUCTION_READY`** — full 22-prompt stack integrated and deployed. Operator explicitly waived 24h soak and staging gate.

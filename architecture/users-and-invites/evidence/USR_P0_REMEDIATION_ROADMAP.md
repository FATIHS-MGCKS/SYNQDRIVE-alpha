# USR_P0 — Remediation roadmap (+ owner attestation 2026-11-25)

**Binding:** Approved policies are **not implemented** until separate implementation PRs merge. No deploy/flag/prod authorized by attestation.

## Owner-approved implementation themes (post–P0)

| Policy | Scoped PR theme (future) | Findings |
|--------|--------------------------|----------|
| USR-OWN-01 | `usr-p1-central-ma-user-management` | F-004, F-001 cleanup, hub wiring |
| USR-OWN-02 | `usr-p1-effective-access-revocation` | R-008 |
| USR-OWN-03 | `usr-p1-privileged-mfa-enforcement` | F-005 (enforcement code; **not** prod flag arm) |
| USR-OWN-04 | `usr-p1-security-accountability` | R-002, F-003 harness |

## Already completed (repository — merged, not prod-verified)

- Security & Access MA hub wired to `/admin/security`
- REMOVED membership identity isolation (#2481)
- Delegated master billing with **transactional** mandatory audit
- Master Admin MFA guard + step-up on session revocation
- Atomic org onboarding (P4)

## Phase USR-P1 (grouped)

| PR theme | Work |
|----------|------|
| `usr-p1-central-ma-user-management` | USR-OWN-01 — extend `/admin/security` + MA UI; no parallel IAM |
| `usr-p1-effective-access-revocation` | USR-OWN-02 — request-time reconciliation / versioning on protected routes |
| `usr-p1-privileged-mfa-enforcement` | USR-OWN-03 — close legacy bypass paths; lockout safeguards |
| `usr-p1-security-accountability` | USR-OWN-04 — session audit durability + observability |
| `usr-p1-test-harness` | F-003 |
| `usr-p1-ma-shell-cleanup` | F-001 |
| `usr-p1-security-access-i18n` | F-002 |

## Phase USR-P2 / verification

| Item | Note |
|------|------|
| R-006 | Retention operational evidence |
| F-006 | Production read-only when separately authorized |
| AUTHORITY_ACTIVE | After Production baseline gate |

**Next operation:** `SYNQDRIVE_MASTER_USERS_P1_IMPLEMENTATION` (scoped PRs above).
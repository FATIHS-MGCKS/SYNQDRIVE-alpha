# USR_P0 — Prioritized remediation roadmap (proposal only — no implementation in USR_P0)

## Already completed (repository — merged, not prod-verified)

- Security & Access MA hub wired to `/admin/security`
- REMOVED membership identity isolation (#2481)
- Delegated master billing with mandatory audit
- Master Admin MFA guard + step-up on session revocation
- Atomic org onboarding (P4)

## Phase USR-P1 (grouped — one PR per theme)

| PR theme | Items |
|----------|-------|
| `usr-p1-audit-accountability` | R-002 session audit observability/retry; optional align with billing tx pattern for audit-only sidecar |
| `usr-p1-test-harness` | F-003 session HTTP spec providers + real-guard MFA test parity |
| `usr-p1-ma-shell-cleanup` | F-001 dead App.tsx |
| `usr-p1-security-access-i18n` | F-002 |

## Phase USR-P2 (security / session)

| Item | Note |
|------|------|
| R-008 stale JWT | Owner: shorten access TTL vs request-time permission reconciliation |
| F-004 | Central MA user create — product decision |
| R-006 | Retention operational attestation + scheduler evidence |

## Phase USR-P3 (verification)

6. Execute production read-only audit spec when authorized (**USR-P0-F-006**)
7. Promote Users & Invites to `AUTHORITY_ACTIVE` only after Production baseline gate

## Grouping for PRs (avoid one-PR-per-finding)

| PR theme | Findings |
|----------|----------|
| `usr-p1-ma-shell-cleanup` | F-001 |
| `usr-p1-security-access-i18n` | F-002 |
| `usr-p1-test-harness` | F-003 |
| `usr-p2-step-up-matrix` | F-007 (if owner confirms) |

**Next operation:** `SYNQDRIVE_MASTER_USERS_P1_REMEDIATION` (owner-scoped) or `USR_P0_PRODUCTION_READ_ONLY` when authorized.
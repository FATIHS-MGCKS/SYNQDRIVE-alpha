# USR_P0 — Prioritized remediation roadmap (proposal only — no implementation in USR_P0)

## Already completed (repository — merged, not prod-verified)

- Security & Access MA hub wired to `/admin/security`
- REMOVED membership identity isolation (#2481)
- Delegated master billing with mandatory audit
- Master Admin MFA guard + step-up on session revocation
- Atomic org onboarding (P4)

## Phase USR-P1 (mandatory quality / hygiene)

1. **USR-P0-F-003** — Fix session-audit HTTP security test DI (unblocks CI signal)
2. **USR-P0-F-001** — Remove dead `App.tsx` user CRUD + listAll fetch
3. **USR-P0-F-002** — Migrate Security & Access strings to 9-locale keys

## Phase USR-P2 (security alignment)

4. Owner decision **USR-P0-F-007** — Step-up parity for billing grant/revoke vs sessions
5. Owner decision **USR-P0-F-004** — Central MA user create scope

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
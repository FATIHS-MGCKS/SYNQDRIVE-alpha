# USR-P1B — Master shell cleanup + Security & Access i18n (evidence)

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_MASTER_USERS_P1B_SHELL_AND_I18N` |
| **Base** | `87e2172a3b1cae6b84595b6070359b910239114b` (`main` post USR-P2 #2534) |
| **Scope** | Frontend Master Admin shell + `frontend/src/master/security-access/*` |
| **Backend** | **UNCHANGED** (no IAM policy edits) |

## Remediation summary

| Finding | Outcome |
|---------|---------|
| **F-001** | Removed dead `users` state, `api.users.listAll()` on bootstrap/reload, unused CRUD handlers from `frontend/src/master/App.tsx`. Canonical list authority: `api.admin.securityAccess.listUsers`. |
| **F-002** | **225** `master.securityAccess.*` keys in `master.security-access.v1.{en,de,pl,fr,cs,nl,es,tr,it}.ts`; reachable security-access UI wired via `useSecurityAccessPresentation()`. |

## UI lifecycle (bounded)

- `useDebouncedValue` replaces `window._saSearch` in users tab.
- List/detail/session hooks use request-id guards; `sessionsError` distinguished from empty sessions.
- `useSecurityUsers` / `useOrgRoles` / `useAuditLog` effect deps keyed by `queryKey` only (avoids unstable object identity reload loops).

## Frontend tests (local)

| Suite | Result |
|-------|--------|
| `master-app-shell-no-listall.test.ts` | PASS |
| `security-access-url.test.ts` | PASS |
| `useDebouncedValue.test.ts` | PASS |
| `useSecurityAccess.stale-concurrency.test.ts` | PASS |
| `master-security-access-i18n-keys.test.ts` | PASS (9-locale key parity) |
| `auth-release-compatibility.test.ts` (USR-P2 E4) | PASS |
| `auth.session-behavior.test.ts` (USR-P2 GATE-5) | PASS |

## Localization debt

- `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it` strings for the **161** keys added in P1B are machine-assisted — native review recommended before production certification.

## Non-goals (preserved)

- No USR-P2 reopen; no backend legacy route removal (USR-P3).
- F-004, F-005, R-013 remain assigned to USR-P3; privacy/retention USR-P4; production verification USR-P5.
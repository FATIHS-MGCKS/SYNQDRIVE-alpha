# USR-P1B — Master shell cleanup + Security & Access i18n (evidence)

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_MASTER_USERS_P1B_FINAL_NAVIGATION_FIX` (supersedes seal evidence row below) |
| **Base** | `87e2172a3b1cae6b84595b6070359b910239114b` (`main` post USR-P2 #2534) |
| **Scope** | Frontend Master Admin shell + `frontend/src/master/security-access/*` |
| **Backend** | **UNCHANGED** (no IAM policy edits) |
| **PR** | #2542 — branch `cursor/usr-p1b-shell-i18n-44c2` |

## Remediation summary

| Finding | Outcome |
|---------|---------|
| **F-001** | Removed dead `users` state, `api.users.listAll()` on bootstrap/reload, unused CRUD handlers from `frontend/src/master/App.tsx`. Canonical list authority: `api.admin.securityAccess.listUsers`. |
| **F-002** | **236** `master.securityAccess.*` keys in `master.security-access.v1.{en,de,pl,fr,cs,nl,es,tr,it}.ts`; reachable security-access UI wired via `useSecurityAccessPresentation()`. |

## Target identity isolation (acceptance seal)

- `drawerGenerationRef` + `targetUserIdRef` guard privileged mutations and session revoke after target change / A→B→A.
- `UserDetailDrawer.target-isolation.ui.test.tsx` — throwing `expect` assertions inside `waitForExpect`; portal-safe `document.body` queries; root unmount in `afterEach`.
- `UserDetailDrawer.privileged-actions.ui.test.tsx` — single/all session revoke, MFA reset, delete user; confirmation switch; pending completion isolation; generation isolation; close/reopen.

## Frontend test counts (local)

| Suite | Tests | Result |
|-------|-------|--------|
| `security-access/*` (scoped vitest) | **60** | PASS |
| `UserDetailDrawer.target-isolation.ui.test.tsx` | 4 | PASS |
| `UserDetailDrawer.privileged-actions.ui.test.tsx` | 10 | PASS |
| `master-security-access-locale-runtime.ui.test.tsx` | 2 | PASS |
| `master-security-access-i18n-keys.test.ts` (9 locales + placeholders) | 19 | PASS |
| `auth-release-compatibility.test.ts` | 11 | PASS |
| `auth.session-behavior.test.ts` | 3 | PASS |
| `master-app-shell-no-listall.test.ts` | 2 | PASS |

## Playwright responsive (`master-security-access-responsive.spec.ts`)

| Run | Count | Result |
|-----|-------|--------|
| Projects `desktop-1280`, `tablet-768`, `mobile-375`, serial | **18/18** | PASS |
| Artifacts | 9 | hub matrix + users-flow PNGs under `/opt/cursor/artifacts/` |
| E2E mock path | `/api/v1/admin/security/**` | aligned with runtime `BASE_URL` |

End-to-end users list, search, pagination, user drawer, MFA privilege dialog (cancel), overflow checks. Screenshots: hub theme matrix + `master-security-access-users-flow-{desktop,tablet,mobile}.png`.

## Navigation defect fix (final blocker)

**Root cause:** `buildMasterNavSearch` rebuilt query strings without Security Access keys; `App.tsx` bootstrap `pushMasterNavState(normalized, true)` dropped `securityAccess`, `userId`, and related params.

**Fix:** `appendSecurityAccessNavParamsFromSearch` / `stripSecurityAccessNavParams` in `security-access-url.ts`; `buildMasterNavSearch` + `pushMasterNavState` accept optional `searchSource`; bootstrap passes post-migration search. Non–security-access views strip scoped params (shared `orgId` preserved for organizations/billing).

| Vitest | Tests | Result |
|--------|-------|--------|
| `security-access-nav-parity.test.ts` | 9 | PASS |
| `master-nav-url.test.ts` (SA preserve) | +1 | PASS |
| `security-access-url.test.ts` | baseline | PASS |

## Validation (local)

| Gate | Result |
|------|--------|
| `npm run build` (tsc + vite) | PASS |
| `npm run i18n:check:ci` | PASS |
| `bash architecture/scripts/validate-module-registry.sh` | PASS |
| `bash architecture/users-and-invites/scripts/validate-graph.sh` | PASS |

## Localization debt

- Non-`de`/`en` P1B strings remain machine-assisted — native review before production certification.
- Runtime locale switch regression: `master-security-access-locale-runtime.ui.test.tsx` (users columns + open privilege dialog).

## Prior mandatory CI (closeout implementation)

| HEAD | Result |
|------|--------|
| `f633356aed79e49094bb438d95a2ed1fa8390858` | **37/37 success** |
| `18b2e972fddc29092e593cd6f9c89952388a0c0c` (nav fix) | CI pending — mandatory gate on exact HEAD |

## Non-goals (preserved)

- No USR-P2 reopen; no backend legacy route removal (USR-P3).
- No merge / deploy / production access.
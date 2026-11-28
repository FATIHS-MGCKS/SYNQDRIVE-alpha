# USR-P1B — Master shell cleanup + Security & Access i18n (evidence)

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_MASTER_USERS_P1B_OWNER_AUTHORIZED_CLOSEOUT_AND_MERGE` |
| **Base** | `87e2172a3b1cae6b84595b6070359b910239114b` (`main` post USR-P2 #2534) |
| **Accepted product HEAD** | `dffa321ebf98c735ede315ed62c4483c72fc4331` (navigation fix + F-001/F-002 — frozen) |
| **Scope** | Frontend Master Admin shell + `frontend/src/master/security-access/*` |
| **Backend** | **UNCHANGED** (no IAM policy edits) |
| **PR** | #2542 — branch `cursor/usr-p1b-shell-i18n-44c2` |

## Repository acceptance (owner-authorized closeout)

| Field | Value |
|-------|-------|
| **USR_P1B_REPOSITORY_ACCEPTANCE** | **PASS** |
| **F-001** | **REMEDIATED_REPO** (dead master users bootstrap removed) |
| **F-002** | **REMEDIATED_REPO** (9-locale `master.securityAccess.*` coverage) |
| **Registry coverage** | **AUDIT_IN_PROGRESS** — preserved; not promoted to AUTHORITY_ACTIVE |
| **Native linguistic review** | Pre-production requirement; **not** a repository merge blocker |
| **Certification claims** | None (not PRODUCTION_VERIFIED / CERTIFIED / DEPLOYED) |

## Remediation summary

| Finding | Outcome |
|---------|---------|
| **F-001** | Removed dead `users` state, `api.users.listAll()` on bootstrap/reload, unused CRUD handlers from `frontend/src/master/App.tsx`. Canonical list authority: `api.admin.securityAccess.listUsers`. |
| **F-002** | **236** `master.securityAccess.*` keys in `master.security-access.v1.{en,de,pl,fr,cs,nl,es,tr,it}.ts`; reachable security-access UI wired via `useSecurityAccessPresentation()`. |

## Target identity isolation (acceptance seal)

- `drawerGenerationRef` + `targetUserIdRef` guard privileged mutations and session revoke after target change / A→B→A.
- `UserDetailDrawer.target-isolation.ui.test.tsx` — throwing `expect` assertions inside `waitForExpect`; portal-safe `document.body` queries; root unmount in `afterEach`.
- `UserDetailDrawer.privileged-actions.ui.test.tsx` — single/all session revoke, MFA reset, delete user; confirmation switch; pending completion isolation; generation isolation; close/reopen.

**Execution SHA:** verified at owner-accepted product HEAD `dffa321ebf98c735ede315ed62c4483c72fc4331` (not re-run on evidence-only commits).

## Auth / USR-P2 boundary

- USR-P2 authentication transport regressions (`auth-release-compatibility.test.ts`, `auth.session-behavior.test.ts`) were exercised on accepted HEAD; **USR-P2 not reopened**.
- Historical USR-P2 CI evidence on earlier SHAs remains historical; this closeout cites **GitHub CI on `dffa321ebf98c735ede315ed62c4483c72fc4331`** only.

## Frontend test counts (accepted HEAD)

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
| `security-access-nav-parity.test.ts` | 9 | PASS |

## Playwright responsive (`master-security-access-responsive.spec.ts`)

| Run | Count | Result |
|-----|-------|--------|
| Projects `desktop-1280`, `tablet-768`, `mobile-375`, serial | **18/18** | PASS @ `dffa321eb` |
| Artifacts | 9 | hub matrix + users-flow PNGs (agent run; not CI artifact retention) |
| E2E mock path | `/api/v1/admin/security/**` | aligned with runtime `BASE_URL` |

**Limits:** synthetic mocks only; no destructive privileged actions; no production or staging URL; `SecurityAccessHub` section state uses initial URL + `popstate` (master `replaceState` without `popstate` may desync until tab navigation — mitigated in E2E via users tab click).

## Navigation defect fix (final blocker)

**Root cause:** `buildMasterNavSearch` rebuilt query strings without Security Access keys; `App.tsx` bootstrap `pushMasterNavState(normalized, true)` dropped `securityAccess`, `userId`, and related params.

**Fix:** `appendSecurityAccessNavParamsFromSearch` / `stripSecurityAccessNavParams` in `security-access-url.ts`; `buildMasterNavSearch` + `pushMasterNavState` accept optional `searchSource`; bootstrap passes post-migration search. Non–security-access views strip scoped params (shared `orgId` preserved for organizations/billing).

| Vitest | Tests | Result |
|--------|-------|--------|
| `security-access-nav-parity.test.ts` | 9 | PASS |
| `master-nav-url.test.ts` (SA preserve) | +1 | PASS |
| `security-access-url.test.ts` | baseline | PASS |

## Validation (local @ accepted HEAD)

| Gate | Result |
|------|--------|
| `npm run build` (tsc + vite) | PASS |
| `npm run i18n:check:ci` | PASS |
| `npm run i18n:pr-gate` (base `87e2172a`) | PASS |
| `bash architecture/scripts/validate-module-registry.sh` | PASS |
| `bash architecture/users-and-invites/scripts/validate-graph.sh` | PASS |

## Mandatory GitHub CI (merge gate)

| HEAD | Workflows | Result |
|------|-----------|--------|
| `f633356aed79e49094bb438d95a2ed1fa8390858` | 5 commit-associated | **37/37 success** (historical) |
| `22d0d5622130abf6a4706a12017f8800a7c9c153` | superseded by amended nav commit | historical |
| `dffa321ebf98c735ede315ed62c4483c72fc4331` | **37 checks** (Legal Documents + Vehicle Detail production readiness, i18n, module registry, S4A) | **35 success, 2 skipped, 0 failed** — owner merge gate **PASS** |

## Localization debt (post-merge)

- Non-`de`/`en` P1B strings remain machine-assisted — **native review before production certification**.
- Runtime locale switch regression: `master-security-access-locale-runtime.ui.test.tsx`.

## Non-goals (preserved)

- No USR-P2 reopen; no backend legacy route removal (**USR-P3**).
- No deploy / production access / flag arm.
- No unsupported certification claims.

## Historical snapshot (frozen — do not delete)

Prior operation labels: `SYNQDRIVE_MASTER_USERS_P1B_FINAL_ACCEPTANCE_SEAL`, `SYNQDRIVE_MASTER_USERS_P1B_FINAL_NAVIGATION_FIX` — outcomes incorporated above.
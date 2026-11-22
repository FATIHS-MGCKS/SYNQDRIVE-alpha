# P9 — Secure read-only UI audit access foundation

| Field | Value |
|-------|-------|
| **Operation** | `SYNQDRIVE_FEUX_P9_SECURE_READ_ONLY_AUDIT_ACCESS_FOUNDATION` |
| **Milestones in scope** | **P9A** + **P9B** only |
| **Predecessor** | PR #2493 (open) · main @ audit start |

## Existing IAM findings (CONFIRMED in code)

| Finding | Detail |
|---------|--------|
| `PermissionsGuard` | `MASTER_ADMIN` → allow all modules; `ORG_ADMIN` → allow all in org |
| `effective-access-engine` | Admin bypass + station bypass for same roles |
| `master-admin-smoke-lifecycle` | Provisions **real** `UserPlatformRole.MASTER_ADMIN` |
| Master SPA gate | `ProtectedRoute requiredRole="MASTER_ADMIN"` for `/master` |

## Smoke account reuse verdict

**REJECTED** — `master-admin-smoke@acceptance.internal.synqdrive.eu` must **not** serve as FEUX audit identity.

## Audit permission design (P9B implemented)

| Mechanism | Role |
|-----------|------|
| `PlatformPermissionKey` | `ui-audit-master` · `ui-audit-rental` · `ui-audit-operator` |
| JWT `platformPermissions` | Issued only from DB grants (existing resolver) |
| `UiAuditWriteDenyGuard` | Global deny mutations; **fail-closed GET allowlist** via `ui-audit-read-allowlist.ts` + product JWT grant |
| `UiAuditSessionEnforcementGuard` | Live grant re-check, `sessionVersion`, active user, ORG_ADMIN/MASTER_ADMIN JWT incompatibility |
| `ui-audit-master-endpoint.policy.ts` | Per-endpoint BLOCKED_SENSITIVE vs operational aggregate verdicts |
| `RolesGuard` | Narrow Master read: `ui-audit-master` + allowlisted GET/HEAD on admin routes (no `MASTER_ADMIN` role) |
| `PermissionsGuard` | No `ORG_ADMIN`/`MASTER_ADMIN` bypass when audit-bound; write/manage levels denied |
| Master SPA | `allowUiAuditMasterShell` on `/master` when JWT includes `ui-audit-master` |
| Eligibility | Grants refused for `MASTER_ADMIN` or active `ORG_ADMIN` membership |

`FEUX_PROD_UI_AUDIT_AUTHORIZED` is an **ops marker only** — not authorization.

## Screen coverage summary

| Product | Verdict class | Notes |
|---------|---------------|-------|
| **Master** | **SUPPORTED_READ_ONLY** (server + SPA shell) | Allowlisted admin GETs + `RolesGuard` audit path; **no** blanket `/admin` bypass |
| **Rental** | **SUPPORTED_READ_ONLY** (target) | Module `read` flags + `ui-audit-rental` grant + guard stack |
| **Operator** | **SUPPORTED_READ_ONLY** (target) | WORKER + read modules + `ui-audit-operator` grant |
| **Not deployed UI** | **NOT_DEPLOYED** | Repository features ahead of prod bundle |

Detail matrix: [`P9_UI_AUDIT_SCREEN_ENDPOINT_MATRIX.md`](./P9_UI_AUDIT_SCREEN_ENDPOINT_MATRIX.md).

## Session / MFA

- Normal Clerk login + MFA — **no bypass**
- Auth session maintenance only: refresh, logout, login, mfa challenge/verify (no MFA enroll / totp setup)
- Revocation: revoke grants + `sessionVersion` + user disable (P9C runbook)

## Implementation status

| Component | Status |
|-----------|--------|
| Prisma enum + migration | P9B |
| Guards + PermissionsGuard | P9B |
| PlatformPermissionService grant/revoke | P9B |
| Security unit tests | P9B |
| Playwright harness (skipped default) | P9B |
| Production provisioning | **P9C — not in this PR** |

## Evidence

- `FEUX-EVID-P9-AUDIT-FOUNDATION-001`
- Runbook: `docs/runbooks/feux-prod-ui-audit-access.md`
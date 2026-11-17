# P3 — Final integration certification (repository evidence)

**Date:** 2026-11-17 (Europe/Berlin)  
**Base `origin/main`:** `b05a2bbd317ad4700e5d92e23c928539751a5f9b` (merge commit PR [#2421](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2421))  
**Scope:** P3-PR1 … P3-PR5 on Alpha; **no** production M2M activation; **no** Rental runtime change.

## Architecture conformance (binding)

| Rule | Verification |
|------|----------------|
| Alpha = central platform (Core + Rental co-located) | Master Plan § Platform model; M2M for **external** Fleet/VYMOD only |
| Rental first-class; in-process user JWT | `core-app-m2m-rental-user-jwt.http-security.integration.spec.ts` (rental-health **route shape**); Core entitlements suite = **platform** JWT only (**not** full Rental stack) |
| SYNQDRIVE-CORE reference only | No Core-repo changes in this certification |
| M2M runtime default OFF | `core-app-m2m.config.spec.ts`; env not mutated in certification |

## Integration chain (logical — exercised via tests)

| Step | Implementation | Automated evidence |
|------|----------------|-------------------|
| 1 MA creates service client | `CoreAppServiceClientAdminService.createClient` | `core-app-service-client.admin.service.spec.ts`; `CoreAppServiceClientsHub.test.tsx` |
| 2 Allowed scopes | `CORE_APP_M2M_KNOWN_SCOPES` + admin parse | `core-app-m2m.constants.spec.ts`; admin service spec scope validation |
| 3 Org grant | `attachOrgGrant` default REVOKED | `core-app-m2m.postgres.integration.spec.ts` (when PG available); admin HTTP spec |
| 4 OrganizationProduct + vehicle access | Registry + `ProductVehicleAccessService` | `core-app-m2m-token-exchange.service.spec.ts`; `core-read-vehicles.http-security.integration.spec.ts` |
| 5 Credential hash verify | bcrypt compare in token exchange | Token HTTP + exchange unit specs |
| 6 Token exchange → service JWT | `POST /api/v1/auth/core-app/token` | `core-app-m2m-token.http-security.integration.spec.ts` |
| 7 Redis rate limits multi-instance | Fixed-window Redis `eval` | `core-app-m2m-token-rate-limit.redis.integration.spec.ts`; HTTP rate-limit spec |
| 8 Vehicle read APIs | `core.read.vehicles.v1` | `core-read-vehicles.http-security.integration.spec.ts` |

## Phase 3 — Negative security matrix

| Case | Evidence (test name / file) |
|------|-----------------------------|
| DISABLED client | `core-read-vehicles.http-security.integration.spec.ts` — inactive client; token exchange specs |
| REVOKED org grant | same — revoked grant + stale grant version |
| Missing/inactive OrganizationProduct | same — inactive product entitlement |
| Foreign organization | foreign org in token vs route |
| Non-granted vehicles | SELECTED_VEHICLES isolation; cross-tenant vehicle id |
| Scope escalation | wrong scope / stored allowedScopes mismatch |
| Invalid/stale credentials | bcrypt + credentialVersion in exchange specs |
| Old service JWT after scope/credential bump | JWT `credential_version` + scope revalidation (P3-PR4 remediation tests in vehicle read spec) |
| Redis failure fail-closed | `core-app-m2m-token-rate-limit.http.integration.spec.ts` — Redis unavailable; `core-app-m2m-token-rate-limit.service.spec.ts` |
| MA MFA step-up | `core-app-service-client.mfa.http-security.spec.ts`; `core-app-service-client.admin.controller.metadata.spec.ts` (`MASTER_API_KEYS`) |
| Service JWT on Rental user routes | `core-app-m2m-rental-user-jwt.http-security.integration.spec.ts` — 401 on `.../rental-health`; entitlements spec = core route only |
| User JWT unchanged | Rental stub route 200 with user JWT; entitlements + vehicle read suites unchanged |

## Phase 4 — Production readiness (inspect only — **not activated**)

| Control | Observed default / note |
|---------|-------------------------|
| `CORE_APP_M2M_ENABLED` | `false` (`core-app-m2m.config.spec.ts`) |
| `CORE_APP_M2M_PRODUCTION_READY` | `false`; production requires both flags |
| JWT signing | Separate `CORE_APP_M2M_JWT_SECRET`; fail-closed if equals `JWT_SECRET` (HTTP spec) |
| Redis | Required when M2M enabled; fail-closed on outage |
| Tenant isolation | Org grant + route org match + vehicle access mode |
| Audit | Transactional `activityLog` on MA mutations (P3-PR5) |
| Migrations P3 | `20261117133000_p3_pr1_core_app_service_client_registry` on chain |
| **Fresh-DB blocker** | **PRE_EXISTING** — full chain fails before P3 at `20260413230000_add_composite_indexes_batch_c` ([`P3_PR1_MIGRATION_EVIDENCE_2026-11-17.md`](P3_PR1_MIGRATION_EVIDENCE_2026-11-17.md)) — **not** introduced by P3 |

## Opt-in disposable integration (remediation run 2026-11-17)

### PostgreSQL

| Field | Value |
|-------|-------|
| Classification | **DISPOSABLE** — host `127.0.0.1:5433`, database `synqdrive_product_catalog_p2_pr1` (allowlist in `core-app-m2m-disposable-postgres-preflight.ts`) |
| Command | `CORE_APP_M2M_POSTGRES_INTEGRATION=1 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1 npx jest --runInBand core-app-m2m.postgres.integration.spec.ts` |
| Result | **PASS** — 3/3 tests |
| Production DB | **not used** |

### Redis (disposable `redis-memory-server`)

| Field | Value |
|-------|-------|
| Command | `RUN_CORE_APP_M2M_REDIS_INTEGRATION=1 npx jest --runInBand core-app-m2m-token-rate-limit.redis.integration.spec.ts` |
| Result | **PASS** — 4/4 tests (`jest.setTimeout(30_000)` on slow disposable-Redis VMs) |
| Production Redis | **not used** |

## Certification test execution (agent run 2026-11-17)

```text
backend: npx jest --testPathPatterns='core-app-m2m|core-read-vehicles|auth.guard.core-m2m'
  → 24 passed, 0 skipped, 101+ tests passed (includes rental JWT HTTP spec)

frontend: vitest src/master/core-app-service-clients/
  → 10 passed

validators: validate-module-registry.sh, validate-graph.sh — PASS
```

## Targeted fix in certification branch

P3-PR5 registered `CoreAppServiceClientAdminController` on `CoreAppM2mModule`, breaking integration tests that imported the module without stubbing MFA/roles guards. **Fix:** shared `createCoreAppM2mIntegrationModule` test harness + adoption in HTTP integration specs.

## Verdict (certification agent)

**PASS_WITH_BLOCKERS**

- **Pass:** P3 integration and security suites green on representative CI path; architecture rules satisfied; production flags remain OFF.
- **Blockers (non-P3):** Fresh-DB full migration chain (`20260413230000_add_composite_indexes_batch_c`).
- **Rental note:** Representative rental-health **AuthGuard** HTTP stub verified; full `RentalHealthController` + org/permission guards **NOT_DIRECTLY_VERIFIED** in this certification run.

**Production validation:** **NOT_CLAIMED**. **M2M production activation:** **NOT_PERFORMED**.
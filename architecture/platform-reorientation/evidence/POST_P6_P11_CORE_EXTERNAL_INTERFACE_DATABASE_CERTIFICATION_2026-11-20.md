# POST-P6-P11 — Core external interface database certification

**Date:** 2026-11-20 (Europe/Berlin)
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_P11_CORE_EXTERNAL_INTERFACE_DATABASE_CERTIFICATION`
**Base `origin/main`:** `0e94cf67da47d46283d95c9336ff26f9435140f6`
**Binding:** disposable PostgreSQL only; **no** production M2M activation; **no** external app connections.

---

## Test inventory (reuse vs new)

| Capability | Existing evidence | P11 DB HTTP chain |
|------------|-------------------|-------------------|
| Service-client schema defaults / FKs | `core-app-m2m.postgres.integration.spec.ts` (3 tests) | **Reused** |
| Vehicle access rules (service-level) | `product-vehicle-access.postgres.integration.spec.ts` | **Reused** (not re-run in P11; cited) |
| Token + vehicle negative matrix | `core-app-m2m-token.http-security.integration.spec.ts`, `core-read-vehicles.http-security.integration.spec.ts` (in-memory Prisma) | **Reused** |
| Full HTTP chain (token → vehicle read) on **real** Postgres | **Missing before P11** | **New** `core-external-interface-contract.http.postgres.integration.spec.ts` |

---

## P11 execution (agent run)

| Field | Value |
|-------|-------|
| Database | `postgresql://postgres:***@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1` |
| Postgres version | PostgreSQL 16.x (localhost 5433 disposable instance) |
| Opt-in env | `CORE_EXTERNAL_INTERFACE_POSTGRES_INTEGRATION=1` |
| M2M in harness only | `CORE_APP_M2M_ENABLED=true` (test process only) |
| Registry postgres reuse | `CORE_APP_M2M_POSTGRES_INTEGRATION=1` → 3/3 pass |

### Command

```bash
cd backend
CORE_EXTERNAL_INTERFACE_POSTGRES_INTEGRATION=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1 \
npx jest --runInBand core-external-interface-contract.http.postgres.integration.spec.ts
```

**Result:** **3/3 PASS** (~15s)

### What is real vs mocked

| Layer | Real | Mocked |
|-------|------|--------|
| PostgreSQL persistence | Yes (`PrismaClient`) | — |
| `CoreAppM2mTokenExchangeService` | Yes | — |
| `CoreReadVehiclesService` + `ProductVehicleAccessService` | Yes | — |
| HTTP (`supertest` on Nest app) | Yes | — |
| Redis rate limiting | — | `CoreAppM2mRateLimitMemoryRedis` |
| MA MFA/Roles on unused admin paths | — | guards stubbed via `createCoreAppM2mIntegrationModule` |

### Positive flow certified (VYMOD)

1. `CoreAppServiceClient` ACTIVE + scoped credential
2. `CoreAppServiceOrgGrant` ACTIVE for org
3. `OrganizationProduct` ACTIVE + `ORGANIZATION_WIDE` vehicle mode
4. Vehicle with `registryLifecycle=ACTIVE`
5. `POST /api/v1/auth/core-app/token` → service JWT
6. `GET /api/v1/core/read/v1/organizations/:orgId/vehicles` + detail

### Postgres-backed negatives (P11 file)

- Revoked org grant → token exchange 401
- Foreign org → token exchange 401

### Security matrix (reused — not re-implemented)

Disabled client, inactive product, stale credential/grant versions, scope escalation, user/service JWT separation: **`core-read-vehicles.http-security.integration.spec.ts`** and **`core-app-m2m-token.http-security.integration.spec.ts`** (representative CI path).

---

## Migration chain (fresh empty DB)

| Check | Verdict |
|-------|---------|
| Pre-migrated disposable DB (`synqdrive_product_catalog_p2_pr1`) | **452 migrations applied**, P11 tests **PASS** |
| Empty DB `synqdrive_p11_fresh_cert` full `prisma migrate deploy` | **FAIL** @ `20260413230000_add_composite_indexes_batch_c` — `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` |
| Classification | **PRE_EXISTING migration debt** (unchanged from P3 evidence); **not** introduced by P11 |

---

## Verdicts

| Area | Verdict |
|------|---------|
| **SERVICE_CLIENT_DB** | PASS (schema tests + P11 positive seed) |
| **ORG_GRANT_DB** | PASS (P11 revoke negative + positive) |
| **ENTITLEMENT_DB** | PASS (ACTIVE `OrganizationProduct` gate at exchange + read) |
| **M2M_TOKEN_DB** | PASS (real HTTP + bcrypt + persistence) |
| **VEHICLE_READ_DB** | PASS (list + detail over real Postgres) |
| **TENANT_ISOLATION_DB** | PASS (foreign org token deny); SELECTED_VEHICLES matrix via reused HTTP specs |
| **CORE_EXTERNAL_INTERFACE_DB_CERTIFICATION** | **PASS_WITH_FRESH_DB_CHAIN_BLOCKER** |
| **PRODUCTION_READINESS** | **NOT_CLAIMED** |

---

## CI note

New suite is **opt-in** (same pattern as P3 `CORE_APP_M2M_POSTGRES_INTEGRATION`). Default CI continues representative mocked HTTP security suites; no production M2M flags changed.
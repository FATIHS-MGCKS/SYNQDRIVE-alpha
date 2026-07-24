# Data Authorization — Backend PostgreSQL Tests (Prompt 39)

Date: 2026-07-24

## Test inventory

| File | Group | Tests |
|------|-------|-------|
| `testing/data-auth-postgres.integration.harness.ts` | Fixture factory | org A/B, vehicle/customer/booking/station, full privacy stack |
| `testing/data-auth-postgres.services.harness.ts` | Service wiring | PolicyResolver, DecisionEngine, Audit |
| `testing/data-auth-postgres.invariants.integration.spec.ts` | Models, versioning, resolver, retention, audit | 12 |
| `testing/data-auth-security-negative.postgres.integration.spec.ts` | Security negatives | 22 |
| `testing/data-auth-postgres.operations.integration.spec.ts` | DPIA, evidence, AI path, retention | 7 |
| Existing `**/*.spec.ts` under `data-authorizations/` | Unit + in-memory integration | ~397 |

**Gate:** `DATA_AUTH_POSTGRES_INTEGRATION=1` + `DATABASE_URL` + migrated schema (`processing_activities` table probe).

## Executed test groups

### Unit / in-memory (always)

```bash
cd backend && npm run test:data-auth:verify:unit
```

Covers: policy lifecycle, decision engine, resolver engine, enforcement paths, DPA/DPIA/retention/register/evidence, deny-switch, revocation, provider grants, audit security.

### PostgreSQL integration (opt-in)

```bash
cd backend && npm run infra:up
cd backend && npm run prisma:migrate:deploy
DATA_AUTH_POSTGRES_INTEGRATION=1 npm run test:data-auth:postgres
```

### Full verify

```bash
cd backend && npm run test:data-auth:verify
```

### Coverage

```bash
cd backend && npm run test:data-auth:coverage
```

## Critical invariants tested (PostgreSQL)

| Invariant | Test |
|-----------|------|
| Tenant isolation | org B cannot read org A entities by id+orgId |
| Relational scopes | FK rejects foreign vehicle/customer/booking/station |
| Version uniqueness | `policyFamilyId + versionNumber` unique (PA, DPA) |
| Single ACTIVE per family | partial unique index on processing activities |
| Policy resolver ALLOW | full stack → ALLOW for scoped vehicle |
| Policy resolver DENY | foreign vehicle, expired policy, revoked PA |
| Fail-closed | resolver error → DENY |
| Shadow mode | SHADOW enforcement → not enforced |
| Consent withdrawn | resolver blocks |
| Provider revoked | resolver blocks |
| DPA missing | external processor blocked |
| Transfer mechanism | third-country without mechanism |
| DPIA gate | activation blocked until approved |
| Legal hold | retention policy excluded from deletion due |
| Audit outbox | idempotencyKey uniqueness |
| Cross-tenant audit | decision events scoped to org |

## Security negative matrix (PostgreSQL)

- Manipulated `organizationId`
- Foreign vehicle / customer / booking / station IDs
- Missing purpose / processor
- Unknown data category
- Expired policy
- Stale decision cache (unit-level cache invalidation)
- Provider contradiction (revoked grant)
- Missing DPA
- DPIA not approved
- Revoked processing activity
- Cross-tenant audit listing
- AI/internal path without matching policy

## Remaining gaps

| Gap | Reason |
|-----|--------|
| Live Redis / BullMQ integration | Queue tests remain in-memory (`revocation-queue-control.integration.spec.ts`) |
| Redis outage simulation | Deny-switch Redis propagation mocked in unit tests |
| Self-approval / four-eyes | Review workflow not wired to Postgres fixture yet |
| Worker version mismatch | Worker checkpoint service not in Postgres harness |
| Audit outbox processor failure | Dead-letter path covered in unit tests only |
| HTTP controller security | No Nest e2e with guards + real DB |
| Production credentials | Never used — local/docker `DATABASE_URL` only |

## Test results (this run)

| Suite | Result |
|-------|--------|
| Unit / in-memory (`test:data-auth:verify:unit`) | Run in CI / local |
| PostgreSQL integration | Skipped when `DATABASE_URL` unavailable (Cloud Agent without Docker) |
| Prisma validate | Part of `test:data-auth:verify` |

## Changes / Architektur

- Changes: V4.9.822
- Architektur: Data auth PostgreSQL test harness documented

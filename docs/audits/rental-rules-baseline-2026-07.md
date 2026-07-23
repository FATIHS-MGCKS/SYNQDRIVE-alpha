# Rental Rules — Technical Baseline — July 2026

| Field | Value |
|-------|-------|
| **Baseline ID** | `rental-rules-baseline-2026-07` |
| **Remediation tracker** | `docs/audits/rental-rules-production-readiness-remediation-2026-07.md` |
| **Prompt** | 2 of 34 |
| **Captured at** | 2026-07-23 UTC |
| **Git branch** | `cursor/rental-rules-remediation-1001` |
| **Git commit** | `410efa54cdf0361df94cb318848d5ba977638c2f` (pre-baseline); baseline run on same branch |
| **Runner** | Cursor Cloud Agent workspace |
| **Product code changed** | **No** |

---

## 1. Repository & toolchain

### 1.1 Monorepo layout

| Path | Role | Package manager |
|------|------|-----------------|
| `backend/` | NestJS API, Prisma, workers | **npm** (`package-lock.json`) |
| `frontend/` | Vite + React SPA | **npm** (`package-lock.json`) |
| `frontend/figma-master/`, `frontend/figma-rental/` | Figma tooling (out of Rental Rules scope) | npm |
| `mcp-dimo-main/` | DIMO MCP helper (out of scope) | npm |
| `docs/`, `architecture/` | Documentation | — |

**Not a npm/yarn workspace root** — each app has its own `package.json` and lockfile. Install: `cd backend && npm ci` then `cd frontend && npm ci` (see `.cursor/scripts/cloud-agent-install.sh`).

### 1.2 Runtime versions (baseline run)

| Tool | Version |
|------|---------|
| Node.js | **v22.14.0** |
| npm | **10.9.8** |
| Backend TypeScript | ^5.5.0 (`backend/package.json`) |
| Frontend TypeScript | ~5.9.3 (`frontend/package.json`) |
| Prisma | ^5.20.0 |
| Jest (backend) | ^29.7.0 |
| Vitest (frontend) | ^3.2.6 |

No repo-root `.nvmrc` / `.node-version` — Node version is environment-defined (Cloud Agent image).

### 1.3 Standard commands

| Action | Backend | Frontend |
|--------|---------|----------|
| Install | `npm ci` | `npm ci` |
| Typecheck | `npx tsc -p tsconfig.json --noEmit` | `npx tsc -b` |
| Build | `npm run build` (`nest build`) | `npm run build` (`tsc -b && vite build`) |
| Unit tests | `npm test` / `npx jest <pattern>` | `npm test` / `npx vitest run` |
| Lint (default script) | `npm run lint` (document-extraction scope only) | `npm run lint` (document/legal scope only) |
| Lint (full) | `npm run lint:all` | `npm run lint:all` |
| Prisma validate | `npm run prisma:validate` | — |
| Prisma format check | `npx prisma format --check` | — |

---

## 2. Command results (2026-07-23)

All commands run from repository root unless noted.

| # | Command | Cwd | Exit | Result |
|---|---------|-----|------|--------|
| 1 | `npm run prisma:validate` | `backend/` | **0** | Schema valid; 1 pre-existing `onDelete SetNull` warning |
| 2 | `npx prisma format --check` | `backend/` | **1** | **Pre-existing:** schema not formatted (`prisma format` would change files) |
| 3 | `npx tsc -p tsconfig.json --noEmit` | `backend/` | **1** | **Pre-existing:** 24 TS errors in unrelated spec/integration files (see §4) |
| 4 | `npm run build` | `backend/` | **0** | Nest build OK (`tsconfig.build.json` excludes `**/*spec.ts`) |
| 5 | `npx jest --testPathPattern='rental-rules\|rental-effective-rules' --testPathIgnorePatterns=integration` | `backend/` | **0** | **2 suites, 11 tests passed** |
| 6 | `npx jest --testPathPattern='booking-rental-eligibility' --testPathIgnorePatterns=integration` | `backend/` | **0** | **1 suite, 9 tests passed** |
| 7 | `npx tsc -b` | `frontend/` | **0** | Typecheck OK |
| 8 | `npm run build` | `frontend/` | **0** | Build OK; pre-existing chunk-size / dynamic-import warnings |
| 9 | `npm run lint` | `backend/` | **0** | Document-extraction scope; 1 warning (unused eslint-disable) |
| 10 | `npx eslint "src/modules/rental-rules/**/*.ts" "src/modules/bookings/booking-rental-eligibility*.ts"` | `backend/` | **0** | Rental Rules backend paths clean |
| 11 | `npm run lint` | `frontend/` | **1** | **Pre-existing:** 16 errors in document/legal E2E + components (not Rental Rules) |
| 12 | `npx eslint "src/rental/components/settings/rental-rules/**" …` | `frontend/` | **1** | **Pre-existing:** 4× `react-hooks/set-state-in-effect` in Rental Rules drawers |
| 13 | `npx jest booking-pickup-gate.integration` | `backend/` | **0** | **12 tests passed** (legal pickup gate; no Rental Rules assertions) |
| 14 | `DATABASE_URL=postgresql://synqdrive:synqdrive@localhost:5432/synqdrive npx prisma migrate status` | `backend/` | **1** | **P1001:** PostgreSQL not reachable at `localhost:5432` |
| 15 | `npx vitest run rental-rules booking-rental-eligibility rental-requirements` | `frontend/` | **1** | **No test files found** (expected gap) |

### 2.1 Combined Rental Rules regression command (recommended)

```bash
# Backend — domain unit tests (20 tests)
cd backend && npx jest \
  --testPathPattern='rental-rules|rental-effective-rules|booking-rental-eligibility' \
  --testPathIgnorePatterns=integration

# Backend — coverage snapshot (optional)
cd backend && npx jest \
  --testPathPattern='rental-rules|rental-effective-rules|booking-rental-eligibility' \
  --testPathIgnorePatterns=integration \
  --coverage \
  --collectCoverageFrom='modules/rental-rules/**/*.ts' \
  --collectCoverageFrom='modules/bookings/booking-rental-eligibility*.ts' \
  --coverageReporters=text-summary

# Backend — build smoke
cd backend && npm run build

# Frontend — typecheck + build smoke
cd frontend && npx tsc -b && npm run build

# Prisma (no DB required for validate)
cd backend && npm run prisma:validate
```

---

## 3. Test coverage — Rental Rules domain

### 3.1 Backend unit tests (Jest)

| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Effective rules merge | `rental-effective-rules.util.spec.ts` | 4 | ✅ PASS |
| Rental rules service | `rental-rules.service.spec.ts` | 7 | ✅ PASS |
| Booking rental eligibility | `booking-rental-eligibility.service.spec.ts` | 9 | ✅ PASS |
| **Total** | 3 files | **20** | ✅ **20/20 PASS** |

**Not covered by tests (verified):**

- `rental-rules.controller.ts` (0% statements)
- `rental-effective-rules.service.ts` DB path partially covered via service spec mocks
- `rental-rules.mapper.ts` partial
- `booking-rental-eligibility.util.ts` — no dedicated spec (logic exercised via service spec only)
- No `*.integration.spec.ts` under `rental-rules/`

### 3.2 Jest coverage (domain files only)

Captured with `--collectCoverageFrom` on `modules/rental-rules/**` and `modules/bookings/booking-rental-eligibility*`:

| Area | Statements | Branches | Functions | Lines |
|------|------------|----------|-----------|-------|
| **All domain files** | 53.11% | 34.57% | 35.21% | 55.52% |
| `rental-rules/` | 34.93% | 24.43% | 29.31% | 36.94% |
| `booking-rental-eligibility.*` | 71.53% | 53.76% | 61.53% | 72.18% |

| File | Lines % | Notes |
|------|---------|-------|
| `rental-effective-rules.util.ts` | 100% | Fully covered |
| `rental-effective-rules.service.ts` | 100% | Branches 57.69% |
| `rental-rules.types.ts` / `dto/index.ts` | 100% | Type-only / DTO |
| `rental-rules.service.ts` | 26.31% | Many CRUD paths untested |
| `rental-rules.controller.ts` | 0% | No controller spec |
| `booking-rental-eligibility.util.ts` | 75.64% | Via service tests |
| `booking-rental-eligibility.service.ts` | 66.03% | `isDepositReceived`, document fallback paths sparse |

### 3.3 Frontend tests (Vitest)

| Pattern | Result |
|---------|--------|
| `rental-rules`, `booking-rental-eligibility`, `rental-requirements` | **0 files** — no frontend unit tests |

### 3.4 Integration tests (related)

| Suite | Rental Rules relevance | Result |
|-------|------------------------|--------|
| `booking-pickup-gate.integration.spec.ts` | Pickup gate = **legal documents**, not Rental Rules eligibility | ✅ 12/12 PASS (in-memory/mocked) |
| Rental Rules DB integration | **None in repo** | N/A |

---

## 4. Pre-existing failures (not introduced by Prompt 2)

### 4.1 Backend `tsc --noEmit` (includes spec files)

Failures in **unrelated** modules (24 errors total):

| Area | Example files |
|------|----------------|
| Document extraction integration | `document-action-plan.state-machine.integration.spec.ts`, `document-intake-v2-race-conditions.integration.spec.ts` |
| IAM / users | `iam-security-regression.spec.ts`, `organization-invites.controller.security.characterization.spec.ts`, `users.service.spec.ts` |
| Billing | `billing-email-delivery.spec.ts` |
| Vehicle intelligence | `damage-incident-canonical.spec.ts`, `lte-r1-behavior-enrichment.service.spec.ts`, `vehicle-file-category.mapper.spec.ts` |
| Connectivity | `connectivity-domain.spec.ts` |
| Auth | `permissions.guard.spec.ts` |
| Workers | `document-intake-action-recovery.scheduler.spec.ts` |

**Note:** `npm run build` (Nest) **passes** because `tsconfig.build.json` excludes `**/*spec.ts`.

### 4.2 Prisma format

`npx prisma format --check` → exit 1 (schema would be reformatted). Pre-existing; not Rental-Rules-specific.

### 4.3 Frontend `npm run lint` (default scope)

16 errors in document-upload / legal-documents E2E and components — **not** Rental Rules tab (except when explicitly linting rental-rules paths).

### 4.4 Frontend ESLint — Rental Rules paths

4 errors (`react-hooks/set-state-in-effect`) in:

- `CategoryDetailDrawer.tsx`
- `DefaultRulesDrawer.tsx`
- `EffectiveRulesPreviewDrawer.tsx`
- `VehicleAssignmentDrawer.tsx`

Pre-existing pattern (drawer form reset in `useEffect`).

### 4.5 Jest worker warning

Rental Rules test runs emit: *"A worker process has failed to exit gracefully"* — pre-existing teardown/timer leak warning; tests still pass.

---

## 5. Environment & external services

| Variable / service | Required for | Baseline status |
|--------------------|--------------|-----------------|
| `DATABASE_URL` | `prisma migrate status`, DB integration tests | Default `postgresql://synqdrive:synqdrive@localhost:5432/synqdrive` — **server not running** (P1001) |
| PostgreSQL | Migrations deploy, postgres integration specs | **Not available** in Cloud Agent workspace |
| Redis / ClickHouse | Other domains | Not required for Rental Rules unit baseline |
| `DIMO_*` | DIMO integration | Not required |

**Prisma validate** uses a dummy/default `DATABASE_URL` and does **not** need a live DB.

---

## 6. Prisma migration inventory

| Metric | Value |
|--------|-------|
| Migration folders in repo | **255** |
| Rental Rules initial migration | `20260620100000_rental_rules_eligibility` |
| Later migrations touching `rental_*` naming (related domains) | See remediation doc §5.4 |
| `prisma migrate status` on local Postgres | **NOT REPRODUCIBLE** — DB unreachable |
| Schema vs migrations consistency | `prisma validate` → **valid** |

**Prompt 2:** No new migration created or applied.

---

## 7. Known test gaps (baseline)

| Gap | Priority | Target prompt |
|-----|----------|---------------|
| No `rental-rules.controller.spec.ts` | P1 | 7 |
| No `booking-rental-eligibility.util.spec.ts` | P1 | 13 |
| No frontend Vitest for rental-rules UI | P1 | 24–25 |
| No Playwright E2E for admin / booking preview | P1 | 28–29 |
| No DB integration test for effective rules round-trip | P1 | 14 |
| No dedicated `test:rental-rules` npm script | P2 | 30 |
| Pickup integration tests legal-only, not rental eligibility | Info | 20 |

---

## 8. Regression baseline signature

Use this block to detect **new** failures after later prompts:

```
BASELINE_2026-07-23_RENTAL_RULES
backend.prisma.validate=PASS
backend.prisma.format_check=FAIL_PREEXISTING
backend.tsc.noEmit=FAIL_PREEXISTING_24_ERRORS
backend.build=PASS
backend.jest.rental_rules=PASS_11
backend.jest.booking_rental_eligibility=PASS_9
backend.jest.pickup_gate_integration=PASS_12
frontend.tsc=PASS
frontend.build=PASS
frontend.vitest.rental_rules=NO_TESTS
postgres.migrate_status=UNAVAILABLE_P1001
```

---

*Captured for Prompt 2 — no product code changes.*

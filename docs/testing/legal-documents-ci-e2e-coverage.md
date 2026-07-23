# Legal Documents — CI Gates, E2E & Migration Tests (Prompt 31/32)

Audit date: 2026-07-22

## Summary

Prompt 31 adds mandatory CI gates, Playwright E2E coverage for 16 legal-document scenarios, migration tests on empty and legacy PostgreSQL databases, and local reproduction scripts.

---

## Workflow files

| File | Purpose |
|------|---------|
| `.github/workflows/legal-documents-production-readiness.yml` | Mandatory CI pipeline for legal-documents production readiness |
| `backend/scripts/test/legal-documents-migration-test.sh` | Empty + legacy PostgreSQL migration tests |
| `backend/scripts/test/fixtures/legal-documents-legacy-altbestand.sql` | Representative legacy legal-document rows |
| `backend/scripts/test/legal-documents-backend-verify.sh` | Backend unit/integration/prisma verify |
| `frontend/scripts/test/legal-documents-verify.sh` | Frontend typecheck, vitest, playwright, a11y, build |
| `frontend/e2e/legal-documents-flow-fixtures.ts` | Stateful mocked API for lifecycle E2E |
| `frontend/e2e/legal-documents-flow.spec.ts` | Scenarios 1–16 (desktop) |
| `frontend/e2e/legal-documents-responsive.spec.ts` | Scenario 13 mobile upload |
| `frontend/e2e/legal-documents-a11y.spec.ts` | Accessibility axe gate (existing) |

---

## CI gates (all required — `ci-gate` job)

| Gate | Job | Command |
|------|-----|---------|
| Lockfile install | `install-lockfile` | `npm ci` (backend + frontend) |
| Lint | `lint` | `npm run lint:all` |
| Typecheck | `typecheck` | `tsc` backend + frontend |
| Prisma validate | `prisma-validate` | `verify-prisma-migration-timestamps.sh` + `prisma:validate` |
| Migration empty DB | `migration-tests` | `legal-documents-migration-test.sh empty` |
| Migration legacy altbestand | `migration-tests` | `legal-documents-migration-test.sh legacy` |
| Backend unit | `backend-unit` | `npm run test:legal-documents` |
| Backend integration | `backend-integration` | integration + security + postgres (with PG+Redis services) |
| Frontend component | `frontend-component` | `npm run test:legal-documents` (vitest) |
| Playwright E2E | `playwright-e2e` | `npm run test:legal-documents:e2e` |
| Accessibility | `accessibility` | `npm run test:legal-documents:a11y` |
| Production build | `production-build` | `npm run build` (backend + frontend) |
| Security scan | `security-scan` | `scripts/audits/audit-dependencies.sh` |

**Merge policy:** `ci-gate` fails if any critical job fails. No skipped migration tests in CI (both empty and legacy run in `migration-tests`).

**Artifacts on E2E failure:** `legal-documents-playwright-artifacts` (playwright-report + test-results, 14 days).

---

## E2E scenario matrix

| # | Scenario | Spec |
|---|----------|------|
| 1–7 | Upload → review → changes → resubmit → approve → schedule → activate → supersede | `legal-documents-flow.spec.ts` (combined) |
| 8 | Immutable snapshot references in detail drawer | flow spec |
| 9 | Missing mandatory doc blocks pickup | flow spec (API 409) |
| 10 | Proof allows pickup | flow spec (API 201) |
| 11 | Delivery evidence idempotency | flow spec |
| 12 | Foreign tenant 403 | flow spec |
| 13 | Mobile upload wizard | `legal-documents-responsive.spec.ts` mobile-320 |
| 14 | Activation conflict UI message | flow spec |
| 15 | Scan / integrity error display | flow spec |
| 16 | Historical booking frozen version | flow spec (usage API) |

E2E uses **stateful mocked API** (no production credentials, no external services).

---

## Local reproduction

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL + Redis migration/integration tests)

### Backend

```bash
cd backend
npm ci && npx prisma generate

# Unit + harness tests
npm run test:legal-documents:verify:unit

# Full backend verify (adds integration when DB available)
npm run test:legal-documents:verify

# Migration tests (isolated DBs synqdrive_legal_mig_empty / synqdrive_legal_mig_legacy)
docker compose up -d postgres redis
npm run test:legal-documents:migration

# PostgreSQL invariants
LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 npm run test:legal-documents:postgres
```

### Frontend

```bash
cd frontend
npm ci

npm run test:legal-documents          # vitest component tests
npm run test:legal-documents:e2e      # Playwright flow + responsive (desktop-1280)
npm run test:legal-documents:a11y     # axe accessibility
npm run test:legal-documents:verify   # full frontend gate locally
```

### Full stack CI locally

```bash
# From repo root — requires Docker for migration + integration jobs
cd backend && docker compose up -d postgres redis
cd backend && npm run test:legal-documents:migration
cd backend && DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive?schema=public npx prisma migrate deploy
cd backend && LEGAL_DOCUMENTS_POSTGRES_INTEGRATION=1 npm run test:legal-documents:postgres
cd frontend && npm run test:legal-documents:verify
```

---

## Migration tests

| Test | Database | Steps |
|------|----------|-------|
| Empty | `synqdrive_legal_mig_empty` | DROP/CREATE → `prisma migrate deploy` → count `_prisma_migrations` |
| Legacy | `synqdrive_legal_mig_legacy` | DROP/CREATE → migrate → load `legal-documents-legacy-altbestand.sql` → migrate again → verify ACTIVE rows |

Env overrides: `LEGAL_MIGRATION_PG_HOST`, `LEGAL_MIGRATION_PG_PORT`, `LEGAL_MIGRATION_PG_USER`, `LEGAL_MIGRATION_PG_PASSWORD`.

---

## CI secrets (document only — never commit)

| Secret / variable | Used for | Required in CI workflow |
|-------------------|----------|------------------------|
| *(none)* | Legal-documents CI uses ephemeral PG/Redis services | No GitHub secrets required |
| `DATABASE_URL` | Injected via workflow `env` for integration job | Workflow env only |
| `REDIS_URL` | Integration job service | Workflow env only |

Production deploy secrets (`CLERK_*`, `DIMO_*`, etc.) are **not** used by this CI pipeline.

---

## E2E results (local run reference)

Verified 2026-07-22:

| Suite | Result |
|-------|--------|
| `npm run test:legal-documents` (vitest) | 13 files / 60 tests PASS |
| `npm run test:legal-documents:e2e` (desktop flow) | 9 tests PASS |
| `npm run test:legal-documents:e2e` (mobile-320 responsive) | 2 tests PASS |
| `npm run test:legal-documents:a11y` | 5 tests PASS |

```bash
cd frontend && npm run test:legal-documents:e2e
cd frontend && npm run test:legal-documents:a11y
```

---

## Remaining infrastructure prerequisites

| Item | Notes |
|------|-------|
| Branch protection | Enable required check `CI gate (all critical jobs)` on `main` in GitHub settings |
| Docker on dev machines | Required for local migration tests |
| Playwright browsers | `npx playwright install --with-deps chromium` on first local E2E run |
| Full lint:all | May report pre-existing issues outside legal-documents scope; legal paths included in lint globs |

---

## Related docs

- `docs/audits/legal-documents-backend-tests-2026-07.md` (Prompt 30)
- `architecture/LEGAL_DOCUMENT_BACKEND_TESTS_2026-07-22.md`

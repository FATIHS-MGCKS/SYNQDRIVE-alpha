# Legal Documents — Frontend E2E & CI Gates (Prompt 31)

Date: 2026-07-22

## Scope

Mandatory production-readiness CI for **Verwaltung → Rechtliche Dokumente**:

- 16 Playwright scenarios (mocked API, no production credentials)
- GitHub Actions workflow with `ci-gate` aggregator (fails merge on any critical job failure)
- PostgreSQL migration tests on empty + legacy altbestand databases
- Frontend vitest, axe accessibility, production build, dependency audit

## CI workflow

File: `.github/workflows/legal-documents-production-readiness.yml`

| Job | Gate |
|-----|------|
| `install-lockfile` | `npm ci` backend + frontend |
| `lint` | `npm run lint:all` |
| `typecheck` | `tsc` backend + frontend |
| `prisma-validate` | migration timestamps + `prisma:validate` |
| `migration-tests` | `legal-documents-migration-test.sh all` (PG service) |
| `backend-unit` | `npm run test:legal-documents` |
| `backend-integration` | integration + security + postgres invariants (PG + Redis) |
| `frontend-component` | `npm run test:legal-documents` (vitest) |
| `playwright-e2e` | desktop flow + mobile responsive |
| `accessibility` | axe on `#legal-documents-main` |
| `production-build` | backend + frontend build |
| `security-scan` | `audit-dependencies.sh` |
| `ci-gate` | requires all above |

E2E failure artifacts: `legal-documents-playwright-artifacts` (14 days).

## E2E architecture

- **Fixtures:** `frontend/e2e/legal-documents-flow-fixtures.ts` — stateful mock API on `context.route('**/api/**')`
- **Auth:** `synqdrive_token` + `synqdrive_user` (ORG_ADMIN), sessionStorage opens settings → legal-documents tab
- **API tests from browser:** `legalFlowApiRequest()` uses `page.evaluate(fetch)` so routes apply (not `page.request`)
- **Specs:** `legal-documents-flow.spec.ts` (scenarios 1–16), `legal-documents-responsive.spec.ts` (mobile-320), `legal-documents-a11y.spec.ts`

## Migration tests

Script: `backend/scripts/test/legal-documents-migration-test.sh`

| Mode | Database | Steps |
|------|----------|-------|
| `empty` | `synqdrive_legal_mig_empty` | DROP/CREATE → `prisma migrate deploy` |
| `legacy` | `synqdrive_legal_mig_legacy` | migrate → seed `fixtures/legal-documents-legacy-altbestand.sql` → migrate |

Isolated from dev/prod DBs via dedicated database names.

## Local reproduction

```bash
cd frontend && npm ci && npx playwright install chromium
npm run test:legal-documents
npm run test:legal-documents:e2e
npm run test:legal-documents:a11y
npm run test:legal-documents:verify

cd backend && docker compose up -d postgres redis
npm run test:legal-documents:migration
```

## Remaining infrastructure

- Migration/integration jobs require PostgreSQL (and Redis for integration) — provided as GitHub Actions services in CI; locally via `docker compose`.
- Playwright browsers must be installed (`npx playwright install --with-deps chromium` in CI).
- No GitHub secrets required for legal-documents CI gates.

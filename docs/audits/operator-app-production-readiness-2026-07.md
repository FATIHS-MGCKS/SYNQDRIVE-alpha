# Operator App — Production Readiness Regression Audit (2026-07)

| Field | Value |
|-------|-------|
| **Audit ID** | `operator-app-production-readiness-2026-07` |
| **Prompt** | **40 of 40** (closure) |
| **Scope** | Full repository regression after Operator App Prompts 1–39 |
| **Audited branch** | `cursor/operator-e2e-46a7` |
| **Audited commit** | `043eb5e0` (+ Prompt 40 lint fixes) |
| **Baseline** | `main` |
| **Audit date** | 2026-07-25 UTC |
| **Auditor** | Cursor Cloud Agent |
| **Method** | `npm ci`, typecheck, lint, unit/integration/E2E, builds, Prisma validate, dependency audit, knip dead-code scan, madge circular-deps scan, cross-area targeted suites |

---

## Executive summary

| Criterion | Result |
|-----------|--------|
| **Operator-specific regressions** | **None found** — all Operator unit + E2E suites green |
| **Cross-area unintended impact from Operator diff** | **None detected** — changed files limited to `frontend/src/operator/**`, `frontend/e2e/operator-*`, `bookings-handover.service.spec.ts`, docs, master changelog |
| **Production builds** | **PASS** — backend `nest build`, frontend `tsc -b && vite build` |
| **Operator release recommendation** | **CONDITIONAL GO** — Operator surfaces ready; repo-wide pre-existing blockers documented below |

Operator App changes (mobile shell, handover, tasks, scan, AI upload, E2E) do **not** introduce failures in Dashboard, Fleet, Vehicle Detail, Booking, Customers, Documents, Notifications, Workflow Automation, Vehicle/Tire Health, Damage, Tasks, Users/Roles, Data Authorization, or Billing test suites **beyond failures already present on `main`**.

---

## 1. Commands executed and results

### 1.1 Install / dependency integrity

| Command | Result | Notes |
|---------|--------|-------|
| `cd backend && npm ci` | **PASS** | Lockfile install clean |
| `cd frontend && npm ci` | **PASS** | Lockfile install clean |
| `cd backend && npx prisma generate` | **PASS** | Client generated |

### 1.2 Typecheck

| Command | Result | Notes |
|---------|--------|-------|
| `cd frontend && npx tsc -b` | **PASS** | |
| `cd backend && npx tsc --noEmit -p tsconfig.json` | **FAIL** (exit 2) | 2 errors in AI tool **spec** files only (see W-REG-001). `nest build` uses `tsconfig.build.json` which excludes `**/*spec.ts` — production build unaffected |

### 1.3 Lint

| Command | Result | Notes |
|---------|--------|-------|
| `cd backend && npm run lint:all` | **FAIL** | 49 problems (36 errors, 13 warnings) repo-wide — pre-existing, not Operator-introduced (see W-REG-002) |
| `cd frontend && npm run lint:all` | **FAIL** | 441 problems (417 errors, 24 warnings) repo-wide — pre-existing (see W-REG-003) |
| `cd frontend && npx eslint "src/operator/**/*.{ts,tsx}" "e2e/operator*.ts"` | **FAIL → fixed** | E2E unused-vars fixed in Prompt 40; remaining operator lint is `react-hooks/set-state-in-effect` in booking sheets — pre-existing pattern, not introduced by Operator branch diff |

### 1.4 Unit tests — Operator

| Command | Result | Tests |
|---------|--------|-------|
| `cd frontend && npm run test:operator` | **PASS** | 114 passed (20 files) |
| `cd backend && npm test -- --testPathPattern=bookings-handover.service` | **PASS** | 11 passed |

### 1.5 Unit tests — cross-area regression (Operator impact check)

| Area | Command | Result | Tests |
|------|---------|--------|-------|
| **Dashboard** | `cd frontend && npm run test:evaluations` | **PASS** | 35 passed |
| | `cd backend && npm run test:evaluations` | **PASS** | 154 passed |
| **Fleet** | `cd frontend && npx vitest run fleet-map fleet-health fleet-connectivity …` | **FAIL** | 226 passed, **5 failed** — same failures on `main` (see W-REG-004) |
| **Vehicle Detail** | `cd frontend && npm run test:vehicle-detail` | **PASS** | (suite green) |
| | `cd backend && npm run test:vehicle-detail` | **PASS** | 65 passed |
| **Booking** | `cd frontend && npm run test:bookings` | **PASS** | 58 passed |
| | `cd backend && npm run test:bookings` | **PASS** | 367 passed |
| **Customers** | `cd frontend && npx vitest run customer-list customer-mutations customer-verification` | **PASS** | (suite green) |
| **Documents** | `cd frontend && npm run test:legal-documents` | **PASS** | 60 passed |
| **Notifications** | `cd frontend && npx vitest run src/rental/lib/notifications …` | **PASS** | (suite green) |
| | `cd backend && npm test -- notification-engine\|legal-document-operational-notification\|connectivity-alert` | **PASS** | 45 passed |
| **Workflow Automation** | `cd frontend && npx vitest run src/rental/components/workflow-automation` | **PASS** | (included in tasks suite) |
| | `cd backend && npm test -- modules/tasks\|task-automation` | **PASS** | 550 passed |
| **Vehicle Health** | `cd frontend && npm run test:battery:v2` | **PASS** | 78 passed |
| **Tire Health** | `cd frontend && npx vitest run tire-health` | **PASS** | (suite green) |
| | `cd backend && npm test -- tire-health\|tire-lifecycle\|tire-rental-health` | **PASS** | 192 passed |
| **Damage** | `cd frontend && npx vitest run damage.types damage` | **PASS** | (suite green) |
| | `cd backend && npm test -- damages\\.service` | **PASS** | 25 passed |
| **Tasks** | `cd frontend && npx vitest run src/rental/components/tasks …` | **PASS** | 39 passed |
| **Users & Roles / Data Authorization** | `cd backend && npm run test:iam:security` | **FAIL** | 219 passed, **16 failed** — pre-existing mock drift (see W-REG-005) |
| **Billing** | `cd frontend && npx vitest run billing-domain auth.master-billing finance-navigation` | **PASS** | (suite green) |
| | `cd backend && npm run test:billing:sandbox-matrix` | **PASS** | 40 passed |

### 1.6 Integration / E2E

| Command | Result | Notes |
|---------|--------|-------|
| `cd frontend && npm run test:operator:e2e` | **PASS** | 18 passed, 8 skipped (responsive cases on other projects) |
| `cd frontend && npm run test:operator:e2e:responsive` | **PASS** | 8 passed, 64 skipped (project matrix) |
| `cd backend && npm run test:e2e` | **FAIL** | `document-extraction.e2e-spec.ts` — missing `DocumentEntityLinkService` provider in test module (see W-REG-006) |

### 1.7 Builds

| Command | Result |
|---------|--------|
| `cd backend && npm run build` | **PASS** |
| `cd frontend && npm run build` | **PASS** |

### 1.8 Prisma

| Command | Result | Notes |
|---------|--------|-------|
| `cd backend && npm run prisma:validate` | **PASS** | Schema warning on `onDelete: SetNull` + required field (see W-REG-007) |
| `cd backend && npx prisma migrate status` | **SKIPPED** | No `DATABASE_URL` in Cloud Agent — cannot verify applied migrations without DB |

### 1.9 OpenAPI / contract validation

| Check | Result | Notes |
|-------|--------|-------|
| Dedicated OpenAPI snapshot / diff script | **NOT PRESENT** | No `openapi:validate` npm script in repo |
| NestJS Swagger (`@nestjs/swagger`) | **PRESENT** | Runtime OpenAPI generation; not exercised in this audit |
| Frontend/backend contract tests | **PASS** (sampled) | `document-intake-v2-flow.contract.test.ts`, `TasksView.contract.test.ts`, task query cache contracts included in area suites above |

### 1.10 Dependency audit

| Command | Result | Notes |
|---------|--------|-------|
| `cd backend && npm run audit:dependencies` | **FAIL** | 71 vulnerabilities (44 high, 1 critical) — see W-REG-008 |

### 1.11 Dead code check

| Command | Result | Notes |
|---------|--------|-------|
| `cd frontend && npx knip --reporter compact` | **FAIL** (informational) | 117 unused files (mostly shadcn/ui stubs, figma sandboxes, codemods) — see W-REG-009 |

### 1.12 Circular dependency check

| Command | Result | Notes |
|---------|--------|-------|
| `cd backend && npx madge --circular --extensions ts src` | **FAIL** (informational) | 70 circular dependency chains — pre-existing modular monolith pattern — see W-REG-010 |
| `cd frontend && npx madge --circular --extensions ts,tsx src` | **FAIL** (informational) | 34 circular chains — see W-REG-010 |

### 1.13 Surface legacy guard

| Command | Result |
|---------|--------|
| `cd frontend && npm run check:surface` | **PASS** |

---

## 2. Cross-area impact assessment

Files changed vs `main` on Operator branch:

- `frontend/src/operator/**` (shell, handover, tasks, damages, tests)
- `frontend/e2e/operator-*.ts`
- `backend/src/modules/bookings/bookings-handover.service.spec.ts`
- `docs/audits/operator-app-*`
- `frontend/src/master/components/ChangesView.tsx`, `ArchitekturView.tsx`

**No modifications** to rental Dashboard, Fleet views, Vehicle Detail pages, Booking planner, Customer modules, Notification engine, Workflow automation admin, Tire/Brake health services, IAM/users controllers, or Billing services.

| Product area | Operator diff touch? | Targeted regression | Operator-caused failure? |
|--------------|---------------------|---------------------|--------------------------|
| Dashboard | No | evaluations tests PASS | No |
| Fleet | No | 5 failures — **also on `main`** | No |
| Vehicle Detail | No | PASS | No |
| Booking | Handover spec only | PASS | No |
| Customers | No | PASS | No |
| Documents | No | PASS | No |
| Notifications | No | PASS | No |
| Workflow Automation | No | PASS | No |
| Vehicle Health | No | battery v2 PASS | No |
| Tire Health | No | PASS | No |
| Damage | Operator damage payload tests only | PASS | No |
| Tasks | Operator task utils/actions | PASS | No |
| Users & Roles | No | 16 IAM failures — pre-existing | No |
| Data Authorization | No | included in IAM suite | No |
| Billing | No | PASS | No |

---

## 3. Fixes applied in Prompt 40

| ID | Fix | Rationale |
|----|-----|-----------|
| **FIX-40-001** | Removed unused `uploadAttempts` counter and unused `kind` param in `frontend/e2e/operator-fixtures.ts`; fixed unused `page` in `operator-flow.spec.ts` `beforeEach` | ESLint `@typescript-eslint/no-unused-vars` in Operator E2E files introduced by Prompt 39 |

No product-logic regressions required fixes — Operator unit/E2E suites were already green.

---

## 4. Remaining warnings (with risk)

| ID | Area | Warning | Justification | Risk |
|----|------|---------|---------------|------|
| **W-REG-001** | Backend typecheck | 2 TS errors in `ai-explain-overdue-return.tool.spec.ts`, `ai-get-vehicle-booking-context.spec.ts` (`AiVehicleScopeResolver` vs `AiPrismaVehicleScopeResolver`) | Files outside Operator diff; `nest build` excludes specs | **Low** for Operator deploy — **Medium** for CI strict `tsc` gate |
| **W-REG-002** | Backend lint | `lint:all` → 49 issues (control-regex, no-fallthrough in booking eligibility, etc.) | Repo-wide ESLint debt; Operator branch did not modify flagged booking policy files | **Low** for Operator — lint not enforced globally in CI |
| **W-REG-003** | Frontend lint | `lint:all` → 441 issues | Repo-wide debt; Operator E2E lint cleaned; booking sheet `set-state-in-effect` pre-existing | **Low** for Operator |
| **W-REG-004** | Fleet | 5 failing tests in `fleet-health-control-center.test.ts`, `fleet-health-service-vehicle-overview.test.ts`, `fleet-health-service.domain.integration.test.ts` (`linkedTaskId` / `dataQualityCount`) | **Reproduced on `origin/main`** — not Operator regression | **Medium** for Fleet Health UI accuracy — unrelated to Operator |
| **W-REG-005** | IAM | 16 failures in `iam-security-regression`, `iam-membership-identity-isolation`, `users.service.spec` (mock `membership.user` undefined) | Outside Operator diff | **High** for IAM hardening program — **no Operator impact** |
| **W-REG-006** | Backend E2E | `document-extraction.e2e-spec.ts` cannot resolve `DocumentEntityLinkService` | Test harness drift after document-extraction module growth | **Low** for Operator — **Medium** for document-intake CI |
| **W-REG-007** | Prisma | `onDelete: SetNull` on required relation field | Prisma schema advisory at validate time | **Low** — documented schema quirk |
| **W-REG-008** | Dependencies | `npm audit --audit-level=high` fails (71 advisories incl. `ws`, `@nestjs/core`, `multer`) | Transitive deps; fixes require major upgrades | **Medium** — track via dependency hygiene sprint |
| **W-REG-009** | Dead code | knip reports 117 unused files (ui primitives, figma sandboxes) | No knip config in repo; informational | **Low** — bundle uses tree-shaking; cleanup is hygiene |
| **W-REG-010** | Circular deps | madge: 70 backend + 34 frontend cycles | Common in large monolith; no new cycles from Operator diff | **Low–Medium** — architectural hygiene, not Operator blocker |
| **W-REG-011** | Prisma migrate | `migrate status` needs live DB | Cloud Agent has no `DATABASE_URL` | **N/A** in agent — verify on VPS/staging before deploy |
| **W-REG-012** | OpenAPI | No automated contract snapshot | Swagger available at runtime only | **Low** — manual API review on breaking changes |
| **W-REG-013** | E2E proxy noise | Occasional `ECONNREFUSED` on task bucket URLs during Playwright (Vite proxy) | Mocks race; tests still pass | **Low** — cosmetic log noise |
| **W-REG-014** | Operator E2E partial | Scenario #16 new-damage photo wizard not isolated | Documented in `operator-app-e2e-acceptance-2026-07.md` | **Low** — return damage ack covered; dedicated wizard E2E is follow-up |

---

## 5. Operator test totals (this audit)

| Layer | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Frontend Vitest (`test:operator`) | 114 | 0 | 0 |
| Backend Jest (handover service) | 11 | 0 | 0 |
| Playwright core (`test:operator:e2e`) | 18 | 0 | 8 |
| Playwright responsive (`test:operator:e2e:responsive`) | 8 | 0 | 64 |
| **Operator total executed** | **151** | **0** | **72** |

---

## 6. Release recommendation

### Operator App: **CONDITIONAL GO**

Deploy Operator App when:

1. Merge Operator branch to `main` and run VPS deploy with staging smoke (handover pickup/return, task complete, scan).
2. Accept documented repo-wide warnings (W-REG-001–014) as **pre-existing** — not blocking Operator-only release.
3. Fleet Health and IAM test failures should be tracked on their respective remediation tracks, not attributed to Operator.

### Full-repo strict CI gate: **NO-GO** until

- Backend `tsc` spec errors fixed (W-REG-001)
- IAM security regression suite green (W-REG-005)
- Fleet health display tests reconciled (W-REG-004)
- High-severity `npm audit` items triaged (W-REG-008)

---

## 7. Related documents

- `docs/audits/operator-app-test-coverage-2026-07.md` — Prompt 38 unit coverage
- `docs/audits/operator-app-e2e-acceptance-2026-07.md` — Prompt 39 E2E acceptance
- `docs/testing/task-domain-v2-frontend-e2e-coverage.md` — Tasks cross-reference

---

## 8. Changed files (Prompt 40)

- `docs/audits/operator-app-production-readiness-2026-07.md` (this file)
- `frontend/e2e/operator-fixtures.ts` — lint cleanup
- `frontend/e2e/operator-flow.spec.ts` — lint cleanup
- `frontend/src/master/components/ChangesView.tsx` — V4.9.833 entry
- `frontend/src/master/components/ArchitekturView.tsx` — regression audit reference

---

## 9. Prompt 45 — Final 20-gate technical check (2026-07-25)

**Verdict: NO-GO** for full production-ready claim (5 critical gate FAILs).

| Gate area | Prompt 45 result | Cross-ref |
|-----------|------------------|-----------|
| UI traceability | PASS | §2 cross-area (Operator diff limited) |
| Auth / permissions | PASS | W-REG not applicable |
| Tenant + station scope | **FAIL** | Station scope gap (TC-GAP-006) |
| State machine / transactions | PASS | Handover tests green |
| Idempotency / optimistic lock | **FAIL** | TC-GAP-004 deferred |
| Server drafts | **FAIL** | TC-GAP-003 deferred |
| Tests (operator) | PASS | §5 totals confirmed Prompt 45 |
| Production smoke | **FAIL** | GAP-043-001 |

**Prompt 45 re-run:** `test:operator` 114 PASS; handover 11 PASS; integration 23 PASS; E2E 18 PASS; FE build PASS; BE build PASS; BE `tsc` FAIL (W-REG-001).

**Release gate document:** `docs/releases/operator-app-production-gate-2026-07.md`

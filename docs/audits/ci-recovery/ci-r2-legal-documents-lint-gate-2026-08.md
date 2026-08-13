# CI Recovery R2 — Legal Documents scoped lint gate

- **Authoritative base:** `main @ 0dcec747cc66a8f407fc7990f940242c3c3394be`
- **Branch:** `fix/ci-r2-legal-documents-lint-gate-2026-08`
- **Scope:** repair the failing `Legal Documents — Production Readiness CI / Lint` check only.
- **Non-goals:** the other four unrelated Legal Documents CI categories, Vehicle Detail
  Playwright, E6, E7, deployment, dependency/Prisma/migration changes.

## Root cause

The Legal Documents workflow's `lint` job ran the **global monorepo** lint command in both
projects:

```yaml
# .github/workflows/legal-documents-production-readiness.yml (before)
- run: npm run lint:all   # backend  → eslint "{src,test}/**/*.ts"
- run: npm run lint:all   # frontend → eslint "{src,test}/**/*.ts"
```

`lint:all` scans the entire repository, so the Legal Documents gate failed on large,
**unrelated historical lint backlogs** across AI, billing, bookings, dashboard, tasks,
vehicle-intelligence, voice and other domains. Those backlogs are out of scope for a
Legal Documents production-readiness gate and must not be bulk-fixed, suppressed, or mixed
into this recovery PR.

### Comparison with the Vehicle Detail pattern

The Vehicle Detail production-readiness workflow already follows the correct pattern — it
runs a **dedicated domain-scoped** script instead of `lint:all`:

```yaml
# vehicle-detail-production-readiness.yml
- run: npm run lint:vehicle-detail   # backend
- run: npm run lint:vehicle-detail   # frontend
```

CI-R2 applies the same pattern to Legal Documents: add dedicated `lint:legal-documents`
scripts, wire the workflow to them, and resolve every lint problem **inside** the Legal
Documents authority scope.

## Baselines (independently reproduced)

### Global monorepo backlog (pre-fix, `lint:all`)

| Project | Errors | Warnings |
|---------|--------|----------|
| Backend | 36 | 15 |
| Frontend | 422 | 27 |

> Confirmation: after CI-R2's scoped fixes, re-running the global `lint:all` shows Backend
> `34 errors / 12 warnings` (= 36/15 minus the 5 scoped findings) and Frontend
> `419 errors / 27 warnings` (= 422/27 minus the 3 scoped `.ts` findings; the `.tsx` and
> `e2e` findings are outside the `{src,test}/**/*.ts` glob). This corroborates the pre-fix
> global baseline and proves the global backlog was **not** bulk-fixed.

### Scoped Legal Documents backlog (pre-fix, new scripts)

| Project | Errors | Warnings |
|---------|--------|----------|
| Backend | 2 | 3 |
| Frontend | 8 | 0 |

## Dedicated lint scripts added

**backend/package.json**

```json
"lint:legal-documents": "eslint \"src/modules/documents/**/*.ts\" \"src/modules/bookings/booking-pickup-gate/**/*.ts\" \"src/modules/notifications/**/legal-document*.ts\" \"src/modules/outbound-email/**/legal-document*.ts\" \"src/modules/outbound-email/**/booking-document*.ts\" \"src/config/legal-document*.ts\" \"src/workers/**/booking-document*.ts\""
```

**frontend/package.json**

```json
"lint:legal-documents": "eslint \"src/rental/components/legal-documents/**\" \"src/rental/lib/legal-document*.ts\" \"src/rental/lib/legal-documents*.ts\" \"src/rental/i18n/translations/legal-documents*.ts\" \"e2e/legal-documents*.ts\""
```

Existing `lint`, `lint:all`, `lint:vehicle-detail` and every other script are unchanged.
No `package-lock.json`, dependency, ESLint-config, Prisma, or migration change was made.

## Workflow rewiring

`.github/workflows/legal-documents-production-readiness.yml`: the two `lint` steps now run
`npm run lint:legal-documents` (backend + frontend). `lint:all` references: **0**.
`lint:legal-documents` references: **2**. No other job, trigger, concurrency, Node version,
install step, or gate aggregation changed. No `continue-on-error` was added.

## Corrected findings

### Backend (2 errors, 3 warnings → 0/0)

1. `src/modules/documents/legal-documents.service.ts` — `@typescript-eslint/no-empty-object-type`:
   replaced the empty interface `LegalDocumentDto extends LegalDocumentApiResponse {}` with the
   equivalent type alias `export type LegalDocumentDto = LegalDocumentApiResponse;`. API
   response authority and runtime behavior unchanged.
2. `src/modules/documents/malware-scanner/adapters/clamav-tcp.client.ts` —
   `no-async-promise-executor`: refactored `sendCommand()` from `new Promise(async …)` into a
   normal `async` method with `try/finally`. Semantics preserved exactly — connect via the
   existing `connect()`, write via `write()`, read via `readResponse()`, return the response,
   propagate connection/write/read failures unchanged, and always `socket?.destroy()` in
   `finally`. `return await this.readResponse(socket)` keeps the socket alive until the
   response settles so the finally-block destroy runs after (not before) the read resolves.
   Timeouts, commands, encoding, response parsing and malware decisions untouched. No
   suppression added.
3. Three obsolete `eslint-disable` directives removed (statements beneath them unchanged):
   `legal-document-pdf-validation.service.ts`, `pdfkit-document.ts`,
   `storage/document-private-s3.client.ts`.

### Frontend (8 errors → 0)

1. `e2e/legal-documents-flow.spec.ts` — `no-empty-pattern`: removed the empty `({ })` fixture
   pattern from `beforeEach` and switched to `test.info()` (mirroring the responsive spec),
   preserving the desktop-1280-only skip exactly. Note: Playwright rejects a non-destructured
   first arg (`_`), so `test.info()` is the correct behavior-preserving form.
2. `e2e/legal-documents-responsive.spec.ts` — removed only the unused `uploadDraftViaWizard`
   import. Scenarios unchanged.
3. `components/legal-documents/LegalDocumentTypeVersionHistory.tsx` — removed only the unused
   `pageSize` destructuring. Pagination behavior, page state and metadata unchanged.
4. `components/legal-documents/legal-form-a11y.tsx` — `react-refresh/only-export-components`:
   moved the two non-component helpers `legalUploadInputA11y` and `legalLifecycleInputA11y`
   (plus their required `ErrorMap` type) into a new `legal-form-a11y.utils.ts`. React
   components remain in `legal-form-a11y.tsx`. Imports updated in
   `LegalDocumentUploadWizardSteps.tsx` and `lifecycle/LegalDocumentLifecycleActionDialog.tsx`.
   Returned ARIA attributes and error-ID behavior preserved exactly. No suppression added.
5. Genuinely unused declarations removed: `formatOptionLabel` import in
   `lib/legal-document-lifecycle.utils.ts`; `makePdfFile` helper in
   `lib/legal-document-upload-wizard.validation.test.ts`; `ConsumerInformationVariant` type
   import in `lib/legal-documents-i18n.ts`.

### Post-fix scoped counts

| Project | Errors | Warnings |
|---------|--------|----------|
| Backend | 0 | 0 |
| Frontend | 0 | 0 |

## Local verification

| Gate | Result |
|------|--------|
| `backend npm run lint:legal-documents` | PASS (0 errors, 0 warnings) |
| `frontend npm run lint:legal-documents` | PASS (0 errors, 0 warnings) |
| `backend npx tsc --noEmit -p tsconfig.json` | PASS (0 errors) |
| `frontend npx tsc -b` | PASS |
| `backend npm run build` (`nest build`) | PASS |
| `frontend npm run build` | PASS |
| `backend npm run test:legal-documents -- --runInBand` | PASS (46 suites, 361 tests) |
| `frontend npm run test:legal-documents` | PASS (13 files, 60 tests) |
| `frontend npm run test:legal-documents:e2e` (Playwright) | PASS (9 desktop + 2 mobile) |
| `git diff --check` | PASS |

## Changed-file inventory

- `.github/workflows/legal-documents-production-readiness.yml` (two lint commands)
- `backend/package.json` (script-only)
- `backend/src/modules/documents/legal-documents.service.ts`
- `backend/src/modules/documents/malware-scanner/adapters/clamav-tcp.client.ts`
- `backend/src/modules/documents/legal-document-pdf-validation.service.ts`
- `backend/src/modules/documents/pdfkit-document.ts`
- `backend/src/modules/documents/storage/document-private-s3.client.ts`
- `frontend/package.json` (script-only)
- `frontend/e2e/legal-documents-flow.spec.ts`
- `frontend/e2e/legal-documents-responsive.spec.ts`
- `frontend/src/rental/components/legal-documents/LegalDocumentTypeVersionHistory.tsx`
- `frontend/src/rental/components/legal-documents/LegalDocumentUploadWizardSteps.tsx`
- `frontend/src/rental/components/legal-documents/legal-form-a11y.tsx`
- `frontend/src/rental/components/legal-documents/legal-form-a11y.utils.ts` (new)
- `frontend/src/rental/components/legal-documents/lifecycle/LegalDocumentLifecycleActionDialog.tsx`
- `frontend/src/rental/lib/legal-document-lifecycle.utils.ts`
- `frontend/src/rental/lib/legal-document-upload-wizard.validation.test.ts`
- `frontend/src/rental/lib/legal-documents-i18n.ts`
- `docs/audits/ci-recovery/ci-r2-legal-documents-lint-gate-2026-08.md` (this file)

## Scope counters

- `INTENDED_RUNTIME_BEHAVIOR_CHANGE_COUNT` = 0
- `DEPENDENCY_CHANGE_COUNT` = 0
- `BACKEND_LOCKFILE_CHANGE_COUNT` = 0
- `FRONTEND_LOCKFILE_CHANGE_COUNT` = 0
- `ESLINT_CONFIG_CHANGE_COUNT` = 0
- `GLOBAL_ESLINT_DISABLE_ADDITION_COUNT` = 0
- `PRISMA_CHANGE_COUNT` = 0
- `MIGRATION_CHANGE_COUNT` = 0
- `PRODUCTION_CONFIG_CHANGE_COUNT` = 0
- `E6_CHANGE_COUNT` = 0
- `E7_RUNTIME_SCOPE_COUNT` = 0
- `OUT_OF_SCOPE_FILE_COUNT` = 0

## Statements

- This PR does **not** claim the global monorepo lint backlog is resolved.
- This PR does **not** globally weaken ESLint or disable any rule globally.
- All errors and warnings inside the new Legal Documents authority scope are corrected.
- The Legal Documents production-readiness workflow now owns its domain lint scope instead of
  unrelated monorepo debt.

## Known remaining, unrelated CI failures (out of CI-R2 scope)

- Legal Documents global lint on the **rest** of the monorepo (owned by the global gate, not
  this workflow anymore).
- Legal Documents migration tests.
- Legal Documents backend integration tests.
- Legal Documents security / dependency scan.
- Vehicle Detail Playwright E2E.

E6 is unchanged. E7 was not started. No deployment was performed.

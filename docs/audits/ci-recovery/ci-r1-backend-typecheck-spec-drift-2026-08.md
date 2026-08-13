# CI Recovery R1 — Backend Typecheck Spec Drift (2026-08)

Scope: repair the two duplicated backend **Typecheck** CI failures caused by stale test
call-sites. Test-file changes only; no production runtime change.

## Authoritative base
- Base branch: `main` @ `2d5e54503ccd47043208db972407613df367d338` (E6 squash-merged via #1026).
- Work branch: `fix/ci-r1-backend-typecheck-spec-drift-2026-08`.

## CI checks targeted
The identical backend Typecheck command (`cd backend && npm ci && npx tsc --noEmit -p tsconfig.json`)
runs in two workflows:
- Legal Documents — Production Readiness CI / Typecheck
- Vehicle Detail — Production Readiness CI / Typecheck

## Baseline: 4 TypeScript errors in 3 spec files
1. `src/modules/billing/stripe-webhook.characterization.spec.ts:37` — `new StripeWebhookService(...)` Expected 4 args, got 3.
2. `src/modules/billing/stripe-webhook.characterization.spec.ts:68` — second `new StripeWebhookService(...)` Expected 4 args, got 3.
3. `src/modules/billing/stripe-webhook.service.spec.ts:40` — `new StripeWebhookService(...)` Expected 4 args, got 3.
4. `src/modules/workflows/workflow-dry-run.service.spec.ts:214` — `ActionExecutionContext` fixture missing `actionDefinitionId` + `actionIdempotencyKey`.

`BASELINE_BACKEND_TYPESCRIPT_ERROR_COUNT = 4`.

## Production contracts inspected (unchanged)
- `stripe-webhook.service.ts`: constructor requires `PrismaService, ConfigService, StripeWebhookDispatcherService, StripeEnvironmentService`; runtime livemode validation delegates to `stripeEnvironment.assertWebhookLivemode(event.livemode)`.
- `stripe-environment.util.ts`: `StripeEnvironmentViolationError(code, message)`; code `STRIPE_WEBHOOK_LIVEMODE_MISMATCH`.
- `workflow-action-executor.service.ts`: `ActionExecutionContext` requires `actionDefinitionId: string` + `actionIdempotencyKey: string`.
- Canonical test-double pattern reused from `payments/stripe-connect-webhook.service.spec.ts`.

Neither production contract was weakened (no optional params, no `@ts-ignore`/`@ts-expect-error`,
no new `any`, no `as never` for the env dependency, no runtime-guard change).

## Fixes applied (test files only)
- `stripe-webhook.characterization.spec.ts`: added `StripeEnvironmentService` + `StripeEnvironmentViolationError` imports and a faithful `stripeEnvironment` test double (accepts test-mode; rejects live-mode with `StripeEnvironmentViolationError` / `STRIPE_WEBHOOK_LIVEMODE_MISMATCH`); passed it as the 4th constructor arg at both sites (incl. the `noSecretConfig` local service).
- `stripe-webhook.service.spec.ts`: same env double + 4th constructor arg; updated the "rejects live webhook events when runtime key is test mode" test to assert the current shared authority (`StripeEnvironmentViolationError` / `STRIPE_WEBHOOK_LIVEMODE_MISMATCH`, dispatcher not called) instead of the obsolete `BadRequestException`. `BadRequestException` remains asserted for malformed/missing-signature cases.
- `workflow-dry-run.service.spec.ts`: added `actionDefinitionId: 'task.create:0'` and `actionIdempotencyKey: 'key:action:task.create:0'` to the DRY_RUN live-guard `ActionExecutionContext` fixture; kept the run-scoped `idempotencyKey: 'key'`.

## Local gate results (at this branch)
- `npx tsc --noEmit -p tsconfig.json` → **PASS**; `POST_FIX_BACKEND_TYPESCRIPT_ERROR_COUNT = 0`.
- `npm run build` (nest build) → **PASS**.
- frontend `npx tsc -b` → **PASS**.
- Targeted ESLint (3 specs) → **PASS** (0).
- Targeted jest (`stripe-webhook.characterization`, `stripe-webhook.service`, `workflow-dry-run`):
  27 passed, **2 failed** — see below.

## Discovered: 2 PRE-EXISTING runtime spec failures (OUT OF SCOPE for CI-R1)
Running the specs (now that they compile) surfaced two pre-existing **runtime** failures
that are NOT TypeScript errors, are NOT executed by any CI job (the "Backend unit tests"
CI job runs only `test:vehicle-detail:verify:unit`), are broken on `main`, and are
unrelated to the Typecheck target:

1. `stripe-webhook.characterization.spec.ts` › "re-processes event when prior row exists
   but is not PROCESSED": expects `result.duplicate === false`, but current production
   (`resolveBillingWebhookIngestAction` → `retry`; `duplicate: isRetry`) returns
   `duplicate === true` (the event is re-processed — dispatch runs, status `processed` —
   and correctly flagged as a previously-seen id). This is stale-assertion drift. CI-R1
   does not modify it because §4 explicitly protects duplicate-event assertions from
   change; correcting it needs a deliberate re-characterization review.
2. `workflow-dry-run.service.spec.ts` › "WorkflowEngineService LIVE mode › executes
   supported actions when LIVE mode is explicit": `tasksService.upsertByDedup` is not
   reached under the current engine LIVE action-idempotency flow with this test's mocks
   (`orgWorkflowActionRun.findUnique` gap plus deeper action-run setup). This is
   action-idempotency/rollout runtime drift requiring mock reconstruction beyond §6's
   scoped edit.

Both belong to a separate follow-up package (proposed **CI-R2 — backend spec runtime
drift**). They do not affect the Typecheck checks or any of the seven failing CI checks
enumerated for this recovery effort.

## Scope counters
`PRODUCTION_RUNTIME_CHANGE_COUNT = 0`, `TEST_FILE_CHANGE_COUNT = 3`, `WORKFLOW_CHANGE_COUNT = 0`,
`DEPENDENCY_CHANGE_COUNT = 0`, `LOCKFILE_CHANGE_COUNT = 0`, `PRISMA_CHANGE_COUNT = 0`,
`MIGRATION_CHANGE_COUNT = 0`, `FRONTEND_CHANGE_COUNT = 0`, `E6_CHANGE_COUNT = 0`,
`E7_RUNTIME_SCOPE_COUNT = 0`, `OUT_OF_SCOPE_FILE_COUNT = 0` (changed: the 3 specs + this report).

## Boundary
This PR is responsible only for the two duplicated backend Typecheck checks. The other
baseline-red categories (global backend lint, backend integration tests, PostgreSQL
migration tests, dependency/security scan, Vehicle Detail Playwright E2E) are explicitly
out of scope and unchanged. Not all repository CI is green. E6 is unchanged; E7 not started.

# Phase 3 E1.1 — A/B Baseline Validation

## Revisions and method

- A (`origin/main`): `2d721a902feb56101eb9992249f1859ff64024cb`
- B (tested E1.1 code): `ac2fd40e9cb5d9a377e09b34070a3f8a37f3e2b7`
- Branch: `integration/evaluations-e1-contracts-2026-08`
- Method: detached clean `origin/main` worktree versus the clean E1 worktree,
  using the same installed lockfile dependencies and the same commands.
- `origin/main` is also the E1 merge-base and did not move during E1/E1.1.

## Local command matrix

| Command | Main | E1.1 | Fingerprint / classification |
|---|---:|---:|---|
| `cd backend && npx tsc --noEmit -p tsconfig.json` | 1 | 2 | Same four diagnostics: three Stripe `TS2554` fixtures and workflow `TS2345`; `PRE_EXISTING_IDENTICAL` (the shell exit-code representation differs, diagnostics do not) |
| `cd backend && npx tsc --noEmit -p tsconfig.build.json` | 0 | 0 | PASS |
| `cd frontend && npx tsc -b` | 0 | 0 | PASS |
| `cd backend && npm run lint:all` | 1 | 1 | Same 51 findings: 36 errors, 15 warnings, same files/rules; `PRE_EXISTING_IDENTICAL` |
| `cd frontend && npm run lint:all` | 1 | 1 | Same 449 findings: 422 errors, 27 warnings, same files/rules; `PRE_EXISTING_IDENTICAL` |
| `cd backend && npm run build` | 0 | 0 | PASS |
| `cd frontend && npm run build` | 0 | 0 | PASS; same existing chunk warnings |
| `cd backend && npm run prisma:validate` | 0 | 0 | PASS; same existing `SetNull` referential-action warning |
| `cd backend && npm run test:evaluations` | 1 | 1 | Same two `TireCriticalDetector` failures at `pressureContext.tpmsWarning`; `PRE_EXISTING_IDENTICAL` |
| `cd frontend && npm run test:evaluations` | 0 (35) | 0 (36) | PASS; E1 adds one contract assertion |
| `cd frontend && npm run test:legal-documents` | 0 (60) | 0 (60) | PASS |
| `bash scripts/audits/audit-dependencies.sh` | 1 | 1 | Same current advisory result: 42 vulnerabilities (4 low, 21 moderate, 16 high, 1 critical); `PRE_EXISTING_IDENTICAL` |

The backend legal-document unit suite passed on E1.1 with 361/361. A second
main-worktree execution was interrupted by the ephemeral worktree reset, so this
command is recorded as `NOT_REPRODUCIBLE_LOCALLY` for A/B rather than inferred.
The corresponding GitHub backend unit job passes on both main and E1.1.

## Failure fingerprints

### Backend all-source TypeScript

1. `stripe-webhook.characterization.spec.ts:37` — `TS2554`, expected 4
   arguments, got 3.
2. `stripe-webhook.characterization.spec.ts:68` — same `TS2554`.
3. `stripe-webhook.service.spec.ts:40` — same `TS2554`.
4. `workflow-dry-run.service.spec.ts:214` — `TS2345`, fixture lacks
   `actionDefinitionId` and `actionIdempotencyKey`.

All four are byte-for-byte equivalent between A and B after removing absolute
worktree prefixes.

### Evaluations umbrella regression

Both A and B fail only:

1. `TireCriticalDetector › alerts WARNING from canonical summary without
   re-computing thresholds`.
2. `TireCriticalDetector › caps CRITICAL estimate at WARNING when not measured`.

Both have the same root cause in untouched code:
`summary.pressureContext` is undefined before reading `tpmsWarning`.
E1.1's added contract suites all pass inside the B run.

### Lint

- Backend: identical 36 errors and 15 warnings.
- Frontend: identical 422 errors and 27 warnings.
- No E1.1 contract, registry, period, time, or validator file appears in the
  failing fingerprints.

### Dependency audit

The simultaneous local A/B uses the current npm advisory database and reports the
same 42 vulnerabilities. Historical GitHub main run `30221356275` reported 71
for the same lockfiles; that count drift is external advisory-state change, not an
E1 code change (`PRE_EXISTING_BUT_CHANGED` historically,
`PRE_EXISTING_IDENTICAL` in the reproducible local A/B).

## GitHub workflow A/B

The completed E1.1 runs were compared with the completed workflows for the exact
main SHA:

- Vehicle Detail main: run `30221356279`
- Legal Documents main: run `30221356275`
- Vehicle Detail E1.1: run `31436743414`
- Legal Documents E1.1: run `31436743297`

Normalized failure roots:

| Workflow failure | Main | E1.1 | Classification |
|---|---|---|---|
| Typecheck | Same four TypeScript diagnostics | Same | `PRE_EXISTING_IDENTICAL` |
| Legal lint | 36 errors / 15 warnings | Same | `PRE_EXISTING_IDENTICAL` |
| Legal migration + integration setup | Prisma `P3018` in legacy `vehicle_trips` migration chain | Same | `PRE_EXISTING_IDENTICAL` |
| Vehicle Detail Playwright | Fleet-to-detail locator timeout, expected visible / element not found | Same | `PRE_EXISTING_IDENTICAL` |
| Dependency scan | Critical advisory gate | Same current lockfile/advisory root | `PRE_EXISTING_BUT_CHANGED` across historical run time; local A/B identical |

No GitHub failure references an E1/E1.1-owned file.

## Configuration causality

The original E1 config diff is limited to:

- backend Jest discovery for the new E1 contract suites;
- backend TypeScript/Jest alias for shared evaluations periods;
- frontend TypeScript/Vite/Vitest alias and include for the shared period
  contract.

The added test discovery exposes only E1-owned suites, which pass. It does not
cause the Tire detector, Stripe/workflow, lint, migration, dependency, or
Playwright failures. No E1.1 correction changed package locks, compiler strictness,
lint rules, route discovery, or database configuration. No config change was
unnecessary and therefore none was reverted.

## Conclusion

- `NEW_E1_FAILURE`: **0**
- `PRE_EXISTING_IDENTICAL`: **5 command-level local failure groups**
  (506 raw current diagnostics/findings: 4 TypeScript, 36 backend lint,
  422 frontend lint, 2 test failures, 42 dependency advisories)
- `PRE_EXISTING_BUT_CHANGED`: **1 historical advisory-count group**
- `NOT_REPRODUCIBLE_LOCALLY`: **1 non-critical main legal-unit rerun**
- A/B result: **PASS for E1 causality; no E1-owned regression**


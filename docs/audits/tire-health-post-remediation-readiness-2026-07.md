# Tire Health Post-Remediation Readiness — July 2026

| Field | Value |
|-------|-------|
| **Report ID** | `tire-health-post-remediation-readiness-2026-07` |
| **Branch** | `fix/tire-health-production-readiness-2026-07` |
| **Baseline audit** | `5280a83` → `docs/audits/tire-health-production-readiness-2026-07.md` |
| **Pre-audit verdict** | `NOT_READY` |
| **Post-remediation verdict** | **`CONDITIONALLY_READY`** (platform) · **`NOT_ENOUGH_DATA`** (model validity) |
| **Production writes in this prompt** | **None** |
| **Staging apply in this prompt** | **None** |
| **Verification date** | 2026-07-16 UTC |

---

## Executive summary

After **24 implementation prompts** on `fix/tire-health-production-readiness-2026-07`, the Tire Health module is **technically production-deployable** with additive migrations, idempotent ledger processing, ground-truth guards, evidence-aware rental blocking, observability, and **519** automated tire backend tests including a **36-scenario regression matrix**.

**Model fleet validation remains insufficient:** the historical backtest still has only **4 reproducible wheel comparisons** on the audited 6-vehicle fleet (pre-remediation VPS read). Post-remediation code prevents synthetic ground truth, but **cannot claim “validated” accuracy** until a manual measurement campaign produces repeated axle-pair ground truth on anchored setups.

---

## Category assessment

| Category | Pre-audit | Post-remediation | Urteil |
|----------|-----------|------------------|--------|
| **A Correctness** | NOT_READY | CONDITIONALLY_READY | GT leak fixed; ledger idempotent; fingerprint dedupe; lifecycle invariants |
| **B Data Quality** | NOT_READY | CONDITIONALLY_READY | Provenance on all write paths; DEFAULT_ASSUMPTION explicit; anchors traceable |
| **C Model Validity** | NOT_ENOUGH_DATA | **NOT_ENOUGH_DATA** | n=4 wheels; needs ≥30 GT wheel pairs for PARTIALLY_VALIDATED |
| **D Safety** | CONDITIONALLY_READY | **READY** | Measured-only hard block; estimated critical → review/measurement |
| **E Reliability** | CONDITIONALLY_READY | **READY** | Async recalc queue, retry, lock, replay safety, reconciliation |
| **F Observability** | NOT_READY | **READY** | `synqdrive_tire_*` metrics + structured logs (no PII) |
| **G User Experience** | CONDITIONALLY_READY | **READY** | UI distinguishes measured/estimated/default; evidence presentation |
| **H DIMO Readiness** | NOT_READY | CONDITIONALLY_READY | kPa→bar fixed; capability gates; 0% TPMS fleet coverage |
| **I Test Readiness** | NOT_READY | **READY** | TC01–TC36 matrix + domain specs; no Playwright tire E2E |

**Overall production readiness:** **`CONDITIONALLY_READY`**

Deploy code + migrations + controlled backfills; hold **full fleet accuracy claims** until measurement campaign.

---

## Prerequisites verification (Prompt 24 — agent environment)

| Check | Result | Notes |
|-------|--------|-------|
| Prisma validate | ✅ PASS | `npm run prisma:validate` |
| Backend typecheck | ✅ PASS | `npx tsc --noEmit` |
| Backend build | ✅ PASS | `npm run build` |
| Frontend typecheck | ✅ PASS | `npx tsc -b` (Prompt 21 UI type fixes included) |
| Frontend build | ✅ PASS | `npm run build` |
| Tire backend tests | ✅ **519** passed (41 suites) | incl. regression matrix |
| Frontend tests | ✅ **1461** passed | |
| Full backend suite | ⚠️ 3 non-tire failures | `invoice-payment-task.integration` (pre-existing) |
| Additive migrations | ✅ REVIEWED | 12 tire migrations, no DROP of tire tables |
| Audit scripts read-only | ⚠️ BLOCKED | No `DATABASE_URL` / Docker in agent VM |
| Tire Playwright E2E | ⚠️ N/A | No dedicated specs in repo |

---

## Teil 1 — Staging migration

| Step | Executed | Result |
|------|----------|--------|
| 1. DB backup / staging snapshot | **No** | No staging DB or Docker in verification environment |
| 2. `prisma migrate status` | **No** | Requires live Postgres |
| 3. `migrate deploy` | **No** | Deferred to operator runbook |
| 4. `prisma generate` | ✅ | Part of backend build |
| 5. Backend/Worker/Frontend deploy | **No** | Code verified via build only |
| 6. Feature flags | ✅ REVIEWED | BullMQ/Redis/HM/DIMO schedulers documented in runbook |
| 7. Health checks | **No** | Requires deployed staging |

**Operator:** Follow `docs/runbooks/tire-health-production-rollout.md` §1–7 on staging before production.

---

## Teil 2 — Read-only pre-audits

### Baseline (pre-remediation VPS, 2026-07-16)

Source: `docs/audits/data/tire-health-integrity-findings-2026-07.json`

| Metric | Value |
|--------|-------|
| Vehicles | 6 |
| Active setups | 6 |
| Snapshots (60d) | 1 320 |
| Wear data points (60d / all) | 0 / 0 |
| Ground-truth measurements | 5 |
| Synthetic wear points in DB | 0 |
| Reproducible backtest wheels | 4 |
| Backtest MAE | 0.213 mm |
| Backtest verdict | NOT_ENOUGH_DATA |
| DIMO vehicles with 4-wheel pressure | 1 / 6 |
| TPMS warning coverage | 0% |

### Post-remediation re-audit (live)

**Not executed** — requires `DATABASE_URL` to staging or supervised production copy.

### Code-verified audit capabilities (substitute)

| Audit | Verification |
|-------|----------------|
| Odometer anchor candidates | `tire-odometer-anchor-backfill-audit.spec.ts` — EXACT/HIGH/MEDIUM/LOW/CONFLICT |
| Trip usage backfill | `tire-trip-usage-backfill-audit.spec.ts` — candidate classification |
| Integrity / synthetic GT | `tire-ground-truth.util.spec.ts`, `tire-health.service.spec.ts` |
| Ground-truth classification | `tire-evidence-source.spec.ts` — partition GT vs non-GT |
| DIMO signal coverage | `tire-dimo-signal-capability.spec.ts`, `audit-tire-health-dimo-signals.ts` |
| Duplicate snapshots | `tire-recalculation-fingerprint.spec.ts`, `tire-health.service.spec.ts` dedupe |
| Pressure units (274 kPa → 2.74 bar) | `dimo-tire-pressure.normalizer.spec.ts`, TC18 regression |

---

## Teil 3 — Controlled staging apply

**NOT EXECUTED** in Prompt 24 verification environment.

Approved operator sequence (staging only):

1. Odometer anchor apply: EXACT + HIGH_CONFIDENCE only  
2. Ledger backfill: unambiguous finalized trips  
3. Aggregate rebuild from ledger  
4. Reconciliation per vehicle  
5. Recalculate affected setups only  
6. Alert sync + rental health re-evaluation  

Post-apply checks documented in runbook §8–12.

---

## Teil 4 — Replay and negative tests

Covered by automated regression (no live staging replay in agent):

| Scenario | Test location |
|----------|----------------|
| Same trip again | `tire-trip-usage.service.spec.ts`, TC15 |
| Changed trip fingerprint | `tire-recalculation-fingerprint.spec.ts`, TC17 |
| Parallel workers | `tire-trip-usage-replay.spec.ts`, TC30 |
| Late trip / enrich | `withTripUsageReplayRetry`, TC16 |
| Setup change / stored set | `tire-lifecycle-invariants.spec.ts`, TC13 |
| Measurement correction | TC24, `tire-prediction-validation.service.spec.ts` |
| Identical recalculation | `tire-health.service.spec.ts`, TC19 |
| Stale pressure | `tire-pressure-context.builder.spec.ts`, TC19 matrix |
| DIMO 274 kPa | `dimo-tire-pressure.normalizer.spec.ts`, TC18 |
| Unknown spec pressure | `tire-recommended-pressure.spec.ts`, TC33 |
| Estimated critical (no hard block) | `tire-rental-health.policy.spec.ts`, TC22 |
| Measured legal minimum hard block | `tire-rental-health.policy.spec.ts`, TC23/36 |
| Alert dedupe / resolution | `tire-health-alert.spec.ts`, TC27 |
| Booking gate E2E policy | `tire-health-regression-matrix.spec.ts` TC36 |

**84 tests** in replay/audit/recalc-focused suites: **all PASS**.

---

## Teil 5 — Post-fix backtest

### Live historical backtest

**Not re-run** — requires built backend + `DATABASE_URL` + `TIRE_HEALTH_AUDIT_ALLOW_PROD=1` on fleet copy.

Script: `scripts/audits/audit-tire-health-backtest.ts`

### Pre-remediation metrics (archived)

| Metric | Value |
|--------|-------|
| n vehicles (with reproducible wheels) | 1 (`VEHICLE_004`) |
| n setups | 1 |
| n measurements (GT) | 2 time points |
| n wheel values (reproducible) | **4** |
| MAE | **0.213 mm** |
| RMSE | **0.214 mm** |
| Bias | −0.213 mm |
| Median abs error | 0.213 mm |
| P90 abs error | 0.228 mm |
| Within ±0.5 mm | 100% (4/4) |
| Within ±1.0 mm | 100% (4/4) |
| Model version (audit) | `TIRE_HEALTH_V2` |
| Verdict | **NOT_ENOUGH_DATA** |

### Post-remediation expectation

- Code **blocks** `actualTreadMm = predictedTreadMm` without measurement (`tire-ground-truth.util`, `TirePredictionValidationService`).
- New wear data points require pre-measurement snapshot linkage.
- Until anchors are applied and repeat measurements exist, backtest n remains **< 30** → **NOT_ENOUGH_DATA**.

**Do not claim “validated”** — honest limit per audit methodology.

---

## Final acceptance criteria

| Criterion | Status |
|-----------|--------|
| Prediction never ground truth | ✅ Code + 13+ unit tests |
| Setup/position invariants | ✅ Partial unique ACTIVE + lifecycle tests |
| Odometer anchors traceable | ✅ Schema + backfill audit; apply pending staging |
| Trip usage idempotent | ✅ Ledger + replay tests |
| Aggregates match ledger | ✅ Reconciliation service + tests |
| Snapshots deduplicated | ✅ Input fingerprint + unique constraint |
| Model version stored | ✅ `TIRE_WEAR_MODEL_VERSION` on snapshots |
| DIMO pressure in bar | ✅ Normalizer at provider boundary |
| Unknown spec → neutral wear factor | ✅ `TirePressureContext.wearEligibility` |
| Rental blocking evidence-safe | ✅ Policy tests |
| Alerts deduplicated | ✅ DB unique + sync service |
| UI measured/estimated/default | ✅ `evidencePresentation` + UI helpers |
| Tests & builds green | ✅ Tire + frontend green; 3 unrelated backend failures |
| Staging replay | ⚠️ Operator pending |
| Integrity audit 0 P0 post-apply | ⚠️ Requires live re-audit after staging |
| Backtest honest | ✅ NOT_ENOUGH_DATA maintained |

---

## Remaining findings (post-code, pre-staging-apply)

### Resolved in code (was P0/P1)

| ID | Resolution |
|----|------------|
| P0-TH-04 | Ground-truth leak removed |
| P0-TH-02 | Partial unique ACTIVE setup |
| P0-TH-21 | HM pressure in rental gate |
| P1-TH-05/12 | kPa→bar normalization |
| P1-TH-06/09/10 | Dedupe snapshots, events, wear points |
| P1-TH-07/08 | Trip ledger + finalization |
| P1-TH-18 | modelVersion on snapshots |

### Open until staging/production apply

| ID | Severity | Remaining action |
|----|----------|------------------|
| P0-TH-03 | P0 | Runtime telemetry auto-anchor on recalculate + staging backfill for historical setups |
| P0-TH-01 | P0→P1 | 8 mm fallback remains but `DEFAULT_ASSUMPTION` provenance; block rental claims |
| P1-TH-13 | P1 | Fleet pressure coverage 1/6 — HM/DIMO campaign |
| P1-TH-17/18 | P1 | Backtest sample size — measurement campaign |
| P2-* | P2 | DIMO ambient/TPMS fleet coverage; observability now addressed in code |

### P0 count after staging apply (expected)

- **Target:** 0 open P0 blocking production gate  
- **Requires:** successful anchor + ledger backfill on staging with reconciliation green

---

## Production actions NOT performed automatically

The following were **explicitly not executed** in Prompt 24:

- ❌ Production or staging `prisma migrate deploy`
- ❌ Odometer anchor backfill apply
- ❌ Trip usage ledger backfill apply
- ❌ Fleet-wide `recalculate()`
- ❌ Production DATABASE_URL connections
- ❌ DIMO subscription or write operations
- ❌ PM2 / VPS deploy
- ❌ Manual measurement campaign

---

## References

- Rollout: `docs/runbooks/tire-health-production-rollout.md`
- Remediation log: `docs/implementation/tire-health-production-readiness-remediation-2026-07.md`
- Verification JSON: `docs/audits/data/tire-health-post-remediation-verification-2026-07.json`
- Test matrix: `docs/audits/data/tire-health-test-coverage-2026-07.csv`

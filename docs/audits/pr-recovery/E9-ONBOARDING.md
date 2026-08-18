# E9 Onboarding — Evaluations Recovery (Forecasts & Time-Series)

Zweck: Ein neuer Chat/Agent soll mit dieser Datei den Plan und den aktuellen Stand
der Evaluations-Recovery-Phase **E9 — Forecasts & Time-Series Presentation** verstehen.

---

## 1. Kontext-Anker

| Field | Value |
|-------|-------|
| Repository | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **E9 entry main SHA** | `2284f4ee8b367468356a54eb6670c48dd6c4dd25` (CI fix #1058) |
| **E8 merge SHA** | `83b140b5c2be591c65058293052468e358b2eba3` (**PR #1056** — not `b3f2827`) |
| **E9A authority commit** | `844f44ba8c81c57ac88ea6f0b6c1d5e1e95bbee5` |
| Branch | `integration/evaluations-e9-forecast-ui-2026-08` |
| PR | **#1059** — Ready for Review (authority/deferral merge — **not merged**) |
| E8_RUNTIME_DEPENDENCY_ALLOWED | `false` |

---

## 2. Zuerst lesen

- `docs/audits/pr-recovery/phase3-e9a-forecast-authority-timeseries-baseline-2026-08.md` (E9A authority)
- `docs/audits/pr-recovery/phase3-e9d-forecast-runtime-deferred-final-acceptance-merge-readiness-2026-08.md` (**E9D-DEFER — canonical outcome**)
- `docs/audits/ci-recovery/data/e9a01-forecast-timeseries-viability-2026-08.json` (measured Production aggregates)
- `architecture/EVALUATIONS_E9_FORECASTS_2026-08-18.md`
- E8: `E8-ONBOARDING.md`, E8D deferral docs

---

## 3. Topology (after E9A.1 + E9D-DEFER)

| Etappe | Status |
|--------|--------|
| E9A | ✅ COMPLETE_CORRECTED (taxonomy, contract proposal, salvage) |
| E9A.1 | ✅ COMPLETE (Production empirical certification) |
| E9B | ⏸ **DEFERRED** — measured insufficient history |
| E9C | ⏸ NOT_REQUIRED_WHILE_RUNTIME_DEFERRED |
| E9D-DEFER | ✅ **COMPLETE** |
| **E9 overall** | **AUTHORITY_COMPLETE_RUNTIME_DEFERRED** |

---

## 4. Frozen outcome (E9D-DEFER — measured)

```
CI_STATUS = CI_E9D_FORECAST_RUNTIME_DEFERRED_FINAL_ACCEPTANCE_COMPLETED
E9_EMPIRICAL_VIABILITY = CERTIFIED_INSUFFICIENT
E9_RUNTIME = DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY
E9B_READINESS = NOT_READY
FORECAST_HORIZON = NONE
```

### Production-measured facts (2026-08-17 read-only)

| Metric | Value |
|--------|-------|
| Qualifying issued invoices | 5 |
| Orgs with revenue history | 1 |
| Observation span | **1 day** (2026-07-13 → 2026-07-14) |
| Closed daily buckets (max) | 3 |
| Rolling origins available | **0** |

**Blockers:** observation span too short; insufficient geometry for walk-forward backtest.

This is **not** the same as prior E9A `UNVERIFIED` status or inference from 4 orgs / 9 vehicles / 0 ServiceCases.

---

## 5. Authority still valid for future E9B

| Authority | Frozen value |
|-----------|--------------|
| Best candidate target | `fin.daily_issued_revenue` (org-only, per-currency) |
| E3 revenue time | `COALESCE(issued_at, invoice_date)` |
| Grain | DAILY (org TZ) |
| Trivial comparator | LAST_OBSERVED_VALUE only |
| Nontrivial baseline | **NONE** selected |
| Min history / folds | **NOT_YET_EMPIRICALLY_FROZEN** (no salvage 180d/14d/4-fold gates) |
| Bucket API on main | **E9B_IMPLEMENTATION_PREREQUISITE** (not empirical blocker) |
| Intervals | NOT_AUTHORIZED |
| E8 dependency | NONE |

---

## 6. Leitplanken (unchanged)

- No E8 risk outputs as E9 target/feature
- No LLM forecast values
- No invented horizons, intervals, or forecast values
- CLIENT_FORECAST_BUSINESS_DERIVATION_COUNT = 0
- Closed-bucket rule; zero vs missing distinct
- No Prisma/migration/production mutations in E9 phases completed

---

## 7. Re-entry

See E9D doc §7 — empirical span + rolling origins + trivial baseline before any runtime.

---

## 8. Copy-&-Paste-Einstieg

```
E9 authority complete; runtime DEFERRED after measured Production probe.
E8 merged @ 83b140b5 (PR #1056). E9 PR #1059 Ready — not merged.
Production: 5 qualifying invoices, 1-day span, 3 daily buckets, 0 rolling origins.
E9B NOT_READY until real history supports walk-forward backtest.
See phase3-e9d-*.md + e9a01 JSON artifact.
```

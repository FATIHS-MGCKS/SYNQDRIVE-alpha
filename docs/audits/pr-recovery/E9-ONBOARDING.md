# E9 Onboarding — Evaluations Recovery (Forecasts & Time-Series)

Zweck: Ein neuer Chat/Agent soll mit dieser Datei den Plan und den aktuellen Stand
der Evaluations-Recovery-Phase **E9 — Forecasts & Time-Series Presentation** verstehen.
Zuerst lesen, dann arbeiten.

---

## 1. Kontext-Anker

| Field | Value |
|-------|-------|
| Repository | `FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **E9 entry main SHA** | `2284f4ee8b367468356a54eb6670c48dd6c4dd25` |
| **E8 merged main SHA** | `b3f2827274cdd2011a5f999506badfb91cf225d9` (PR #1056) |
| Arbeits-/PR-Branch | `integration/evaluations-e9-forecast-ui-2026-08` |
| PR | Draft — siehe `phase3-e9a-*.md` |
| **Nicht mergen ohne explizite Autorisierung** | |

**E8 runtime dependency:** `E8_RUNTIME_DEPENDENCY_ALLOWED=false`  
E9 darf **nicht** von E8 `riskScore`, `eventProbability`, `confidence`, `estimatedExposure` oder unavailable E8 model output abhängen.

---

## 2. Zuerst lesen

- `AGENTS.md`, `.cursor/rules/projektregel.mdc`, `.cursor/rules/Dimo-Rule.mdc`
- `docs/audits/pr-recovery/E7-ONBOARDING.md`, `E8-ONBOARDING.md`
- `docs/audits/pr-recovery/phase3-e8d-predictive-risk-deferred-final-acceptance-merge-readiness-2026-08.md`
- `architecture/EVALUATIONS_E3_MONEY_FINANCE_2026-08-11.md`
- `architecture/EVALUATIONS_E4_TENANT_SAFE_ANALYTICS_2026-08-11.md`
- E5/E6 final authority documents
- **E9A:** `phase3-e9a-forecast-authority-timeseries-baseline-2026-08.md`
- **E9 architecture:** `architecture/EVALUATIONS_E9_FORECASTS_2026-08-18.md`
- Empirical artifact: `docs/audits/ci-recovery/data/e9a01-forecast-timeseries-viability-2026-08.json`

---

## 3. Gesamtplan Evaluations Recovery (E8–E9)

| Etappe | Inhalt | Status |
|--------|--------|--------|
| E8A–E8D | Predictive risk authority + deferral | ✅ merged / deferred |
| **E9A** | **Forecast authority + time-series contract + baseline salvage + empirical viability freeze** | ✅ COMPLETE (docs-only) |
| **E9B** | Canonical forecast backend + shared contract + backtesting | ⏸ NOT_READY |
| **E9C** | Forecast frontend integration | ⏸ blocked by E9B |
| **E9D** | Integrated acceptance + merge readiness | ⏸ pending E9B/C |
| **E9D-DEFER** | Final deferral if runtime never justified | candidate if E9B blocked |

---

## 4. E9A frozen outcome (DEFERRED)

**Authority complete; E9 product runtime intentionally deferred pending canonical bucketed history + empirical backtest support.**

| Authority | E9A decision |
|-----------|--------------|
| Forecast taxonomy | Five classes frozen (Historical Series / Projection / Baseline Forecast / Statistical Forecast / Scenario) |
| E9 vs E8 | E9 = continuous/count/money **time-series**; E8 = **event risk** — never mixed |
| Best candidate target (when data exists) | `fin.daily_issued_revenue` (org-only, per-currency) |
| Secondary candidate | `ops.fleet_utilization_pct` daily (org-only, SCHEDULED basis) |
| **E9_MVP_TARGETS** | **[]** (none authorized for runtime today) |
| **E9_RUNTIME** | **DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY** |
| Canonical series API on main | **0** multi-bucket endpoints |
| FORECAST_HORIZON | **NONE** (no invented horizon) |
| FORECAST_INTERVAL | **NOT_AUTHORIZED** |
| Baseline method (future) | LAST_OBSERVED_VALUE + MA(14) after revalidation; seasonal only if empirically supported |
| Persistence | **DERIVED_ON_READ** (no Prisma in E9A) |
| E8 dependency | **NONE** |
| E9B readiness | **NOT_READY** |

### Blockers (exact)

1. `NO_CANONICAL_MULTI_BUCKET_SERIES_API_ON_MAIN` — E1 serves period scalars only
2. `PRODUCTION_TIMESERIES_PROBE_BLOCKED_SSH` — E9A01 remote probe could not run
3. `INSUFFICIENT_PLATFORM_HISTORY_FOR_SALVAGE_MIN_GATES` — E8B0.1: 4 orgs, 9 vehicles; revenue salvage gate 180d not certified
4. `SPARSE_TENANT_COVERAGE_E8B01_CROSSREF`

---

## 5. Leitplanken (gelten für E9B+)

- **Forecast ≠ observed history** — explicit `kind` on series points; no frontend date-position inference
- **No E8 runtime** — zero imports of predictive-risk outputs as E9 target or feature
- **No LLM forecast values** — explanation-only under separate authority later
- **E1 Money** — `amountMinor` + `currency`; no float; no mixed-currency sums
- **E5 quality fail-closed** — live partial buckets suppress; closed historical buckets may allow FRESHNESS UNKNOWN when event times authoritative
- **Closed-bucket rule** — current partial day never used as complete training bucket
- **Rolling-origin backtest only** — no random split; `training_end < forecast_start`
- **CLIENT_FORECAST_BUSINESS_DERIVATION_COUNT = 0**
- Keine Prisma/Migration/Production-Änderungen ohne explizite spätere Phase

---

## 6. Salvage-Referenzen (NICHT blind mergen)

| Branch | Verdict |
|--------|---------|
| `evaluations-feature-store-8427` | REQUIRES_REVALIDATION — PIT pattern reusable after rewrite |
| `evaluations-baseline-forecasts-8427` | E9_ONLY — MA/seasonal contract; revalidate min-history + intervals |
| `evaluations-forecast-backtesting-8427` | E9_ONLY infra pattern; **REJECT** maintenance probability heuristics |
| `evaluations-predictive-analytics-architecture-8427` | SAFE_CONCEPT_ONLY — tiers/gates/lifecycle |
| `evaluations-maintenance-risk-forecast.ts` | **REJECT** — E8-only uncalibrated probabilities |
| `FinancialInsightsView` daily chart | **REJECT** — client non-canonical |

---

## 7. Re-entry criteria (E9B resume)

All required before E9B runtime:

1. Canonical **bucketed observed series API** for at least one target (server-owned bucketing)
2. Production or representative staging **empirical bucket counts** meeting salvage min-history (revenue ≥180 daily org buckets or explicitly lowered with product approval)
3. Rolling-origin backtest with ≥4 folds and LAST_OBSERVED_VALUE baseline comparison
4. Zero target leakage in harness (E8-style mutant sensitivity for feature cutoff)
5. Explicit product approval for **horizon** and **scope** (org-only default)
6. Quality fail-closed matrix passing on closed buckets

---

## 8. Copy-&-Paste-Einstieg

```
Repo: FATIHS-MGCKS/SYNQDRIVE-alpha.
Branch: integration/evaluations-e9-forecast-ui-2026-08.
E8 merged @ b3f28272. E9A complete: authority frozen, runtime DEFERRED.
E8B0.1 Production: 4 orgs, 9 vehicles, 0 ServiceCase rows.
No canonical multi-bucket series API on main. Client FinancialInsightsView daily chart is NON-CANONICAL.
E9 must not use E8 risk outputs. E9B NOT_READY until bucket API + empirical history.
See phase3-e9a-*.md and architecture/EVALUATIONS_E9_FORECASTS_2026-08-18.md.
```

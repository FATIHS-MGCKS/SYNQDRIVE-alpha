# E8 Onboarding — Evaluations Recovery (Predictive Risk & estimatedExposure)

Zweck: Ein neuer Chat/Agent soll mit dieser Datei den Plan und den aktuellen Stand
der Evaluations-Recovery-Phase **E8 — Predictive Risk / estimatedExposure** verstehen.
Zuerst lesen, dann arbeiten.

---

## 1. Kontext-Anker

- Repository: `FATIHS-MGCKS/SYNQDRIVE-alpha`
- **E7 merge commit:** `bd732a8f7a6467565a8668ea136e81b79a04666a` (squash-merge PR #1055)
- **E8 entry main SHA:** siehe `phase3-e8a-*.md` (branch von aktuellem `origin/main`)
- Arbeits-/PR-Branch: `integration/evaluations-e8-predictive-risk-2026-08`
- PR: **#1056** — [Evaluations Recovery E8 – Predictive Risk & estimatedExposure](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1056) (OPEN, Ready for Review, base `main`)
- **Nicht mergen ohne explizite Autorisierung**

## 2. Zuerst lesen

- `AGENTS.md`, `.cursor/rules/projektregel.mdc`, `.cursor/rules/Dimo-Rule.mdc`
- `docs/audits/pr-recovery/E7-ONBOARDING.md` + E7A–E7D authority docs
- `docs/audits/pr-recovery/phase3-e8a-predictive-risk-estimated-exposure-authority-baseline-2026-08.md` (**E8A authority freeze**)
- `docs/audits/pr-recovery/phase3-e8b0-predictive-target-label-horizon-dataset-certification-2026-08.md` (superseded synthetic)
- `docs/audits/pr-recovery/phase3-e8b01-production-readonly-predictive-certification-2026-08.md` (**E8B0.1 — canonical empirical certification**)
- `docs/audits/pr-recovery/phase3-e8d-predictive-risk-deferred-final-acceptance-merge-readiness-2026-08.md` (**E8D-DEFER — final deferral acceptance**)
- `architecture/EVALUATIONS_E8_PREDICTIVE_RISK_2026-08-17.md`
- E1–E6 final authority documents (contracts, finance MTD, analytics, quality/privacy)

## 3. Gesamtplan Evaluations Recovery (E8–E9)

| Etappe | Inhalt | Status |
|--------|--------|--------|
| E7 | Recommendations / Actions (observed, server-derived) | ✅ merged (`bd732a8`) |
| **E8A** | **Predictive risk + estimatedExposure authority / model governance freeze** | ✅ COMPLETE (docs-only) |
| **E8B0** | **Target label / horizon / PIT dataset certification (synthetic harness)** | ✅ SUPERSEDED_SYNTHETIC_CERTIFICATION |
| **E8B0.1** | **Production read-only empirical certification + leakage correction** | ✅ COMPLETE_REAL_READONLY_CERTIFICATION |
| **E8B** | **Canonical backend predictive risk + offline validation** | ⏸ DEFERRED_PENDING_EMPIRICAL_HISTORY |
| **E8C** | **Predictive Risk frontend integration** | ⏸ NOT_REQUIRED_WHILE_RUNTIME_DEFERRED |
| **E8D-DEFER** | **Final deferral acceptance + merge readiness** | ✅ COMPLETE |
| **E9A** | **Forecast authority + time-series contract + empirical viability freeze** | ✅ COMPLETE (docs-only; runtime deferred) |
| **E9B** | **Canonical forecast backend + backtesting** | ⏸ NOT_READY |
| **E9C** | **Forecast frontend integration** | ⏸ blocked by E9B |
| **E9** | **Forecast UI / time-series presentation** | ⏸ DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY |

## 4. E8 frozen authority (E8D-DEFER)

**Authority complete; runtime intentionally deferred pending real Production outcome history.**

| Authority | E8D decision |
|-----------|--------------|
| E8 predictive target | **`FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION`** (E8B0.1 certified semantics; event truth within horizon) |
| E8_TARGET_AUTHORITY | `DEFINED_BUT_EMPIRICALLY_UNVALIDATED` |
| E8 scope | **ORGANIZATION_ONLY** |
| E8 horizon | **`RECOMMENDED_HORIZON=NONE`** on current Production (zero ServiceCase rows) |
| E8_RUNTIME | **DEFERRED_PENDING_EMPIRICAL_HISTORY** |
| Initial risk output (when authorized) | `RISK_CATEGORY` + provenance — no numeric probability until calibration |
| EVENT_PROBABILITY | **NOT_AUTHORIZED** |
| NUMERIC_CONFIDENCE | **NOT_AUTHORIZED** |
| estimatedExposure | **DEFERRED_INSUFFICIENT_AUTHORITY** |
| RISK_CATEGORY_THRESHOLD_AUTHORITY | **INSUFFICIENT_EMPIRICAL_SUPPORT** |
| Production facts | ORG=4, VEHICLE=9, **SERVICE_CASE=0** |
| E8B blockers | `INSUFFICIENT_REAL_POSITIVE_LABELS`, `NO_VALIDATION_SUPPORT`, `NO_TEST_SUPPORT` |
| Model path (future) | DETERMINISTIC_POLICY_RULE baseline → STATISTICAL_BASELINE; no ML in initial E8B |
| Persistence | DERIVED_ON_READ; no Prisma in E8 phases completed so far |
| E7 | Separate section; no circular E7↔E8 truth |
| E9 | E9A complete on branch `integration/evaluations-e9-forecast-ui-2026-08`; must not depend on unavailable E8 runtime; E9B NOT_READY |

## 5. Leitplanken (gelten für zukünftiges E8B+)

- Vier Klassen strikt trennen: **Observed Fact**, **Risk Indicator**, **Forward-Risk Rule**, **Statistical Prediction**
- Kein beobachteter Fakt als Vorhersage; keine Regel als Kalibrierungswahrscheinlichkeit
- Kein `riskScore × money`; kein dekoratives Confidence-%
- E1 Money (`amountMinor`, `currency`); kein EUR-Default; keine gemischten Summen
- E5 FRESHNESS UNKNOWN fail-closed für live-abhängige Claims
- E5B piiTier: `none` ⇒ keine personenbezogenen Predictive Features
- Kein LLM als numerische Risk-Autorität
- `CLIENT_PREDICTIVE_BUSINESS_DERIVATION_COUNT = 0` (Frontend)
- Keine Prisma/Migration/Production-Änderungen ohne explizite spätere Phase

## 6. Salvage-Referenzen (NICHT blind mergen)

| Branch | Verdict |
|--------|---------|
| `evaluations-predictive-analytics-architecture-8427` | SAFE_CONCEPT_ONLY (Tier/Gates-Dokumentation) |
| `evaluations-feature-store-8427` | REQUIRES_REVALIDATION (PIT snapshots) |
| `evaluations-baseline-forecasts-8427` | E9_ONLY |
| `evaluations-forecast-backtesting-8427` | E8 risk heuristics REQUIRES_REVALIDATION; backtest infra E9_ONLY |
| `evaluations-recommendation-domain-8427` | UNSAFE_LEGACY (expectedBenefit/confidence persistence) |

## 7. Re-entry criteria (frozen — E8D-DEFER)

E8 runtime resume requires all of: non-zero qualifying labels, complete horizons, train/validation/test positives, valid PIT reconstruction, mutant-sensitive leakage harness, zero target leakage, empirically defensible horizon + threshold, explicit product approval for horizon and category policy. No minimum numeric threshold frozen. `estimatedExposure` has separate re-entry authority.

## 8. Copy-&-Paste-Einstieg

```
Repo: FATIHS-MGCKS/SYNQDRIVE-alpha.
Branch: integration/evaluations-e8-predictive-risk-2026-08.
E7 merged @ bd732a8. E8A complete. E8B0 superseded. E8B0.1 complete (Production read-only).
E8D-DEFER complete: authority frozen, runtime deferred, PR #1056 Ready for Review (not merged).

Certified target: FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION.
Production: 4 orgs, 9 vehicles, 0 ServiceCase rows. RECOMMENDED_HORIZON=NONE.
No eventProbability, numeric confidence, or estimatedExposure runtime authorized.
E9 may begin after PR #1056 merge — independent of E8 runtime.
```

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
- Draft-PR: **#1056** — [Evaluations Recovery E8 – Predictive Risk & estimatedExposure](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1056) (OPEN, Draft, base `main`)
- **Bleibt Draft bis E8D — nicht mergen ohne explizite Autorisierung**

## 2. Zuerst lesen

- `AGENTS.md`, `.cursor/rules/projektregel.mdc`, `.cursor/rules/Dimo-Rule.mdc`
- `docs/audits/pr-recovery/E7-ONBOARDING.md` + E7A–E7D authority docs
- `docs/audits/pr-recovery/phase3-e8a-predictive-risk-estimated-exposure-authority-baseline-2026-08.md` (**E8A authority freeze**)
- `docs/audits/pr-recovery/phase3-e8b0-predictive-target-label-horizon-dataset-certification-2026-08.md` (**E8B0 certification — read before E8B runtime**)
- `architecture/EVALUATIONS_E8_PREDICTIVE_RISK_2026-08-17.md`
- E1–E6 final authority documents (contracts, finance MTD, analytics, quality/privacy)

## 3. Gesamtplan Evaluations Recovery (E8–E9)

| Etappe | Inhalt | Status |
|--------|--------|--------|
| E7 | Recommendations / Actions (observed, server-derived) | ✅ merged (`bd732a8`) |
| **E8A** | **Predictive risk + estimatedExposure authority / model governance freeze** | ✅ (docs-only) |
| **E8B0** | **Target label / horizon / PIT dataset certification (runtime gate)** | ✅ (docs + offline harness) |
| E8B | Canonical backend predictive risk + offline validation | ⬜ blocked pending product horizon + threshold authority |
| E8C | Predictive Risk frontend integration | ⬜ offen |
| E8D | Integrated validation / calibration / merge readiness | ⬜ offen |
| E9 | Forecast UI / time-series presentation | ⬜ ausgeschlossen bis E9 autorisiert |

## 4. E8A Ergebnis (Authority)

**Form B — Predictive risk authority frozen; estimatedExposure deferred.**

| Authority | E8A decision |
|-----------|--------------|
| E8 predictive target | **`FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION`** (E8B0 certified; E8A `unplanned` name rejected) |
| E8 scope | **ORGANIZATION_ONLY** (station not PIT-reconstructible for MVP) |
| E8 horizon | **`NEXT_30_DAYS` recommended** — **REQUIRES_EXPLICIT_PRODUCT_APPROVAL** before runtime |
| Initial risk output | `RISK_CATEGORY` + provenance (no numeric probability until calibration) |
| estimatedExposure | **DEFERRED** — insufficient mathematical/money authority for EXPECTED LOSS or standalone field |
| Model path | DETERMINISTIC_POLICY_RULE baseline → STATISTICAL_BASELINE (historical rate); no ML in initial E8B |
| Persistence | DERIVED_ON_READ (preferred); no Prisma in E8A/E8B initial |
| E7 | Separate section; no circular E7↔E8 truth |
| E9 | Excluded (baseline forecast = E9_ONLY salvage) |

## 5. Leitplanken (gelten für E8B+)

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

## 7. Test-Gates (E8B+)

Siehe Test-Matrix in `phase3-e8a-*.md` §49.

```bash
cd backend && npm test -- --testPathPattern="evaluations-predictive|e8"
cd frontend && npx vitest run src/rental/.../evaluations-predictive...
```

## 8. Copy-&-Paste-Einstieg

```
Repo: FATIHS-MGCKS/SYNQDRIVE-alpha.
Branch: integration/evaluations-e8-predictive-risk-2026-08.
E7 merged @ bd732a8. E8A complete (docs-only authority freeze).

Bitte lies E8-ONBOARDING.md und phase3-e8a-predictive-risk-estimated-exposure-authority-baseline-2026-08.md.

E8A froze Form B governance (no probability, estimatedExposure deferred). E8B0 certified target `FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION`, org-only scope, PIT feature set, and leakage gates. Runtime blocked until product approves horizon + ELEVATED/NORMAL threshold. PR bleibt Draft.
```

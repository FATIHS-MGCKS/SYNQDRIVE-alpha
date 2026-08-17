# E7 Onboarding — Evaluations Recovery (Recommendations & Actions)

Zweck: Ein neuer Chat/Agent soll mit dieser Datei den Plan und den aktuellen Stand
der Evaluations-Recovery-Phase **E7 — Recommendations / Actions** verstehen. Zuerst
lesen, dann arbeiten.

---

## 1. Kontext-Anker

- Repository: `FATIHS-MGCKS/SYNQDRIVE-alpha`
- **E7 entry main SHA:** `06bae11f37a1843836dedf6a4cfcab0eb2fe37a5` (R3B closure via squash-merge PR #1054)
- **R3B status:** COMPLETE — E7 ist explizit autorisiert
- Arbeits-/PR-Branch: `integration/evaluations-e7-recommendations-actions-2026-08`
- Draft-PR: **#1055** — „Evaluations Recovery E7 – Recommendations & Actions“
  (OPEN, Draft, base `main`). **Bleibt Draft — nicht mergen, nicht Ready markieren.**

## 2. Zuerst lesen: Regeln / Arbeitsanweisungen

- `AGENTS.md`
- `.cursor/rules/projektregel.mdc`
- `.cursor/rules/Dimo-Rule.mdc`
- `.cursor/rules/Architectur-Updates.mdc`
- `docs/audits/pr-recovery/E6-ONBOARDING.md` (Vorgänger-Kontext)
- `docs/audits/pr-recovery/phase3-e7a-recommendations-actions-authority-baseline-2026-08.md` (**E7A authority freeze**)

Backend-Hintergrund (E1–E6, bereits in `main`):

- `phase3-e1-evaluations-contracts-implementation-2026-08.md`
- `phase3-e2-tenant-analytics-foundation-implementation-2026-08.md`
- `phase3-e3-money-finance-correctness-implementation-2026-08.md`
- `phase3-e4-tenant-safe-analytics-backend-implementation-2026-08.md`
- `phase3-e5-final-quality-privacy-authorization-audit-implementation-2026-08.md`
- `phase3-e6-final-canonical-presentation-acceptance-2026-08.md`

## 3. Gesamtplan: Evaluations Recovery (Phase 3, E1–E9)

| Etappe | Inhalt | Status |
|--------|--------|--------|
| E1 | Kanonische Verträge: Metric / Status / Period / Money | ✅ gemerged |
| E2 | Tenant / Station / RBAC | ✅ gemerged |
| E3 | Finance (fix MTD, explizite Money-Währung) | ✅ gemerged |
| E4 | Analytics-Backend: Summary, Utilization, Cost, Strengths/Weaknesses, Driver | ✅ gemerged |
| E5 | Quality / Privacy / Audit | ✅ gemerged |
| E6 | Canonical Presentation Layer (`EvaluationsPage` / `financial-insights`) | ✅ gemerged (via main nach E6-Merge) |
| **E7A** | **Authority / contract / implementation scope freeze** | ✅ (dieser Branch) |
| **E7B** | Canonical backend Recommendations derivation + API | ⬜ offen |
| **E7C** | Recommendations / Actions frontend integration | ⬜ offen |
| **E7D** | Integrated privacy/security/quality/UX acceptance + merge readiness | ⬜ offen |
| E8 | Predictive Risk / `estimatedExposure` | ⬜ ausgeschlossen bis E8 autorisiert |
| E9 | Forecast UI | ⬜ ausgeschlossen bis E9 autorisiert |

## 4. Leitplanken (gelten für E7B–E7D)

- Recommendations müssen **deterministisch**, **evidence-backed**, **org/station-scoped**,
  **status-aware**, **quality-aware**, **privacy-aware** und **explainable** sein.
- Keine spekulative Business-Wahrheit; keine LLM-Empfehlungen aus Rohdaten.
- Keine Client-seitige Business-Ableitung von Recommendations (`CLIENT_BUSINESS_RECOMMENDATION_DERIVATION_COUNT = 0`).
- Keine erfundenen Schwellen (`UNAUTHORIZED_INVENTED_THRESHOLDS = 0`).
- Kein `estimatedExposure`, keine Forecast-Felder (`E7_ESTIMATED_EXPOSURE_FIELDS = 0`, `E7_FORECAST_FIELDS = 0`).
- Money: E3 MTD-Invarianz, explizite Währung, kein EUR-Default, keine gemischten Summen.
- Privacy: server `piiTier` verbatim; `driverRef` opaque; kein Identity-Join.
- Genau **eine** Auswertungen-Seite (`financial-insights`); E7 erweitert, ersetzt nicht.
- E7A: **keine** Runtime-Änderungen an Backend/Frontend/Prisma/Migration/Production.

## 5. E7 Runtime-Ziel (nach E7B/C — noch nicht implementiert)

- Backend: neuer derivations-authority-Service unter `evaluations-analytics/e7/`
  (Vorschlag), der E1–E6 Inputs orchestriert und Recommendations + Action-Metadaten liefert.
- Frontend: neuer Abschnitt auf `EvaluationsPage` (nach Executive Summary), der den
  E7-Endpoint transportiert und **nur** non-mutating Actions ausführt (Navigation/Filter/Deep-Link).
- Kein zweites Automation-System; Workflow-Bezug nur als Deep-Link/Context (E7A-Entscheidung).

## 6. Salvage-Referenzen (NICHT blind cherry-picken)

Historische Branches unter `origin/cursor/evaluations-*`:

- `evaluations-recommendation-domain-8427` — persistence + API + `expectedBenefit`/`estimatedCost` (**E8-nahe, nicht on main**)
- `evaluations-action-center-8427` — legacy `business-insights` stack (**ersetzt durch E4/E6**)
- `evaluations-predictive-analytics-architecture-8427`, `evaluations-baseline-forecasts-8427` — **E8/E9, verboten**

Legacy Frontend (Dashboard, nicht EvaluationsPage):

- `frontend/src/rental/lib/insights-categories.ts` — client-side recommendation strings (**UNSAFE_CLIENT_DERIVATION** für E7)

## 7. Test-Gates (E7B+)

Siehe Test-Matrix in `phase3-e7a-recommendations-actions-authority-baseline-2026-08.md` §21.

```bash
cd backend && npm run test:evaluations   # E1–E5 regression + future E7 specs
cd frontend && npx vitest run src/rental/lib/evaluations src/rental/components/evaluations
```

## 8. Copy-&-Paste-Einstieg für einen neuen Chat

```
Repo: FATIHS-MGCKS/SYNQDRIVE-alpha.
Branch: integration/evaluations-e7-recommendations-actions-2026-08.
Base main: 06bae11f (R3B/#1054 merged). R3B COMPLETE.

Bitte lies docs/audits/pr-recovery/E7-ONBOARDING.md und phase3-e7a-recommendations-actions-authority-baseline-2026-08.md.

E7A ist abgeschlossen (authority freeze, docs-only). Nächstes Gate: E7B canonical backend Recommendations + API. PR bleibt Draft. Kein E8/E9, keine erfundenen Schwellen, keine Client-Business-Derivation.
```

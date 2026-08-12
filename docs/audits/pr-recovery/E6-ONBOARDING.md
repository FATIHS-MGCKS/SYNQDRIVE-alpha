# E6 Onboarding — Evaluations Recovery (Plan & Ablauf für einen neuen Agenten)

Zweck: Ein neuer Chat/Agent soll mit dieser einen Datei den gesamten Plan und den
aktuellen Stand der „Evaluations/Auswertungen Recovery“ verstehen. Zuerst lesen,
dann arbeiten.

---

## 1. Kontext-Anker

- Repository: `FATIHS-MGCKS/SYNQDRIVE-alpha`
- Aktiver Arbeits-/PR-Branch: `integration/evaluations-e6-canonical-frontend-2026-08`
- Aktiver Draft-PR: **#1026** — „Evaluations Recovery E6 – Canonical Presentation Layer“
  (OPEN, Draft, base `main`). **Bleibt Draft — nicht mergen, nicht Ready markieren.**

## 2. Zuerst lesen: Regeln / Arbeitsanweisungen

- `AGENTS.md` — Repo-Layout, Dev-/Deploy-/Test-Befehle, Architektur-Regeln
- `.cursor/rules/projektregel.mdc` — projektweite SynqDrive Engineering-/Architektur-Regeln
- `.cursor/rules/Dimo-Rule.mdc` — DIMO-Integrationsregeln
- `.cursor/rules/Figma-rule.mdc` — UI/Figma-Regeln (Figma = visuelle Wahrheit, Code = funktionale Wahrheit)
- `.cursor/rules/Architectur-Updates.mdc` — nach jeder sinnvollen Änderung Changes/Architektur aktualisieren
- `.agents/skills/make-interfaces-feel-better/SKILL.md` — UI-Politur
- `.cursor/skills/vps-deploy/SKILL.md` — Deploy (nur wenn ausdrücklich gewünscht)

## 3. Gesamtplan: Evaluations Recovery (Phase 3, E1–E9)

Die Auswertungen werden etappenweise „kanonisch“ neu aufgebaut. E1–E5 sind Backend/
Verträge (in `main` gemerged). E6 ist das Frontend (Presentation Layer) im PR #1026.

| Etappe | Inhalt | Status |
|--------|--------|--------|
| E1 | Kanonische Verträge: Metric / Status / Period / Money | ✅ gemerged |
| E2 | Tenant / Station / RBAC (Server-Autorität, kein hardcoded org/vehicle) | ✅ gemerged |
| E3 | Finance (fix MTD, explizite Money-Währung) | ✅ gemerged |
| E4 | Analytics-Backend: Summary, Utilization, Cost, Strengths/Weaknesses | ✅ gemerged (#1024) |
| E5 | Quality / Privacy / Audit | ✅ gemerged (#1025) |
| E6A | Kanonische Frontend-Datenschicht (Transport, Result-States, Money, Hooks) | ✅ in PR #1026 |
| E6A.1 | 404-Semantik + Hook-Lifecycle-Korrektur | ✅ |
| E6B | Sichtbare Kern-Oberflächen (die Auswertungen-Seite) | ✅ |
| E6B.1 | Finance-Transport-Status-Semantik + i18n („Eligible vehicles“) | ✅ |
| E6B.1.1 | 404-Authority Kommentar-/Doku-Cleanup (docs/comment-only) | ✅ |
| E6C | Driver Influence UI + detailliertes Data-Quality-Panel | ✅ (aktueller Stand) |
| **E7** | Recommendations / Actions | ⬜ offen (noch NICHT starten) |
| **E8** | Predictive Risk / `estimatedExposure` | ⬜ offen |
| **E9** | Forecast UI | ⬜ offen |

Absolute Stopp-Regel aktuell: **E7 nicht starten**, bis der User es explizit autorisiert
(genauso wenig E8/E9 oder eine vollständige E6D-Neugestaltung). E6C ist abgeschlossen —
Driver Influence UI (lazy) und das detaillierte Data-Quality-Panel liegen auf der
bestehenden Auswertungen-Seite; siehe `phase3-e6c-driver-quality-surfaces-*`.

## 4. Leitplanken (gelten über alle Etappen)

- Keine Client-seitige Neuberechnung von Business-Wahrheit (Finance/Utilization/Cost/
  Quality/Privacy kommen kanonisch vom Backend).
- Money immer mit **expliziter Währung** (`amountMinor` + `currency` + `locale`);
  kein EUR-Default, kein `/100`, keine Währung aus Locale, gemischte Währungen nie summieren.
- HTTP-Transport-Semantik: generischer **404 → NOT_FOUND** (nie `FEATURE_DISABLED`);
  403 → UNAUTHORIZED; 5xx/Netzwerk → ERROR. `FEATURE_DISABLED` nur mit verlässlichem,
  nicht-verräterischem Discriminator (existiert heute nicht).
- Finance = **MTD/E3** (globaler Analytics-Zeitraum ändert Finance nicht).
- Genau **eine** Auswertungen-Seite/Route (`financial-insights`), keine zweite Seite.
- Kein Backend/Prisma/Migration/Prod-Config im Frontend-Scope; **kein Deploy**; PR bleibt Draft.
- E6C-/E7-/E8-/E9-Inhalte NICHT vorwegnehmen (keine Driver-Influence-UI, kein
  Data-Quality-Panel, keine Recommendations/Actions, kein `estimatedExposure`, kein Forecast).

## 5. Plan-/Beweis-Dokumente (die eigentliche „Story“)

Alle unter `docs/audits/pr-recovery/`. Für E6 am wichtigsten:

- `phase3-e6a-canonical-frontend-data-layer-implementation-2026-08.md` + `…-test-report-2026-08.md`
- `phase3-e6b-core-evaluation-surfaces-implementation-2026-08.md` + `…-test-report-2026-08.md`
  (enthalten auch die Abschnitte E6B.1 und E6B.1.1)

Backend-Hintergrund (bei Bedarf):
- `phase3-e3-money-finance-correctness-implementation-2026-08.md`
- `phase3-e4-tenant-safe-analytics-backend-implementation-2026-08.md`
- `phase3-e5-final-quality-privacy-authorization-audit-implementation-2026-08.md`

## 6. Runtime-Code (E6)

Frontend-Datenschicht (E6A):
- `frontend/src/rental/lib/evaluations/evaluations-request.ts` — Result-/Async-Typen, State-Semantik
- `frontend/src/rental/lib/evaluations/evaluations-analytics-client.ts` — `mapEvaluationsResult`
  (403→UNAUTHORIZED, 404→NOT_FOUND, sonst ERROR)
- `frontend/src/rental/lib/evaluations/evaluations-canonical.types.ts`, `evaluations-money.ts`, `evaluations-query-keys.ts`
- `frontend/src/rental/hooks/useEvaluationsCanonicalAnalytics.ts`, `frontend/src/rental/hooks/useEvaluationsFinanceBundle.ts`
- `frontend/src/lib/api.ts` — `requestResult<T>()` + `api.evaluations.*`
  (u. a. `financeInsightsResult`, `analyticsInsightsSummary`, `analyticsQuality`, `driverAnalysis`)

Frontend-Oberflächen (E6B) — Ordner `frontend/src/rental/components/evaluations/`:
- `EvaluationsPage.tsx` (Komposition; eingehängt in `frontend/src/rental/App.tsx`, Route `financial-insights`)
- `EvaluationsHeaderControls.tsx`, `EvaluationsSectionShell.tsx`, `MetricStatusBadge.tsx`, `EvaluationsKpiCard.tsx`
- `ExecutiveSummarySection.tsx`, `StrengthWeaknessSection.tsx`, `FinanceReceivablesSection.tsx`,
  `FleetUtilizationSection.tsx`, `CostDowntimeSection.tsx`
- `evaluations-presentation.ts`, `evaluations-section-derive.ts`
- i18n: `frontend/src/rental/i18n/translations/en.ts` + `de.ts` (Keys unter `evaluations.*`)
- Tests: `frontend/src/rental/components/evaluations/*.test.*`, `frontend/src/rental/hooks/useEvaluationsFinanceBundle.test.tsx`
- E2E: `frontend/e2e/evaluations-flow.spec.ts`, `frontend/e2e/evaluations-fixtures.ts`
  (legacy visual/a11y-Specs sind für E6D „skipped“)

## 7. Relevante Branches

- Arbeits-/PR-Branch: `integration/evaluations-e6-canonical-frontend-2026-08`
- Discovery/Salvage-Grundlage: `origin/audit/evaluations-e6-discovery-2026-08`
- Post-Merge-Audits E1–E5: `origin/audit/evaluations-e{1..5}-post-merge-2026-08`
- Historische Feature-Branches (nur als Salvage-Referenz, **nicht blind cherry-picken**):
  `origin/cursor/evaluations-*` (z. B. `evaluations-analytics-summary-8427`,
  `evaluations-cost-model-8427`, `evaluations-data-quality-model-8427`, `evaluations-a11y-i18n-8427`)

## 8. Test-/Quality-Gates (Frontend)

```bash
cd frontend
npx tsc -b                 # typecheck
npx vite build             # production build
npx eslint src/rental/components/evaluations/ src/rental/hooks/useEvaluationsFinanceBundle.ts
npx vitest run src/rental/lib/evaluations src/rental/components/evaluations \
  src/rental/hooks/useEvaluationsFinanceBundle.test.tsx \
  src/rental/lib/finance-insights-adapter.test.ts
```
Hinweis: Playwright-Browser sind in der Cloud-Agent-Sandbox nicht installiert →
E2E wird nur in CI ausgeführt (als `ENVIRONMENT_SPECIFIC` klassifizieren, nicht als neuer Fehler).
Bekannte rote CI-Checks (Backend Typecheck/Lint, Backend integration/Migration,
Security scan, „Playwright E2E (Vehicle Detail)“) sind vor-bestehend und identisch zur
Baseline; E6 ist frontend-only.

## 9. Copy-&-Paste-Einstieg für einen neuen Chat

```
Repo: FATIHS-MGCKS/SYNQDRIVE-alpha. Branch: integration/evaluations-e6-canonical-frontend-2026-08. Draft-PR #1026 (base main, bleibt Draft).

Bitte lies zuerst docs/audits/pr-recovery/E6-ONBOARDING.md — dort stehen Plan, Etappen (E1–E9), Leitplanken, alle relevanten Dateien und Branches.

Aktueller Stand: E1–E5 gemerged; im PR #1026 sind E6A, E6A.1, E6B, E6B.1, E6B.1.1 fertig. Als Nächstes offen: E6C (Driver Influence UI + Data-Quality-Panel), danach E7/E8/E9. E6C NICHT starten, bevor ich es sage.

Leitplanken: keine Client-Neuberechnung von Business-Wahrheit; Money mit expliziter Währung; generischer 404 = NOT_FOUND (nie FEATURE_DISABLED ohne verlässlichen Discriminator); Finance = MTD/E3; keine Backend/Prisma/Migration-Änderungen; PR bleibt Draft; kein Deploy.
```

# Baseline- und Regression-Testbericht — Auswertungen

**Datum:** 2026-07-24  
**Prompt:** 3/54  
**Basis:** `evaluations-technical-inventory-2026-07.md`, `evaluations-data-flow-map-2026-07.md`  
**Zweck:** Belastbares Sicherungsnetz vor produktiven Fachlogik-Änderungen an der Auswertungen-Seite

---

## 1. Zusammenfassung

| Kategorie | Status | Anmerkung |
|-----------|--------|-----------|
| Frontend Typecheck (`tsc -b`) | **PASS** | Exit 0 |
| Frontend Production Build | **PASS** | Exit 0 |
| Backend Production Build (`nest build`) | **PASS** | Exit 0 |
| Prisma Validate | **PASS** | 1 Schema-Warning (bestehend) |
| Frontend `test:evaluations` | **PASS** | 30 Tests (22 neu) |
| Backend `test:evaluations` | **PASS** | 122 Tests (3 neu) |
| Frontend ESLint (`lint:all`) | **FAIL** (bestehend) | 1299 Errors repo-weit |
| Backend ESLint (`lint:all`) | **FAIL** (bestehend) | 35 Errors repo-weit |
| Backend `tsc --noEmit` (gesamtes Projekt) | **FAIL** (bestehend) | 29 TS-Fehler in Spec-Dateien |
| Integration / E2E Auswertungen | **Nicht ausgeführt** | Kein dediziertes E2E für `financial-insights` |

**Fazit:** Produktions-Builds und neue Auswertungen-Baseline-Tests sind grün. Repo-weite Lint/TS-Probleme in **unveränderten** Bereichen bestehen vorher und wurden nicht unterdrückt.

---

## 2. Ausgeführte Befehle

### 2.1 Abhängigkeiten

```bash
cd frontend && npm ci          # Exit 0
cd backend && npm ci           # Exit 0
cd backend && npx prisma generate  # Exit 0
```

### 2.2 Typecheck

```bash
cd frontend && npx tsc -b --pretty false
# Exit 0

cd backend && npx tsc --noEmit -p tsconfig.json
# Exit 2 — 29 Fehler (siehe §4.1)
```

**Hinweis:** `nest build` kompiliert erfolgreich (Exit 0), da Nest-Build-Konfiguration Test-Specs ggf. anders behandelt.

### 2.3 Prisma

```bash
cd backend && npm run prisma:validate
# Exit 0 — Schema valid
# Warning: onDelete SetNull auf required relation (bestehend)
```

### 2.4 Linting

```bash
cd frontend && npm run lint:all
# Exit 0 (eslint Prozess) — 1360 problems (1299 errors) repo-weit

cd backend && npm run lint:all
# Exit 0 (eslint Prozess) — 48 problems (35 errors) repo-weit
```

Keine Auswertungen-Dateien gezielt gelintet; `lint`-Scripts im Repo decken nur Teilbereiche ab.

### 2.5 Production Builds

```bash
cd frontend && npm run build
# Exit 0 — vite build → backend/public/

cd backend && npm run build
# Exit 0 — nest build
```

### 2.6 Auswertungen Unit-Tests (neu)

```bash
cd frontend && npm run test:evaluations
# Exit 0 — 4 files, 30 tests

cd backend && npm run test:evaluations
# Exit 0 — 13 suites, 122 tests (runInBand + 8GB heap)

bash scripts/test/evaluations-verify.sh
# Führt Frontend + Backend test:evaluations aus
```

### 2.7 Business-Insights / Finanzlogik (Backend, im test:evaluations enthalten)

```bash
cd backend && NODE_OPTIONS='--max-old-space-size=8192' npx jest --runInBand \
  --testPathPattern='business-insights|financial-insights\.logic|data-analyse\.utils|dashboard-insights|insight-health-gate|misuse-cases\.service|evaluations-baseline' \
  --testPathIgnorePatterns='integration|live'
# Exit 0 — 122 passed
```

**Infrastruktur-Hinweis:** `financial-insights.logic.spec.ts` importiert Frontend-Modul; paralleler Jest-Lauf führt zu **OOM** (Heap). Mitigation: `--runInBand` + `NODE_OPTIONS=--max-old-space-size=8192` in `test:evaluations`.

---

## 3. Neu hinzugefügte Tests

### 3.1 Frontend (Vitest)

| Datei | Tests | Typ |
|-------|-------|-----|
| `frontend/src/rental/lib/evaluations/evaluations-test-fixtures.ts` | — | Shared Fixtures |
| `frontend/src/rental/lib/evaluations/insights-categories.characterization.test.ts` | 8 | Characterization |
| `frontend/src/rental/lib/evaluations/financial-insights-scenarios.characterization.test.ts` | 10 | Characterization |
| `frontend/src/rental/lib/evaluations/insights-cockpit-kpi.characterization.test.ts` | 4 | Characterization (legacy KPI naming) |

**Fixture-Szenarien abgedeckt:**

| Szenario | Fixture-Konstante |
|----------|-------------------|
| Organisation ohne Daten | `SCENARIO_EMPTY`, `SCENARIO_FAILED_SOURCES` |
| Vollständige Daten | `SCENARIO_FULL` |
| Teilweise fehlende Daten | `SCENARIO_PARTIAL` |
| Mehr als vier Insights | `buildManyInsights(6)` |
| Gruppierte Insights | `SCENARIO_GROUPED_INSIGHT` |
| Mehrere Stationen | `VEHICLE_STATION_MAP`, `INSIGHT_STATION_A/B` |
| Mehrere Währungen | `SCENARIO_MULTI_CURRENCY` |
| Überfällig / offen / bezahlt | `SCENARIO_OVERDUE_PARTIAL` |
| Fehlgeschlagene API-Quellen | `SCENARIO_FAILED_SOURCES` (leere Listen) |

**Als „legacy behavior“ / „characterization“ markiert (nicht als fachlich korrekt festgeschrieben):**

- `financialImpactEur`: Werte >1000 werden als Cent /100 interpretiert
- `financialRiskEur` Prop = nur überfällige Forderungen (Cockpit-KPI-Aggregation)
- MTD Revenue zählt offene SENT-Rechnungen im Monat mit (characterization in full-scenario test)

### 3.2 Backend (Jest)

| Datei | Tests | Typ |
|-------|-------|-----|
| `backend/src/modules/business-insights/evaluations-baseline.characterization.spec.ts` | 3 | Characterization (Repository read limits, stale, empty org) |

### 3.3 NPM-Scripts

| Package | Script |
|---------|--------|
| `frontend/package.json` | `test:evaluations` |
| `backend/package.json` | `test:evaluations` |
| `scripts/test/evaluations-verify.sh` | Kombiniertes Verify |

---

## 4. Bereits vorher vorhandene Fehler (nicht durch Prompt 3 verursacht)

### 4.1 Backend TypeScript (`tsc --noEmit`)

29 Fehler, u. a. in:

- `src/modules/users/iam-security-regression.spec.ts`
- `src/modules/users/organization-invites.controller.security.characterization.spec.ts`
- `src/modules/users/users.service.spec.ts`
- `src/modules/vehicle-intelligence/damage-incidents/damage-incident-canonical.spec.ts`
- `src/modules/vehicle-intelligence/trips/lte-r1-behavior-enrichment.service.spec.ts`
- `src/shared/auth/permissions.guard.spec.ts`
- `src/workers/schedulers/document-intake-action-recovery.scheduler.spec.ts`

**Keine Auswertungen-Module betroffen.**

### 4.2 ESLint repo-weit

- Frontend: 1299 Errors (unused vars, etc.) — nicht Auswertungen-spezifisch
- Backend: 35 Errors — nicht Auswertungen-spezifisch

### 4.3 Jest OOM bei parallelem Lauf

`financial-insights.logic.spec.ts` + voller business-insights Pattern-Match ohne `--runInBand` → Worker SIGTERM / heap limit.

### 4.4 Prisma Schema Warning

`onDelete: SetNull` auf required relation — dokumentiert von `prisma validate`.

---

## 5. Durch Prompt 3 verursachte Fehler

**Keine.** Alle neuen Tests bestehen; Builds unverändert grün.

---

## 6. Testabdeckung Auswertungen-Module

| Modul / Bereich | Vor Prompt 3 | Nach Prompt 3 | Lücke |
|-----------------|-------------|---------------|-------|
| `financial-insights.logic.ts` | Backend spec (9) | + Frontend scenario tests (10) | UI `FinancialInsightsView` |
| `insights-categories.ts` | Keine | 8 characterization | — |
| `InsightsCockpit.tsx` | Keine | 4 KPI characterization (extracted) | React render/integration |
| `FinancialInsightsView.tsx` | Keine | — | **Kein Component-Test** |
| `DashboardInsightsContext.tsx` | Keine | — | Polling/error paths |
| `business-insights` Detectors | 5 detector specs + core specs | +3 repository characterization | 7 Detectors ohne dedizierte Spec |
| `dashboard-insights.repository` | Indirekt via service | +3 direct characterization | Integration mit Prisma |
| `data-analyse` | `data-analyse.utils.spec.ts` | unverändert | `DataAnalyseView` UI |
| `misuse-cases` | `misuse-cases.service.spec.ts` | unverändert | Cockpit section E2E |
| `businessPulseSliceBuilder` | 8 tests | in `test:evaluations` | — |
| E2E `financial-insights` | Keine | Keine | **Offen** |

**Geschätzte Abdeckung Kernlogik (reine Functions):** ~70% der clientseitigen Aggregations- und Kategorisierungslogik.  
**UI / API-Integration:** weiterhin ungetestet.

---

## 7. Blockierende Infrastrukturprobleme

| Problem | Auswirkung | Mitigation in Baseline |
|---------|-----------|------------------------|
| Jest OOM bei Frontend-Import aus Backend | Parallele CI-Jobs können flaky sein | `test:evaluations` nutzt `--runInBand` + 8GB heap |
| Keine Postgres/Redis für Integration | Kein Live-Test `dashboard-insights` E2E | Characterization mit Prisma-Mocks |
| `tsc --noEmit` repo-weit rot | CI-Gate falls aktiv | `nest build` + gezielte test:evaluations als Gate |
| ESLint repo-weit rot | Kein sauberes Lint-Gate | Nicht pauschal deaktiviert; Auswertungen-Dateien lint-clean |

---

## 8. Reproduzierbare Schritte

```bash
# 1. Install
cd frontend && npm ci
cd ../backend && npm ci && npx prisma generate

# 2. Schnell-Check Auswertungen-Baseline
bash scripts/test/evaluations-verify.sh

# 3. Vollständiger Build-Check
cd frontend && npx tsc -b && npm run build
cd ../backend && npm run prisma:validate && npm run build

# 4. Optional: gesamter Backend-TSC (zeigt bestehende Spec-Fehler)
cd backend && npx tsc --noEmit -p tsconfig.json
```

---

## 9. Geänderte / neue Dateien (Prompt 3)

### Neu

- `docs/audits/evaluations/evaluations-baseline-test-report-2026-07.md`
- `frontend/src/rental/lib/evaluations/evaluations-test-fixtures.ts`
- `frontend/src/rental/lib/evaluations/insights-categories.characterization.test.ts`
- `frontend/src/rental/lib/evaluations/financial-insights-scenarios.characterization.test.ts`
- `frontend/src/rental/lib/evaluations/insights-cockpit-kpi.characterization.test.ts`
- `backend/src/modules/business-insights/evaluations-baseline.characterization.spec.ts`
- `scripts/test/evaluations-verify.sh`

### Geändert

- `frontend/package.json` — Script `test:evaluations`
- `backend/package.json` — Script `test:evaluations`

### Unverändert (bewusst)

- Keine Produktions-Fachlogik in `FinancialInsightsView`, Detectors, Services
- Keine Tests deaktiviert oder Fehler unterdrückt
- Keine `.skip` / `.only` in neuen Tests

---

## 10. Nächste Schritte (Prompt 4+)

1. Component-Test oder E2E für `financial-insights` View (Smoke: KPI render, error banner)
2. Integrationstest `GET /dashboard-insights` mit Test-DB
3. Shared package für `financial-insights.logic` (Backend-Import ohne OOM-Risiko)
4. ESLint/TS-Cleanup in IAM-Specs (repo-weit, nicht Auswertungen-blockierend)

---

**Dokumentpfad:** `docs/audits/evaluations/evaluations-baseline-test-report-2026-07.md`

**Synqdrive Code → Changes / Architektur:** Nicht aktualisiert (Test-Baseline + Audit-Dokumentation).

# Fleet „Zustand & Service“ — Post-Remediation Readiness Audit (3/3)

| Feld | Wert |
|------|------|
| **Audit-ID** | `fleet-health-service-post-remediation-readiness-2026-07-21` |
| **Prompt** | Phase 9, **65/66** |
| **Audit-Typ** | Read-only, **lokal** — keine Produktions-SSH/DB, keine Writes |
| **Integrations-Branch (Primär)** | `cursor/fleet-health-e2e-bad3` @ `439ed532` |
| **Repository `main` (Referenz)** | `90e8c48a` — **ohne** Fleet-Health-Remediation-Merge |
| **Basis-Audits** | [`fleet-health-service-production-reality.md`](./fleet-health-service-production-reality.md) (1/2), [`fleet-health-service-workflow-ux-test-matrix.md`](./fleet-health-service-workflow-ux-test-matrix.md) (2/2) |
| **Tracker** | [`fleet-health-service-remediation-tracker.md`](../implementation/fleet-health-service-remediation-tracker.md) (Branch `cursor/fleet-health-remediation-tracker-bad3`, Stand Prompt 2 — **veraltet**, siehe §3) |
| **Post-Remediation-Urteil** | **`CONDITIONALLY_READY`** (Integrations-/Staging-Pfad) — **kein** `PRODUCTION_READY` |

---

## 1. Executive Summary

Die Fleet-Health-Service-Remediation (66 Prompts) hat **substantielle Fortschritte** auf **parallelen Feature-Branches** erzielt: paginierter Rental-Health-Fleet-Endpunkt, Service-Case-Verdrahtung in der FHS-UI, priorisierte Multi-Finding-Übersicht, Observability (Metriken, Grafana, Alerts, Runbook), Domain-Integrationstests und ein dedizierter Playwright-Flow (Prompt 63). Lokale Tests auf dem Integrations-Branch **`cursor/fleet-health-e2e-bad3`**: **178 bestandene Tests** (55 Backend FHS + 7 Battery/Prometheus + 68 Frontend FHS + 32 Runtime/Control-Center + 16 E2E), **0 Failures**.

**Es gibt keine belastbare Production-Ready-Freigabe:**

1. **Nicht auf `main` gemerged** — Produktion (Audit 1: VPS `ac856881`) liegt weiterhin hinter dem Remediation-Stack.
2. **Fragmentierte Branches** — Vendor-Fehler, Unified Refresh, RBAC-Guards und erweiterte Service-Case-Arbeiten existieren auf **separaten** Branches, die **nicht** in den Integrations-Branch eingeflossen sind (§2).
3. **Offene P0/P1** — Vendor silent-fail (P0-2), Task-Pagination (P0-5), Health-Degradation `rental_blocked: false` (P0-4), Health→Task FALSE_MATCH (P1-1), RBAC auf Integrations-Branch (P1-4), `blocksRental` nicht in Runtime State (P1-5).
4. **Kein Staging-/Prod-Sign-off** — Prompt 64 Runbook existiert, wurde in diesem Audit **nicht** gegen Live-VPS ausgeführt.

**Empfehlung:** Integrations-Branch + offene Remediation-Branches konsolidieren → Staging-Deploy → read-only Validation Runbook (P64) → erneutes Gate (P65) vor Pilot.

---

## 2. Audit-Scope und Methodik

| Quelle | Methode | Grenzen |
|--------|---------|---------|
| Code-Review | Statische Analyse auf Integrations-Branch + Stichproben paralleler Branches | Kein vollständiges Merge aller 15+ Branches |
| Unit/Integration-Tests | `npm test` / `vitest` / Playwright lokal | Mock-E2E, nicht Produktion |
| Tracker P1–P64 | Abgleich Tracker-Doc vs. tatsächlicher Branch-Stand | Tracker-Doc nicht nachgepflegt seit Prompt 2 |
| Prod-Befunde Audit 1 | **Nicht** re-verifiziert | PM2/Battery-Logs/DB-Counts zeitpunktbezogen |

**Strikte Regeln eingehalten:** keine DB-Writes, keine Queue-Mutationen, keine Restarts, keine manuellen Jobs.

---

## 3. Remediation-Tracker (Prompts 1–64)

Legende: **DONE** · **PARTIAL** · **TODO** · **BRANCH** (implementiert, aber nicht im Integrations-Branch `@439ed532`)

| ID | Titel (Kurz) | Status | Evidenz / Branch |
|----|--------------|--------|------------------|
| 1 | Remediation-Vertrag | **DONE** | `fleet-health-service-remediation-contract.md` (Tracker-Branch) |
| 2 | Tracker 66 | **PARTIAL** | Tracker existiert, **nicht** auf aktuellem Integrations-Stand |
| 3 | Domain Boundaries ADR | **DONE** | `docs/architecture/fleet-health-service-domain-boundaries.md` |
| 4 | Call-Site-Baseline | **DONE** | `fleet-health-service-callsite-baseline.md` |
| 5 | Testplan & Fixtures | **TODO** | Matrix in Audit 2, kein dedizierter Testplan-Doc |
| 6 | Rollout-Flags & Deploy-Runbook | **PARTIAL** | P64 `fleet-health-service-production-validation.md` auf `cursor/fleet-health-prod-validation-bad3` |
| 7 | Vendor-Fehler exponieren | **BRANCH** | `cursor/fleet-health-unified-refresh-bad3` — `service-center-source-state.ts` |
| 8 | Service Cases Data Layer | **PARTIAL** | `useFleetHealthServiceCases.ts` auf Integrations-Branch; vollständiger Source-State **BRANCH** |
| 9 | Service Cases UI | **PARTIAL** | Overview + Drawer + Filter; dedizierte Work-Liste **BRANCH** (`service-cases-list`) |
| 10 | Health Degradation ehrlich | **PARTIAL** | `data_partial` + `_error`; `rental_blocked: false` in `degradedVehicleHealth` bleibt |
| 11 | `sourceFindingId` Dedup | **TODO** | `health-task-bridge.utils.ts` unverändert |
| 12 | Unified `reloadAll()` | **BRANCH** | `fleet-health-service-refresh-coordinator` auf unified-refresh-Branch |
| 13 | Task-Pagination Backend | **TODO** | `tasks.service.ts` — kein `take`/cursor |
| 14 | Task-Pagination Frontend | **TODO** | `useServiceCenterData` lädt volle Liste |
| 15 | Health Fleet POST body | **TODO** | Paginated GET `rental-health/fleet` statt POST (akzeptabler Ersatz) |
| 16 | Battery V2 Job-ID | **DONE** | `battery-v2-job-queue.util.ts` + Spec PASS |
| 17 | Cases Termine-Tab | **PARTIAL** | Tasks in Schedule; Cases mit `scheduledAt` in Overview/Drawer |
| 18 | Cases Historie-Tab | **PARTIAL** | `history` Tab task-basiert; abgeschlossene Cases nicht dediziert |
| 19 | Case/Task/Health KPI-Trennung | **DONE** | `fleet-health-kpi-split` Commits auf Integrations-Branch |
| 20 | `blocksRental` → Runtime | **TODO** | Nur FHS-Filter `getBlockingServiceCaseVehicleIds`, nicht `vehicleRuntimeStateBuilder` |
| 21 | Health-sourced Case CTA | **PARTIAL** | Technical observation → Case in E2E + Backend-Integrationstest |
| 22 | Case-Dokumente Historie | **TODO** | — |
| 23 | Case↔Task in FHS | **PARTIAL** | Drawer zeigt verknüpfte Tasks; kein vollständiger Task-Detail-Flow |
| 24 | Case Integrationstests | **PARTIAL** | BE `fleet-health-service.domain.integration.spec.ts` (15), FE domain test (6) |
| 25 | Multi-Finding Übersicht | **DONE** | `fleet-health-service-vehicle-overview.ts`, expandable rows |
| 26 | Bridge Unit-Tests | **TODO** | Kein `health-task-bridge.utils.test.ts` |
| 27 | `sourceFindingId` Metadata | **TODO** | — |
| 28 | Match-Status-Typen | **TODO** | — |
| 29 | Execution-only Dedup | **PARTIAL** | ViewModel-Sections; keine dedizierten FALSE_MATCH-Typen |
| 30 | Bridge Contract Docs | **PARTIAL** | `FLEET_HEALTH_SERVICE_CONTRACT.md` aktualisiert |
| 31 | Permission Keys | **BRANCH** | `cursor/fleet-health-remediation-tracker-bad3` / RBAC-Commits, **nicht** in Integrations-Branch |
| 32 | Tasks PermissionsGuard | **BRANCH** | wie 31 |
| 33 | Service-Cases PermissionsGuard | **BRANCH** | wie 31 |
| 34 | Frontend Permission-Gating | **PARTIAL** | E2E Mock read-only; kein durchgängiges UI-Gating |
| 35 | RBAC Controller-Specs | **BRANCH** | 101 Tests laut Tracker, **nicht** auf Integrations-Branch ausgeführt |
| 36 | RBAC Rollenmatrix-Docs | **BRANCH** | wie 31 |
| 37 | Rental-Health Batch härten | **PARTIAL** | Summary read model + batch 5 |
| 38 | Frontend Health Chunking | **PARTIAL** | `getFleetScoped` paginiert; kein Multi-Chunk für Legacy-Pfad |
| 39 | Task Cursor API-Vertrag | **TODO** | — |
| 40 | Task Summary effizient | **TODO** | — |
| 41 | Virtualisierte Fahrzeugliste | **TODO** | — |
| 42 | URL/Chunk Limit Tests | **PARTIAL** | `fleet-health-service.view-model.scale.test.ts` (5) |
| 43 | Large-Fleet Harness | **PARTIAL** | `docs/testing/fleet-health-service-scale-benchmarks.md` |
| 44 | FHS Cache / SWR | **TODO** | — |
| 45 | Per-Modul Freshness | **BRANCH** | `cursor/fleet-health-freshness-bad3` |
| 46 | KPI-Strip Fehlerzustände | **BRANCH** | unified-refresh + freshness Branches |
| 47 | Task Partial-Load UI | **BRANCH** | unified-refresh `service-center-source-state` |
| 48 | Window-Focus Refetch | **TODO** | — |
| 49 | Stale-Badge pro Modul | **BRANCH** | freshness-Branch |
| 50 | Partial-Failure Integration | **PARTIAL** | E2E Tests 9–10; dedizierte Spec **BRANCH** |
| 51 | DE Fehlermeldungen FHS | **DONE** | `fleet-health-service.i18n.test.ts` |
| 52 | Operator-Labels | **DONE** | `fleet-health-service-labels.ts` + terminology commit |
| 53 | Keyboard Subtabs | **PARTIAL** | `fleet-health-service-a11y.ts`; keine vollständige Roving-Tabindex-Spec |
| 54 | Mobile Drawer Focus-Trap | **PARTIAL** | `fleet-health-service.a11y.ui.test.tsx` + E2E mobile drawer |
| 55 | Dark-Mode KPI-Kontrast | **NOT_VERIFIABLE** | Kein automatisierter Kontrast-Test |
| 56 | IA „Arbeiten“ | **DONE** | 4 Top-Tabs, Work-Panel mit tasks/schedule/vendors |
| 57 | Deep-Link & Back | **DONE** | `fleet-health-service.types.ts` + E2E 14a–14c |
| 58 | Permission-Denied UI | **PARTIAL** | E2E Test 12 (Mock); keine Live-RBAC-Verifikation |
| 59 | Prometheus Metriken | **DONE** | `fleet-health-observability/`, `synqdrive_fleet_health_*` |
| 60 | Grafana Dashboard | **DONE** | `synqdrive-fleet-health-service.json` |
| 61 | SLO-Alerts | **DONE** | `alerts.yml` + `fleet-health-service-readiness-alerts-slo.md` |
| 62 | Ops Runbook Incidents | **DONE** | `fleet-health-service-readiness.md` |
| 63 | Playwright E2E Flow | **DONE** | `fleet-health-service-flow.spec.ts` — 16 PASS |
| 64 | E2E Matrix-Abdeckung | **PARTIAL** | ~12/14 P0/P1-Szenarien mock-abgedeckt; formaler ≥80%-Nachweis fehlt |

**Tracker-Zählung (1–64, konservativ):** DONE **16** · PARTIAL **28** · BRANCH **10** · TODO **9** · NOT_VERIFIABLE **1**

---

## 4. P0 / P1 / P2 — Remediation-Status (beide Ursprungsaudits)

### 4.1 P0

| ID | Finding | Audit | Status | Nachweis |
|----|---------|-------|--------|----------|
| P0-1 | Service Cases fehlen in FHS | 1, 2 | **PARTIAL → CONDITIONALLY_READY** | `useFleetHealthServiceCases`, Overview/Drawer/Filter; nicht in Schedule/Historie/useServiceCenterData |
| P0-2 | Vendor silent fail | 1, 2 | **NOT_READY** | Integrations-Branch: `useServiceCenterData.ts:30` `.catch(() => [])`; Fix auf **unified-refresh-Branch** |
| P0-3 | Battery V2 Enqueue `:` | 1, 2 | **READY** (Code) / **NOT_VERIFIABLE** (Prod) | `buildBatteryV2JobId` SHA-256; Spec PASS; Prod-Log nicht erneut geprüft |
| P0-4 | Health error → `rental_blocked: false` | 2 | **NOT_READY** | `degradedVehicleHealth` setzt weiterhin `rental_blocked: false` |
| P0-5 | Tasks ohne Pagination | 1, 2 | **NOT_READY** | `tasks.service.ts` full `findMany` |

### 4.2 P1

| ID | Finding | Status | Nachweis |
|----|---------|--------|----------|
| P1-1 | Health→Task FALSE_MATCH | **NOT_READY** | `findDuplicateHealthTask` Typ-Heuristik |
| P1-2 | Refresh nur Health | **PARTIAL** | Split: Header `reloadHealth` vs. Overview `reloadService`; unified-refresh **BRANCH** |
| P1-3 | Eine Zeile/Fahrzeug | **READY** | Expandable multi-finding rows |
| P1-4 | RBAC Tasks/SC | **NOT_READY** (Integration) / **BRANCH** | PermissionsGuard auf separater Branch, nicht in `@439ed532` |
| P1-5 | `blocksRental` nicht Rental Health/Runtime | **PARTIAL** | FHS blocking filter only |
| P1-6 | Kein `sourceFindingId` | **NOT_READY** | Bridge metadata |
| P1-7 | Termine ohne Case-Dates | **PARTIAL** | Cases in Overview; Schedule task-only |
| P1-8 | Skalierung 500+ vehicleIds | **PARTIAL** | Paginated `rental-health/fleet`; Tasks weiterhin unbounded |

### 4.3 P2

| ID | Finding | Status | Nachweis |
|----|---------|--------|----------|
| P2-1 | Triage-Jargon / EN strings | **READY** | i18n + labels tests |
| P2-2 | Freshness nur max timestamp | **BRANCH** | freshness-Branch |
| P2-3 | Kein Grafana FHS | **READY** | Dashboard + Docs im Repo |
| P2-4 | Kein FHS E2E | **READY** | Playwright 16 PASS |
| P2-5 | PM2 / snapshot poll failures | **NOT_VERIFIABLE** | Audit-1-Snapshot; nicht re-validiert |

---

## 5. Domänen-Bewertung

| Domäne | Urteil | Begründung (Kurz) |
|--------|--------|-------------------|
| **Architektur-Invarianten** | **CONDITIONALLY_READY** | Zwei-Schichten-Modell erhalten; Service Cases teilweise verdrahtet; `blocksRental`/`unknown`-Semantik noch Lücken |
| **Battery-V2** | **READY** (Code) | Job-ID-Sanitizer + Tests; Prod-Wirkung **NOT_VERIFIABLE** |
| **RBAC** | **NOT_READY** | Integrations-Branch ohne PermissionsGuard; RBAC-Work auf unmerged Branch |
| **Partial Failures** | **CONDITIONALLY_READY** | Source-State + KPI-Fehler auf **BRANCH**; E2E deckt vendor-stats/service-error ab |
| **Service Cases** | **CONDITIONALLY_READY** | Fetch + UI-Kernpfade; Work-Liste/Historie/Termine unvollständig |
| **Finding Matching** | **NOT_READY** | Bridge-Dedup unverändert; keine dedizierten Specs |
| **Runtime State** | **CONDITIONALLY_READY** | `rental_blocked` aus Rental Health; Case-Blockade nicht in `vehicleRuntimeStateBuilder` |
| **Pagination** | **CONDITIONALLY_READY** | Health fleet paginiert; Tasks/Service Cases unbounded |
| **UI/UX** | **CONDITIONALLY_READY** | IA, KPI-Split, Priority Overview, DE Copy; Permission/Partial-Failure-Lücken |
| **Mobile / A11y** | **READY** | 5 a11y UI tests + mobile E2E drawer PASS |
| **Metrics / Observability** | **READY** | Metriken, Grafana JSON, SLO alerts, incident runbook + prometheus-config spec |
| **Tests** | **CONDITIONALLY_READY** | 178 PASS lokal; RBAC-Suite nicht auf Branch; keine Prod-E2E |

### Gesamturteil

| Ebene | Urteil |
|-------|--------|
| **Code-Integrations-Branch** | **CONDITIONALLY_READY** |
| **Production / Pilot** | **NOT_READY** |
| **Sign-off Production-Ready** | **Abgelehnt** — keine belastbare Evidenz |

---

## 6. Architektur-Invarianten (Detail)

| Invariante | Soll | Ist (Integrations-Branch) | Status |
|----------|------|---------------------------|--------|
| Rental Health = Diagnose | 7 Module, `rental_blocked` unabhängig | `RentalHealthService` unverändert kanonisch | **READY** |
| Task ≠ Health-Bewertung | Getrennte Schichten | ViewModel kombiniert ohne Re-Scoring | **READY** |
| Service Case = Vorgang | Backend + FHS | `useFleetHealthServiceCases` + UI-Teilpfade | **CONDITIONALLY_READY** |
| Runtime = Mietbereitschaft | `vehicleRuntimeStateBuilder` | Health `rental_blocked` in Reasons; Case `blocksRental` **nicht** | **CONDITIONALLY_READY** |
| `unknown` ≠ safe | `limited` band | `fleet-health-control-center` Tests PASS | **READY** |
| Warning blockiert nicht auto. | Hard-block only | Policy unverändert | **READY** |
| Task DONE ≠ Health behoben | Getrennt | Architektur erhalten | **READY** |
| Per-vehicle Fehler ehrlich | Kein falsches „frei“ | `rental_blocked: false` bei Degradation | **NOT_READY** |

---

## 7. Testausführung (lokal, Integrations-Branch)

Ausgeführt am **2026-07-21** auf `cursor/fleet-health-e2e-bad3` @ `439ed532`.

### 7.1 Backend

```bash
cd backend && npm test -- --testPathPattern="fleet-health|rental-health-fleet|rental-health-summary|fleet-health-service.domain|fleet-health-prometheus|fleet-health-task-match|technical-observations"
```

| Ergebnis | 11 Suites, **55 Tests PASS** |

Zusätzlich:

```bash
npm test -- --testPathPattern="battery-v2-job-queue|prometheus-config"
```

| Ergebnis | 2 Suites, **7 Tests PASS** |

**RBAC-Suite** (`fleet-service.permissions`, `tasks.permissions`, …): **nicht ausführbar** — Specs nicht auf Integrations-Branch.

### 7.2 Frontend

```bash
cd frontend && npm test -- --run fleet-health-service
```

| Ergebnis | 9 Dateien, **68 Tests PASS** |

```bash
npm test -- --run fleet-health-control-center vehicleRuntimeStateBuilder rentalReadiness
```

| Ergebnis | 3 Dateien, **32 Tests PASS** |

### 7.3 E2E (isolierte Mocks, nicht Produktion)

```bash
cd frontend && npx playwright test -c e2e/playwright.config.ts fleet-health-service-flow.spec.ts --project=desktop-1280 --project=mobile-375
```

| Ergebnis | **16 passed**, 16 skipped (falsches Projekt) |

### 7.4 Gesamt

| Kategorie | Tests PASS | Failures |
|-----------|------------|----------|
| Backend FHS-relevant | 62 | 0 |
| Frontend FHS + Runtime | 100 | 0 |
| E2E FHS Flow | 16 | 0 |
| **Summe** | **178** | **0** |

---

## 8. Verbleibende Blocker vor Pilot

| Prio | Blocker | Prompt-Bezug |
|------|---------|--------------|
| P0 | Branch-Konsolidierung → `main` + Staging-Deploy | Governance |
| P0 | Vendor-Fehler (P0-2) mergen oder nachziehen | 7 |
| P0 | Task-Pagination (P0-5) | 13–14 |
| P0 | Health-Degradation Semantik (P0-4) | 10 |
| P1 | RBAC auf Integrations-Branch verifizieren | 31–35 |
| P1 | Health→Task Bridge (P1-1, P1-6) | 11, 26–28 |
| P1 | Unified Refresh mergen | 12 |
| P1 | `blocksRental` in Runtime State | 20 |
| Ops | P64 Validation Runbook gegen Staging | 64 |
| Ops | Grafana/Alerts auf VPS provisionieren | 60–61 |

---

## 9. Abnahmekriterien Prompt 65 (Gate)

| Gate | Kriterium | Status |
|------|-----------|--------|
| G1 | Tracker 1–64 reviewed | **PASS** (§3) |
| G2 | P0/P1/P2 aus beiden Audits mapped | **PASS** (§4) |
| G3 | Domänen bewertet READY/…/NOT_VERIFIABLE | **PASS** (§5) |
| G4 | Relevante Tests ausgeführt | **PASS** (§7) |
| G5 | Keine unbelegte Production-Ready-Behauptung | **PASS** |
| G6 | Alle P0 auf Integrations-Branch grün | **FAIL** |
| G7 | `main` = Remediation + Staging sign-off | **FAIL** |

**Prompt 65 Gate:** **FAIL** — dokumentierte Ausnahmen erforderlich für kontrollierten Pilot; volles Production-Ready **nicht** erreichbar.

---

## 10. Prompt 66 (Sign-off) — Voraussetzungen

1. Merge-Train: `unified-refresh`, `freshness`, `service-cases-list`, RBAC-Branch → Integrations-Branch → `main`.
2. Staging-Deploy + `docs/runbooks/fleet-health-service-production-validation.md` (read-only).
3. P0-2, P0-4, P0-5, P1-1, P1-4, P1-5 schließen oder formal defer mit Owner.
4. Tracker-Dokument auf aktuellen Stand bringen (Prompt 2 Nachpflege).
5. Erneutes Post-Remediation-Audit nach Staging-Evidenz.

---

## 11. Verwandte Artefakte

| Artefakt | Pfad |
|----------|------|
| Production Validation (read-only) | `docs/runbooks/fleet-health-service-production-validation.md` |
| Incident Runbook | `docs/runbooks/fleet-health-service-readiness.md` |
| Domain Integration Tests | `docs/testing/fleet-health-service-domain-integration.md` |
| Scale Benchmarks | `docs/testing/fleet-health-service-scale-benchmarks.md` |
| E2E Spec | `frontend/e2e/fleet-health-service-flow.spec.ts` |

---

## 12. Changelog

| Version | Datum | Änderung |
|---------|-------|----------|
| 1.0 | 2026-07-21 | Initiales Post-Remediation-Audit (Prompt 65/66) |

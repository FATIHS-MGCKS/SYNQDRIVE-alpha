# Fleet „Zustand & Service“ — Remediation-Tracker (66 Prompts) — **FINAL**

| Feld | Wert |
|------|------|
| **Version** | **2.0 (final)** |
| **Abgeschlossen (UTC)** | 2026-07-21 |
| **Prompt** | 66/66 (Sign-off) |
| **Vertrag** | [`fleet-health-service-remediation-contract.md`](./fleet-health-service-remediation-contract.md) (Tracker-Branch) |
| **Integrations-Branch** | `cursor/fleet-health-e2e-bad3` @ `439ed532` |
| **Post-Remediation-Audit** | [`docs/audits/fleet-health-service-post-remediation-readiness.md`](../audits/fleet-health-service-post-remediation-readiness.md) |
| **Rollout-Plan** | [`docs/releases/fleet-health-service-rollout-plan.md`](../releases/fleet-health-service-rollout-plan.md) |
| **Gesamturteil** | **`CONDITIONALLY_READY`** (Code-Integration) · **`NO_GO`** (Production-Pilot) |

---

## 1. Zweck

Finaler Nachvollziehbarkeits-Tracker nach Abschluss aller 66 Prompts. Status basiert auf Post-Remediation-Audit (P65) und Code-Review auf dem Integrations-Branch.

**Legende Status:**

| Status | Bedeutung |
|--------|-----------|
| **DONE** | Akzeptanzkriterien auf Integrations-Branch erfüllt + Testnachweis |
| **PARTIAL** | Kern vorhanden; Lücken dokumentiert |
| **BLOCKED** | Rollout-blockierend; Gate oder Merge fehlt |
| **DEFER** | Bewusst nach Pilot verschoben |
| **NOT_VERIFIABLE** | Kein automatisierter Nachweis |

---

## 2. Basis-Audits

| Audit | Datei | Urteil |
|-------|-------|--------|
| **1 — Production Reality** | [`fleet-health-service-production-reality.md`](../audits/fleet-health-service-production-reality.md) | `CONDITIONALLY_READY` |
| **2 — Workflow/UX-Matrix** | [`fleet-health-service-workflow-ux-test-matrix.md`](../audits/fleet-health-service-workflow-ux-test-matrix.md) | `CONDITIONALLY_READY` |
| **3 — Post-Remediation** | [`fleet-health-service-post-remediation-readiness.md`](../audits/fleet-health-service-post-remediation-readiness.md) | `CONDITIONALLY_READY` / Prod **NOT_READY** |

---

## 3. Phasenübersicht (final)

| Phase | Prompts | Fokus | DONE | PARTIAL | BLOCKED | DEFER/N.V. |
|-------|---------|-------|------|---------|---------|------------|
| 0 | 1–6 | Planung, Baseline, Rollout | 4 | 2 | 0 | 0 |
| 1 | 7–16 | P0 Kritisch | 1 | 2 | 3 | 0 |
| 2 | 17–24 | Service Cases Tiefe | 1 | 5 | 1 | 0 |
| 3 | 25–30 | Health→Task-Brücke | 1 | 2 | 3 | 0 |
| 4 | 31–36 | RBAC | 0 | 1 | 5 | 0 |
| 5 | 37–44 | Skalierung | 0 | 4 | 4 | 0 |
| 6 | 45–50 | Partial Failure | 0 | 1 | 4 | 0 |
| 7 | 51–58 | UX / i18n / a11y | 4 | 3 | 0 | 1 |
| 8 | 59–62 | Observability | 4 | 0 | 0 | 0 |
| 9 | 63–66 | E2E, Gate, Sign-off | 3 | 1 | 0 | 0 |
| **Σ** | **66** | | **18** | **25** | **21** | **1** |

*Hinweis: BLOCKED umfasst Items auf separaten Branches (RBAC, unified-refresh) und offene P0.*

---

## 4. Prompt-Register (vollständig, final)

### Phase 0 — Planung & Baseline

| ID | Titel | Status | Evidenz / Commit | Testnachweis |
|----|-------|--------|------------------|--------------|
| **1** | Remediation-Vertrag | **DONE** | `fleet-health-service-remediation-contract.md` | N/A |
| **2** | Remediation-Tracker 66 | **DONE** | Dieses Dokument v2.0 (P66) | N/A |
| **3** | Domain Boundaries ADR | **DONE** | `docs/architecture/fleet-health-service-domain-boundaries.md` | N/A |
| **4** | Call-Site-Baseline | **DONE** | `fleet-health-service-callsite-baseline.md` | 283 Tests (Baseline) |
| **5** | Testplan & Fixtures | **PARTIAL** | Matrix in Audit 2; kein dedizierter Testplan-Doc | E2E-Fixtures P63 |
| **6** | Rollout-Flags & Deploy-Runbook | **PARTIAL** | P64 Runbook (prod-validation Branch); P66 Rollout-Plan §5 | N/A |

### Phase 1 — P0 Kritisch

| ID | Titel | Status | Evidenz / Branch | Testnachweis |
|----|-------|--------|------------------|--------------|
| **7** | Vendor-Fehler exponieren | **BLOCKED** | Fix auf `cursor/fleet-health-unified-refresh-bad3`; **nicht** merged | E2E 9 mock only |
| **8** | Service Cases Data Layer | **PARTIAL** | `useFleetHealthServiceCases.ts` auf Integrations-Branch | FE domain test (6) |
| **9** | Service Cases UI | **PARTIAL** | Overview + Drawer; Work-Liste auf `service-cases-list` Branch | E2E 6–7 |
| **10** | Health Degradation ehrlich | **BLOCKED** | `degradedVehicleHealth` → `rental_blocked: false` (P0-4) | — |
| **11** | `sourceFindingId` Dedup | **BLOCKED** | `health-task-bridge.utils.ts` unverändert (P1-1) | — |
| **12** | Unified `reloadAll()` | **BLOCKED** | `fleet-health-service-refresh-coordinator` auf unified-refresh Branch | E2E 10 partial |
| **13** | Task-Pagination Backend | **BLOCKED** | `tasks.service.ts` ohne cursor (P0-5) | — |
| **14** | Task-Pagination Frontend | **BLOCKED** | `useServiceCenterData` full list (P0-5) | — |
| **15** | Health Fleet Batch API | **PARTIAL** | Paginated GET `rental-health/fleet` statt POST | BE fleet scale spec |
| **16** | Battery V2 Job-ID | **DONE** | `battery-v2-job-queue.util.ts` | 7 BE tests PASS |

### Phase 2 — Service Cases Tiefe

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **17** | Cases Termine-Tab | **PARTIAL** | Cases in Overview; Schedule task-only | E2E 8 |
| **18** | Cases Historie-Tab | **PARTIAL** | History tab task-basiert | — |
| **19** | Case/Task/Health KPI-Trennung | **DONE** | `fleet-health-kpi-split` | KPI tests (5) |
| **20** | `blocksRental` → Runtime | **BLOCKED** | Nur FHS-Filter, nicht `vehicleRuntimeStateBuilder` (P1-5) | — |
| **21** | Health-sourced Case CTA | **PARTIAL** | Technical observation → Case | E2E 6, BE integration |
| **22** | Case-Dokumente Historie | **DEFER** | Nicht implementiert | — |
| **23** | Case↔Task in FHS | **PARTIAL** | Drawer verknüpfte Tasks | E2E 7 |
| **24** | Case Integrationstests | **PARTIAL** | BE 15 + FE 6 domain tests | 21 PASS |

### Phase 3 — Health→Task-Brücke

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **25** | Multi-Finding Übersicht | **DONE** | `fleet-health-service-vehicle-overview.ts` | 7 + E2E 3 |
| **26** | Bridge Unit-Tests | **BLOCKED** | Kein `health-task-bridge.utils.test.ts` | — |
| **27** | `sourceFindingId` Metadata | **BLOCKED** | Nicht persistiert (P1-6) | — |
| **28** | Match-Status-Typen | **BLOCKED** | Keine FALSE_MATCH-Typen | — |
| **29** | Execution-only Dedup | **PARTIAL** | ViewModel-Sections | view-model tests |
| **30** | Bridge Contract Docs | **PARTIAL** | `FLEET_HEALTH_SERVICE_CONTRACT.md` | — |

### Phase 4 — RBAC

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **31** | Permission Keys | **BLOCKED** | Auf RBAC-Branch, **nicht** in Integrations-Branch | 101 Specs (Branch) |
| **32** | Tasks PermissionsGuard | **BLOCKED** | Wie 31 (P1-4) | Branch only |
| **33** | Service-Cases PermissionsGuard | **BLOCKED** | Wie 31 | Branch only |
| **34** | Frontend Permission-Gating | **PARTIAL** | E2E 12 Mock | E2E PASS |
| **35** | RBAC Controller-Specs | **BLOCKED** | Nicht auf Integrations-Branch ausführbar | — |
| **36** | RBAC Rollenmatrix-Docs | **BLOCKED** | Auf RBAC-Branch | — |

### Phase 5 — Skalierung

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **37** | Rental-Health Batch härten | **PARTIAL** | Summary read model + batch 5 | BE specs |
| **38** | Frontend Health Chunking | **PARTIAL** | `getFleetScoped` paginiert | scale test (5) |
| **39** | Task Cursor API-Vertrag | **BLOCKED** | Abhängig P13 | — |
| **40** | Task Summary effizient | **BLOCKED** | Abhängig P13 | — |
| **41** | Virtualisierte Fahrzeugliste | **BLOCKED** | Nicht implementiert | — |
| **42** | URL/Chunk Limit Tests | **PARTIAL** | `view-model.scale.test.ts` | 5 PASS |
| **43** | Large-Fleet Harness | **PARTIAL** | `fleet-health-service-scale-benchmarks.md` | Doc only |
| **44** | FHS Cache / SWR | **BLOCKED** | Nicht implementiert | — |

### Phase 6 — Partial Failure & Freshness

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **45** | Per-Modul Freshness | **BLOCKED** | `cursor/fleet-health-freshness-bad3` | — |
| **46** | KPI-Strip Fehlerzustände | **BLOCKED** | unified-refresh + freshness Branches | — |
| **47** | Task Partial-Load UI | **BLOCKED** | `service-center-source-state` Branch | — |
| **48** | Window-Focus Refetch | **BLOCKED** | Nicht implementiert | — |
| **49** | Stale-Badge pro Modul | **BLOCKED** | freshness-Branch | — |
| **50** | Partial-Failure Integration | **PARTIAL** | E2E 9–10 | 16 E2E PASS |

### Phase 7 — UX / i18n / a11y

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **51** | DE Fehlermeldungen FHS | **DONE** | `fleet-health-service.i18n.test.ts` | 3 PASS |
| **52** | Operator-Labels | **DONE** | `fleet-health-service-labels.ts` | 2 PASS |
| **53** | Keyboard Subtabs | **PARTIAL** | `fleet-health-service-a11y.ts` | a11y ui (5) |
| **54** | Mobile Drawer Focus-Trap | **PARTIAL** | a11y ui + E2E mobile | PASS |
| **55** | Dark-Mode KPI-Kontrast | **NOT_VERIFIABLE** | Kein automatisierter Kontrast-Test | — |
| **56** | IA „Arbeiten“ | **DONE** | 4 Top-Tabs, Work-Panel | E2E 1, 14 |
| **57** | Deep-Link & Back | **DONE** | URL sync + legacy deep links | E2E 14a–c |
| **58** | Permission-Denied UI | **PARTIAL** | E2E 12 Mock; kein Live-RBAC | E2E PASS |

### Phase 8 — Observability

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **59** | Prometheus Metriken | **DONE** | `fleet-health-observability/` | prometheus spec |
| **60** | Grafana Dashboard | **DONE** | `synqdrive-fleet-health-service.json` | Doc |
| **61** | SLO-Alerts | **DONE** | `alerts.yml` + SLO doc | — |
| **62** | Ops Runbook Incidents | **DONE** | `fleet-health-service-readiness.md` | — |

### Phase 9 — E2E & Abnahme

| ID | Titel | Status | Evidenz | Testnachweis |
|----|-------|--------|---------|--------------|
| **63** | Playwright E2E Flow | **DONE** | `fleet-health-service-flow.spec.ts` | **16 PASS** |
| **64** | E2E Matrix-Abdeckung | **PARTIAL** | ~12/14 P0/P1 mock-abgedeckt | formal ≥80% fehlt |
| **65** | Post-Remediation-Audit | **DONE** | `fleet-health-service-post-remediation-readiness.md` | 178 tests PASS |
| **66** | Go/No-Go Rollout-Plan | **DONE** | `fleet-health-service-rollout-plan.md` | Urteil **NO_GO** |

---

## 5. P0/P1 Blocker-Register (Rollout)

| ID | Finding | Tracker | Status | Rollout-Plan |
|----|---------|---------|--------|--------------|
| P0-1 | Service Cases in FHS | P8–P9 | **PARTIAL** | Pilot mit eingeschränktem Scope |
| P0-2 | Vendor silent fail | P7 | **BLOCKED** | §4.1, §10.3 |
| P0-3 | Battery V2 Job-ID | P16 | **DONE** (Code) | §10.1 |
| P0-4 | Health → false safe | P10 | **BLOCKED** | §10.3 |
| P0-5 | Task Pagination | P13–P14 | **BLOCKED** | §6.3, G14 |
| P1-1 | FALSE_MATCH | P11, P26–28 | **BLOCKED** | §10.3 |
| P1-4 | RBAC | P31–36 | **BLOCKED** | §10.2 |
| P1-5 | blocksRental Runtime | P20 | **BLOCKED** | §4.2 |

---

## 6. Testnachweis (Integrations-Branch, final)

Ausgeführt 2026-07-21 auf `cursor/fleet-health-e2e-bad3` @ `439ed532`:

```bash
# Backend FHS-relevant — 55 PASS
cd backend && npm test -- --testPathPattern="fleet-health|rental-health-fleet|rental-health-summary|fleet-health-service.domain|fleet-health-prometheus|fleet-health-task-match|technical-observations"

# Battery + Prometheus config — 7 PASS
cd backend && npm test -- --testPathPattern="battery-v2-job-queue|prometheus-config"

# Frontend FHS — 68 PASS
cd frontend && npm test -- --run fleet-health-service

# Runtime / Control Center — 32 PASS
cd frontend && npm test -- --run fleet-health-control-center vehicleRuntimeStateBuilder rentalReadiness

# E2E — 16 PASS
cd frontend && npx playwright test -c e2e/playwright.config.ts fleet-health-service-flow.spec.ts --project=desktop-1280 --project=mobile-375
```

| Summe | **178 PASS**, 0 Failures |
|-------|--------------------------|
| RBAC-Suite | **nicht ausführbar** auf Integrations-Branch |

---

## 7. Merge-Train (offen)

Vor Pilot müssen in den Integrations-Branch und `main` gemergt werden:

| Branch | Inhalt | Blockiert |
|--------|--------|-----------|
| `cursor/fleet-health-unified-refresh-bad3` | P7, P12, P46–P47 | P0-2, Partial Failure |
| `cursor/fleet-health-freshness-bad3` | P45, P49 | P2-2 |
| `cursor/fleet-health-service-cases-list-bad3` | P9 erweitert | Service Cases UI |
| RBAC-Commits auf `cursor/fleet-health-remediation-tracker-bad3` | P31–P36 | P1-4 |
| `cursor/fleet-health-prod-validation-bad3` | P64 Runbook | G11 |
| `cursor/fleet-health-post-audit-bad3` | P65 Audit | Gate |
| `cursor/fleet-health-rollout-plan-bad3` | P66 Plan | Sign-off |

---

## 8. Änderungshistorie

| Datum (UTC) | Prompt | Änderung |
|-------------|--------|----------|
| 2026-07-20 | 2 | Initiale Tracker-Erstellung (v1.0) |
| 2026-07-20 | 3–4, 16, 31–36 | Teil-Updates RBAC, ADR, Baseline, Battery |
| 2026-07-21 | 65 | Post-Remediation-Audit; Tracker-Abgleich 1–64 |
| 2026-07-21 | **66** | **Tracker finalisiert (v2.0); Rollout-Plan; NO_GO Sign-off** |

---

*Remediation-Programm 66/66 abgeschlossen (Dokumentation + Code auf Integrations-Branch). Production-Pilot erst nach Rollout-Plan Gates.*

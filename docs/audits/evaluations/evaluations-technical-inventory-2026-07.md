# Technische Bestandsaufnahme — SynqDrive „Auswertungen“

**Datum:** 2026-07-24  
**Repository:** `SYNQDRIVE-alpha` (Workspace-Commit: detached HEAD)  
**Scope:** Prompt 1/54 — reine Bestandsaufnahme, keine produktiven Änderungen  
**Auditor:** Cursor Cloud Agent (read-only Code-Analyse)

---

## Executive Summary

Im SynqDrive-Codebase existiert **kein eigenständiges Modul mit dem Namen „Auswertungen“**. Der Produktbegriff mappt auf **drei technische Säulen**:

| Säule | Produktlabel (DE) | View-Key / Route | Zielgruppe |
|-------|-------------------|------------------|------------|
| **Finanz-Auswertungen** | „Auswertungen“ (`nav.financialInsights`) | `financial-insights` | Alle Org-Mitglieder (Finance-Bereich) |
| **Business Insights Cockpit** | eingebettet in Finanz-Auswertungen + Dashboard | — | Alle Org-Mitglieder |
| **Data Analyse** | „Data Analyse“ (`nav.dataAnalyse`) | `data-analyse` | Admin mit Permission `data-analyse.read` |

Zusätzlich existieren **verwandte Analytics-Oberflächen**, die nicht unter dem Sidebar-Label „Auswertungen“ laufen, aber operativ relevant sind: Dashboard-Finanz-KPIs, Fleet Health, Misuse Cases, Voice/WhatsApp-Analytics, Schadens-Heatmaps.

Die Rental-SPA nutzt **kein URL-Routing** für Hauptviews; Navigation erfolgt über `currentView`-State in `App.tsx`.

---

## 1. Dateiinventar mit Verantwortlichkeit

### 1.1 Frontend — Primäre Auswertungen-Oberflächen

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `frontend/src/rental/App.tsx` | View-Routing (`financial-insights`, `data-analyse`); Legacy-Redirect `fleet-condition` → Fleet Hub |
| `frontend/src/rental/components/Sidebar.tsx` | Navigation: Finance → Auswertungen; Data Analyse (permission-gated) |
| `frontend/src/rental/components/TopBar.tsx` | Suche/Navigation inkl. Finanz-Views |
| `frontend/src/rental/components/finance-navigation.ts` | Finance-View-URL-Parsing; `financial-insights` als Finance-View erkannt |
| `frontend/src/rental/components/FinancialInsightsView.tsx` | **Hauptseite Finanz-Auswertungen**: Invoice-KPIs, Chart, Top-Kunden/Fahrzeuge, Drill-down-Modal |
| `frontend/src/rental/components/insights/InsightsCockpit.tsx` | Business-Risk-Cockpit: KPI-Strip, Insight-Karten, Misuse-Section, Empfehlungen |
| `frontend/src/rental/lib/financial-insights.logic.ts` | Pure Invoice-Aggregation (MTD Umsatz, Forderungen, Ausgaben, reservierter Umsatz) |
| `frontend/src/rental/lib/insights-categories.ts` | Insight-Partitionierung (Business Risk / Revenue Leakage / Empfehlungen), Station-Filter, Finanzimpact |
| `frontend/src/rental/DashboardInsightsContext.tsx` | Shared Context für `GET /dashboard-insights`; 5-Min-Polling; Vehicle-Health-Alert-Ableitung |
| `frontend/src/rental/components/DataAnalyseView.tsx` | Admin-Telemetrie-Analyse: Signals, HF, Events, Pipeline, ClickHouse-Debug |
| `frontend/src/rental/components/invoices/invoiceClassification.ts` | Invoice-Typ/Status-Klassifikation (von Finanz-Logik importiert) |

### 1.2 Frontend — Dashboard (Analytics-adjacent, nicht eigene Auswertungen-Route)

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `frontend/src/rental/components/DashboardView.tsx` | Control-Center mit Finance-KPI-Strip + Action Queue |
| `frontend/src/rental/components/dashboard/useDashboardViewModel.ts` | Zentraler Dashboard-VM: Invoices, Bookings, Stations, Service Cases, Insights |
| `frontend/src/rental/components/dashboard/FinanceKpiStrip.tsx` | Dashboard-Finanz-KPI-Zeile |
| `frontend/src/rental/components/dashboard/financeKpiCards.tsx` | KPI-Card-Rendering + Metric-ID → i18n |
| `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.ts` | **Aktiver** clientseitiger Finance-Slice-Builder für Drill-downs |
| `frontend/src/rental/components/dashboard/DashboardDrilldownDrawer.tsx` | Side-Drawer Drill-down (KPIs, Fleet, Finance) |
| `frontend/src/rental/components/dashboard/dashboardDrilldownCta.ts` | CTA-Routing (`open-finance` → `financial-insights`) |
| `frontend/src/rental/components/dashboard/ActionQueue.tsx` | Ersetzt `BusinessInsightsBox`; merged Insights + Health + Today-Ops |
| `frontend/src/rental/components/dashboard/actionQueueBuilder.ts` | Unified Action Queue aus Insights, Health Alerts, Bookings |
| `frontend/src/rental/components/dashboard/deriveOperationalInsights.ts` | Client-abgeleitete Cross-Module-Ops-Hints |
| `frontend/src/rental/components/dashboard/derivePredictiveOperationsInsights.ts` | Predictive Ops Hints (clientseitig) |
| `frontend/src/rental/components/dashboard/dataTrustBuilder.ts` | Data-Trust-Status pro Domain (`insights`, `financial`) |
| `frontend/src/rental/components/dashboard/controlSignalsBuilder.ts` | Fleet Readiness, Telemetry Freshness (client-KPIs) |
| `frontend/src/rental/components/dashboard/businessPulseBuilder.ts` | **Deprecated** — nicht vom aktiven Dashboard genutzt |
| `frontend/src/rental/components/dashboard/BusinessPulse.tsx` | **Exportiert, nicht gerendert** — ersetzt durch `FinanceKpiStrip` |
| `frontend/src/rental/components/BusinessInsightsBox.tsx` | **Legacy, keine Imports** — ersetzt durch `ActionQueue` |

### 1.3 Frontend — Verwandte Analytics (nicht Sidebar „Auswertungen“)

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `frontend/src/rental/components/FleetConditionView.tsx` | Fleet Health Condition Board |
| `frontend/src/rental/components/FleetHubView.tsx` | Fleet-Tabs inkl. `condition-service` |
| `frontend/src/rental/components/fleet-health-service/*` | Fleet Health Service KPIs, Overview, Cases |
| `frontend/src/rental/lib/fleet-health-control-center.ts` | Client-KPI/Grouping für Fleet Health |
| `frontend/src/rental/components/VehicleInsightsCard.tsx` | Per-Vehicle Intelligence Widget — **nicht in App gemountet** |
| `frontend/src/rental/components/vehicle-insights-logic.ts` | Client-Verdict/Readiness/Cost/Downtime |
| `frontend/src/rental/components/RentalStressAnalysisCard.tsx` | Driving-Stress-Evaluation |
| `frontend/src/rental/components/damages/DamageInsightsSection.tsx` | Damage Heatmap auf Damages-View |
| `frontend/src/rental/lib/damage-insights.ts` | Damage Vehicle Insight Cards |
| `frontend/src/rental/components/vehicle-bookings/VehicleAvailabilityInsights.tsx` | Utilization/Free-Slot Insights |
| `frontend/src/rental/lib/vehicle-availability-insights.utils.ts` | Availability Insight Builder |
| `frontend/src/rental/components/MisuseCasesPanel.tsx` | Standalone Misuse-Panel (nicht nur Cockpit) |
| `frontend/src/rental/components/voice-assistant/VoiceAnalyticsView.tsx` | Voice Assistant Usage Analytics |
| `frontend/src/rental/components/voice-assistant/VoiceUsageAnalyticsPanel.tsx` | Usage/Billing Period Panel |
| `frontend/src/rental/components/voice-assistant/VoiceOpsKpiStrip.tsx` | Voice Ops KPI Strip |
| `frontend/src/rental/components/whatsapp/WhatsAppKpiCards.tsx` | WhatsApp Business KPI Cards |
| `frontend/src/lib/api.ts` | API-Client: `dashboardInsights`, `dataAnalyse`, `misuseCases`, `invoices`, etc. |

### 1.4 Frontend — i18n

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `frontend/src/rental/i18n/translations/de.ts` | `nav.financialInsights` = „Auswertungen“, `nav.insights` = „Auswertungen“ (orphaned), `nav.dataAnalyse` |
| `frontend/src/rental/i18n/translations/en.ts` | Entsprechende EN-Keys |
| `frontend/src/rental/i18n/translations/{fr,nl,es,it,pl,cs}.ts` | Weitere Locales |

**Hinweis:** `FinancialInsightsView` und `InsightsCockpit` enthalten überwiegend **hardcodierte DE/EN-Texte**, nicht i18n-Keys.

### 1.5 Frontend — Tests

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.test.ts` | Finance-Slice KPI Tests |
| `frontend/src/rental/components/dashboard/deriveOperationalInsights.test.ts` | Ops Insight Derivation |
| `frontend/src/rental/components/dashboard/derivePredictiveOperationsInsights.test.ts` | Predictive Ops |
| `frontend/src/rental/components/dashboard/dashboardRuntimeUI.test.ts` | Assertiert kein `<BusinessPulse>` |
| `frontend/src/rental/components/dashboard/dashboardRegressionAudit.test.ts` | Dashboard Regression |
| `frontend/src/rental/components/dashboard/notificationEngine*.test.ts` | Notification Engine Dedupe/Characterization |
| `frontend/src/rental/components/dashboard/actionQueueGrouping.test.ts` | Action Queue Grouping |
| `frontend/src/rental/lib/damage-insights.test.ts` | Damage Insights |
| `frontend/src/rental/components/vehicle-insights-logic.tire.test.ts` | Vehicle Insights Logic |
| `frontend/src/rental/lib/notifications/notifications-v2-cutover.test.ts` | V2 Cutover (referenziert dashboard-insights) |
| `frontend/e2e/dashboard-notifications-v2.spec.ts` | E2E Dashboard Notifications V2 |

**Keine dedizierten Frontend-Tests** für `FinancialInsightsView`, `InsightsCockpit`, `insights-categories.ts`, `DataAnalyseView`.

### 1.6 Frontend — Legacy/Prototyp

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `frontend/figma-rental/App.tsx` | Alter Prototyp mit `analytics`, `fleet-condition` Views |
| `frontend/figma-rental/components/Sidebar.tsx` | Legacy Insights-Section |

### 1.7 Backend — Business Insights / Dashboard

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/business-insights/business-insights.module.ts` | Nest Module + Detector Registration |
| `backend/src/modules/business-insights/business-insights.service.ts` | Orchestrator: Detectors, Gating, Publish, Notification Ingest, Task Bridge |
| `backend/src/modules/business-insights/business-insights-scheduler.service.ts` | Cron `2,32 * * * *` + Boot-Stagger → BullMQ Enqueue |
| `backend/src/modules/business-insights/business-insights-trigger.service.ts` | Event-driven debounced reruns (BullMQ) |
| `backend/src/modules/business-insights/dashboard-insights.controller.ts` | Tenant Read API `GET /dashboard-insights` |
| `backend/src/modules/business-insights/dashboard-insights.repository.ts` | Prisma Persistence, Stale-Flag, Publish/Prune |
| `backend/src/modules/business-insights/internal-business-insights.controller.ts` | MASTER_ADMIN Ops API |
| `backend/src/modules/business-insights/tenant-insight-policy.service.ts` | Per-Tenant Policy |
| `backend/src/modules/business-insights/insight.types.ts` | Candidates, Policy, DTOs, Trigger Types |
| `backend/src/modules/business-insights/insight-ranking.service.ts` | Priority Ranking |
| `backend/src/modules/business-insights/insight-grouping.service.ts` | Dedupe + Fleet Grouping |
| `backend/src/modules/business-insights/insight-formatter.service.ts` | Title/Message Formatting (optional LLM) |
| `backend/src/modules/business-insights/insight-health-gate.ts` | Health Insights nur mit upcoming Booking |
| `backend/src/modules/business-insights/insight-task-bridge.service.ts` | Insight → OrgTask Materialization |
| `backend/src/modules/business-insights/insight-task.mapper.ts` | Severity → Task Priority |
| `backend/src/modules/business-insights/financial-insights.logic.spec.ts` | Spiegelt Frontend `financial-insights.logic.ts` (Backend-Test only) |

### 1.8 Backend — Detectors (`detectors/`)

| Datei | `InsightType` | Datenquelle (Kurz) |
|-------|---------------|-------------------|
| `tight-handover.detector.ts` | `TIGHT_HANDOVER` | Bookings, Handover-Puffer |
| `return-needs-inspection.detector.ts` | `RETURN_NEEDS_INSPECTION` | Returns, Inspection Status |
| `station-shortage.detector.ts` | `STATION_SHORTAGE` | Stations, Vehicles, Bookings (24h Horizon) |
| `low-utilization.detector.ts` | `LOW_UTILIZATION` | Vehicle Bookings, `dailyRateEur`, Lookback |
| `service-window.detector.ts` | `SERVICE_WINDOW` | Service Cases, Bookings |
| `service-before-booking.detector.ts` | `SERVICE_BEFORE_BOOKING` | Service + upcoming Bookings |
| `battery-critical.detector.ts` | `BATTERY_CRITICAL` | Battery Health Service |
| `tire-critical.detector.ts` | `TIRE_CRITICAL` | Tire Health Service |
| `brake-critical.detector.ts` | `BRAKE_CRITICAL` | Brake Health Service |
| `compliance-operational.detector.ts` | `SERVICE_OVERDUE`, `TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `HM_SERVICE_NO_TRACKING` | `service-compliance-operational.signals.ts` (Single Source) |
| `pickup-overdue.detector.ts` | `PICKUP_OVERDUE` | Bookings Pickup Window |
| `driving-assessment-device-quality.detector.ts` | `DRIVING_ASSESSMENT_DEVICE_QUALITY` | `vehicle_driving_assessment_quality` |

### 1.9 Backend — Data Analyse

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/data-analyse/data-analyse.module.ts` | Module Wiring |
| `backend/src/modules/data-analyse/data-analyse.controller.ts` | Org-scoped REST (Permission `data-analyse.read`) |
| `backend/src/modules/data-analyse/data-analyse.service.ts` | Telemetry Overview, Signals, HF, Pipeline, Health Trace |
| `backend/src/modules/data-analyse/data-analyse.types.ts` | DTOs |
| `backend/src/modules/data-analyse/data-analyse.constants.ts` | KPI Thresholds, Cadence Caps, Permission Key |
| `backend/src/modules/data-analyse/data-analyse.utils.ts` | Interval Stats, Cadence KPI Math, `tenantVehicleWhere()` |
| `backend/src/modules/data-analyse/data-analyse-signal-catalog.ts` | Signal Group / Catalog Definitions |

**Nested (Battery Shadow, permission-gated via data-analyse):**

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/vehicle-intelligence/battery-health/hv-capacity-shadow/hv-capacity-shadow-evaluation.controller.ts` | Per-Vehicle HV Shadow Evaluation |
| `backend/src/modules/vehicle-intelligence/battery-health/hv-capacity-shadow/hv-capacity-shadow-evaluation.service.ts` | Shadow SOH Logic |
| `backend/src/modules/vehicle-intelligence/battery-health/shadow-validation/battery-shadow-validation.controller.ts` | Org Battery V2 Shadow Report |

### 1.10 Backend — Misuse Cases

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.controller.ts` | `GET/POST .../misuse-cases` |
| `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.service.ts` | List/Get Logic |
| `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-case-lifecycle/misuse-case-lifecycle.service.ts` | Lifecycle Transitions |
| `backend/src/modules/vehicle-intelligence/shadow-detector/*` | Shadow Detector Pipeline (Misuse Evidence) |

### 1.11 Backend — Notification Evaluation Runtime

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/notifications/runtime/notification-evaluation.service.ts` | BullMQ Enqueue, Redis Lock, ruft `BusinessInsightsService.runForOrganization` |
| `backend/src/modules/notifications/runtime/notification-evaluation.types.ts` | Job/Result Types |
| `backend/src/modules/notifications/runtime/notification-evaluation-queue.util.ts` | Job IDs, Redis Key Prefixes |
| `backend/src/modules/notifications/runtime/notification-evaluation-observability.service.ts` | Metrics/Logging |
| `backend/src/modules/notifications/adapters/notification-producer.ingest.service.ts` | V2 Ingest aus Insight Run |
| `backend/src/modules/notifications/adapters/rental-health-notification.projector.ts` | Rental Health → Notification Sources |
| `backend/src/workers/processors/notification-evaluation.processor.ts` | BullMQ Worker (concurrency 2) |
| `backend/src/workers/processors/notification-delivery.processor.ts` | Delivery Worker |
| `backend/src/modules/notifications/delivery/notification-delivery-scheduler.service.ts` | Outbox Polling Cron (30s) |
| `backend/src/config/notification-evaluation.config.ts` | `NOTIFICATION_EVALUATION_*` Env |

### 1.12 Backend — ClickHouse / Analytics Layer

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/clickhouse/clickhouse-analytics.service.ts` | Ignition/Motion Segments, Activity Windows |
| `backend/src/modules/clickhouse/clickhouse-hf.service.ts` | HF Points/Events Reads |
| `backend/src/modules/clickhouse/clickhouse-diagnostics.service.ts` | Global CH Diagnostics |
| `backend/src/modules/clickhouse/clickhouse-table-registry.ts` | Table Registry; Data Analyse Consumers |
| `backend/src/modules/clickhouse/migrations/*.sql` | CH DDL |

### 1.13 Backend — Adjacent Analytics

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/src/modules/vehicle-intelligence/trips/trip-analytics-canonical.service.ts` | Canonical Trip Hydration + Vehicle Stats |
| `backend/src/modules/vehicle-intelligence/damages/damage-analytics.ts` | Damage Heatmap Pure Functions |
| `backend/src/modules/rental-health/rental-health.service.ts` | Health Aggregation (Insight Notification Sync) |
| `backend/src/modules/invoices/*` | Invoice CRUD (Finanz-Auswertungen Datenquelle) |
| `backend/src/modules/voice-assistant/voice-assistant.controller.ts` | Voice Analytics Endpoint |
| `backend/src/modules/voice-billing/voice-billing.controller.ts` | Revenue Forecast |
| `backend/src/modules/users/iam-team.controller.ts` | `GET .../iam/team/kpis` |
| `backend/src/workers/schedulers/data-retention.scheduler.ts` | Daily 03:30 Telemetry Retention (nicht Insight-Tables) |

### 1.14 Backend — Config / Auth

| Datei | Verantwortlichkeit |
|-------|-------------------|
| `backend/.env.example` | `NOTIFICATIONS_V2`, `NOTIFICATION_EVALUATION_*`, `CLICKHOUSE_*`, `HF_MIRROR_ENABLED` |
| `backend/src/shared/auth/permission.constants.ts` | Module Key `data-analyse` |
| `backend/src/modules/users/defaults/organization-role.defaults.ts` | Default Permissions inkl. `data-analyse` |

### 1.15 Prisma / DB

| Model / Table | Zweck |
|---------------|-------|
| `TenantInsightPolicy` / `tenant_insight_policies` | Per-Org Enable, Refresh, Max Visible, Enabled Types |
| `DashboardInsightRun` / `dashboard_insight_runs` | Run Audit Trail |
| `DashboardInsight` / `dashboard_insights` | Published Dashboard Cards |
| `Notification` / `notifications` | V2 Durable Inbox (`legacyInsightId` Bridge) |
| `VehicleDrivingAssessmentQuality` / `vehicle_driving_assessment_quality` | Device Quality Detector Input |
| `AnalyticsCache` / `analytics_cache` | DIMO Chart Payload Cache |
| `InsightType` enum (15 Werte) | Detector Types |
| `OrgInvoice` (via invoices module) | Finanz-Auswertungen Rohdaten |

**Keine Prisma-Seeds** für Insights/Policies gefunden.

### 1.16 Architecture Docs (referenziert)

| Datei | Thema |
|-------|-------|
| `architecture/CLICKHOUSE_DIAGNOSTICS_2026-07-08.md` | CH Diagnostics |
| `architecture/HF_WINDOWS_SIGNAL_QUALITY_2026-07-08.md` | HF/Signal Quality |
| `architecture/DRIVING_ASSESSMENT_DEVICE_QUALITY_2026-07-10.md` | Device Quality |
| `architecture/TRIP_SYSTEM_AUDIT_2026-04-10.md` | Trip System |
| `docs/notification-engine-source-ownership.md` | Notification Engine Ownership |
| `docs/notification-engine-current-state.md` | Notification Engine State |
| `docs/architecture/hv-capacity-shadow-evaluation.md` | HV Shadow Evaluation |

---

## 2. Komponenten- und Modulübersicht

### 2.1 Navigation / Routing

```
Sidebar (Finance)
  └── financial-insights  →  FinancialInsightsView
        ├── InsightsCockpit (Business Insights)
        │     ├── RunStateBanner
        │     ├── InsightKpiCard ×5
        │     ├── Geschäftsrisiken (InsightCard[])
        │     ├── Umsatzverlust (InsightCard[])
        │     ├── MisuseAbuseSection → api.misuseCases.list
        │     └── Empfohlene Maßnahmen
        ├── Finanz-KPI-Grid (KpiCard ×5)
        ├── Recharts AreaChart (daily revenue/expenses)
        ├── Snapshot Sidebar (margin, MoM, avg invoice)
        ├── ListCards (top customers/vehicles, recent activity)
        └── BreakdownPopup (revenue/expenses drill-down)

Sidebar (Support, permission-gated)
  └── data-analyse  →  DataAnalyseView
        └── Tabs: Overview | Signals | HF | Events | Device Connection |
                  RPM Webhooks | Launch | Health | Pipeline | Groups | CH Debug

Dashboard (separate View)
  └── FinanceKpiStrip + ActionQueue + DashboardDrilldownDrawer
        └── CTA open-finance → financial-insights
```

### 2.2 State Management / Data Fetching

| Mechanismus | Verwendung |
|-------------|------------|
| `useState` + `useEffect` + `api.*` | `FinancialInsightsView`, `DataAnalyseView`, Misuse Section |
| `DashboardInsightsContext` | 5-Min-Polling `api.dashboardInsights.get(orgId)` |
| `useDashboardViewModel` | Dashboard: Invoices, Bookings, Stations, Service Cases |
| `FleetContext` | `rental-health` Map für Vehicle Health Alerts |
| TanStack Query | **Nicht** für Auswertungen/Dashboard Insights verwendet |

### 2.3 Backend-Modularchitektur

```
BusinessInsightsScheduler (Cron 2,32 * * * *)
  → NotificationEvaluationService.scheduleScheduledEvaluation
    → BullMQ notification.evaluation
      → NotificationEvaluationProcessor
        → BusinessInsightsService.runForOrganization
          → Detectors (parallel Promise.allSettled)
          → InsightHealthGate
          → Grouping → Ranking → Formatting
          → DashboardInsightsRepository.publishInsights
          → InsightTaskBridgeService.materialize
          → NotificationProducerIngestService (V2 sync)
          → syncVehicleHealthNotifications
```

---

## 3. Datenquellen je Analysebereich

| Analysebereich | Primäre Datenquelle | API / Tabelle | Berechnung |
|----------------|--------------------|--------------:|------------|
| **MTD Umsatz** | Org Invoices | `GET /organizations/:orgId/invoices` | Client: `mtdRevenueInRange()` |
| **MTD Ausgaben** | Org Invoices (incoming) |同上 | Client: `expensesInRange()` |
| **Gewinn / Marge** | Abgeleitet | — | Client: Revenue − Expenses |
| **Offene / überfällige Forderungen** | Org Invoices (outgoing) |同上 | Client: `openOutgoingReceivables()`, `overdueOutgoingReceivables()` |
| **MoM Deltas** | Org Invoices (prev month) |同上 | Client |
| **Daily Chart** | Org Invoices MTD |同上 | Client: Tages-Buckets |
| **Top Kunden/Fahrzeuge** | Invoices + Customers + Fleet | `invoices`, `customers`, FleetContext | Client Aggregation |
| **Business Risks** | Dashboard Insights | `GET /dashboard-insights` | **Backend Detectors** → Prisma `dashboard_insights` |
| **Revenue Leakage** | Dashboard Insights (`LOW_UTILIZATION`) |同上 | Backend Detector |
| **Finanzrisiko (geschätzt)** | Overdue EUR + Insight `financialImpactCents` | Client Merge | Client: `estimatedRisk` in InsightsCockpit |
| **Misuse / Nutzungsauffälligkeiten** | Misuse Cases | `GET /organizations/:orgId/misuse-cases` | Backend Shadow Detector Pipeline |
| **Empfohlene Maßnahmen** | Dashboard Insights (CRITICAL/WARNING) | `/dashboard-insights` | Client: `partitionInsights()` |
| **Telemetry Overview** | DIMO/CH Snapshots | `data-analyse/vehicles/:id/telemetry-overview` | Backend `DataAnalyseService` |
| **Signals / HF / Pipeline** | ClickHouse + Prisma | diverse `data-analyse/*` Endpoints | Backend |
| **Signal Quality** | ClickHouse `signal_quality_snapshots` | `signal-quality/latest` | Backend |
| **CH Diagnostics** | ClickHouse Cluster | `clickhouse-diagnostics` | Backend (global, `orgId` ignoriert) |
| **Battery Shadow** | Battery Health V2 Shadow | `hv-capacity-shadow-evaluation` | Backend (internal shadow) |
| **Dashboard Finance KPIs** | Org Invoices | `invoices` via `useDashboardViewModel` | Client: `businessPulseSliceBuilder` |
| **Vehicle Health Alerts** | Rental Health V1 | `GET /organizations/:orgId/rental-health` | Client: `deriveVehicleHealthAlertsFromRentalHealth` |
| **Voice Analytics** | Voice Assistant Sessions | `voice-assistant/analytics` | Backend |
| **Damage Heatmap** | Damage Stats | `damages/stats` | Backend `damage-analytics.ts` + Client |

---

## 4. KPIs, Insights, Risiken und Empfehlungen

### 4.1 Finanz-KPIs (`FinancialInsightsView`)

| KPI | Formel / Quelle | Währung |
|-----|-----------------|---------|
| Issued Revenue MTD | `mtdRevenueInRange` (issued + paid, dedupliziert) | EUR (nur `isEurInvoice`) |
| Paid Revenue MTD | `paidRevenueInRange` | EUR |
| Expenses MTD | `expensesInRange` (incoming) | EUR |
| Profit MTD | Revenue − Expenses | EUR |
| Profit Margin | Profit / Revenue × 100 | % |
| Open Receivables | `openOutgoingReceivables` | EUR |
| Overdue Receivables | `overdueOutgoingReceivables` | EUR |
| Revenue MoM Delta | vs. previous month `mtdRevenueInRange` | % |
| Expense MoM Delta | vs. previous month `expensesInRange` | % |
| Avg Invoice Value | MTD Revenue / Count | EUR |
| MTD Open Invoice Count | MTD invoices ≠ PAID/CANCELLED | Count |
| Top 5 Customers | MTD revenue by `customerId` | EUR |
| Top 5 Vehicles | MTD revenue by `vehicleId` | EUR |
| Daily Revenue/Expenses/Profit | Per-day buckets current month | EUR |

**Reservierter Umsatz** (`reservedRevenueInRange`) existiert in `financial-insights.logic.ts` und wird im Dashboard (`businessPulseSliceBuilder`) genutzt, aber **nicht** auf der Auswertungen-Hauptseite als eigene KPI-Karte angezeigt (laut Code-Inspektion).

### 4.2 Insights-Cockpit KPIs

| KPI | Quelle |
|-----|--------|
| Business Risks (Count) | `partitionInsights().businessRisks.length` |
| Finanzrisiko (geschätzt) | `overdueReceivablesEur` + Σ `financialImpactEur(insight)` |
| Offene Forderungen | Prop `openReceivablesEur` von Parent |
| Kritische Buchungen | Business Risks mit `severity === CRITICAL` |
| Revenue Leakage (Count) | `partitionInsights().revenueLeakage.length` |

### 4.3 Business Insight Types (Backend Detectors)

| Type | Kategorie (Frontend) | Severity-Typisch |
|------|---------------------|------------------|
| `TIGHT_HANDOVER` | Business Risk | WARNING/CRITICAL |
| `RETURN_NEEDS_INSPECTION` | Business Risk | WARNING |
| `STATION_SHORTAGE` | Business Risk | CRITICAL |
| `LOW_UTILIZATION` | Revenue Leakage | OPPORTUNITY/WARNING |
| `SERVICE_WINDOW` | Business Risk | WARNING |
| `SERVICE_BEFORE_BOOKING` | Business Risk | CRITICAL |
| `BATTERY_CRITICAL` | Hidden unless booking context | CRITICAL |
| `TIRE_CRITICAL` | Hidden unless booking context | CRITICAL |
| `BRAKE_CRITICAL` | Hidden unless booking context | CRITICAL |
| `SERVICE_OVERDUE` | Business Risk | CRITICAL |
| `PICKUP_OVERDUE` | Business Risk | CRITICAL |
| `TUV_OVERDUE` | Business Risk | CRITICAL |
| `BOKRAFT_OVERDUE` | Business Risk | CRITICAL |
| `HM_SERVICE_NO_TRACKING` | Business Risk (via compliance detector) | WARNING |
| `DRIVING_ASSESSMENT_DEVICE_QUALITY` | Operational Recommendation | WARNING |

**Frontend `InsightType` enthält `RETURN_OVERDUE`**, das im Backend-Prisma-Enum **nicht existiert** — potenzieller Typ-Mismatch (toter Frontend-Typ).

**Backend `HM_SERVICE_NO_TRACKING`** fehlt im Frontend `InsightType` Union — wird ggf. als generischer Typ behandelt.

### 4.4 Data Analyse KPIs (Backend, pro Vehicle)

- Telemetry freshness / last signal age
- HF availability status (`hf_available`, `sparse`, `snapshot_only`, `missing`)
- Signal cadence KPIs (via `data-analyse.utils.ts`)
- Pipeline stage status
- Event architecture layer counts
- Device connection episode summary
- RPM webhook candidate counts
- Launch feasibility score
- Health trace module states

### 4.5 Empfehlungen (Recommendations)

| Quelle | Mechanismus |
|--------|-------------|
| Insight `metrics.recommendation` | Backend Detector / Formatter |
| Insight `actionLabel` | Backend |
| Fallback `insightRecommendation()` | Client hardcoded DE per `InsightType` |
| Misuse Case `recommendedAction` | Backend Misuse Pipeline |
| Action Queue (Dashboard) | `actionQueueBuilder` merged aus Insights + Health + Bookings |

---

## 5. Hintergrundprozesse

| Prozess | Datei | Trigger | Redis/BullMQ |
|---------|-------|---------|--------------|
| Scheduled Insight Evaluation | `business-insights-scheduler.service.ts` | Cron `2,32 * * * *` (~30 min) | BullMQ `notification.evaluation` |
| Boot Evaluation Stagger | `business-insights-scheduler.service.ts` | `onApplicationBootstrap` + `bootStaggerMs` (15s default) | BullMQ |
| Debounced Event Evaluation | `business-insights-trigger.service.ts` | `requestDebouncedRerun` (120s debounce) | Redis `notification:eval:pending:{orgId}` |
| Evaluation Worker | `notification-evaluation.processor.ts` | Queue consumer | Concurrency 2, Org Lock |
| Insight Data Prune | `business-insights.service.ts` | Every 48 scheduler cycles (~24h) | — |
| Notification Delivery | `notification-delivery-scheduler.service.ts` | Cron `*/30 * * * * *` | BullMQ `notification.delivery` |
| Driving Assessment Trigger | `driving-assessment-device-quality.service.ts` | Status change | `requestDebouncedRerun` |
| Data Retention (Telemetry) | `data-retention.scheduler.ts` | Daily 03:30 | — (nicht Insight-Tables) |
| DIMO Poll Jobs | `DimoPollJobType.ANALYTICS` | DIMO Worker | Separate Queue |

### Redis-Abhängigkeiten

- BullMQ backing store (evaluation + delivery queues)
- `notification:eval:pending:{orgId}` — Event Coalescing
- `notification:eval:followup:{orgId}` — Lock-Contention Follow-up
- Org-scoped Distributed Lock (`RedisDistributedLockService`) während Evaluation
- Lock unavailable → Evaluation skipped (`lock_redis_unavailable`)

### Feature Flags / Env

| Variable | Default (.env.example) | Effekt |
|----------|------------------------|--------|
| `NOTIFICATIONS_V2` | `false` | V2 Inbox Writes + REST (503 wenn false) |
| `NOTIFICATION_EVALUATION_QUEUE_ENABLED` | `true` | BullMQ Evaluation Jobs |
| `NOTIFICATION_EVALUATION_DEBOUNCE_MS` | `120000` | Debounce Window |
| `NOTIFICATIONS_DELIVERY_ENABLED` | — | Async Delivery |
| `WORKERS_ENABLED` | — | Worker Process Registration |
| `HF_MIRROR_ENABLED` | `false` | HF ClickHouse Mirror (Data Analyse HF Tab) |
| `CLICKHOUSE_URL` | local | CH Availability (graceful degradation) |

---

## 6. Guards, Rollen, Tenant-Scoping

| Endpoint-Gruppe | Guards | Permission | Station Scope |
|-----------------|--------|------------|---------------|
| `dashboard-insights` | `OrgScopingGuard`, `RolesGuard` | **Keine** — jedes aktive Org-Mitglied | **Nein** |
| `data-analyse/*` | `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard` | `data-analyse.read` | Vehicle via `tenantVehicleWhere` |
| `misuse-cases` | `OrgScopingGuard`, `RolesGuard` | Keine explizite Module Permission | Nein |
| `invoices` | Org-scoped | Finance Permissions | Nein (laut invoices module) |
| `admin/business-insights` | `MASTER_ADMIN` | Cross-org by design | — |
| `notifications` V2 | Org + Roles | `NOTIFICATIONS_V2` flag | **Ja** via `NotificationStationScopeService` |

**Permission `data-analyse`:** ORG_ADMIN/SUB_ADMIN default; WORKER erhält read via `workerReadPermissions()`.

---

## 7. Export, Download, Drill-down

| Feature | Ort | Status |
|---------|-----|--------|
| Revenue/Expense Drill-down Modal | `FinancialInsightsView` → `BreakdownPopup` | Implementiert (per-day invoice expansion) |
| KPI Click → Popup | Revenue/Expenses `KpiCard onClick` | Implementiert |
| Dashboard Drill-down Drawer | `DashboardDrilldownDrawer` | Implementiert |
| Finance Metric Drill-down | `FinanceKpiStrip` → Drawer | Implementiert |
| CTA → Auswertungen | `dashboardDrilldownCta` `open-finance` | Implementiert |
| Insight Card Click-through | `InsightsCockpit` InsightCard | **Nicht implementiert** (zeigt bookingId/customerId Badges, kein Nav) |
| CSV/PDF/XLSX Export | Auswertungen-Surfaces | **Nicht implementiert** |
| Data Analyse Tab Export | `DataAnalyseView` | **Nicht implementiert** |

---

## 8. Platzhalter, Duplikate, Tote Pfade

### 8.1 Platzhalterdaten

| Bereich | Mock/Placeholder? | Evidenz |
|---------|-------------------|---------|
| `FinancialInsightsView` | **Nein** | Kommentar + Code: echte Invoices, Empty States |
| `InsightsCockpit` | **Nein** | Live API |
| `DataAnalyseView` | **Nein** | Echte Backend Diagnostics |
| Dashboard Finance | **Nein** | Echte Invoices; `—` bei Fehler |
| i18n `dashboard.routeOptimizationDesc` etc. | **Stale Marketing Copy** | In Locale-Dateien, nicht an Live-Widgets gebunden |

### 8.2 Clientseitig berechnete Unternehmenskennzahlen

- Gesamte Finanz-KPI-Sektion der Auswertungen-Seite (kein dediziertes Backend-Aggregations-Endpoint)
- Dashboard Finance KPIs (`businessPulseSliceBuilder`)
- Insights-Cockpit `estimatedRisk`, Kategorisierung, Station-Filter
- Dashboard Operational/Predictive Insights (`deriveOperationalInsights`, `derivePredictiveOperationsInsights`)

### 8.3 Doppelte / widersprüchliche Berechnungen

| Thema | Detail |
|-------|--------|
| Health: Dashboard vs Notifications | Detectors (Battery/Tire/Brake) **und** `syncVehicleHealthNotifications()` via Rental Health — zwei Emissionspfade |
| Tire/Brake Alerts | Detectors + `TireHealthAlertService.listOpenAlertNotificationSources()` — potenzielle Überlappung |
| Finanz-Logik Frontend/Backend | Logik nur im Frontend; Backend-Test `financial-insights.logic.spec.ts` spiegelt Frontend — Drift-Risiko |
| Policy `refreshIntervalMin` vs Cron | Policy steuert nur **Stale-UI-Flag** (`2 × refreshIntervalMin`); tatsächlicher Lauf: hardcoded Cron `2,32 * * * *` |
| `nav.insights` vs `nav.financialInsights` | Beide DE: „Auswertungen“ — nur `financialInsights` in Sidebar verwendet |

### 8.4 Ungenutzte / disconnected UI

| Element | Status |
|---------|--------|
| `BusinessInsightsBox.tsx` | Dead code |
| `BusinessPulse.tsx` | Exportiert, nicht gerendert |
| `businessPulseBuilder.ts` | Deprecated |
| `VehicleInsightsCard.tsx` | Nicht in App gemountet |
| `nav.insights`, `nav.fleetCondition`, `category.insights` | Orphaned i18n |
| `fleet-condition` view key | Redirect only |
| `figma-rental` analytics views | Prototyp, nicht Production |
| Insight Cards | Kein Click-through trotz bookingId/customerId |
| `GET dashboard-insights/summary` | Backend vorhanden, **Frontend nutzt nur `GET /`** |

### 8.5 Tote Endpunkte / ungenutzte Trigger

| Item | Evidenz |
|------|---------|
| `onBookingChange` / `onVehicleChange` / `onStationChange` | Definiert in `business-insights-trigger.service.ts`, **zero call sites** außer `requestDebouncedRerun` |
| `scheduled_30min` trigger type | In Types/Tests, Scheduler emittiert `scheduled_active` / `scheduled_boot` |
| `RETURN_OVERDUE` Frontend Type | Nicht im Backend-Enum |

### 8.6 Technisch vorhanden, UI nicht genutzt

- `reservedRevenueInRange` auf Auswertungen-Seite
- `dashboard-insights/summary` Endpoint
- Insight `actionType` / `actionLabel` — keine Nav-Handler in UI
- `TenantInsightPolicy.enabledTypes` / `policyOverrides` — Admin API vorhanden, kein Tenant-UI
- Station-Filter Prop `stationId` auf `InsightsCockpit` — Parent übergibt aktuell `null` (kein Station-Picker auf Seite)

---

## 9. Bestehende Tests und Testlücken

### 9.1 Vorhandene Tests

**Backend Business Insights:**
- `business-insights.spec.ts`
- `business-insights-runtime.spec.ts`
- `business-insights-trigger.characterization.spec.ts`
- `notification-engine.characterization.spec.ts`
- `financial-insights.logic.spec.ts`
- `insight-health-gate.spec.ts`
- `detectors/battery-critical.detector.spec.ts`
- `detectors/brake-critical.detector.spec.ts`
- `detectors/tire-critical.detector.spec.ts`
- `detectors/return-needs-inspection.detector.spec.ts`

**Backend Data Analyse:**
- `data-analyse.utils.spec.ts`
- `data-analyse-producer-status.spec.ts`

**Backend Notifications:**
- `notification-evaluation-runtime.spec.ts`
- `notification-evaluation.live.integration.spec.ts` (env-gated)
- ~26 weitere Specs unter `notifications/`

**Backend Adjacent:**
- `damage-analytics.spec.ts`
- `trip-analytics-canonical.service.spec.ts`
- `misuse-cases.service.spec.ts`
- `hv-capacity-shadow-evaluation.*.spec.ts`
- `service-overdue-task.integration.spec.ts`

**Frontend:**
- Dashboard runtime/regression tests (businessPulse, actionQueue, notificationEngine)
- `damage-insights.test.ts`
- `vehicle-insights-logic.tire.test.ts`
- E2E: `dashboard-notifications-v2.spec.ts`

### 9.2 Testlücken

| Bereich | Lücke |
|---------|-------|
| `FinancialInsightsView` | Keine Unit/Integration Tests |
| `InsightsCockpit` | Keine Tests |
| `insights-categories.ts` | Keine Tests |
| `DataAnalyseView` | Keine Tests |
| Dashboard ↔ Auswertungen KPI Parity | Kein expliziter Cross-Surface Test |
| E2E Finanz-Auswertungen | Kein dediziertes E2E Spec |
| Detector Coverage | 7 von 12 Detectors ohne dedizierte Spec |
| Misuse Section in Cockpit | Kein Frontend Test |
| Station Filter auf InsightsCockpit | Kein Test |
| Export/Drill-down Flows | Kein automatisierter Test |
| Permission Matrix `data-analyse` | Nur HV Shadow Permission Spec |
| Cross-Tenant Admin Endpoints | Keine Security Specs für `run-detail/:runId` |

---

## 10. Findings nach Priorität

### P0 — Kritisch

| ID | Finding | Evidenz |
|----|---------|---------|
| P0-1 | **Finanz-KPIs vollständig clientseitig** — große Invoice-Listen werden an den Browser geliefert und dort aggregiert; Performance- und Konsistenzrisiko bei großen Mandanten | `FinancialInsightsView` → `api.invoices.list` + `financial-insights.logic.ts`; kein Aggregations-Endpoint |
| P0-2 | **Kein Export** für Finanz- oder Business-Auswertungen trotz operativer Anforderung (implizit durch Professionalisierungs-Prompt) | Kein CSV/PDF/XLSX Code in Auswertungen-Surfaces |
| P0-3 | **Insight Cards ohne Navigation** — `bookingId`/`customerId` werden angezeigt, aber kein Drill-down/Deep-Link | `InsightsCockpit.tsx` InsightCard |

### P1 — Hoch

| ID | Finding | Evidenz |
|----|---------|---------|
| P1-1 | **Doppelte Health-Emission** Dashboard Insights vs Notification V2 Rental Health Sync | `business-insights.service.ts` Detectors + `syncVehicleHealthNotifications` |
| P1-2 | **Event-Trigger nicht angebunden** — `onBookingChange`/`onVehicleChange`/`onStationChange` ohne Call Sites; Insights nur Cron + Driving Assessment + Manual Admin | Grep: nur `requestDebouncedRerun` aufgerufen |
| P1-3 | **Dashboard-Insights ohne Permission Guard** — jedes Org-Mitglied sieht fleet-wide Insights; Notifications V2 hat Station Scope | `dashboard-insights.controller.ts` vs `NotificationStationScopeService` |
| P1-4 | **Hardcoded UI Texte** auf Auswertungen-Seite — keine i18n für Cockpit/FIN KPI Labels | `InsightsCockpit`, `FinancialInsightsView` |
| P1-5 | **Frontend/Backend InsightType Drift** — `RETURN_OVERDUE` (FE), `HM_SERVICE_NO_TRACKING` (BE only) | `DashboardInsightsContext.tsx` vs `schema.prisma` |
| P1-6 | **Policy `refreshIntervalMin` nicht an Scheduler gekoppelt** — Stale-Flag vs tatsächlicher Refresh inkonsistent | `dashboard-insights.repository.ts` vs `business-insights-scheduler.service.ts` |

### P2 — Mittel

| ID | Finding | Evidenz |
|----|---------|---------|
| P2-1 | **Legacy Dead Code** — `BusinessInsightsBox`, `BusinessPulse`, `businessPulseBuilder` | Keine Production Imports |
| P2-2 | **Orphaned i18n Keys** — `nav.insights`, `nav.fleetCondition`, `category.insights` | Sidebar nutzt nur `nav.financialInsights` |
| P2-3 | **Finanz-Logik Drift-Risiko** — Backend testet Frontend-Kopie, nicht shared package | `financial-insights.logic.spec.ts` Kommentar |
| P2-4 | **`VehicleInsightsCard` disconnected** | Nicht in `App.tsx` gemountet |
| P2-5 | **Reserved Revenue KPI** im Dashboard vorhanden, auf Auswertungen-Seite fehlend | `reservedRevenueInRange` vs `FinancialInsightsView` |
| P2-6 | **CH Diagnostics global** — `orgId` Parameter ignoriert; Infrastruktur-Metadaten für jeden `data-analyse`-Berechtigten | `data-analyse.service.ts` |
| P2-7 | **Kein TanStack Query** — manuelles Fetching, kein Cache/Dedup zwischen Dashboard und Auswertungen | Context + useEffect Pattern |
| P2-8 | **`dashboard-insights/summary` ungenutzt** | Frontend API Client hat nur `.get()` |

### P3 — Niedrig

| ID | Finding | Evidenz |
|----|---------|---------|
| P3-1 | **Duplikat Battery Shadow Report** — Org + Platform Admin Endpoints | `battery-shadow-validation.controller.ts` |
| P3-2 | **`scheduled_30min` Trigger-Typ** — Legacy in Types | `insight.types.ts` |
| P3-3 | **figma-rental Prototyp** — veraltete Analytics Views im Repo | `frontend/figma-rental/` |
| P3-4 | **Unused import** `TrendingDown` in FinancialInsightsView | `void TrendingDown` |
| P3-5 | **Stale Dashboard i18n Marketing Strings** | `dashboard.routeOptimizationDesc` etc. |

### Cross-Tenant Risiken

| ID | Severity | Finding |
|----|----------|---------|
| CT-1 | Medium (Admin) | `GET admin/business-insights/run-detail/:runId` — kein `orgId`-Check |
| CT-2 | Medium (Admin) | `GET admin/battery-shadow-validation-report` — optionales `organizationId`, cross-tenant |
| CT-3 | Low | `dashboard-insights` korrekt org-scoped, aber **kein Station-Filter** für scoped Users |
| CT-4 | Low | CH Queries teils nur `vehicle_id` Filter — Vehicle Ownership wird vorher asserted |

---

## 11. Offene Fragen (nicht belastbar aus Code beantwortbar)

1. **Produkt-Scope „Auswertungen“:** Sollen Voice/WhatsApp-Analytics, Fleet Health und Damage Heatmaps in die Professionalisierung einbezogen werden, oder nur `financial-insights` + `data-analyse`?
2. **Notification V2 Cutover:** Wann wird das Legacy `DashboardInsight`-Feed durch V2 Inbox ersetzt? Dual-Write ist im Code dokumentiert, Cutover-Zeitpunkt unklar.
3. **Produktions-Feature-Flags:** Welche Werte haben `NOTIFICATIONS_V2`, `HF_MIRROR_ENABLED`, `CLICKHOUSE_URL` auf dem VPS? (Nur `.env.example` im Repo sichtbar.)
4. **LLM Formatting:** Ist `useLlmFormatting` in `TenantInsightPolicy` in Produktion aktiv? Default: `false`.
5. **Invoice-Volume:** Wie viele Invoices pro Org im Schnitt? Entscheidend für P0-1 Performance-Bewertung.
6. **Station-Scope Anforderung:** Sollen station-scoped User auf Auswertungen nur ihre Station sehen (wie Notifications V2)?
7. **Export-Anforderungen:** Welche Formate (CSV, PDF, DATEV) und welche KPIs sind fachlich required?
8. **HM_SERVICE_NO_TRACKING:** Soll dieser Insight-Typ im Frontend explizit kategorisiert werden?
9. **Event-Trigger Wiring:** War das Ausbleiben von `onBookingChange`-Calls beabsichtigt (reine Cron-Architektur) oder Recovery-Lücke?
10. **Master Admin Run Detail:** Ist cross-tenant Read by `runId` für Support akzeptiert oder Bug?

---

## 12. Nicht vollständig nachvollziehbare Bereiche

| Bereich | Grund |
|---------|-------|
| Produktions-Env / Feature-Flag-Werte | Nicht im Repo; VPS `.env` nicht zugänglich |
| Live-Datenmengen (Invoices, Insights pro Org) | Kein DB-Zugriff in diesem Audit |
| Notification V2 Produktions-Cutover-Status | Nur Code-Kommentare und Flags |
| LLM Insight Formatter Verhalten in Prod | `useLlmFormatting` default false; kein Live-Test |
| ClickHouse Produktions-Topologie | Nur Code + Architecture Docs |
| Vollständige DIMO Poll / Worker Interaktion mit Data Analyse | Nur teilweise in ClickHouse Registry dokumentiert |
| E2E-Abdeckung aller Data Analyse Tabs | Kein E2E Spec gefunden |
| Master-App (`frontend/src/master`) Auswertungen-Referenzen | `ChangesView`/`ArchitekturView` erwähnen Features, aber keine dedizierte Master-Auswertungen-UI |

---

## 13. Untersuchte Dateien (Gesamtliste)

### Frontend (47+ Dateien)
`App.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `finance-navigation.ts`, `FinancialInsightsView.tsx`, `insights/InsightsCockpit.tsx`, `DataAnalyseView.tsx`, `DashboardInsightsContext.tsx`, `financial-insights.logic.ts`, `insights-categories.ts`, `invoiceClassification.ts`, `BusinessInsightsBox.tsx`, `MisuseCasesPanel.tsx`, `VehicleInsightsCard.tsx`, `vehicle-insights-logic.ts`, `RentalStressAnalysisCard.tsx`, `damages/DamageInsightsSection.tsx`, `damage-insights.ts`, `vehicle-bookings/VehicleAvailabilityInsights.tsx`, `vehicle-availability-insights.utils.ts`, `FleetConditionView.tsx`, `FleetHubView.tsx`, `fleet-health-service/*`, `fleet-health-control-center.ts`, `voice-assistant/VoiceAnalyticsView.tsx`, `voice-assistant/VoiceUsageAnalyticsPanel.tsx`, `voice-assistant/VoiceOpsKpiStrip.tsx`, `whatsapp/WhatsAppKpiCards.tsx`, `dashboard/DashboardView.tsx`, `dashboard/useDashboardViewModel.ts`, `dashboard/FinanceKpiStrip.tsx`, `dashboard/financeKpiCards.tsx`, `dashboard/runtime/businessPulseSliceBuilder.ts`, `dashboard/DashboardDrilldownDrawer.tsx`, `dashboard/dashboardDrilldownCta.ts`, `dashboard/ActionQueue.tsx`, `dashboard/actionQueueBuilder.ts`, `dashboard/deriveOperationalInsights.ts`, `dashboard/derivePredictiveOperationsInsights.ts`, `dashboard/dataTrustBuilder.ts`, `dashboard/controlSignalsBuilder.ts`, `dashboard/businessPulseBuilder.ts`, `dashboard/BusinessPulse.tsx`, `lib/api.ts`, `i18n/translations/*.ts`, `figma-rental/App.tsx`, zugehörige `*.test.ts` / `*.spec.ts`

### Backend (80+ Dateien)
`business-insights/*` (37 Dateien), `data-analyse/*` (9), `notifications/runtime/*`, `notifications/adapters/*`, `workers/processors/notification-evaluation.processor.ts`, `workers/processors/notification-delivery.processor.ts`, `workers/schedulers/data-retention.scheduler.ts`, `clickhouse/*`, `vehicle-intelligence/misuse-cases/*`, `vehicle-intelligence/trips/trip-analytics-canonical.service.ts`, `vehicle-intelligence/damages/damage-analytics.ts`, `vehicle-intelligence/battery-health/hv-capacity-shadow/*`, `vehicle-intelligence/battery-health/shadow-validation/*`, `rental-health/*`, `config/notification-evaluation.config.ts`, `shared/auth/permission.constants.ts`, `prisma/schema.prisma` (Insight Models), zugehörige `*.spec.ts`

### Docs
`architecture/CLICKHOUSE_*.md`, `architecture/HF_WINDOWS_*.md`, `architecture/DRIVING_ASSESSMENT_*.md`, `architecture/TRIP_SYSTEM_AUDIT_*.md`, `docs/notification-engine-*.md`, `docs/architecture/hv-capacity-shadow-evaluation.md`

---

## 14. Nächste Schritte (Prompt 2+ — nicht Teil dieses Audits)

Dieses Dokument ist **read-only**. Empfohlene Follow-ups für spätere Prompts:

1. Produkt-Scope und P0/P1 Priorisierung mit Stakeholder abstimmen
2. Backend-Aggregations-Endpoint für Finanz-KPIs evaluieren
3. Insight Card Navigation / Drill-down spezifizieren
4. Event-Trigger Wiring (`onBookingChange` etc.) klären
5. i18n-Vollständigkeit für Auswertungen-Seite
6. Testplan für fehlende Coverage erstellen
7. Export-Spezifikation definieren

---

**Dokumentpfad:** `docs/audits/evaluations/evaluations-technical-inventory-2026-07.md`

**Folgedokument (Prompt 2):** [`evaluations-data-flow-map-2026-07.md`](./evaluations-data-flow-map-2026-07.md)

**Folgedokument (Prompt 3):** [`evaluations-baseline-test-report-2026-07.md`](./evaluations-baseline-test-report-2026-07.md)

**Synqdrive Code → Changes / Architektur:** Nicht aktualisiert (reine Audit-Dokumentation, keine Implementierungsänderung).

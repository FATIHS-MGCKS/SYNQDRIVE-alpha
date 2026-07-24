# Evaluations Metric Registry

**Version:** 1.0.0  
**Datum:** 2026-07-24  
**Prompt:** 5/54 — Auswertungen-Professionalisierung  
**Taxonomie:** `docs/architecture/analytics/evaluations-kpi-taxonomy.md`

---

## 1. Zweck

Die Metric Registry ist die **technische Single Source of Truth** für alle Kennzahlen der Auswertungen-Seite. Sie enthält keine Anzeigenamen in Services — nur stabile IDs und i18n-Schlüssel.

---

## 2. Pfade & Exportstruktur

```
shared/evaluations-metrics/
  evaluations-metric.contract.ts    # Enums + EvaluationsMetricDefinition
  evaluations-metric.i18n.ts        # DE/EN Texte (label + description pro metricId)
  evaluations-metric.legacy-map.ts  # Legacy → kanonische ID

backend/src/modules/evaluations-metrics/
  evaluations-metric.definitions.ts # 74 Metrik-Records
  evaluations-metric.registry.ts    # Lookup, Snapshot, Startup-Validierung
  evaluations-metric.service.ts
  evaluations-metric.controller.ts
  evaluations-metric.module.ts
  evaluations-metric.registry.spec.ts
  index.ts

frontend/src/rental/lib/evaluations/
  evaluations-metric.contract.ts       # Re-Export shared contract + KPI constants
  evaluations-metric.contract.test.ts
```

### TypeScript path alias (Backend + Frontend)

```json
"@synq/evaluations-metrics/*": ["../shared/evaluations-metrics/*"]
```

### HTTP API

| Method | Path | Auth | Response |
|--------|------|------|----------|
| `GET` | `/api/v1/evaluations-metrics/registry` | `RolesGuard` | `EvaluationsMetricRegistrySnapshot` |
| `GET` | `/api/v1/evaluations-metrics/metrics/lookup?id={metricId}` | `RolesGuard` | `EvaluationsMetricDefinition` |

### Backend exports (`@modules/evaluations-metrics`)

- `EvaluationsMetricsModule`
- `EvaluationsMetricService`
- `getEvaluationsMetricRegistrySnapshot()`
- `requireEvaluationsMetricDefinition(id)`
- `resolveEvaluationsMetricId(id)` — folgt `supersededBy`
- `resolveLegacyEvaluationsMetricId(legacyId)`
- `EVALUATIONS_METRIC_DEFINITIONS`

---

## 3. Record-Schema

Jede Kennzahl:

```typescript
{
  id: string;                      // z. B. fin.mtd_issued_revenue
  category: EvaluationsMetricCategory;
  labelKey: string;                  // evaluations.metrics.{id}.label
  descriptionKey: string;            // evaluations.metrics.{id}.description
  unit: EvaluationsMetricUnit;
  valueType: EvaluationsValueType;
  aggregationType: EvaluationsAggregationType;
  calculationVersion: string;      // semver, z. B. 1.0.0
  supportedDimensions: EvaluationsDimension[];
  supportedComparisons: EvaluationsComparison[];
  dataClassification: EvaluationsDataClassification;
  metricKind: EvaluationsMetricKind;
  implementationStatus: EvaluationsImplementationStatus;
  supersededBy?: string;             // deprecated aliases only
}
```

### metricKind (verbindlich)

| Kind | Bedeutung |
|------|-----------|
| `OBSERVED` | Direkt aus Quelldaten |
| `DERIVED` | Berechnet aus anderen Kennzahlen |
| `RULE_BASED_ESTIMATE` | Deterministische Heuristik |
| `STATISTICAL_FORECAST` | Statistisches Prognosemodell |
| `ML_FORECAST` | ML-Prognose (reserviert) |

---

## 4. i18n

- **Schlüsselkonvention:** `evaluations.metrics.{metricId}.label` / `.description`
- **Textquelle:** `shared/evaluations-metrics/evaluations-metric.i18n.ts`
- Registry-Tests prüfen Vollständigkeit (DE + EN).
- Frontend-`translations/de.ts` + `en.ts`: UI-Wiring folgt in Prompt 6+ (keine UI-Label-Änderung in Prompt 5).

---

## 5. Startup- & Test-Validierung

Beim Import von `evaluations-metric.registry.ts`:

- Duplikat-IDs → `EvaluationsMetricRegistryError`
- Ungültige `calculationVersion` → Fehler
- `supersededBy` zeigt auf unbekannte ID → Fehler

`evaluations-metric.registry.spec.ts` prüft zusätzlich:

- Eindeutige IDs (74 Metriken)
- Pflichtfelder vollständig
- Gültige Kategorien, Units, metricKinds, Aggregationen
- i18n-Schlüssel vorhanden
- Legacy-Maps zeigen auf registrierte IDs

---

## 6. Migrierte Kennzahlen (Prompt 5)

Registry-definiert und per Konstanten angebunden (ohne UI-Änderung):

| Bereich | Konstanten / Mapping |
|---------|---------------------|
| Financial Insights | `FINANCIAL_INSIGHTS_REGISTRY_METRIC_IDS` (9 KPIs) |
| Insights Cockpit | `INSIGHTS_COCKPIT_REGISTRY_METRIC_IDS` (5 KPIs) |
| Business Pulse | `BUSINESS_PULSE_TO_EVALUATIONS_METRIC` (9 slice ids) |
| Audit legacy ids | `AUDIT_LEGACY_TO_EVALUATIONS_METRIC` (16 Einträge) |
| Insight metric fields | `INSIGHT_METRICS_FIELD_LEGACY` (`lostRevenueEur`, …) |
| Cockpit props | `COCKPIT_PROP_LEGACY` (`financialRiskEur`, …) |

**Gesamt in Registry:** 74 `metricId`s (inkl. deprecated Aliase und planned Platzhalter).

---

## 7. Verbleibende Legacy-Kennzahlen (UI unverändert)

Diese Bezeichner bleiben in UI/Runtime bis Prompt 6+:

| Legacy | Ort | Kanonische ID |
|--------|-----|---------------|
| `BusinessMetricId` (`revenue`, `profit`, …) | Dashboard Business Pulse | siehe `BUSINESS_PULSE_TO_EVALUATIONS_METRIC` |
| „Issued Revenue MTD“ (hardcoded EN) | `FinancialInsightsView` | `fin.mtd_issued_revenue` |
| „Net Profit MTD“ | `FinancialInsightsView` | `fin.mtd_net_result` |
| `financialRiskEur` Prop | `InsightsCockpit` | `fin.overdue_receivables` (Anteil) |
| „Finanzrisiko (geschätzt)“ | `InsightsCockpit` | `ins.estimated_financial_exposure_eur` |
| „Kritische Buchungen“ | `InsightsCockpit` | `ins.critical_insights_count` |
| `metrics.lostRevenueEur` | Low Utilization Detector | `ins.low_utilization.revenue_potential_eur` |
| `fin.mtd_profit`, `fin.profit_margin` | Audit JSON / alte Docs | superseded in Registry |
| `GET /invoices/stats` | Backend (ungenutzt auf Auswertungen) | **nicht** in Registry |

**Keine UI-Werte geändert** in Prompt 5 — nur Registry, API, Tests und Dokumentation.

---

## 8. Tests ausführen

```bash
cd backend && npm run test:evaluations
cd frontend && npm run test:evaluations
bash scripts/test/evaluations-verify.sh
cd backend && npm run build
cd frontend && npm run build
```

---

## 9. Nächste Schritte (Prompt 6+)

1. UI-Labels auf `labelKey` / i18n umstellen
2. Server-seitige Aggregation mit `calculationVersion`-Bump bei Formeländerung
3. Export-Pipeline mit Registry-Headern
4. `ML_FORECAST`-Metriken an Forecast-Engine koppeln

---

**Dokumentpfad:** `docs/architecture/analytics/evaluations-metric-registry.md`

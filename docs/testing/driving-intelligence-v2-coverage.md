# Driving Intelligence V2 — Test Coverage

Stand: 2026-07-17  
Scope: Backend-Unit-Tests, Frontend-Contract-Tests, Shadow-Validierung, E2E-Lücken.

---

## Ausführung

```bash
cd backend

# DI V2 Kernpaket (~100+ Suites)
npm test -- --testPathPattern="driving-intelligence|rental-driving-analysis|misuse-case|shadow-detector|driver-attribution|trip-assessability|driving-impact|driving-analysis|driving-intelligence-jobs|dimo-native-driving|event-context|driving-capability|driving-evidence"

# Reconciliation + Queue
npm test -- --testPathPattern="driving-analysis-reconciliation|driving-intelligence-jobs"

# Prisma
npx prisma validate

# Build
npm run build

cd ../frontend

# Trip / Driving UI contracts
npm test -- --run \
  src/rental/components/trips/ \
  src/rental/lib/misuse-case-lifecycle.ui.test.ts \
  src/rental/lib/driving-impact-rolling.ui.test.ts \
  src/rental/lib/driving-impact-model-profile.ui.test.ts

npm run build
```

---

## Backend-Abdeckungsmatrix

| Bereich | Status | Primäre Testdateien |
|---------|--------|---------------------|
| **Status Resolver** | ✅ | `trip-analysis-status.spec.ts`, `driving-analysis-stage.status-derivation.spec.ts` |
| **Analysis Runs** | ✅ | `driving-analysis-run.repository.spec.ts`, `driving-analysis-run.fingerprint.spec.ts` |
| **Queue / Retry / Dead Letter** | ✅ | `driving-intelligence-jobs.retry-policy.spec.ts`, `driving-intelligence-jobs.processor.service.spec.ts`, `driving-intelligence-jobs.errors.spec.ts` |
| **Native Events** | ✅ | `dimo-native-event-fingerprint.spec.ts`, `dimo-native-driving-event-persistence.service.spec.ts`, `dimo-native-event-classification.spec.ts` |
| **Event Context** | ✅ | `event-context-enrichment.service.spec.ts`, `driving-event-context-enrich.handler.spec.ts`, `event-context-quality.spec.ts` |
| **Capability** | ✅ | `vehicle-driving-capability*.spec.ts`, `driving-detector-capability.resolver.spec.ts` |
| **Assessability** | ✅ | `trip-assessability.policy.spec.ts`, `trip-assessability.repository.spec.ts` |
| **Driving Impact** | ✅ | `driving-impact.service.spec.ts`, `driving-impact-provenance.spec.ts`, `driving-impact-load-components.spec.ts` |
| **Source Quality** | ✅ | `driving-impact-provenance.spec.ts`, `driving-impact-load-components.reader.spec.ts` |
| **Misuse Reconciliation** | ✅ | `misuse-case-reconcile.service.spec.ts`, `misuse-case-rating-reconciliation.spec.ts`, `misuse-case-persistence.spec.ts` |
| **Attribution** | ✅ | `attribution-resolver.spec.ts`, `driving-attribution-roles.spec.ts`, `driver-attribution.service.tenant.spec.ts` |
| **Rental Analysis** | ✅ | `rental-driving-analysis.*.spec.ts` (metrics, assessment, pattern-summary, recompute, road-distribution) |
| **Health Impact** | ❌ | Kein Handler-Test — `DRIVING_HEALTH_IMPACT_PUBLISH` Stub |
| **Tenant Scope** | ✅ | `vehicle-intelligence-tenant.scope.spec.ts`, `*.tenant.spec.ts` |
| **Reconciliation** | ✅ | `driving-analysis-reconciliation.service.spec.ts` (inkl. P76 impact status_desync) |
| **Shadow Detectors** | ✅ | `shadow-detector.*.spec.ts`, `*.shadow-detector.spec.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## Frontend / E2E-Abdeckungsmatrix

| Bereich | Status | Primäre Testdateien |
|---------|--------|---------------------|
| **Decision Summary** | ❌ | `TripDecisionSummary.tsx` fehlt |
| **Datenqualität** | ⚠️ | `trip-assessment-copy.test.ts`, `event-context-ui.test.ts` |
| **Vehicle Load** | ⚠️ | `behavior-rating.test.ts`, `scoreFormat` (indirekt) |
| **Driver Conduct** | ⚠️ | `trip-assessment-ui-semantics.test.ts` |
| **Misuse** | ⚠️ | `misuse-case-lifecycle.ui.test.ts` — kein Panel-E2E |
| **Attribution** | ✅ | `trip-attribution-ui.test.ts` |
| **Rental History** | ❌ | Kein Customer-Driving-History-Panel |
| **Manuelle Freigabe** | ❌ | Kein Dialog / API-Binding |
| **Mobile** | ❌ | Kein DI-V2-responsive E2E |
| **i18n** | ⚠️ | Keys geändert P76; kein dedizierter dimensional-i18n-Test |
| **Accessibility** | ❌ | Keine `aria-labelledby`-Contract-Tests für 6 Dimensionen |

**E2E:** Kein `driving-intelligence*.spec.ts` in `frontend/e2e/` — Fleet/Task/Invoice-Specs decken DI V2 nicht ab.

---

## Shadow-Validierung (Test-relevant)

| Check | Abgedeckt durch |
|-------|-----------------|
| Shadow-Detektoren ohne operative Wirkung | `shadow-detector.orchestrator.service.spec.ts`, Config `masterEnabled=false` |
| False-Positive-Policies | `*-shadow.policy.spec.ts` pro Detektor |
| Native-Event-Vergleich | `dimo-native-event-fingerprint.spec.ts` |
| Health Eligibility | ❌ nicht implementiert |
| Keine Kunden-/Readinesswirkung | `rental-driving-analysis.pattern-summary.spec.ts` (`automaticBlockingEnabled: false`) |

Siehe Runbook: `docs/runbooks/driving-intelligence-v2-shadow-validation.md`

---

## Bekannte Lücken (Priorität)

| P | Lücke | Empfohlene Spec |
|---|-------|-----------------|
| P0 | `DRIVING_HEALTH_IMPACT_PUBLISH` Handler | `driving-health-impact-publish.handler.spec.ts` |
| P0 | `TripDecisionSummaryService` | `trip-decision-summary.service.spec.ts` |
| P1 | Grafana-Metrik-Emission | `trip-metrics.service.driving-v2.spec.ts` |
| P1 | Customer Manual Decision API | `driving-decisions.service.spec.ts` |
| P2 | Playwright Trip Detail dimensional | `driving-decision-flow.spec.ts` |

---

## CI-Empfehlung

```bash
# Minimal DI V2 Gate (PR)
npm test -- --testPathPattern="driving-analysis-reconciliation|rental-driving-analysis.pattern-summary|attribution-resolver|misuse-case-persistence|shadow-detector.contract|driving-impact-provenance"
```

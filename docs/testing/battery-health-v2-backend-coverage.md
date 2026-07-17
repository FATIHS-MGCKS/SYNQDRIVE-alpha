# Battery Health V2 — Backend Test Coverage

Stand: 2026-07-16 (Prompt 74/78)  
Scope: Backend-Tests für Battery Health V2 — DIMO-Ingest, LV/HV-Pipelines, Jobs, Assessment, Readiness, Ops.

## Ausführung

```bash
cd backend

# Gesamtpaket (Unit, ohne DB-Integration)
npm run test:battery:v2

# Integration (In-Memory + optional DB)
npm run test:battery:v2:integration
# Retention mit Postgres (optional):
BATTERY_V2_RETENTION_INTEGRATION=1 npm test -- battery-v2-retention.integration

# Vollständige Verifikation: Unit + Integration + Prisma + tsc + Build
npm run test:battery:v2:verify

# Teilbefehle
npm run test:battery:v2:verify:unit
bash scripts/test/battery-health-v2-verify.sh integration
bash scripts/test/battery-health-v2-verify.sh prisma
bash scripts/test/battery-health-v2-verify.sh typecheck
bash scripts/test/battery-health-v2-verify.sh build
```

**Jest-Muster (Unit):**  
`battery-health|dimo-battery-signal|drive-profile-resolver|battery-policy-profile|lv-battery-chemistry|battery-v2|battery-critical.detector`  
— `integration`-Specs werden per Default ausgeschlossen.

**Letzter Lauf (`npm run test:battery:v2:verify`):**

| Schritt | Ergebnis |
|---------|----------|
| Unit (`test:battery:v2`) | **97 Suites / 725 Tests** — alle grün |
| Integration Observation | **1 Suite / 12 Tests** — alle grün |
| Integration Retention | übersprungen (kein `BATTERY_V2_RETENTION_INTEGRATION=1`) |
| `prisma validate` | grün (1 bestehende Schema-Warnung `onDelete SetNull`) |
| `tsc --noEmit` | grün |
| `npm run build` | grün |

---

## Abdeckungsmatrix (27 Bereiche)

| # | Bereich | Status | Primäre Testdateien |
|---|---------|--------|---------------------|
| 1 | **DIMO Mapper** | ✅ | `dimo/mappers/dimo-battery-signal.mapper.spec.ts` |
| 2 | **Observation Identity** | ✅ | `battery-provider-observation.policy.spec.ts`, `hv-snapshot-observation.policy.spec.ts`, `hv-battery-health.service.observation.spec.ts` |
| 3 | **Deduplizierung** | ✅ | `battery-measurement.repository.spec.ts`, `battery-measurement-session.repository.spec.ts`, `hv-battery-health.service.observation.spec.ts`, `battery-provider-observation.integration.spec.ts` |
| 4 | **Freshness** | ✅ | `battery-freshness.policy.spec.ts`, `battery-signal-freshness.contract.spec.ts`, `canonical-battery/canonical-battery-signal-freshness.builder.spec.ts` |
| 5 | **Queue Producer/Consumer** | ✅ | `jobs/battery-v2-rest-target.producer.spec.ts`, `jobs/battery-v2-producer-migration.spec.ts`, `jobs/battery-v2-job-queue.util.spec.ts`, `jobs/battery-v2-jobs-producer.module.spec.ts`, `jobs/battery-v2-pipeline-hardening.spec.ts` |
| 6 | **Retry / Dead Letter** | ✅ | `jobs/battery-v2-pipeline-hardening.spec.ts`, `jobs/battery-v2-reconciliation.spec.ts`, `jobs/battery-v2-job-error.util.spec.ts`, `retention/battery-v2-retention.service.spec.ts`, `observability/battery-v2-prometheus.metrics.spec.ts` |
| 7 | **REST State Machine** | ✅ | `lv-rest-window/lv-rest-window.state-machine.spec.ts` |
| 8 | **REST_60M / REST_6H** | ✅ | `lv-rest-window/battery-rest-target-evaluation.spec.ts`, `lv-rest-window/lv-rest-window-target.metadata.spec.ts`, `jobs/battery-v2-reconciliation.spec.ts`, `jobs/handlers/battery-rest-target-evaluate.handler.spec.ts` |
| 9 | **Wake-Kontamination** | ✅ | `lv-rest-window/lv-rest-measurement-quality.spec.ts`, `lv-rest-window/lv-rest-shadow-metrics.spec.ts`, `lv-assessment/lv-evidence-selection.policy.spec.ts`, `lv-assessment/lv-publication.policy.spec.ts`, `jobs/handlers/battery-rest-target-evaluate.handler.spec.ts`, `diagnostic/battery-data-diagnostic.service.spec.ts` |
| 10 | **MISSED** | ✅ | `lv-rest-window/lv-rest-measurement-quality.spec.ts`, `lv-rest-window/lv-rest-shadow-metrics.spec.ts`, `battery-measurement.repository.spec.ts`, `observability/battery-v2-prometheus.metrics.spec.ts` |
| 11 | **Start-Proxy & Coverage** | ✅ | `lv-start-proxy/battery-start-proxy-*.spec.ts`, `jobs/handlers/battery-start-proxy-extract.handler.spec.ts`, `jobs/battery-v2-reconciliation.spec.ts`, `jobs/battery-v2-idempotent-execution.service.spec.ts` |
| 12 | **ICE / PHEV / BEV** | ✅ | `drive-profile/drive-profile-resolver.spec.ts`, `battery-policy-profile/battery-policy-profile.resolver.spec.ts`, `lv-canonical/lv-canonical-battery.resolver.spec.ts`, `canonical-battery/canonical-battery.builder.spec.ts`, `hv-method-profile/hv-method-profile.resolver.spec.ts` |
| 13 | **Chemistry** | ✅ | `lv-battery-chemistry/lv-battery-chemistry-resolver.spec.ts`, `lv-assessment/lv-chemistry-assessment-context.policy.spec.ts` |
| 14 | **LV Assessment / Publication** | ✅ | `battery-assessment.service.spec.ts`, `lv-assessment/lv-estimated-health-assessment.policy.spec.ts`, `lv-assessment/lv-publication.policy.spec.ts`, `battery-publication.service.spec.ts`, `lv-assessment/lv-evidence-selection.policy.spec.ts` |
| 15 | **Capability** | ✅ | `capability-preflight/battery-capability-*.spec.ts`, `jobs/handlers/hv-capability-refresh.handler.spec.ts` |
| 16 | **Recharge Segments** | ✅ | `hv-charge-session/hv-recharge-session-reconcile.service.spec.ts`, `observability/battery-v2-prometheus.metrics.spec.ts` |
| 17 | **HvChargeSession** | ✅ | `hv-charge-session/hv-charge-session-persist.service.spec.ts`, `hv-charge-session/hv-charge-session-quality.assessor.spec.ts`, `hv-fallback-charge-session.policy.spec.ts` |
| 18 | **M2 / M3** | ✅ | `hv-capacity-shadow/hv-capacity-m2.policy.spec.ts`, `hv-capacity-shadow/hv-capacity-m3.policy.spec.ts`, `hv-capacity-shadow/hv-capacity-m3-validation.service.spec.ts`, `hv-capacity-shadow/hv-capacity-session-summary.aggregator.spec.ts` |
| 19 | **Cross-Session Assessment** | ✅ | `hv-capacity-shadow/hv-capacity-cross-session-assessment.service.spec.ts`, `hv-capacity-shadow/hv-capacity-cross-session.policy.spec.ts` |
| 20 | **Reference Capacity** | ✅ | `reference-capacity/vehicle-battery-reference-capacity.service.spec.ts`, `reference-capacity/vehicle-battery-reference-capacity.policy.spec.ts` |
| 21 | **SOH Gate** | ✅ | `hv-capacity-shadow/hv-soh-gate.policy.spec.ts`, `hv-capacity-shadow/hv-soh-gate-assessment.service.spec.ts` |
| 22 | **Readiness** | ✅ | `battery-readiness.policy.spec.ts`, `rental-health/rental-health.service.spec.ts` |
| 23 | **Alerts / Tasks** | ✅ | `battery-alert.policy.spec.ts`, `business-insights/detectors/battery-critical.detector.spec.ts`, `battery-task.policy.spec.ts`, `battery-task.service.spec.ts` |
| 24 | **Retention** | ✅ | `retention/battery-v2-retention.service.spec.ts`, `retention/battery-v2-retention.types.spec.ts`, `retention/battery-v2-retention.integration.spec.ts` (DB, opt-in) |
| 25 | **Tenant-Trennung** | ✅ | `battery-measurement.repository.spec.ts`, `battery-measurement-session.repository.spec.ts`, `hv-capacity-shadow/hv-capacity-shadow-evaluation.service.spec.ts` |
| 26 | **Race Conditions** | ✅ | `jobs/battery-v2-idempotent-execution.service.spec.ts`, `battery-provider-observation.integration.spec.ts`, `hv-battery-health.service.observation.spec.ts` |
| 27 | **Canonical Consumer / Evidence** | ✅ | `canonical-battery-health.service.spec.ts`, `canonical-battery/*.spec.ts`, `battery-evidence-strength.policy.spec.ts`, `battery-readiness.policy.spec.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

**Ops / Diagnostic (P72–P73, ergänzend):** `diagnostic/battery-data-diagnostic.service.spec.ts`, `diagnostic/battery-data-repair.service.spec.ts`, `diagnostic/battery-data-repair.util.spec.ts`

---

## Detail: kritische Pfade

### Observation → Persistenz

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Unveränderte Polls werden verworfen | Policy + Integration | `battery-provider-observation.policy.spec.ts`, `battery-provider-observation.integration.spec.ts` |
| VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP | Policy | `battery-provider-observation.policy.spec.ts` |
| Out-of-order Skip | Policy + Integration | `hv-snapshot-observation.policy.spec.ts`, `battery-provider-observation.integration.spec.ts` |
| P2002-Race → idempotenter Rückgriff | Integration | `battery-provider-observation.integration.spec.ts` |
| Prometheus Duplicate Counter | Integration Harness | `battery-observation.integration.harness.ts`, `battery-v2-prometheus.metrics.spec.ts` |

### Job-Pipeline

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| 8 Job-Typen registriert | Module + Registry | `jobs/battery-v2-jobs.module.spec.ts`, `jobs/battery-v2-job.validation.spec.ts` |
| Idempotency-Key-Präfixe | Validation | `jobs/battery-v2-job-idempotency.policy.spec.ts`, `jobs/battery-v2-job-idempotency.validation.spec.ts` |
| Vehicle-Lock Serialisierung | Unit | `jobs/battery-v2-idempotent-execution.service.spec.ts` |
| Transient Retry vs Dead Letter | Processor | `jobs/battery-v2-pipeline-hardening.spec.ts` |
| Unrecoverable (PERMANENT_CONFIG) | Processor | `jobs/battery-v2-pipeline-hardening.spec.ts` |
| Dead-Letter-Skip beim Enqueue | Reconciliation | `jobs/battery-v2-reconciliation.spec.ts` |
| Reconciliation REST/Start/Assessment | Producer | `jobs/battery-v2-reconciliation.spec.ts` |

### LV REST Shadow

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| FSM OPEN → TARGET_PENDING → … | State machine | `lv-rest-window/lv-rest-window.state-machine.spec.ts` |
| REST_60M / REST_6H Metadaten | Metadata | `lv-rest-window/lv-rest-window-target.metadata.spec.ts` |
| MISSED / VALID / CONTAMINATED_BY_WAKE | Quality + Metrics | `lv-rest-window/lv-rest-measurement-quality.spec.ts`, `lv-rest-shadow-metrics.spec.ts` |
| Shadow-Summary Aggregation | Resolver | `lv-rest-window/lv-rest-shadow-summary.resolver.spec.ts` |
| Handler wake_detected | Handler | `jobs/handlers/battery-rest-target-evaluate.handler.spec.ts` |

### HV Capacity / SOH

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| M2 Session CV | Policy | `hv-capacity-shadow/hv-capacity-m2.policy.spec.ts` |
| M3 Agreement / Validation | Service + Policy | `hv-capacity-shadow/hv-capacity-m3-validation.service.spec.ts`, `hv-capacity-m3.policy.spec.ts` |
| Cross-Session Merge | Service + Policy | `hv-capacity-cross-session-assessment.service.spec.ts`, `hv-capacity-cross-session.policy.spec.ts` |
| SOH Gate Policy + Assessment | Policy + Service | `hv-soh-gate.policy.spec.ts`, `hv-soh-gate-assessment.service.spec.ts` |
| Shadow Evaluation Permission | Permission | `hv-capacity-shadow-evaluation.permission.spec.ts` |
| Reference Capacity Verify | Service + Policy | `reference-capacity/vehicle-battery-reference-capacity.*.spec.ts` |

### Readiness, Alerts, Tasks

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| READY / NOT_READY / HARD_BLOCK | Policy | `battery-readiness.policy.spec.ts` |
| Rental-Block-Integration | Service | `rental-health.service.spec.ts` |
| Alert-Dedup / Auto-Resolve | Policy + Detector | `battery-alert.policy.spec.ts`, `battery-critical.detector.spec.ts` |
| Task-Intents / Dedup | Policy + Service | `battery-task.policy.spec.ts`, `battery-task.service.spec.ts` |

### Retention

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Phased Dry-Run / Guards | Unit | `retention/battery-v2-retention.service.spec.ts` |
| Aggregate-before-Delete | Integration (DB) | `retention/battery-v2-retention.integration.spec.ts` |
| Dead-Letter Prune Phase | Unit | `retention/battery-v2-retention.service.spec.ts` |

---

## Spec-Inventar nach Modul

| Modul | Suites (ca.) | Pfad |
|-------|--------------|------|
| Core + Legacy Safety | 12 | `battery-health/*.spec.ts` (root) |
| Jobs / Queue | 18 | `battery-health/jobs/**` |
| LV REST Window | 8 | `battery-health/lv-rest-window/**` |
| LV Start Proxy | 6 | `battery-health/lv-start-proxy/**` |
| LV Assessment | 5 | `battery-health/lv-assessment/**` |
| HV Charge Session | 4 | `battery-health/hv-charge-session/**` |
| HV Capacity Shadow | 14 | `battery-health/hv-capacity-shadow/**` |
| Reference Capacity | 2 | `battery-health/reference-capacity/**` |
| Capability Preflight | 4 | `battery-health/capability-preflight/**` |
| Canonical / Consumer | 6 | `battery-health/canonical-battery/**`, `canonical-battery-health.service.spec.ts` |
| Retention | 3 | `battery-health/retention/**` |
| Observability | 1 | `battery-health/observability/**` |
| Diagnostic / Repair | 4 | `battery-health/diagnostic/**` |
| DIMO | 1 | `dimo/mappers/dimo-battery-signal.mapper.spec.ts` |
| Drive / Policy / Chemistry | 3 | `drive-profile`, `battery-policy-profile`, `lv-battery-chemistry` |
| Business Integration | 2 | `battery-critical.detector`, `rental-health.service` |

**Gesamt:** 97 Unit-Suites unter dem V2-Jest-Muster.

---

## Integration vs Unit

| Paket | Art | DB | Env-Flag |
|-------|-----|-----|----------|
| `battery-provider-observation.integration.spec.ts` | In-Memory Prisma Harness | Nein | — |
| `battery-v2-retention.integration.spec.ts` | Postgres | Ja | `BATTERY_V2_RETENTION_INTEGRATION=1` |

Legacy-Pfade außerhalb des Pakets: `docs/architecture/battery-observation-legacy-persistence.md`

---

## Bekannte Grenzen

1. **Retention-Integration** erfordert laufende Postgres-Instanz und explizites Flag — nicht Teil des Default-`verify`-Laufs.
2. **End-to-End BullMQ/Redis** wird nicht in dieser Suite gestartet; Processor-Verhalten ist über `battery-v2-pipeline-hardening.spec.ts` unit-getestet.
3. **DIMO Live-API** — keine Netzwerk-Integration; Mapper + Policy + Harness decken Contract ab.
4. **Prisma-Warnung** `onDelete: SetNull` auf required FK — bestehend, nicht Battery-spezifisch.

---

## Verwandte Dokumentation

- Architektur: `docs/architecture/battery-health-v2.md`
- Rollout-Flags: `docs/architecture/battery-health-v2-rollout-flags.md`
- Deployment: `docs/runbooks/battery-health-v2-deployment.md`
- Retention: `docs/architecture/battery-v2-retention.md`
- Grafana/Ops: `docs/architecture/battery-v2-grafana-prometheus-ops.md`

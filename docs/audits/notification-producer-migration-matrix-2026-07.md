# Notification Producer Migration Matrix (Prompt 11/36)

**Datum:** 2026-07-26  
**Repository:** `SYNQDRIVE-alpha`  
**Branch:** `remediation/notification-engine-production-readiness-2026-07`  
**Basis:** `docs/audits/notification-engine-data-flow-map-2026-07.md` (Prompt 2)  
**Scope:** Verbindliche Migrationsmatrix — **keine Producer-Code-Änderung** in diesem Prompt  
**Registry:** 46 Core-Event-Types + 20 `LEGAL_*` = **66** registrierte Event-Types  
**Producer-Pfade:** **58** (P-01 … P-49 laut Datenflusskarte)

---

## Executive Summary

| Metrik | Wert |
|--------|------|
| **Producer gesamt** | **58** |
| **Bereits kanonisch (V2 `ingestCandidate`)** | **14** |
| **Teilweise kanonisch (Hybrid V1+V2)** | **18** |
| **Legacy (V1-only Inbox-Pfad)** | **14** |
| **Synthetisch (Frontend, keine Persistenz)** | **6** |
| **Redundant (paralleler Doppel-Pfad)** | **5** |
| **Zu entfernen (nach Ziel-Cutover)** | **12** |
| **In fachliches Domain Event umwandeln** | **4** |
| **Registry-Events ohne Live-Producer** | **~34** (siehe Anhang B) |
| **Explizite Legacy-Pfade zur Entfernung** | **14** (siehe §7) |

---

## 1. Kategorien (verbindlich)

| Kategorie | Definition | Cutover-Verhalten |
|-----------|------------|-------------------|
| **bereits kanonisch** | Schreibt ausschließlich über `NotificationCoreService.ingestCandidate` in `notifications`; Registry-validiert; Fingerprint stabil | Behalten; nur Härtung/Tests |
| **teilweise kanonisch** | V2-Hook existiert, aber V1 (`dashboard_insights` / Frontend) liefert parallel Inbox-Wahrheit | Shadow → Live → V1-Inbox abschalten |
| **Legacy** | Nur V1-Persistenz oder V1-Composition; kein oder inaktiver V2-Hook | Producer nach Registry migrieren |
| **synthetisch** | Frontend berechnet Karten ohne Backend-Persistenz | Nach Backend-Producer: aus Inbox entfernen |
| **redundant** | Gleicher Sachverhalt wird von zwei Pfaden mit unterschiedlicher Semantik materialisiert | Sekundärpfad entfernen (meist V1 oder FE) |
| **zu entfernen** | Orphan, Stub oder reine Übergangsbrücke ohne Zielarchitektur | Löschen nach Abhängigkeits-Check |
| **in fachliches Domain Event umzuwandeln** | Heute kein Notification-Inbox-Event; gehört in OrgTask / ActivityLog / Billing-Queue | Nicht in Notification Engine forcieren |

---

## 2. Priorisierte Migrationswellen

Reihenfolge gemäß Remediation-Priorität (Prompt 11):

| Welle | Domäne | Producer-IDs | Ziel |
|-------|--------|--------------|------|
| **W1** | Vehicle Health & Telemetrie | P-11…P-13, P-20, P-24…P-28, P-47 | V2 als einzige Inbox-Wahrheit; ACTIVE_DTC-Race fix; Grace konsolidieren |
| **W2** | Booking & Overdue | P-05, P-06, P-15, P-48 | `PICKUP_OVERDUE`, `RETURN_OVERDUE`, `RETURN_NEEDS_INSPECTION`, `TIGHT_HANDOVER` → V2 |
| **W3** | Technical Observations | P-22, P-23 | Shadow → Live; Complaint bleibt Domain, nicht Inbox |
| **W4** | DashboardInsight (restliche Detektoren) | P-07…P-10, P-14, P-16, P-18, P-19 | BI nur noch Analytics/Task-Bridge; Inbox über V2 |
| **W5** | Rental Health (Read Model) | P-26…P-28, P-47 | Projector bleibt; FE-Bridge `mergeV2*` entfernen |
| **W6** | ActionQueue / Frontend Composition | P-44, P-45, P-49, Bridges | `VITE_NOTIFICATIONS_V2=on` ohne supplemental Merge |
| **W7** | Workflow-Meldungen | P-36…P-39 | Entscheid: OrgTask bleibt / optionale V2-Spiegelung |
| **W8** | Billing & Payment | *(Registry only)* | Neue Domain-Producers für `PAYMENT_FAILED`, `INVOICE_OVERDUE`, `DEPOSIT_PROBLEM` |
| **W9** | Dokumente & KYC | P-32…P-35 | Legal V2 stabilisieren; `LEGAL_PICKUP_BLOCKED` aktivieren |
| **W10** | Connectivity | P-29…P-31 | Bereits kanonisch — Dedupe gegen FE-Synthetic (P-44, P-45) |

---

## 3. Producer-Matrix (58 Pfade)

**Spalten:** Kat = Kategorie · Out = aktueller Output · Ziel-ET = Ziel-Eventtyp · Ziel-Ent = Ziel-Entity · FP = Fingerprint-Dimensionen · Rec = Recovery-Signal · Sev = Ziel-Severity · Mig = Migrationstechnik · Flag · Tests · Rollback

### 3.1 Orchestrierung (keine direkten Notifications)

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-01 | `business-insights-scheduler.service` → `scheduledRunCron` | Legacy | BullMQ `notification.evaluation` Job | — | ORG | — | — | — | Behalten als Scheduler; keine Inbox-Änderung | `NOTIFICATIONS_V2` | `notification-evaluation.service.spec` | Cron deaktivieren |
| P-02 | `notification-evaluation.service` → `executeRun` | teilweise kanonisch | BI-Run + V2-Sync-Hooks | — | ORG | — | — | — | Hooks bleiben Post-BI; Lock/Retry unverändert | `NOTIFICATIONS_V2` | `notification-evaluation*.spec` | Queue pause |
| P-03 | `business-insights-trigger.service` → debounced rerun | Legacy | Debounced eval request | — | ORG | — | — | — | Behalten; Producer-Migration ändert Hook-Ziele nicht | `NOTIFICATIONS_V2` | BI trigger specs | Debounce TTL |
| P-04 | `internal-business-insights.controller` → manual run | Legacy | Master-admin eval | — | ORG | — | — | — | Unverändert | — | Controller e2e | — |

### 3.2 W1 — Vehicle Health & Telemetrie

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-11 | `battery-critical.detector` | redundant | `dashboard_insights` BATTERY_CRITICAL | `BATTERY_CRITICAL` | VEHICLE | `org\|BATTERY_CRITICAL\|VEHICLE\|{id}\|battery_critical\|v1` | module good/unknown + grace 6h | CRITICAL | BI-Inbox-Leg abschalten; nur P-20/P-28 | `NOTIFICATIONS_V2` | `notification-producers-phase1` | BI publish re-enable |
| P-12 | `tire-critical.detector` | redundant | V1 insight TIRE_CRITICAL | `TIRE_CRITICAL` | VEHICLE | `…\|tires_critical\|v1` | TPMS/recalc good + grace | CRITICAL | wie P-11 | `NOTIFICATIONS_V2` | rental-health-notification.spec | wie P-11 |
| P-13 | `brake-critical.detector` | redundant | V1 insight BRAKE_CRITICAL | `BRAKE_CRITICAL` | VEHICLE | `…\|brakes_critical\|v1` | module good + grace | CRITICAL | wie P-11 | `NOTIFICATIONS_V2` | brake-health specs | wie P-11 |
| P-20 | `notification-producer.ingest` → `syncVehicleHealthWarnings` | teilweise kanonisch | V2 notifications (4 types) | `ACTIVE_DTC`, `TIRE_*`, `BRAKE_*`, `BATTERY_*` | VEHICLE | per-type conditionCode | SUCCESS ingest → RESOLVED | CRITICAL/WARNING | Live; BI-Detektor-Leg entfernen | `NOTIFICATIONS_V2` (live adapter) | `notification-producers-phase1`, rental-health-notification | Flag off |
| P-24 | `dimo-dtc.processor` → `emitDtcHealthNotifications` | bereits kanonisch | V2 `ACTIVE_DTC` per code | `ACTIVE_DTC` | VEHICLE | `active_dtc:{code}` | DTC cleared → SUCCESS | WARNING/CRITICAL | Fix resolve-race (CT-06); Fleet-sweep koordinieren | `NOTIFICATIONS_V2` | dimo-dtc + phase1 specs | Realtime hook off |
| P-25 | `brake-dtc-evidence.producer` | bereits kanonisch | V2 `BRAKE_CRITICAL` | `BRAKE_CRITICAL` | VEHICLE | code-scoped | evidence cleared | CRITICAL | Behalten; Dedup mit P-20 | `NOTIFICATIONS_V2` | brake-dtc specs | Hook off |
| P-26 | `tire-health-alert.service` → `syncAlerts` | in Domain Event | `tire_health_alerts` rows | — (feed P-20) | VEHICLE | dedupeKey table | alert cleared | — | Zwischentabelle bleibt; kein direkter Inbox-Pfad | — | tire-health specs | — |
| P-27 | `brake-health-alert.service` | in Domain Event | `brake_health_alerts` | — (feed P-20) | VEHICLE | dedupeKey | alert cleared | — | wie P-26 | — | brake-health specs | — |
| P-28 | `rental-health-notification.projector` | teilweise kanonisch | Read-model → P-20 | via P-20 | VEHICLE | module conditionCode | rental-health module OK | CRITICAL/WARNING | Projector bleibt kanonische Quelle für Batch | `NOTIFICATIONS_V2` | rental-health-notification.spec | Projector skip |
| P-47 | `deriveVehicleHealthAlertsFromRentalHealth` | synthetisch / zu entfernen | FE `VehicleHealthAlert[]` | *(none — API only)* | VEHICLE | semanticKey FE | health API recovery | mixed | Entfernen wenn P-20+P-24 vollständig; Bridge zuerst | `VITE_NOTIFICATIONS_V2` | wob-l7503 FE tests | Bridge re-enable |

### 3.3 W2 — Booking & Overdue

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-05 | `tight-handover.detector` | Legacy | V1 `TIGHT_HANDOVER` | `TIGHT_HANDOVER` | VEHICLE+BOOKING | `tight_handover:{bookingId}` | handover completed | WARNING | Neuer Adapter post-BI; Registry templates DE | `NOTIFICATIONS_V2` + shadow | insight-candidate.mapper | V1 only |
| P-06 | `return-needs-inspection.detector` | Legacy | V1 `RETURN_NEEDS_INSPECTION` | `RETURN_NEEDS_INSPECTION` | BOOKING | `return_inspection:{bookingId}` | inspection done | WARNING | Adapter + domain hook on return flow | `NOTIFICATIONS_V2` | BI detector specs | V1 |
| P-15 | `pickup-overdue.detector` | Legacy | V1 `PICKUP_OVERDUE` | `PICKUP_OVERDUE` | BOOKING | `pickup_overdue:{bookingId}` | pickup completed | CRITICAL | Adapter; ersetzt P-48 tiles | `NOTIFICATIONS_V2` | BI + handover-copy | V1 + P-48 bridge |
| P-48 | `actionQueueBuilder` pickup/return loops | synthetisch / zu entfernen | FE queue items `pickup-*`/`return-*` | `PICKUP_OVERDUE`, `RETURN_OVERDUE`, `RETURN_NEEDS_INSPECTION` | BOOKING | bookingId | booking state change | CRITICAL | Backend Producer → remove supplemental `extractOverdueHandover*` | `VITE_NOTIFICATIONS_V2=on` | notification-handover FE tests | supplemental bridge |

### 3.4 W3 — Technical Observations

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-22 | `technical-observations.service` → active | teilweise kanonisch | V2 `TECHNICAL_OBSERVATION_ACTIVE` + complaint row | `TECHNICAL_OBSERVATION_ACTIVE` | VEHICLE | `technical_observation_active:{obsId}` | resolve/dismiss/convert | WARNING | Shadow → Live (`shadowModeEnabled`) | `NOTIFICATIONS_V2` + registry shadow | phase1 + observation specs | shadow on |
| P-23 | same → resolved | teilweise kanonisch | SUCCESS → RESOLVED | same | VEHICLE | same fingerprint | SUCCESS ingest | SUCCESS | Paired with P-22 | wie P-22 | wie P-22 | wie P-22 |

### 3.5 W4 — DashboardInsight (übrige Detektoren)

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-07 | `station-shortage.detector` | teilweise kanonisch | V1 + V2 shadow (P-18) | `STATION_SHORTAGE` | STATION | `shortage` | station not in detector set | WARNING | Shadow → Live; predictive P-45 separat | shadow registry | phase1 station | shadow |
| P-08 | `low-utilization.detector` | teilweise kanonisch | V1 + V2 live (P-19) | `LOW_UTILIZATION` | VEHICLE | `low_util:{vehicleId}` | utilization above threshold | INFO/WARNING | V1 Finance-Tab behalten; Inbox nur V2 | `NOTIFICATIONS_V2` | BI specs | V1 inbox |
| P-09 | `service-window.detector` | Legacy | V1 `SERVICE_WINDOW` | `SERVICE_WINDOW` | VEHICLE | `service_window:{vehicleId}` | window passed / service done | INFO | Adapter post-BI | `NOTIFICATIONS_V2` | insight mapper | V1 |
| P-10 | `service-before-booking.detector` | Legacy | V1 `SERVICE_BEFORE_BOOKING` | `SERVICE_BEFORE_BOOKING` | VEHICLE | `service_before_booking:{bookingId}` | booking cancelled / service done | WARNING | Adapter | `NOTIFICATIONS_V2` | BI specs | V1 |
| P-14 | `compliance-operational.detector` | Legacy | V1 `SERVICE_OVERDUE`, `TUV_*`, `BOKRAFT_*`, `HM_*` | Registry types | VEHICLE | per compliance kind | compliance satisfied | WARNING/CRITICAL | Split adapters; P-21 für HM resolve exists | `NOTIFICATIONS_V2` | compliance specs | V1 |
| P-16 | `driving-assessment-device-quality.detector` | redundant | V1 insight (RECOVERING INFO) | *(none for inbox)* | VEHICLE | — | runtime NORMAL | INFO | **Entfernen** als Inbox; P-17 runtime canonical | — | wob-l7503 | re-enable detector publish |
| P-17 | `driving-assessment-device-quality.service` → V2 | teilweise kanonisch | V2 `DRIVING_ASSESSMENT_DEVICE_QUALITY` | same | VEHICLE | `driving_assessment_device_quality` | NORMAL/RECOVERING SUCCESS | WARNING | Shadow → Live | registry shadow | phase1 | shadow |
| P-18 | ingest → `syncStationShortagesFromInsights` | teilweise kanonisch | V2 STATION_SHORTAGE | `STATION_SHORTAGE` | STATION | `shortage` | absent from BI output | WARNING | Shadow → Live | shadow | phase1 | shadow |
| P-19 | ingest → `syncLowUtilizationFromInsights` | teilweise kanonisch | V2 LOW_UTILIZATION | `LOW_UTILIZATION` | VEHICLE | vehicle scoped | not in detector output | WARNING | Live; stop V1 inbox dup | live | phase1 | flag off |
| P-21 | ingest → `resolveInboxExcludedNotifications` | teilweise kanonisch | RESOLVED `HM_SERVICE_NO_TRACKING` | `HM_SERVICE_NO_TRACKING` | VEHICLE | hm_no_tracking | tracking restored | SUCCESS | Behalten als resolve-only hook | `NOTIFICATIONS_V2` | phase1 | skip hook |

### 3.6 W5 — Rental Health Read Model

*(P-26…P-28 in §3.2; P-47 in §3.2)*

**Übergangs-Infrastruktur (zu entfernen nach W1+W5):**

| Pfad | Kat | Mig | Flag | Rollback |
|------|-----|-----|------|----------|
| `merge-v2-with-vehicle-health.ts` | zu entfernen | Dedup nur noch API-seitig | `VITE_NOTIFICATIONS_V2=on` | Bridge re-import |
| `mergeV2WithSupplemental` | zu entfernen | Counts/List ohne FE merge | `VITE_NOTIFICATIONS_V2=on` | supplemental on |

### 3.7 W6 — ActionQueue / Frontend Composition

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-44 | `deriveOperationalInsights` | synthetisch / zu entfernen | 3× derived cards (tariff, telemetry, handover backlog) | `TELEMETRY_SOFT_OFFLINE`, `DATA_COVERAGE_INSUFFICIENT`, fleet ops STATE | ORG/FLEET | TBD per derived type | backend connectivity / fleet APIs | WARNING | Backend Producer pro derived type | `VITE_NOTIFICATIONS_V2=on` | dashboard VM tests | V1 derived on |
| P-45 | `derivePredictiveOperationsInsights` | synthetisch / zu entfernen | 8× predictive risk cards | `STATION_SHORTAGE` (24h), `TELEMETRY_SOFT_OFFLINE`, … | mixed | horizon in conditionCode | prediction invalidated | INFO/WARNING | Either BI+V2 horizon adapter or drop from inbox | `VITE_NOTIFICATIONS_V2=on` | predictive tests | V1 predictive on |
| P-46 | `dashboardNotificationAdapter` | zu entfernen | Orphan synthetic DRIVING_ASSESSMENT | — | — | — | — | — | **Delete file + imports** (CT-01) | — | grep orphan | restore file |
| P-49 | `vehicleRuntimeStateBuilder` → health reasons | synthetisch | RuntimeReason in ActionQueue | Registry STATE types | VEHICLE | runtime reason id | runtime clears | mixed | Map each reason to registry producer; queue reads API only | `VITE_NOTIFICATIONS_V2=on` | runtime builder tests | V1 runtime in queue |

**Weitere FE-Legacy (zu entfernen):**

| Pfad | Kat | Mig |
|------|-----|-----|
| `actionQueueBuilder` legacy BI insight loop | zu entfernen | Wenn alle InsightTypes V2-Producers haben |
| `notificationEngineDedupe` (fachlich) | zu entfernen | Server-side fingerprint only |
| `notificationCtaResolver` V1 | zu entfernen | `action.type` from API |
| `BusinessInsightsBox.tsx` | zu entfernen | Dead UI |

### 3.8 W7 — Workflow & Tasks

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-36 | `insight-task-bridge.service` | in Domain Event | `org_tasks` from BI | — (Task, not inbox) | varies | task dedupe | task DONE | — | **Behalten** getrennt; optional link `notificationId` | — | insight-task-bridge spec | — |
| P-37 | `workflow-action-executor` → `notification.prepare` | in Domain Event | OrgTask draft | Optional mirror: `BOOKING_*` STATE | BOOKING | workflow instance | task complete | INFO | **Nicht** in Inbox mergen; optional V2 informational | Workflow flags | workflow test matrix | draft-only |
| P-38 | same → `alert.create` | in Domain Event | Alert OrgTask | — | varies | — | task DONE | — | Tasks UI only | — | workflow specs | — |
| P-39 | `battery-task.service` | in Domain Event | Battery OrgTask | — | VEHICLE | — | policy OK | — | Parallel zu BATTERY_CRITICAL notification | — | battery-task specs | — |

### 3.9 W8 — Billing & Payment

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| — | `payment-email.processor` | in Domain Event | Separate email queue | — | — | — | — | — | **Bewusst getrennt** von Notification Engine | Billing flags | payment processor specs | — |
| — | billing-email queues | in Domain Event | Email only | — | — | — | — | — | Optional später: `PAYMENT_FAILED`, `INVOICE_OVERDUE`, `DEPOSIT_PROBLEM` via ingest | `NOTIFICATIONS_V2` | TBD | — |
| W8-B1 | `billing-operational-notification` → `BillingEventPublisher` listener | **migriert** | V2 `PAYMENT_FAILED`, `INVOICE_OVERDUE` | same | INVOICE | `billing:stripe:{type}:{stripeInvoiceId}` | `PAYMENT_SUCCEEDED` → SUCCESS | CRITICAL/WARNING | Listener auf Domain Events; keine Stripe-Payload in metadata | `NOTIFICATIONS_V2` | `billing-operational-notification.service.spec.ts` | listener off |
| W8-R1 | `invoice-operational-notification` + overdue scheduler | **migriert** | V2 `INVOICE_OVERDUE` (rental `OrgInvoice`) | same | INVOICE | `rental-invoice:overdue:{id}` | full payment → SUCCESS | WARNING | Scheduler hook nach Status-Transition | `NOTIFICATIONS_V2` | `invoice-operational-notification.service.spec.ts`, scheduler hook spec | hook off |
| — | `DEPOSIT_PROBLEM` | Registry only | **kein Producer** | — | — | — | — | — | Nicht erfunden (kein operativer Pfad) | — | — | — |

*(Stripe subscription billing via W8-B1; rental invoices via W8-R1)*

### 3.10 W9 — Dokumente & KYC (Legal)

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-32 | `legal-document-operational-notification` → org readiness | bereits kanonisch | V2 `LEGAL_REQUIRED_*`, `LEGAL_APPROVAL_PENDING`, `LEGAL_DOCUMENT_EXPIRING_SOON`, … | 20× LEGAL_* | ORGANIZATION | `legalOperationalNotificationFingerprintKey` | scope auto-close map | WARNING/CRITICAL | Stabilisieren; remove deprecated org-legal path | `NOTIFICATIONS_V2` | legal notification audit | flag off |
| P-33 | same → bundle completeness | bereits kanonisch | `LEGAL_BUNDLE_INCOMPLETE`, `LEGAL_DOCUMENT_DELIVERY_FAILED` | LEGAL_* | BOOKING | bundle+booking scoped | bundle complete | WARNING | Behalten | `NOTIFICATIONS_V2` | legal specs | flag off |
| P-34 | same → `syncPickupGateBlock` | **migriert** | `LEGAL_PICKUP_BLOCKED_MISSING_PROOF` | same | BOOKING | pickup gate key | proof uploaded | CRITICAL | Caller in `BookingPickupGateService.assertPickupAllowed` | `NOTIFICATIONS_V2` | pickup gate e2e + legal specs | disable hook |
| P-35 | same → integrity/technical | bereits kanonisch | `LEGAL_INTEGRITY_*`, `LEGAL_TECH_*` | ORG/DOC | integrity scoped | drift cleared | CRITICAL | Behalten | `NOTIFICATIONS_V2` | integrity specs | flag off |

### 3.11 W10 — Connectivity

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-29 | `connectivity-alert.service` → `onDeviceUnplugged` | bereits kanonisch | V2 `DEVICE_UNPLUGGED` | same | VEHICLE + episodeId | episode-scoped | plug-in / recover | CRITICAL | Behalten; dedupe P-44 fleet telemetry | `NOTIFICATIONS_V2` | connectivity-alert specs | webhook off |
| P-30 | same → `onEpisodeRecovered` | bereits kanonisch | RESOLVED + `DEVICE_RECONNECTED` | `DEVICE_RECONNECTED` | VEHICLE | episode | — | SUCCESS | Behalten | `NOTIFICATIONS_V2` | connectivity specs | — |
| P-31 | same → `syncRuntimeAlerts` | bereits kanonisch | 8× connectivity STATE types | `TELEMETRY_OFFLINE`, `TELEMETRY_SOFT_OFFLINE`, `AUTHORIZATION_REQUIRED`, … | VEHICLE | conditionCode per state | runtime projection OK | WARNING/CRITICAL | Behalten; remove FE derived telemetry dup | `NOTIFICATIONS_V2` | connectivity runtime specs | projection off |

### 3.12 Parallele Kanäle & Migration

| ID | Modul / Funktion | Kat | Out | Ziel-ET | Ziel-Ent | FP | Rec | Sev | Mig | Flag | Tests | Rollback |
|----|------------------|-----|-----|---------|----------|----|----|-----|-----|------|-------|----------|
| P-40 | `voice-budget-warning.service` | in Domain Event | `activity_log` | — | ORG | — | — | — | Nicht in Notification Inbox | Voice flags | voice budget specs | — |
| P-41 | `iam-membership-lifecycle-notification` | in Domain Event | `activity_log` | — | USER/ORG | — | — | — | Audit only | — | IAM specs | — |
| P-42 | `whatsapp-automation-hooks` | zu entfernen | TODO stub | — | — | — | — | — | Delete or implement via delivery channel later | — | — | — |
| P-43 | `notification-migration-backfill.service` | Legacy (offline) | insights → notifications | mapped types | varies | insight fingerprint | — | — | One-time CLI; not runtime producer | CLI `--apply` | migration dry-run | DB restore |

---

## 4. Detaillierte Migrationsfelder (Referenz pro Domäne)

### 4.1 Fingerprint-Standard (alle V2-Producers)

```
{organizationId}|{eventType}|{entityType}|{entityId}|{conditionKey}|v{schemaVersion}
```

- `conditionKey`: registry `conditionCode` oder variant (`active_dtc:P0420`, `technical_observation_active:{uuid}`)
- `schemaVersion`: Registry `fingerprintVersion` (meist `v1`)
- Verboten in FP: Titel, Body, Severity, Locale, Route, Zeitstempel

### 4.2 Recovery-Standard

| Recovery-State | Ingest-Verhalten | Lifecycle |
|----------------|------------------|-----------|
| `ACTIVE` / `DEGRADED` | WARNING/CRITICAL OPEN oder occurrence++ | OPEN |
| `RECOVERING` | SUCCESS ingest (driving assessment) | → RESOLVED |
| `CLEARED` / `NORMAL` | SUCCESS ingest | → RESOLVED |
| Fleet sweep absent | SUCCESS ingest (batch adapters) | → RESOLVED |

### 4.3 Feature Flags (global)

| Flag | Rolle in Migration |
|------|-------------------|
| `NOTIFICATIONS_V2` | Backend ingest + API gate |
| Registry `shadowModeEnabled` | Per-event shadow write |
| `VITE_NOTIFICATIONS_V2` | `off` / `shadow` / `on` — Frontend Inbox source |
| `NOTIFICATIONS_DELIVERY_ENABLED` | Outbox email (post-inbox) |
| `VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS` | 6h grace before health resolve |

### 4.4 Migrationstechniken (Katalog)

| Technik | Wann | Beispiel |
|---------|------|----------|
| **Shadow ingest** | V2 parallel, V1 Inbox bleibt | P-17, P-18, P-22 |
| **Live adapter** | V2 Inbox, V1 nur Analytics | P-19, P-20, P-24 |
| **Resolve-only hook** | V1 detector retired, auto-close | P-21 |
| **Realtime hook** | Event-driven vor BI batch | P-24, P-29 |
| **Domain projection** | Read model → adapter | P-28 → P-20 |
| **Frontend cutover** | Remove supplemental merge | P-44…P-49 |
| **Registry backfill** | Historical insights | P-43 |
| **Domain Event split** | Tasks/Activity/Billing bleiben außerhalb | P-36…P-41 |

### 4.5 Test-Minimum pro Producer-Migration

| Stufe | Artefakt |
|-------|----------|
| Unit | Adapter + fingerprint + recovery |
| Integration | `notification-producers-phase1.spec.ts` pattern |
| Regression | WOB L 7503 stack (driving + observation + health) |
| FE | `notificationEngine.wob-l7503.test.ts`, handover-copy tests |
| Shadow | `notification-shadow-compare.ts` delta = 0 before cutover |

### 4.6 Rollback-Standard

1. Registry `shadowModeEnabled=true` (per event)  
2. `NOTIFICATIONS_V2=false` (backend)  
3. `VITE_NOTIFICATIONS_V2=shadow` or `off` (frontend)  
4. Re-enable V1 BI publish for affected detectors  
5. DB: notifications rows bleiben; keine auto-delete bei Rollback  

---

## 5. Konkurrierende Wahrheiten → Migrationsentscheidung

| CT-ID | Kanonischer Pfad | Zu entfernender Pfad | Welle |
|-------|------------------|----------------------|-------|
| CT-01 | P-17 runtime V2 | P-16 BI, P-46 orphan, complaint as inbox | W1/W4 |
| CT-02 | P-22 V2 | FE runtime `damage:suspicion` in queue | W3/W6 |
| CT-03…CT-06 | P-20, P-24, P-25 | P-11…P-13 BI, P-47 FE | W1 |
| CT-07 | P-18 V2 | P-45 predictive 24h (oder eigener ET) | W4/W6 |
| CT-08 | P-19 V2 | P-08 V1 inbox | W4 |
| CT-09 | P-15 V2 (target) | P-48 tiles, supplemental bridge | W2/W6 |
| CT-10 | P-31 V2 | P-44, P-45 telemetry derived | W10/W6 |
| CT-11 | P-14 V2 (target) | P-36 task-only visibility | W4/W7 |
| CT-12 | P-32…P-35 | deprecated org-legal notification | W9 |
| CT-13 | V2 fingerprint | V1 UUID-per-publish | all waves |
| CT-14 | V2 API (optional WF mirror) | P-37 OrgTask-only | W7 |

---

## 6. Empfohlene Migrationsreihenfolge (Gesamt)

1. **ACTIVE_DTC resolve-race** (P-24) + grace alignment (P-20) — blockiert Health-Sign-off  
2. **Vehicle health batch+realtime** (P-20, P-24, P-25, P-28) — remove P-11…P-13 inbox leg, P-47 bridge  
3. **Driving assessment shadow→live** (P-17) — disable P-16 inbox, delete P-46  
4. **Technical observation shadow→live** (P-22, P-23)  
5. **Booking overdue producers** (P-15, P-06) — remove P-48 supplemental  
6. **Station shortage + low utilization live** (P-18, P-19) — remove P-45/P-07 dup for inbox  
7. **Compliance detectors** (P-14) → split V2 adapters  
8. **Remaining BI** (P-05, P-09, P-10)  
9. **Frontend cutover cleanup** — merge bridges, derived, predictive, runtime queue reasons  
10. **Legal pickup gate** (P-34 activation)  
11. **Billing registry producers** (new) — separate from payment-email  
12. **Workflow decision** (P-37) — document final: Task-only vs optional V2 mirror  
13. **Connectivity dedupe audit** — confirm P-31 sole inbox for telemetry STATE  
14. **Operator App** — V2 API or documented V1 subset (out of producer scope, consumer)  

---

## 7. Legacy-Pfade zur Entfernung (14)

Nach erfolgreichem Sign-off pro Welle — **zählen als zu entfernende Legacy-Pfade:**

| # | Pfad | Typ | Abhängigkeit |
|---|------|-----|--------------|
| L-01 | `dashboardNotificationAdapter.ts` (P-46) | Orphan FE producer | P-17 live |
| L-02 | `deriveOperationalInsights` inbox leg (P-44) | Synthetic | P-31, fleet producers |
| L-03 | `derivePredictiveOperationsInsights` inbox leg (P-45) | Synthetic | P-18 live |
| L-04 | `deriveVehicleHealthAlertsFromRentalHealth` (P-47) | Synthetic bridge | P-20 complete |
| L-05 | `actionQueueBuilder` pickup/return loops (P-48) | Synthetic | P-15/P-06 V2 |
| L-06 | `vehicleRuntimeStateBuilder` queue health reasons (P-49) | Synthetic | Registry STATE producers |
| L-07 | `merge-v2-with-vehicle-health.ts` | Transition bridge | W1+W5 |
| L-08 | `extractOverdueHandoverQueueItems` | Transition bridge | W2 |
| L-09 | `actionQueueBuilder` legacy BI insight loop | V1 composition | W4 complete |
| L-10 | `notificationEngineDedupe` (fachliche Schicht) | V1 dedupe | V2 fingerprint only |
| L-11 | `notificationCtaResolver` V1 | V1 CTA | API `action` complete |
| L-12 | `BusinessInsightsBox.tsx` | Dead UI | — |
| L-13 | BI detector inbox publish for hybrid types (P-11…P-13, P-16) | Redundant V1 | P-20/P-17 live |
| L-14 | `whatsapp-automation-hooks` stub (P-42) | Unwired | — |

---

## Anhang A — Registry Event-Types: Producer-Status

### Core registry (46) — Kurzstatus

| EventType | Producer-Status | Ziel-Producer |
|-----------|-----------------|---------------|
| `STATION_SHORTAGE` | teilweise (P-07, P-18) | P-18 live |
| `PICKUP_OVERDUE` | Legacy (P-15) | P-15 → adapter |
| `RETURN_OVERDUE` | **kein Detektor** (nur P-48 FE) | Neuer adapter + booking domain |
| `BLOCKED_VEHICLE` | **kein Producer** | Fleet ops domain hook |
| `VEHICLE_NOT_READY` | **kein Producer** | Handover/readiness hook |
| `MAINTENANCE_REQUIRED` | **kein Producer** | Maintenance domain |
| `ACTIVE_DTC` | kanonisch (P-24, P-20) | P-24 realtime |
| `BATTERY_CRITICAL` | teilweise (P-11, P-20) | P-20 |
| `TIRE_CRITICAL` | teilweise (P-12, P-20) | P-20 |
| `BRAKE_CRITICAL` | teilweise (P-13, P-20, P-25) | P-25 + P-20 |
| `COMPLIANCE_EXPIRED` | **kein Producer** | P-14 extension |
| `SERVICE_OVERDUE` | Legacy (P-14) | P-14 adapter |
| `TIGHT_HANDOVER` | Legacy (P-05) | P-05 adapter |
| `RETURN_NEEDS_INSPECTION` | Legacy (P-06) | P-06 adapter |
| `LOW_UTILIZATION` | teilweise (P-08, P-19) | P-19 live |
| `SERVICE_WINDOW` | Legacy (P-09) | P-09 adapter |
| `SERVICE_BEFORE_BOOKING` | Legacy (P-10) | P-10 adapter |
| `TUV_OVERDUE` / `BOKRAFT_OVERDUE` | Legacy (P-14) | P-14 adapter |
| `HM_SERVICE_NO_TRACKING` | resolve-only (P-21) | P-14 + P-21 |
| `TECHNICAL_OBSERVATION_ACTIVE` | teilweise (P-22) | P-22 live |
| `DRIVING_ASSESSMENT_DEVICE_QUALITY` | teilweise (P-17) | P-17 live |
| `TRIP_ANALYSIS_COMPLETED` | **kein Producer** | Trip enrichment hook |
| `MISUSE_DETECTED` / `POSSIBLE_IMPACT` | **kein Producer** | Driving intelligence |
| `DATA_QUALITY_LIMITED` | **kein Producer** | Trip/telemetry hook |
| `BOOKING_*` / `PICKUP_DUE` / `RETURN_DUE` / `HANDOVER_INCOMPLETE` | **kein Producer** | Booking lifecycle hooks |
| `REQUIRED_DOCUMENT_MISSING` | **kein Producer** (non-legal) | Documents module |
| `PAYMENT_FAILED` / `INVOICE_OVERDUE` | **migriert** (W8-B1, W8-R1) | Billing + rental invoice hooks |
| `DEPOSIT_PROBLEM` | **kein Producer** | Registry stub only |
| `INTEGRATION_DISCONNECTED` | **migriert** | `IntegrationOperationalNotificationService` on connect/disconnect/status |
| `TELEMETRY_*` / `DEVICE_*` / `CONNECTIVITY_*` / `WEBHOOK_FAILURE` | kanonisch (P-31, P-29, P-30) | P-31 |

### LEGAL_* (20) — alle P-32…P-35

---

## Anhang B — Test-Artefakte (bestehend)

| Artefakt | Abdeckung |
|----------|-----------|
| `notification-producers-phase1.spec.ts` | P-17, P-18, P-20, WOB L 7503 |
| `rental-health-notification.spec.ts` | P-28, P-20 |
| `notification-lifecycle.state-machine.spec.ts` | Lifecycle (cross-cutting) |
| `notification-receipt.separation.spec.ts` | Receipts (consumer) |
| `notificationEngine.wob-l7503.test.ts` | FE regression |
| `connectivity-alert.service.spec.ts` | P-29…P-31 |
| Legal notification specs | P-32…P-35 |
| `billing-operational-notification.service.spec.ts` | W8-B1 |
| `invoice-operational-notification.service.spec.ts` | W8-R1 |
| `integration-operational-notification.service.spec.ts` | INTEGRATION_DISCONNECTED |
| `invoice-overdue-scheduler.notification.spec.ts` | W8-R1 scheduler hook |

---

## Änderungen in diesem Prompt

| Artefakt | Aktion |
|----------|--------|
| `docs/audits/notification-producer-migration-matrix-2026-07.md` | **Aktualisiert** (Prompt 17 — W8 Billing, W8 Rental Invoices, Integrations, P-34 migriert) |
| `billing-operational-notification.service.ts` | **Neu** — W8-B1 |
| `invoice-operational-notification.service.ts` | **Neu** — W8-R1 |
| `integration-operational-notification.service.ts` | **Neu** — INTEGRATION_DISCONNECTED |
| `booking-pickup-gate.service.ts` | **Wiring** — P-34 `syncPickupGateBlock` |

**Fortsetzung Prompt 18:** Nächste Remediation-Welle gemäß Matrix.

---

*Erstellt als verbindliche Migrationsmatrix für die Notification Engine Remediation Serie (36 Prompts).*

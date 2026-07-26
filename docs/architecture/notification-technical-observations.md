# Notification Engine — Technical Observations (Remediation W1 / Prompt 14)

**Datum:** 2026-07-26  
**Branch:** `remediation/notification-engine-production-readiness-2026-07`  
**Wave:** W1 (Vehicle Health & Telemetrie)  
**Basis:** `docs/architecture/notification-vehicle-health-telemetry-producers.md`

## Ziel

Technical Observations (`vehicle_complaints` / `VehicleComplaint`) bleiben fachliche Domain-Objekte (Intake, Evidence, Links zu Task/Damage/Service). Die **kanonische Inbox-Wahrheit** liegt ausschließlich in der Notification Engine (`TECHNICAL_OBSERVATION_ACTIVE`). Es gibt höchstens **eine aktive Notification pro Observation** (`technical_observation_active:{observationId}`).

## Beziehung Observation ↔ Notification

| Aspekt | Observation (`VehicleComplaint`) | Notification (`TECHNICAL_OBSERVATION_ACTIVE`) |
|--------|----------------------------------|-----------------------------------------------|
| Rolle | Fachliches Objekt, CRUD, Audit, Finding-Bridge | Kanonische Meldung im Meldungen-Panel |
| Identity | `vehicle_complaints.id` | Fingerprint mit `conditionCodeVariant = observationId` |
| Referenz | — | `metadata.observationId`, `metadata.complaintId` |
| Korrelation | `bookingId`, `linkedServiceCaseId`, `linkedServiceTaskId`, `convertedToTaskId` | `correlationId` (Priorität: booking → service case → task) |
| Kausalität | `handoverProtocolId`, `linkedServiceTaskId` | `causationId` |
| Severity | `urgency` (CRITICAL/HIGH/MEDIUM/LOW) | `NotificationSeverity` via Re-Ingest |
| Lifecycle | `ACTIVE` / terminal (`RESOLVED`, `DISMISSED`, `CONVERTED`, …) | OPEN → RESOLVED (SUCCESS) bei Terminalstatus |

## Producer & Lifecycle-Sync

**Service:** `TechnicalObservationsService`  
**Ingest:** `NotificationProducerIngestService.syncTechnicalObservationActive/Resolved`  
**Adapter:** `TechnicalObservationNotificationAdapter` (live, `shadowModeEnabled: false`)

| Aktion | Notification-Verhalten |
|--------|------------------------|
| `create` | Active ingest mit `correlationId` / `causationId` |
| `update` (severity, status) | Active re-ingest oder resolve je nach Status |
| `resolve` / `dismiss` / `convertToTask` | Resolve ingest |
| `linkService` | Active re-ingest mit aktualisiertem `correlationId` |
| Reopen (`update` → ACTIVE) | Active re-ingest auf gleichem Fingerprint |

**Device-Quality-Dedupe:** Auto-Observations aus `DrivingAssessmentDeviceQualityService` (`DEVICE_QUALITY_WORKER_ID` / Marker) werden **nicht** als `TECHNICAL_OBSERVATION_ACTIVE` ingested — kanonisch bleibt `DRIVING_ASSESSMENT_DEVICE_QUALITY`.

## Entfernte / unterdrückte Doppelpfade

| Pfad | Maßnahme |
|------|----------|
| Rental-Health `complaints` → aggregate `technical_observation_active` ActionQueue-Zeile | Frontend `merge-v2-with-vehicle-health.ts` unterdrückt Supplemental, wenn V2 pro Fahrzeug `TECHNICAL_OBSERVATION_ACTIVE` hat |
| Device-quality system observation | `shouldIngestTechnicalObservationNotification` filter |
| Zweite Notification pro Observation | Stabiler Fingerprint `technical_observation_active:{id}` |

**Unverändert:** Rental-Health `evaluateComplaints` liefert weiterhin Modul-State für Health-Pills/Fleet — keine zweite Inbox, nur Aggregat für UI.

## Tests

- `notification-technical-observation-producers.spec.ts` — manual/handover ingest, severity, resolve, reopen, service link, driving-assessment dedupe
- `technical-observations.service.spec.ts` — lifecycle hooks mit ingest mock
- `merge-v2-with-vehicle-health.test.ts` — aggregate complaints bridge suppression

## Offene Legacy-Abhängigkeiten

- Rental-Health-Modul `complaints` bleibt für Health-Summary (nicht Inbox)
- `FindingBridgeService` parallel zu Domain-Observation (Findings ≠ Notifications)
- Per-Observation V2 rows ersetzen aggregate rental-health bridge schrittweise für alle Fahrzeuge

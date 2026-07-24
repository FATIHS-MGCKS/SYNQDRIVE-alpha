# Vehicle Detail Page — Audit Logging & Data Minimization

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 17/36 — Audit Logging und Datenminimierung |
| **Vorgänger** | [`vehicle-detail-page-device-connection-security-2026-07.md`](./vehicle-detail-page-device-connection-security-2026-07.md) |

---

## Ziel

Nachvollziehbares, datensparsames Audit Logging für Zugriffe und Mutationen der Vehicle Detail Page — ohne Tokens, Secrets, Roh-GPS-Koordinaten oder unnötige PII in Logs.

---

## Zentrale Audit-Schicht

| Komponente | Pfad | Rolle |
|------------|------|-------|
| `VehicleDetailAccessAuditService` | `backend/src/modules/activity-log/vehicle-detail-access-audit.service.ts` | Einheitliche Audit-Codes, Dedup (60s), Outcome/Purpose/RequestId |
| `AuditService` | `backend/src/modules/activity-log/audit.service.ts` | Persistenz in `activity_logs`, PII-Scrub auf Write |
| `scrubPiiJson` / `scrubPiiString` | `backend/src/shared/utils/audit-pii.util.ts` | Redaction von Tokens, Koordinaten, Callback-URLs, E-Mails |

### Audit-Felder (strukturiert in `metaJson`)

| Feld | Quelle |
|------|--------|
| Actor/User ID | `userId` (Spalte) + `actorUserId` im Kontext |
| Organization ID | `organizationId` (Spalte + `metaJson.organizationId`) |
| Vehicle ID | `entityId` + `metaJson.vehicleId` |
| Aktion | `metaJson.auditAction` (`LIVE_GPS_READ`, `TELEMETRY_READ`, …) |
| Zweck | `metaJson.purpose` |
| Zeit | `createdAt` (DB) + `metaJson.recordedAt` (ISO) |
| Ergebnis | `metaJson.outcome` (`allowed` \| `denied`) |
| Fehlerklasse | `metaJson.errorClass` (`PERMISSION_DENIED`, `DATA_AUTHORIZATION_DENIED`) |
| Request-/Correlation-ID | `metaJson.requestId` (gesetzt durch `RequestLoggingInterceptor`) |

---

## Abgedeckte Vehicle-Detail-Pfade

| Pfad | Audit-Code | Dedup | Hinweise |
|------|------------|-------|----------|
| `GET …/live-gps` | `LIVE_GPS_READ` | 60s | über `GpsPositionAccessService` |
| `GET …/telemetry` | `TELEMETRY_READ` | 60s | über `GpsPositionAccessService` |
| `GET …/fleet-map` | `FLEET_MAP_READ` | 60s | Org-weit, kein `vehicleId` |
| `GET …/device-connection` | `DEVICE_CONNECTION_READ` | 60s | nur Aggregat-Metadaten (`lteR1Capable`, `openUnpluggedEpisode`) |
| `PATCH …/status` (operational) | `VEHICLE_OPERATIONAL_STATUS_UPDATE` | nein | `previousStatus` / `nextStatus` |
| `PATCH …/status` (cleaning) | `VEHICLE_CLEANING_STATUS_UPDATE` | nein | `previousCleaningStatus` / `nextCleaningStatus` |
| `GET /vehicles/:vehicleId/file-summary` | `FILE_SUMMARY_READ` | 60s | Documents-Tab Read Model |
| `GET …/rental-requirements` | `RENTAL_REQUIREMENTS_READ` | 60s | effektive Mietanforderungen |
| GPS Data-Auth-Ablehnung | `LIVE_GPS_READ` / `TELEMETRY_READ` / … + `errorClass` | nein | `AUTH_FAIL`, Level WARN |
| Permission-Denial (Vehicle Detail) | `VEHICLE_PERMISSION_DENIED` | nein | `PermissionsGuard` |

**Nicht geloggt:** Access/Refresh Tokens, Mapbox Token, Provider-Secrets, vollständige Provider-Rohantworten, exakte GPS-Koordinaten, Stacktraces in API-Antworten.

---

## Datenminimierung & PII-Redaction

- `audit-pii.util.ts` redacted Schlüssel mit Fragmenten: `token`, `secret`, `latitude`, `longitude`, `coordinates`, `callbackurl`, …
- `AuditService` und `ActivityLogService` wenden Scrubber auf `description` und `metaJson` an.
- GPS-Audit-Einträge enthalten **keine** Koordinaten — nur Purpose, Data-Category, Outcome.
- Device-Connection-Audit enthält keine `rawEvents`, `callbackUrl`, `triggerId` (bereits client-seitig entfernt, Prompt 16).

---

## Log-Retention, Level, Production-Debug

| Thema | Ist-Zustand | Empfehlung |
|-------|-------------|------------|
| **Retention** | `RETENTION_ACTIVITY_LOGS_DAYS=0` (deaktiviert) in `retention.config.ts` | Für Produktion Retention-Tage setzen + Partition-Job (`backend/scripts/ops/`) |
| **Strukturierte Logs** | NestJS `Logger` + `activity_logs.metaJson` (JSON) | Ausreichend für Audit-Trail; Korrelation über `requestId` |
| **Log-Level** | Audit INFO (erlaubt), WARN (verweigert) | Beibehalten |
| **Debug in Production** | `logger.debug` nur für Cache-Fehler etc., keine PII | Kein `debug`-Logging von Telemetrie-Rohdaten |
| **Tenant-Kontext** | `organizationId` Pflicht; Vehicle-Scoped Routes mit `vehicleId` | Org-Scoping-Guard bleibt erste Verteidigungslinie |

---

## Tenant-Sicherheit

- Alle Vehicle-Detail-Audits sind an `organizationId` gebunden.
- `PermissionsGuard` loggt Denials nur bei Vehicle-Detail-Kontext (`vehicleId` in Route, `fleet-map`, `fleet-connectivity`, oder Module `fleet` / `fleet-connectivity` / `rental-rules*` / `document-upload`).
- Data-Authorization-Denials werden vor Provider-Fetch ausgelöst (kein Leak von Position-Daten bei fehlender Einwilligung).

---

## Tests

| Bereich | Datei |
|---------|-------|
| Vehicle Detail Audit Service | `vehicle-detail-access-audit.service.spec.ts` |
| GPS Access + Denial Audit | `gps-position-access.service.spec.ts` |
| PII Scrubber | `audit-pii.util.spec.ts` |
| Permission Denial Audit | `permissions.guard.vehicle-detail-audit.spec.ts` |
| Status PATCH Audit | `vehicles.controller.status-patch.spec.ts` |
| Device Connection Audit | `vehicles.service.device-connection.spec.ts` |

---

## Offene organisatorische DSGVO-Nachweise (nicht allein im Code)

Diese Punkte erfordern Prozess-, Vertrags- oder Dokumentationsarbeit außerhalb des Repos:

1. **Verzeichnis von Verarbeitungstätigkeiten (VVT)** — Zweckbindung für GPS/Telemetrie (`LIVE_MAP`, `TECHNICAL_OVERVIEW`, `FLEET_ANALYTICS`) dokumentieren und mit Data-Authorization-Zwecken abgleichen.
2. **Aufbewahrungsfristen & Löschkonzept** — `RETENTION_ACTIVITY_LOGS_DAYS` operativ setzen; Löschfristen für `activity_logs` in Datenschutzerklärung / internem Retention-Register festlegen.
3. **Rechtsgrundlage & Einwilligung** — DIMO/Telemetrie-Einwilligungen (Data Authorization) müssen organisatorisch gepflegt und bei Widerruf prozessual durchgesetzt werden (technisch: Enforcement vorhanden).
4. **Auskunfts- und Löschrechte (Art. 15/17 DSGVO)** — Export/Löschung von Audit-Einträgen mit Personenbezug (User-ID, IP, User-Agent) über IAM/DSAR-Prozess; Code liefert strukturierte Logs, nicht den Vollzug von Betroffenenanfragen.
5. **Auftragsverarbeitung (AVV)** — DIMO, Mapbox, Hosting-Provider: Verträge und Unterauftragsverzeichnis pflegen.
6. **Zugriffskontrolle & Schulung** — Wer darf Activity Logs lesen (`legal-documents-audit`, Master Admin)? Organisatorische Freigabe und Need-to-know.
7. **Incident Response** — Bei Audit-System-Ausfall (`AuditService` fire-and-forget): Monitoring/Alerting für `AuditService.record failed` in Produktion.
8. **Datenschutz-Folgenabschätzung (DSFA)** — Bei flächendeckendem Live-GPS-Polling (5s) und Fahrzeugortung empfohlen; technische Minimierung (Dedup, keine Koordinaten in Logs) ist umgesetzt, organisatorische Bewertung bleibt offen.

---

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).

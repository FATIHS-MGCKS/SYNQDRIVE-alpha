# Vehicle Detail Page — Device-Connection-Sicherheit

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 16/36 — Device-Connection-Endpunkte absichern |
| **Vorgänger** | [`vehicle-detail-page-gps-authorization-map-2026-07.md`](./vehicle-detail-page-gps-authorization-map-2026-07.md) |

---

## Abgesicherte Endpunkte

| Endpunkt | Permission | Guards | Rate Limit | Audit | DTO-Sanitisierung |
|----------|------------|--------|------------|-------|-------------------|
| `GET /organizations/:orgId/vehicles/:vehicleId/device-connection` | `fleet-connectivity:read` | `OrgScopingGuard`, `PermissionsGuard` | 120/min | `AuditService` SYNC | `sanitizeDeviceConnectionForClient` |
| `GET /organizations/:orgId/fleet-connectivity` | `fleet-connectivity:read` | bereits verdrahtet | global throttler | — | Fleet-DTO (keine Rohpayloads) |
| `GET /organizations/:orgId/fleet-connectivity/:vehicleId` | `fleet-connectivity:read` | bereits verdrahtet | global throttler | — | Fleet-DTO |
| `GET /vehicles/:vehicleId/trips/:tripId/device-connection-evidence` | `fleet-connectivity:read` | `VehicleOwnershipGuard`, `PermissionsGuard` | global throttler | — | Trip-Evidence-View |
| `GET /organizations/:orgId/data-analyse/.../device-connection-events` | `data-analyse:read` | bereits verdrahtet | — | — | nur mit `debugRaw` (Operator) |

---

## Implementierung (finale Pfade)

| Komponente | Pfad |
|------------|------|
| Client-DTO-Sanitizer | `backend/src/modules/dimo/device-connection-client-response.ts` |
| Vehicle Detail API | `backend/src/modules/vehicles/vehicles.controller.ts` → `getDeviceConnection` |
| Service + Audit | `backend/src/modules/vehicles/vehicles.service.ts` → `getDeviceConnection` |
| Trip Evidence Permission | `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts` |
| Vehicle Detail Card (UI) | `frontend/src/rental/components/vehicle-detail/VehicleDeviceConnectionCard.tsx` |
| Card-State-Resolver | `frontend/src/rental/lib/device-connection-ui.ts` |
| OBD Header Index | `frontend/src/rental/hooks/useFleetObdPlugIndex.ts` |
| Trip Evidence UI | `frontend/src/rental/components/trips/TripDeviceConnectionEvidence.tsx` |

**Entfernt aus Client-Responses:** `rawEvents`, `callbackUrl`, `triggerId` — ersetzt durch `callbackConfigured: boolean`.

**Frontend-Verhalten:** Karte bleibt bei Fehler/Berechtigung/Empty sichtbar (kein stilles `return null` mehr).

---

## Tests

| Bereich | Datei |
|---------|-------|
| Controller Security | `vehicles.controller.device-connection.spec.ts` |
| Service Audit + Sanitize | `vehicles.service.device-connection.spec.ts` |
| Sanitizer Unit | `device-connection-client-response.spec.ts` |
| Trip Evidence Permission | `vehicle-intelligence.controller.device-connection.spec.ts` |
| Frontend Card States | `device-connection-card-states.test.ts` |

---

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).

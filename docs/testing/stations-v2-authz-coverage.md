# Stations V2 — Authorization Test Coverage

Stand: 2026-07-17  
Scope: Automatisiertes Authz-Testpaket (Gate 1 Permission + Gate 2 Station Scope) für `/api/v1/organizations/:orgId/stations/**`

## Ausführung

```bash
cd backend

# V2 Authz-Paket isoliert (46 Tests)
npm test -- --testPathPattern="stations-v2-authz"

# Gesamtes Stations-Modul inkl. Authz-Paket (190 Tests)
npm test -- --testPathPattern="stations"

# TypeScript + Build
npx tsc --noEmit
npm run build
```

**Letzter Lauf:** 46/46 Authz-Tests grün; 190/190 Stations-Suites grün.

**Typecheck / Build:** `npx tsc --noEmit` und `npm run build` schlagen im Gesamt-Backend wegen vorbestehender Fehler in anderen Modulen fehl (z. B. voice-assistant, brake-evidence, driving-impact). Die Authz-Testdateien kompilieren und laufen isoliert fehlerfrei via Jest.

---

## Testpaket-Struktur

| Datei | Rolle |
|-------|-------|
| `backend/src/modules/stations/testing/stations-v2-authz.fixtures.ts` | Personas, Endpoint-Katalog (Read/Mutation), Konstanten |
| `backend/src/modules/stations/testing/stations-v2-authz.harness.ts` | Harness: Permission Guard + Mutation Guards + Scope Guard |
| `backend/src/modules/stations/stations-v2-authz.spec.ts` | Matrix-Tests über Rollen, Scope-Modi, Sonderfälle |

**Bestehende ergänzende Suites (nicht ersetzt):**

- `stations.controller.spec.ts` — Metadaten/Guard-Wiring
- `station-scope.service.spec.ts` — Scope-Service Einzelfälle
- `stations-access.service.spec.ts` — Permission-Service
- `stations-nested-security.spec.ts` — Service-Layer 404 / Nested Where
- `station-access-scope.integration.spec.ts` — List/Stats Scope-Filter

---

## Abdeckungsmatrix

### A. Read-Endpunkte

| Endpoint | Permission | Scope | Abgedeckt |
|----------|------------|-------|-----------|
| `GET /stations` | `stations.read` | `list` | ✅ Org Admin allow, Driver deny |
| `GET /stations/stats` | `stations.read` | `list` | ✅ |
| `GET /stations/:id` | `stations.read` | `station` | ✅ Assigned / out-of-scope |
| `GET /stations/:id/overview-stats` | `stations.read` | `station` | ✅ |
| `GET /stations/:id/fleet` | `stations.read` | `station` | ✅ + Nested where |
| `GET /stations/:id/bookings` | `stations.read` | `station` | ✅ + Nested where |
| `GET /stations/:id/operations` | `stations.read` | `station` | ✅ |
| `GET /stations/:id/team` | `stations.read` | `station` | ✅ |
| `GET /stations/:id/activity` | `stations.view_activity` | `station` | ✅ Read-only allow |

### B. Mutation-Endpunkte

| Endpoint | Permission(s) | Scope | Abgedeckt |
|----------|---------------|-------|-----------|
| `POST /stations` | `stations.create` | `create` | ✅ Manager/Driver deny |
| `PATCH /stations/:id` (master) | `stations.update_master_data` | `station` | ✅ Manager allow |
| `PATCH /stations/:id` (ops) | `stations.manage_operations` | `station` | ✅ Manager allow |
| `POST /stations/:id/archive` | `stations.archive` | `station` | ✅ Manager deny |
| `POST /stations/:id/restore` | `stations.restore` | `station` | ✅ Permission + archived policy |
| `POST /stations/:id/set-primary` | `stations.set_primary` + role | `station` | ✅ Worker role block |
| `PUT /stations/:id/vehicles` | `stations.manage_home_fleet` | `station` | ✅ |
| `POST /stations/:id/assign-vehicle` | target-dependent | `station` | ✅ home / expected |
| `PATCH /stations/vehicles/current-station` | `stations.manage_current_location` | `vehicle_location` | ✅ Worker allow |
| `POST /stations/backfill-coordinates` | `stations.geocode` | `list` | ✅ Manager allow |
| `DELETE /stations/:id` | `stations.archive` | `station` | ✅ |

### C. Scope-Modi

| Modus | Test |
|-------|------|
| `ALL_STATIONS` | Org Admin auf beliebiger In-Org-Station |
| `ASSIGNED_STATIONS` | Manager/Worker nur `stationIds` |
| `NO_STATIONS` | Driver blockiert |
| Leere `stationIds` | List → `STATION_SCOPE_NO_STATIONS` |

### D. Sonderfälle

| Szenario | Erwartung | Test |
|----------|-----------|------|
| Archivierte Station im Scope | GET erlaubt, PATCH verweigert | ✅ |
| Restore auf archiviert | Scope: `ARCHIVED_WRITE_FORBIDDEN` (Ist) | ✅ dokumentiert |
| Nicht existierende Station | `STATION_NOT_FOUND` | ✅ |
| Cross-Tenant Station | `STATION_SCOPE_CROSS_ORGANIZATION` | ✅ |
| JWT Org-Mismatch | 403 Forbidden | ✅ |
| `:id` vs `stationId` | Gleiche Resolver-Logik | ✅ |
| Listenfilter / KPI | `id IN allowedStationIds` | ✅ |
| Nested Fleet/Bookings | OR home/current/expected bzw. pickup/return | ✅ |
| Out-of-scope Service Read | 404 ohne Count-Leak | ✅ |

### E. Rollen-Personas

| Persona | Rolle | Scope | Permissions |
|---------|-------|-------|-------------|
| Org Admin | `ORG_ADMIN` | `ALL_STATIONS` | Voll |
| Station Manager | `SUB_ADMIN` | `ASSIGNED_STATIONS` | Manager-Matrix |
| Worker | `WORKER` | `ASSIGNED_STATIONS` | read + current location |
| Driver | `DRIVER` | `NO_STATIONS` | keine |
| Read-only | `SUB_ADMIN` | `ASSIGNED_STATIONS` | read + view_activity |

---

## Bekannte Ist-/Soll-Beobachtungen

1. **Restore auf archivierte Station:** `POST .../restore` trifft aktuell auf `ARCHIVED_WRITE_FORBIDDEN` am Scope-Gate (POST ≠ historischer Read). Permission `stations.restore` allein reicht nicht. Test dokumentiert Ist-Verhalten — ggf. eigener Prompt für Restore-Exemption.

2. **Mapbox-Suche:** `GET .../search/mapbox*` hat `scope: none` und kein `stations.read` am Controller — bewusst außerhalb dieses Authz-Katalogs (kein Stations-Lesezugriff erforderlich).

---

## Referenzen

- [`docs/architecture/stations-v2-permissions.md`](../architecture/stations-v2-permissions.md)
- [`docs/architecture/stations-v2-execution-contract.md`](../architecture/stations-v2-execution-contract.md)
- Prompt 14/78 — Authz-Testpaket

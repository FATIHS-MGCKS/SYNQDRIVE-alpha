# Stations V2 — Backend Test Coverage

Stand: 2026-07-18 (Prompt 71/78)  
Scope: Backend-Tests für Stations V2 — Permissions, Commands, Read Models, Booking/Handover-Integration, Performance.

## Ausführung

```bash
cd backend

# Gesamtpaket (Stations V2 + shared stations + booking handover wiring)
npm run test:stations:v2

# Vollständige Verifikation: Tests + Prisma + tsc + Build
npm run test:stations:v2:verify

# Teilbefehle
npm run test:stations:v2:verify:unit
bash scripts/test/stations-v2-verify.sh prisma
bash scripts/test/stations-v2-verify.sh typecheck
bash scripts/test/stations-v2-verify.sh build

# Authz-Paket isoliert
npm test -- --testPathPattern="stations-v2-authz|stations-v2-transfers-authz|stations-v2-override-authz"
```

**Jest-Muster:** `stations|station-access-scope|station-scope|station-booking|station-capacity|station-kpis|station-summary|station-org-summaries|station-operations|handover-station|one-way-return|expected-station|vehicle-handover-station|vehicle-home-fleet|vehicle-change-home|vehicle-correct-current|vehicle-station-transfer|vehicle-station-position|bookings-handover.station|bookings.service.station-rules`

**Letzter Lauf (`npm run test:stations:v2`):**

| Schritt | Ergebnis |
|---------|----------|
| Stations V2 Tests | **104 Suites / 864 Tests** — alle grün |
| `prisma validate` | grün (1 bestehende Schema-Warnung `onDelete SetNull`) |
| `tsc --noEmit` | schlägt im Gesamt-Backend wegen vorbestehender Fehler fehl (z. B. `twilio`, damage-incident specs) |
| `npm run build` | schlägt wegen fehlendem `twilio`-Modul fehl — Stations-Specs kompilieren und laufen isoliert fehlerfrei via Jest |

---

## Abdeckungsmatrix (24 Bereiche)

| # | Bereich | Status | Primäre Testdateien |
|---|---------|--------|---------------------|
| 1 | **Permissions & Scope** | ✅ | `stations-v2-authz.spec.ts`, `stations-v2-transfers-authz.spec.ts`, `stations-v2-override-authz.spec.ts`, `stations-access.service.spec.ts`, `stations-mutation-permission.util.spec.ts`, `guards/stations-mutation-guards.spec.ts`, `shared/stations/station-scope.service.spec.ts`, `shared/stations/station-access-scope.*.spec.ts` |
| 2 | **CRUD-Invarianten** | ✅ | `stations-create.integration.spec.ts`, `stations-update.integration.spec.ts`, `station-create-validation.util.spec.ts`, `station-update-validation.util.spec.ts`, `dto/create-station.dto.spec.ts`, `stations.controller.spec.ts` |
| 3 | **Lifecycle** | ✅ | `shared/stations/station-lifecycle.policy.spec.ts`, `station-lifecycle-command.util.spec.ts`, `stations-lifecycle-command.integration.spec.ts` |
| 4 | **Archive Preview** | ✅ | `station-archive-preview.util.spec.ts`, `stations-archive-preview.integration.spec.ts` |
| 5 | **Archive / Restore** | ✅ | `station-archive-command.util.spec.ts`, `stations-archive-command.integration.spec.ts`, `station-restore-command.util.spec.ts`, `station-restore-preview.util.spec.ts`, `stations-restore-command.integration.spec.ts`, `stations-delete-deprecation.integration.spec.ts` |
| 6 | **Primary Concurrency** | ✅ | `station-set-primary-command.util.spec.ts`, `stations-set-primary-command.integration.spec.ts`, `station-primary-invariant.migration.spec.ts`, `stations-optimistic-concurrency.integration.spec.ts` |
| 7 | **Koordinaten / Zeitzone** | ✅ | `station-geocode.util.spec.ts`, `station-location-masterdata.util.spec.ts`, `stations-location-masterdata.integration.spec.ts`, `station-mapbox.service.spec.ts`, `shared/stations/station-timezone.util.spec.ts` |
| 8 | **Opening Hours** | ✅ | `shared/stations/station-opening-hours.validation.spec.ts`, `shared/stations/station-opening-calendar.util.spec.ts`, `station-create-validation.util.spec.ts` |
| 9 | **Calendar Exceptions** | ✅ | `shared/stations/station-calendar-exception.validation.spec.ts`, `station-calendar-exception.integration.spec.ts`, `station-calendar-exception.migration.spec.ts` |
| 10 | **Capacity** | ✅ | `shared/stations/station-capacity-policy.spec.ts`, `shared/stations/station-capacity-rules.spec.ts`, `shared/stations/station-capacity-rules.simulation.spec.ts`, `station-operational-capability.integration.spec.ts` |
| 11 | **Home / Current / Expected** | ✅ | `vehicle-change-home-station-command.*.spec.ts`, `vehicle-correct-current-station-command.*.spec.ts`, `shared/stations/expected-station.policy.spec.ts`, `vehicle-station-position-metadata.migration.spec.ts`, `bookings-handover.station-position.integration.spec.ts` |
| 12 | **Delta Assignment** | ✅ | `vehicle-home-fleet-delta.integration.spec.ts`, `vehicle-home-fleet-delta.util.spec.ts`, `vehicle-home-assignment-preview.integration.spec.ts` |
| 13 | **>500 Fahrzeuge** | ✅ | `shared/stations/station-set-vehicles.policy.spec.ts`, `vehicle-home-assignment-preview.integration.spec.ts` (501-Batch-Limit), `station-set-vehicles-deprecation.integration.spec.ts`, `stations-v2-query-performance.spec.ts` |
| 14 | **Transfers** | ✅ | `vehicle-station-transfer.util.spec.ts`, `vehicle-station-transfer.integration.spec.ts`, `stations-v2-transfers-authz.spec.ts` |
| 15 | **Booking Rules** | ✅ | `shared/stations/station-booking-rules.resolver.spec.ts`, `station-booking-rules.service.spec.ts`, `station-booking-rules.integration.spec.ts`, `bookings.service.station-rules.integration.spec.ts` |
| 16 | **After-hours** | ✅ | `shared/stations/station-booking-pickup-rules.spec.ts`, `shared/stations/station-booking-return-rules.spec.ts`, `shared/stations/station-operational-capability.resolver.spec.ts`, `bookings-handover.station-rules.integration.spec.ts` |
| 17 | **Overrides** | ✅ | `shared/stations/station-rule-manual-override.policy.spec.ts`, `station-rule-manual-override.integration.spec.ts`, `stations-v2-override-authz.spec.ts`, `stations-v2-transfers-authz.spec.ts` |
| 18 | **Pickup / Return** | ✅ | `shared/stations/station-booking-pickup-rules.spec.ts`, `shared/stations/station-booking-return-rules.spec.ts`, `shared/stations/handover-station-rules.util.spec.ts`, `bookings-handover.station-rules.integration.spec.ts`, `shared/stations/one-way-return-follow-up.util.spec.ts` |
| 19 | **KPI Read Model** | ✅ | `shared/stations/station-kpis.resolver.spec.ts`, `station-summary-read-model.integration.spec.ts`, `shared/stations/station-org-summaries.resolver.spec.ts`, `station-org-summaries.integration.spec.ts` |
| 20 | **Runtime State** | ✅ | `shared/stations/station-kpis.resolver.spec.ts`, `station-summary-read-model.integration.spec.ts` (Runtime-Loader-Mock), `station-org-summaries.integration.spec.ts` |
| 21 | **Tasks** | ✅ | `shared/stations/station-operations-summary.resolver.spec.ts`, `station-operations-timeline.integration.spec.ts`, `stations-nested-security.spec.ts` |
| 22 | **Audit Trail** | ✅ | `station-domain-audit.service.spec.ts`, `shared/stations/station-domain-audit.util.spec.ts`, `stations-v2-audit-trail.integration.spec.ts` |
| 23 | **Tenant Isolation** | ✅ | `stations-v2-authz.spec.ts`, `stations-v2-tenant-isolation.spec.ts`, `vehicle-home-fleet-delta.integration.spec.ts`, `stations-nested-security.spec.ts` |
| 24 | **Performancekritische Queries** | ✅ | `station-query-path-indexes.spec.ts`, `station-org-summaries.integration.spec.ts` (bounded batch queries), `stations-v2-query-performance.spec.ts` |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## Konsolidierte Testpakete (Prompt 71)

| Paket | Dateien | Rolle |
|-------|---------|-------|
| **Authz** | `testing/stations-v2-authz.fixtures.ts`, `testing/stations-v2-authz.harness.ts`, `stations-v2-authz.spec.ts` | Gate 1 Permission + Gate 2 Scope Matrix |
| **Transfers Authz** | `stations-v2-transfers-authz.spec.ts` | `stations.manage_transfers`, correct-current, override guards |
| **Tenant Isolation** | `stations-v2-tenant-isolation.spec.ts` | Cross-org Reads, Home-Fleet-Delta |
| **Audit Trail** | `stations-v2-audit-trail.integration.spec.ts` | Command → `StationDomainAuditService` Wiring |
| **Query Performance** | `stations-v2-query-performance.spec.ts`, `station-query-path-indexes.spec.ts` | Index-Migration, 500er Batch-Caps |
| **Shared Mocks** | `testing/station-domain-audit.service.mock.ts`, `testing/station-vehicle-runtime-loader.mock.ts`, `testing/station-operations.service.mock.ts` | Einheitliche Service-Integration |

Ergänzend: [`stations-v2-authz-coverage.md`](./stations-v2-authz-coverage.md) (Authz-Detailmatrix Prompt 14).

---

## Detail: kritische Pfade

### Permission + Scope (Gate 1/2)

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Org Admin ALL_STATIONS | Matrix | `stations-v2-authz.spec.ts` |
| ASSIGNED_STATIONS / NO_STATIONS | Matrix | `stations-v2-authz.spec.ts` |
| Nested Fleet/Bookings Where | Service | `stations-nested-security.spec.ts`, `station-access-scope.integration.spec.ts` |
| Cross-Tenant 404 | Authz + Tenant | `stations-v2-authz.spec.ts`, `stations-v2-tenant-isolation.spec.ts` |
| Transfer Permission | Guard | `stations-v2-transfers-authz.spec.ts` |

### Home / Current / Expected Semantik

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Change Home nur `homeStationId` | Integration | `vehicle-change-home-station-command.integration.spec.ts` |
| Correct Current nur `currentStationId` | Integration | `vehicle-correct-current-station-command.integration.spec.ts` |
| Expected Policy Prioritäten | Unit | `shared/stations/expected-station.policy.spec.ts` |
| SET vehicles deprecated | Integration | `station-set-vehicles-deprecation.integration.spec.ts` |
| Optimistic Concurrency 409 | Integration | `stations-optimistic-concurrency.integration.spec.ts` |

### Booking / Handover

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Pickup/Return Rules TZ-aware | Unit | `station-booking-pickup-rules.spec.ts`, `station-booking-return-rules.spec.ts` |
| Booking Create/Update Gate | Integration | `bookings.service.station-rules.integration.spec.ts` |
| Handover Revalidation | Integration | `bookings-handover.station-rules.integration.spec.ts` |
| Manual Override | Integration | `station-rule-manual-override.integration.spec.ts` |

### Read Models & KPIs

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Station Summary Partial Data | Integration | `station-summary-read-model.integration.spec.ts` |
| Org Summaries Pagination/Cap | Integration | `station-org-summaries.integration.spec.ts` |
| Operations Timeline | Integration | `station-operations-timeline.integration.spec.ts` |
| Runtime KPI enrichment | Integration | `station-org-summaries.integration.spec.ts` |

---

## Referenzen

- [`docs/architecture/stations-v2-execution-contract.md`](../architecture/stations-v2-execution-contract.md)
- [`docs/architecture/stations-v2-permissions.md`](../architecture/stations-v2-permissions.md)
- [`docs/performance/stations-v2-query-analysis.md`](../performance/stations-v2-query-analysis.md)
- Prompt 14/78 — Authz-Testpaket (`stations-v2-authz-coverage.md`)
- Prompt 71/78 — Vollständiges Backend-Testpaket (dieses Dokument)

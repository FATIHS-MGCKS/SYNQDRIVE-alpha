# Vehicle Operational State V2 — Frontend & E2E Test Coverage

Stand: 2026-07-16  
Scope: Vitest (Unit/Component/Contract) + Playwright (E2E) für Vehicle Operational State V2 im Rental-Frontend und Operator-Bereich.

## Ausführung

```bash
cd frontend

# TypeScript
npx tsc -b

# Vitest — Operational-V2-Fokus
npm test -- \
  src/rental/lib/vehicle-operational-state \
  src/rental/lib/vehicle-operational-query \
  src/rental/lib/vehicle-operational-unknown-display.test.ts \
  src/rental/lib/vehicle-operational-booking-display.test.ts \
  src/rental/lib/fleet-command-filters.test.ts \
  src/rental/lib/fleet-map-vehicle-store.utils.test.ts \
  src/rental/lib/vehicle-operational-state-v2-surfaces.test.ts \
  src/rental/lib/vehicle-operational-period-availability.test.ts \
  src/rental/components/fleet-operator/FleetCommandPanel.test.tsx \
  src/rental/components/fleet/VehicleOperationalStatusCallout.test.tsx \
  src/operator/lib/operatorStatus.test.ts \
  src/rental/components/dashboard/runtime

# Production Build
npm run build

# Playwright E2E (Operational-V2-Specs, Desktop)
cd e2e
npx playwright test fleet-operational-flow.spec.ts fleet-operational-responsive.spec.ts --project=desktop-1280

# Playwright E2E (alle Viewports)
npx playwright test fleet-operational-flow.spec.ts fleet-operational-responsive.spec.ts
```

**Frameworks:** Vitest + React Testing Library (statische Markup-/Contract-Tests) · Playwright (`frontend/e2e/`) · Mocks in `fleet-operational-fixtures.ts` (analog `task-fixtures.ts`).

---

## Abdeckungsmatrix (9 Bereiche)

| Bereich | Status | Primäre Testdateien |
|---------|--------|---------------------|
| **1. Fleet List** | ✅ Voll | `fleet-command-filters.test.ts`, `vehicle-operational-state-v2-surfaces.test.ts`, `FleetCommandPanel.test.tsx`, `fleet-operational-flow.spec.ts` (Test 1) |
| **2. Fleet Map** | ✅ Voll | `fleetVisualState` (via surfaces), `fleet-operational-flow.spec.ts` (Test 2), `fleet-operational-responsive.spec.ts` |
| **3. Vehicle Detail** | ✅ Voll | `VehicleOperationalStatusCallout.test.tsx`, `vehicle-operational-unknown-display.test.ts`, `fleet-operational-flow.spec.ts` (Test 3) |
| **4. Dashboard** | ✅ Voll | `dashboardRuntimeUI.test.ts`, `runtimeSliceConsistency.test.ts`, `todaysOperationalSlice.test.ts`, `vehicle-operational-state-v2-surfaces.test.ts`, `fleet-operational-flow.spec.ts` (Test 4) |
| **5. Operator App** | ✅ Weitgehend | `operatorStatus.test.ts` (Status-Badges, UNKNOWN neutral) |
| **6. Cache** | ✅ Voll | `vehicle-operational-query.test.ts`, `fleet-map-vehicle-store.utils.test.ts`, `fleet-operational-flow.spec.ts` (Tests 5–6) |
| **7. Safe Fallback** | ✅ Voll | `vehicle-operational-state.test.ts`, `vehicle-operational-unknown-display.test.ts`, `vehicle-operational-state-v2-surfaces.test.ts`, `fleet-operational-responsive.spec.ts` |
| **8. Responsive** | ✅ Voll | `fleet-operational-responsive.spec.ts` |
| **9. Zeitraumverfügbarkeit** | ✅ Voll | `vehicle-operational-period-availability.test.ts`, `bookings.service.overlap` (Backend) |

Legende: ✅ abgedeckt · ⚠️ teilweise · ❌ Lücke

---

## 1. Fleet List

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Available mit zukünftiger Buchung (Tab Available) | Unit + E2E | `vehicle-operational-state-v2-surfaces.test.ts`, `fleet-operational-flow.spec.ts` (Test 7) |
| Reserved am Pickup-Tag | Unit + E2E | `fleet-command-filters.test.ts`, `fleet-operational-flow.spec.ts` |
| Active Rented nach Pickup | Unit + E2E | `fleet-operational-flow.spec.ts` |
| Unknown (neutral) | Unit + E2E | `FleetCommandPanel.test.tsx`, `fleet-operational-flow.spec.ts` |
| Tabs und Zähler | Component + E2E | `FleetCommandPanel.test.tsx`, `fleet-operational-flow.spec.ts` |

---

## 2. Fleet Map

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Gleiche Statuswerte wie Fleet List | Unit | `vehicle-operational-state-v2-surfaces.test.ts` |
| Markerzustände / Legende | E2E | `fleet-operational-flow.spec.ts` (Test 2) |
| Filter (Tabs, Future-Booking) | Unit + E2E | `fleet-command-filters.test.ts`, `fleet-operational-flow.spec.ts` |
| Unknown neutral (kein Available-Falschpositiv) | Unit + E2E | `fleetVisualState` via surfaces, `fleet-operational-flow.spec.ts` |

---

## 3. Vehicle Detail

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Operational Status | Component + E2E | `VehicleOperationalStatusCallout.test.tsx`, `fleet-operational-flow.spec.ts` |
| Next / Active / Reserved Booking | Unit | `vehicle-operational-booking-display.test.ts`, `vehicle-operational-selectors.test.ts` |
| Reason und Data Quality | Unit | `vehicle-operational-unknown-display.test.ts` |
| Keine UUIDs in UI | Component + E2E | `VehicleOperationalStatusCallout.test.tsx`, `assertNoVisibleUuids` |

---

## 4. Dashboard

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Ready for Renting | Unit + E2E | `runtimeSliceConsistency.test.ts`, `fleet-operational-flow.spec.ts` |
| Today's Operational / Active Rented | Unit + E2E | `todaysOperationalSlice.test.ts`, `fleet-operational-flow.spec.ts` |
| Reserved Today (via runtime groups) | Unit | `todaysOperationalSlice.test.ts` |
| KPI-Zahlen = Drawer-Inhalte | Unit | `runtimeSliceConsistency.test.ts`, `dashboardRuntimeUI.test.ts` |

---

## 5. Operator App

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Statuskonsistenz (Bereit/Reserviert/Vermietet/Neutral) | Unit | `operatorStatus.test.ts` |
| Pickup-/Return-Wechsel ohne Reload | Unit (invalidation) + E2E (Fleet-Refresh nach Mock-Update) | `vehicle-operational-query.test.ts`, `fleet-operational-flow.spec.ts` (Tests 5–6) |
| Fahrzeugliste zeigt Kennzeichen statt UUID | E2E (Fleet) | `fleet-operational-flow.spec.ts`, `assertNoVisibleUuids` |

---

## 6. Cache / Invalidation

| Ereignis | Abdeckung | Datei |
|----------|-----------|-------|
| Pickup → alle Flächen | Unit + E2E | `vehicle-operational-query.test.ts`, `fleet-map-vehicle-store.utils.test.ts`, `fleet-operational-flow.spec.ts` (Test 5) |
| Return | Unit + E2E | `fleet-map-vehicle-store.utils.test.ts`, `fleet-operational-flow.spec.ts` (Test 6) |
| Stornierung / Verschiebung / Fahrzeugwechsel | Unit | `vehicle-operational-query.test.ts` (`invalidateVehicleOperationalAfterBookingChange`) |
| Optimistic Patch sync canonical + legacy | Unit | `fleet-map-vehicle-store.utils.test.ts` |

---

## 7. Safe Fallback

| Szenario | Erwartung | Datei |
|----------|-----------|-------|
| `null` / fehlender Status | UNKNOWN | `vehicle-operational-state.test.ts` |
| Unbekannter String | UNKNOWN | `vehicle-operational-state.test.ts` |
| DEGRADED | Fail-closed, nicht Available | `vehicle-operational-state-v2-surfaces.test.ts` |
| UNAVAILABLE / unreliable | „Status nicht verfügbar“, neutral | `vehicle-operational-unknown-display.test.ts`, `fleet-operational-responsive.spec.ts` |
| Niemals Available bei UNKNOWN | Unit | `runtimeSliceConsistency.test.ts`, `verifyUnknownExcludedFromAvailable` |

**Label-Fix (V4.9.500):** UNKNOWN-Label ist `Status nicht verfügbar` / `Status unavailable` — Vitest-Suites entsprechend aktualisiert.

---

## 8. Responsive & Themes

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| iPhone (320–430) | E2E projects | `fleet-operational-responsive.spec.ts` |
| Tablet (768) | E2E | `fleet-operational-responsive.spec.ts` |
| Desktop (1280) | E2E | `fleet-operational-responsive.spec.ts` |
| Dark / Light | E2E | `fleet-operational-responsive.spec.ts` |
| Lange deutsche Texte | E2E | `fleet-operational-responsive.spec.ts` |
| Kein horizontaler Overflow | E2E | `assertNoHorizontalOverflow` |

---

## 9. Zeitraumverfügbarkeit

| Anforderung | Abdeckung | Datei |
|-------------|-----------|-------|
| Fahrzeug operativ Available, Zukunftsslot gebucht | Tab bleibt Available | `vehicle-operational-period-availability.test.ts` |
| Überlappender Buchungszeitraum blockiert | Overlap-Gate | `vehicle-operational-period-availability.test.ts`, Backend `bookings.service.overlap.spec.ts` |
| Nicht überlappender Zeitraum buchbar | Unit | `vehicle-operational-period-availability.test.ts` |

---

## E2E-Fixture-Seeds (`fleet-operational-fixtures.ts`)

| Kennzeichen | Kanonischer Status | Zweck |
|-------------|-------------------|-------|
| `AVL-1` | AVAILABLE | Ready-to-rent / Available-Tab |
| `FUT-1` | AVAILABLE + nextBooking | Zukunftsbelegung, Tab Available |
| `RSV-1` | RESERVED (Pickup heute) | Reserved-Tab, Pickup-Cache-Test |
| `ACT-1` | ACTIVE_RENTED | Active-Tab, Return-Cache-Test |
| `UNK-1` | UNKNOWN (unreliable) | Neutral badge, kein Available |

Org-ID `org-fleet-op-e2e` — keine UUIDs in sichtbarer UI.

---

## Verwandte Dokumente

- Backend: [`vehicle-operational-state-v2-backend-coverage.md`](./vehicle-operational-state-v2-backend-coverage.md)
- Ops-Runbook: [`../runbooks/vehicle-operational-status-repair.md`](../runbooks/vehicle-operational-status-repair.md)
- Task-V2-Vorlage: [`task-domain-v2-frontend-e2e-coverage.md`](./task-domain-v2-frontend-e2e-coverage.md)

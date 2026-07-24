# Vehicle Detail Page — Polling Lifecycle (2026-07)

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 18/36 — Polling-Lifecycle bedarfsgerecht steuern |
| **Vorgänger** | [`vehicle-detail-page-privacy-controls-2026-07.md`](./vehicle-detail-page-privacy-controls-2026-07.md) |

---

## Ziel

Hochfrequentes GPS- und Telemetrie-Polling nur bei sichtbarer Overview-Live-Map; keine Hintergrund-Loops, keine verwaisten Timer, keine Requests für frühere Fahrzeuge.

---

## Request-Frequenzen (vorher → nachher)

| Kanal | Vorher | Nachher | Aktiv wenn |
|-------|--------|---------|------------|
| **GPS `/live-gps`** | 5s auf allen VDP-Tabs (Timer lief immer; Fetch nur bei `isLiveTracking`) | **5s** | Overview-Tab + Map sichtbar (`IntersectionObserver`) + Tab sichtbar + Online + `fleet:read` + Data-Auth OK + Live-Tracking |
| **Telemetry `/telemetry`** | 30s auf allen VDP-Tabs | **30s** Overview / **90s** andere VDP-Tabs | VDP offen + Tab sichtbar + Online + Permission; pausiert bei Hidden/Offline/Auth-Block |
| **Device Connection** | Einmalig bei Mount | **60s** auf Overview (sichtbare Map) / sonst einmalig | `fleet-connectivity:read` + Overview-Surface aktiv |
| **Battery live (Health box)** | 30s solange Overview gemountet | **30s** nur bei sichtbarer Overview-Map | wie Device Connection |
| **Battery live (Health tab)** | 30s | **30s** nur bei `document.visibilityState === visible` | Health-Tab gemountet |
| **OBD Fleet Index (Header)** | Fetch bei `orgId`-Wechsel (90s Cache) | unverändert, **kein Fetch bei hidden Tab** | `document` sichtbar |

---

## Architektur

| Komponente | Pfad |
|------------|------|
| Policy (reine Gate-Logik) | `frontend/src/rental/lib/vehicle-detail-polling-policy.ts` |
| Map-Sichtbarkeit | `OverviewLiveMapCard` → `useVehicleDetailPollingStore.overviewMapVisible` |
| Tab/Online-Signale | `hooks/useBrowserTabSignals.ts` |
| Telemetry-Binder | `App.tsx` → `VehicleLiveTelemetryBinder` |
| Live GPS + Dashboard | `hooks/useLiveVehicleTelemetry.ts` |
| Overview-Polling-Helper | `hooks/useVehicleDetailOverviewPollingEnabled.ts` |
| Generisches Interval | `hooks/usePollingWhen.ts` |
| Access-Block-Erkennung | `lib/telemetry-access-errors.ts` → `telemetryAccessBlock` im Store |

### Gate-Matrix (`resolveVehicleDetailPollingGates`)

Hochfrequentes GPS (`gpsHighFrequency`) nur wenn **alle** zutreffen:

- Vehicle Detail offen (`vehicleId` gebunden)
- Overview-Tab aktiv
- Live-Map im Viewport (`IntersectionObserver`, threshold > 0)
- Browser-Tab sichtbar
- Netzwerk online
- `fleet:read` Permission
- Kein Telemetry-Access-Block (Permission / Data Authorization)

---

## Cleanup-Verhalten

| Ereignis | Verhalten |
|----------|-----------|
| Tab-Wechsel (weg von Overview) | GPS-Timer gestoppt; Dashboard auf 90s (Header-Badge) |
| `document.hidden` | Alle Poll-Loops pausiert |
| Unmount / Fahrzeugwechsel | Timer cleared, `useVehicleLiveMapStore.unbind()`, Access-Block reset |
| Logout | `vehicleId` → null → Hook cleanup |
| 403 Permission / Data-Auth | `telemetryAccessBlock` gesetzt → Gates schließen → keine weiteren Requests |
| Offline | Gates schließen bis `online`-Event |
| Rückkehr sichtbar | Gates öffnen → kontrollierter Immediate-Fetch + Timer-Neustart |

---

## Tests

| Datei | Abdeckung |
|-------|-----------|
| `vehicle-detail-polling-policy.test.ts` | Overview aktiv, Tabwechsel, hidden, Permission, Map unsichtbar |
| `useLiveVehicleTelemetry.polling-lifecycle.test.ts` | Fake Timers: GPS/Dashboard, Tab-Gate, Unmount, Fahrzeugwechsel, Data-Auth |

---

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).

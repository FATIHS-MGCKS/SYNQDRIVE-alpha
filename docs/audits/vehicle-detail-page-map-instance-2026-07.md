# Vehicle Detail Page — Map Instance & Listener Stabilization (2026-07)

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 21/36 — Map-Instanz und Listener stabilisieren |
| **Vorgänger** | [`vehicle-detail-page-map-animation-2026-07.md`](./vehicle-detail-page-map-animation-2026-07.md) |

---

## Ziel

Mapbox-Instanz auf der Vehicle Detail Live Map stabil halten: kein vollständiger Rebuild bei Theme-Wechsel, Listener genau einmal registrieren, sauberes Cleanup, Resize/WebGL/Fehlerzustände kontrolliert.

---

## Vorher → Nachher

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| Theme-Wechsel | `useEffect([isDarkMode])` → `map.remove()` + neue `Map` | `map.setStyle()` + Kamera-Wiederherstellung |
| Listener | Plate-Sync in separatem Effect (re-registriert bei `loaded`/`syncPlateOverlay`) | `load`, `error`, `move`, `zoom`, `resize`, `webglcontextlost` einmal bei Init |
| Resize | Nur Map-Events `resize` | `ResizeObserver` auf Container + Map-Events |
| Fehler | Kein Nutzer-Feedback bei Mapbox/WebGL-Fehlern | `mapError` Overlay (DE, ohne technische API-Texte) |
| Marker-Cleanup | Bei Map-Teardown | `removeMapMarker()` + Animation-Cancel vor `map.remove()` |
| Map-Init-Deps | `[isDarkMode]` | `[]` (einmalige Erstellung) |

---

## Architektur

| Komponente | Pfad |
|------------|------|
| Map-Lifecycle-Hilfen | `frontend/src/rental/lib/live-map-instance.ts` |
| VDP Live Map | `frontend/src/rental/components/LiveMapOverview.tsx` |
| Fahrzeug-Remount (bewusst) | `OverviewLiveMapCard` → `key={vehicleId}` |

### Listener-Matrix (einmalig pro Map-Instanz)

| Event | Aktion |
|-------|--------|
| `load` | `setLoaded(true)`, Plate-Sync |
| `error` | `mapError` setzen |
| `move` / `zoom` / `resize` | Plate-Overlay imperativ positionieren |
| `webglcontextlost` | `preventDefault`, Nutzer-Hinweis |
| `style.load` (Theme-Effekt) | Kamera `jumpTo`, Plate-Sync |

### Theme-Wechsel

1. `captureMapCamera(map)` vor `setStyle`
2. `map.setStyle(resolveLiveMapStyle(isDarkMode), { diff: false })`
3. `style.load` → `restoreMapCamera` + Sedan-Palette via separatem Effect

### Cleanup bei Navigation/Unmount

- Animation-Session canceln
- Marker entfernen
- Alle Map-Listener `off`
- `webglcontextlost` vom Canvas entfernen
- `ResizeObserver.disconnect()`
- `map.remove()` via `detachMapInstance`

---

## Tests

| Datei | Abdeckung |
|-------|-----------|
| `live-map-instance.test.ts` | Style-Auflösung, Kamera capture/restore, Fehlerklassifikation |
| `LiveMapOverview.map-lifecycle.test.tsx` | Initial Load, Theme ohne Re-Create, Unmount, Resize, WebGL, Style-Fehler, Remount |

---

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).

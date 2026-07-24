# Vehicle Detail Page — Map Animation Without Per-Frame React State (2026-07)

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 20/36 — Map-Animation ohne React-State pro Frame |
| **Vorgänger** | [`vehicle-detail-page-request-control-2026-07.md`](./vehicle-detail-page-request-control-2026-07.md) |

---

## Ziel

Flüssige Marker- und Kennzeichenanimation auf der Vehicle Detail Live Map **ohne** `setState` pro `requestAnimationFrame`. React rendert nur bei fachlich neuen Daten oder UI-Zustandswechseln (Map geladen, Kennzeichen sichtbar, Warten auf Position).

---

## Vorher → Nachher

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| Markerposition | Mapbox `Marker.setLngLat` (imperativ) | unverändert (imperativ) |
| Kennzeichen-Overlay | `markerScreen` React-State pro Frame | `plateOverlayRef` + `style.transform` imperativ |
| Sedan-Rotation | `querySelector` pro Frame | gecachtes `sedanMarkerRef` |
| Animationsloop | Inline in `LiveMapOverview` | `live-map-marker-animation.ts` |
| rAF-Cleanup | `cancelAnimationFrame` im Effect | Session `cancel()` + Unmount-Cleanup |
| Reduced Motion | — | `animationPolicy.reducedMotion` vorbereitet (noch nicht angebunden) |

---

## Architektur

| Komponente | Pfad |
|------------|------|
| Animationskern (Interp + Dead Reckoning) | `frontend/src/rental/lib/live-map-marker-animation.ts` |
| Map-UI + imperative Refs | `frontend/src/rental/components/LiveMapOverview.tsx` |
| Marker-DOM | `frontend/src/lib/vehicleMarker.ts` |
| Geo-Hilfen | `frontend/src/lib/liveMapUtils.ts` |

### Ref-Inventar (`LiveMapOverview`)

| Ref | Zweck |
|-----|--------|
| `markerRef` | Mapbox `Marker` Instanz |
| `markerWrapRef` | 32×32 Wrapper-DOM |
| `sedanMarkerRef` | Gecachtes `.synq-sedan-marker` (kein `querySelector` pro Frame) |
| `plateOverlayRef` | Kennzeichen-Callout — Position via `transform` |
| `displayPositionRef` | Aktuelle animierte lng/lat |
| `animationSessionRef` | Aktive rAF-Session mit `cancel()` |

### Animations-Lebenszyklus

1. Neues `targetPosition` → vorherige Session `cancel()`
2. Snap bei erstem Punkt, Mikrobewegung (&lt;0,5 m) oder Teleport (&gt;2000 m)
3. Sonst `startMarkerAnimation` → `onFrame` → `applyMarkerFrame` (Marker + Plate, imperativ)
4. Phase 1: GPS-Interpolation (4,5 s, ease-in-out)
5. Phase 2: Dead Reckoning (max 6 s, nur bei Speed ≥ 3 km/h)
6. Unmount / neues Ziel / Gate-Wechsel → `stopMarkerAnimation()`

### Bewusst unverändert

- Visuelles Erscheinungsbild (Pfeil-Marker, Liquid-Glass-Kennzeichen, Kamera-`easeTo`)
- Heading-Interpolation via CSS `transition` auf `.synq-sedan-inner` (0,8 s)
- Keine neue WebSocket-/SSE-Architektur
- `prefers-reduced-motion` noch nicht aktiv — nur `MarkerAnimationPolicy.reducedMotion` API

---

## Messung / Erwartung

| Metrik | Erwartung |
|--------|-----------|
| React-Renders während Markerfahrt | Nur bei `loaded`, `waitingForPosition`, `licensePlate`-Gate — **nicht** 60/s |
| CPU | Weniger Reconciliation/Commit; DOM-Updates nur Marker + ein Overlay-`transform` |
| Memory | Session-Cancel verhindert verwaiste rAF-Callbacks |
| Plate-Sync bei Pan/Zoom | Map-Events → `syncPlateOverlay()` (imperativ) |

---

## Tests

| Datei | Abdeckung |
|-------|-----------|
| `live-map-marker-animation.test.ts` | Snap, Interp, Dead Reckoning, Reduced-Motion-API, Cancel, Stale-Frame, Plate-Transform |

---

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).

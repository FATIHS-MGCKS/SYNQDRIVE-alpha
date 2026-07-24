# Vehicle Detail Page — Live Map Behavior, Attribution & Error States (2026-07)

## Scope

Prompt 22/36: close live-map remediation on the vehicle detail overview map (`LiveMapOverview` + `OverviewLiveMapCard`).

## Checklist

| # | Requirement | Status | Implementation |
|---|-------------|--------|----------------|
| 1 | Mapbox attribution visible & license-compliant | ✅ | `AttributionControl({ compact: true })` bottom-right; styled in `liquid-glass-lens.css` |
| 2 | No full disable without replacement | ✅ | Default control disabled only to position custom compact attribution |
| 3 | Follow respects manual interaction | ✅ | `dragstart` / `zoomstart` / `rotatestart` / `pitchstart` disable follow |
| 4 | No forced re-center after drag/zoom | ✅ | `shouldFollowCamera()` gates `easeTo` |
| 5 | Re-center only via existing follow | ✅ | No new center button; follow resumes on vehicle remount (`key={vehicleId}`) |
| 6 | `prefers-reduced-motion` | ✅ | Media query + `animationPolicy` override |
| 7 | No persistent dead-reckoning under reduced motion | ✅ | `startMarkerAnimation` snaps when `reducedMotion` |
| 8 | Mapbox errors caught | ✅ | `map.on('error')` + `classifyMapRuntimeError` |
| 9 | Missing token neutral | ✅ | `sq-map-liquid-empty` overlay, no env var names |
| 10 | Network errors neutral | ✅ | `network_unavailable` kind |
| 11 | No internal config in UI | ✅ | German operator messages only |
| 12 | Last known position labeled | ✅ | Existing `OverviewLiveMapCard` badge + `operatorHint` |
| 13 | Missing position displayed | ✅ | `waitingForPosition` + `operatorHint` overlay |
| 14 | Mobile gestures | ✅ | `cooperativeGestures: true` |
| 15 | Vertical scroll not blocked | ✅ | Cooperative gestures allow page scroll |

## Files

- `frontend/src/rental/lib/live-map-behavior.ts` — follow state, reduced motion helpers
- `frontend/src/rental/lib/live-map-instance.ts` — network error classification
- `frontend/src/rental/components/LiveMapOverview.tsx` — attribution, follow gating, errors
- `frontend/src/components/surface/liquid-glass-lens.css` — attribution HUD styling
- Tests: `live-map-behavior.test.ts`, `LiveMapOverview.map-behavior.test.tsx`

## Tests

```bash
cd frontend && npm test -- live-map-behavior LiveMapOverview.map-behavior live-map-instance live-map-marker-animation LiveMapOverview.map-lifecycle
```

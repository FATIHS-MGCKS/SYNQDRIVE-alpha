# Vehicle Detail Page — Telemetry Timestamp Semantics

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 11/36 — Provider-Messzeit vs. Empfangszeit |
| **Vorgänger** | [`vehicle-detail-page-telemetry-nullability-2026-07.md`](./vehicle-detail-page-telemetry-nullability-2026-07.md) |

---

## Ziel

Eindeutige Trennung von **Provider-Messzeit**, **SynqDrive-Empfangszeit** und **UI-Anzeigezeit**. Freshness basiert immer auf der tatsächlichen Messung — nie auf `Date.now()` am Empfangspunkt oder Cache-Hit.

---

## Kanonische Semantik

| Feld | Bedeutung | Quelle | Freshness? |
|------|-----------|--------|------------|
| `measuredAt` | Provider-Messzeitpunkt | DIMO `signals.lastSeen` / `sourceTimestamp` | **Ja** |
| `receivedAt` | SynqDrive Ingest / Proxy-Empfang | `providerFetchedAt` / HTTP fetch time | Nein (Diagnose) |
| `cachedAt` | Redis fleet-map Serve-Zeit | Cache read path | Nein (Diagnose) |
| `observedAtIso` / `lastSignal` | Kanonischer Anzeige-/Freshness-Zeitpunkt | Resolver-Priorität | **Ja** |

### Resolver-Priorität (Backend + Frontend identisch)

1. `providerObservedAt` (`sourceTimestamp` / `measuredAt`)
2. `lastValidTelemetryAt` (`lastSeenAt`)
3. `receivedAt` — nur wenn kein Backfill-Lag > 15 min
4. `lastSignal` / `latestStateUpdatedAt` — niedrigstes Vertrauen

---

## Pipeline-Dokumentation

```
Provider measuredAt (DIMO signals.lastSeen / sourceTimestamp)
    ↓ DimoSnapshotProcessor.normalizeSnapshot
Backend receivedAt (providerFetchedAt = fetchedAt)
    ↓ VehicleLatestState
GET /telemetry → measuredAt, receivedAt, observedAtIso, signalAgeMs
    ↓ useLiveVehicleTelemetry (30s)
Frontend store measuredAt / receivedAt / lastSignal
    ↓ resolveTelemetryDisplayTime
UI: VehicleConnectionBadge age label, freshness state
```

**Live GPS Pfad (5s):**

```
GET /live-gps → measuredAt (provider), receivedAt (proxy fetch)
    ↓ mergeGpsMeasuredAt (nur source=dimo)
Store patch — Freshness aus measuredAt, nicht receivedAt
```

**Fleet-map Cache:**

```
Redis hit → rehydrateFleetMapTelemetryFreshness(now)
cachedAt gesetzt, signalAgeMs neu berechnet aus measuredAt
```

---

## Geänderte Dateien (Prompt 11/36)

| Layer | Datei | Änderung |
|-------|-------|----------|
| Backend | `telemetry-timestamp.projection.ts` | Zentrale Projection measuredAt/receivedAt/freshness |
| Backend | `telemetry-freshness.resolver.ts` | Unix-Sekunden + numerische Strings |
| Backend | `vehicles.service.ts` | `/telemetry`, `/fleet-map`, `/live-gps` exponieren Timestamps |
| Frontend | `telemetry-timestamp-semantics.ts` | Display-Resolver, GPS merge, age formatter |
| Frontend | `telemetryFreshness.ts` | Sekunden-Normalisierung |
| Frontend | `useVehicleLiveMapStore.ts` | `measuredAt`, `receivedAt`, `cachedAt` |
| Frontend | `useLiveVehicleTelemetry.ts` | Timestamp wiring Dashboard + GPS |
| Frontend | `VehicleDetailHeaderBadges.tsx` | Badge nutzt measuredAt, kein falscher „just now" |
| Frontend | `overview-map-position.ts` | Live nur bei `gpsSource === 'dimo'` |
| Frontend | `fleet-map-vehicle-mapper.ts` | measuredAt/receivedAt/cachedAt propagieren |
| Types | `vehicles.ts`, `api.ts` | Additive nullable Felder |

---

## Tests

| Suite | Abdeckung |
|-------|-----------|
| `telemetry-timestamp.projection.spec.ts` | measured vs received, cache rehydrate, no_signal |
| `telemetry-freshness.resolver.spec.ts` | unix seconds |
| `telemetry-timestamp-semantics.test.ts` | TZ, seconds, stale receipt, out-of-order, GPS merge |
| `overview-map-position.test.ts` | cache+fresh ≠ live |
| `vehicle-operational-state-v2.fleet-map-cache.spec.ts` | cachedAt on cache hit |

---

## Bewusst nicht geändert

- DB-Schema (`providerFetchedAt`, `sourceTimestamp` existieren bereits)
- `interpretVehicleState` für MOVING/IDLE/PARKED (nutzt weiterhin `lastSeenAt` intern)
- ClickHouse `recordedAt ?? new Date()` (Analytics-only)
- `lastLocationAt: Date.now()` im Hook (Client-Animationszeit, nicht UI-Label)

**SynqDrive Code → Changes / Architektur:** nicht aktualisiert (externes Workspace).

---

## Prompt 12/36 — Positionsresolver & Live-Klassifizierung

| Feld | Wert |
|------|------|
| **Audit-Datum** | 2026-07-24 |
| **Prompt** | 12/36 — Positionsresolver und Live-Klassifizierung |
| **Vorgänger** | Prompt 11/36 (dieses Dokument) |

### Kanonische fachliche Modi

| Modus | `positionClass` | UI `mode` | Live-Badge |
|-------|-----------------|-----------|------------|
| Live-Position | `live` | `livePosition` | Ja |
| Letzte bekannte Position | `lastKnown` | `lastKnownPosition`, `staticPositionOnly`, `telemetryUnavailable` | Nein („Last known“ / „Signal issue“) |
| Keine verwertbare Position | `none` | `noPosition`, `trackingUnavailable` | Nein |

### Live-Eligibility-Entscheidungsmatrix

Eine Position gilt **nur als live**, wenn **alle** Bedingungen erfüllt sind:

| # | Kriterium | Prüfung | Ablehnung → |
|---|-----------|---------|-------------|
| 1 | Store-Binding | `boundVehicleId` + `boundOrgId` === aktuelles Fahrzeug | `lastKnown` / `none` |
| 2 | Telemetry State live | `isLiveTracking === true` (Backend) | `lastKnown` / `none` |
| 3 | Valide Koordinaten | `parseLngLat`: finite, Bounds, kein 0,0 | `none` / static fallback |
| 4 | Live-Quelle | `gpsSource === 'dimo'` (kein Cache) | `lastKnown` |
| 5 | Provider-Messzeit | `measuredAt` parsebar + plausibel (≤60s Zukunft) | `lastKnown` |
| 6 | Freshness-Fenster | `isFresh` + `measuredAt`/`signalAgeMs` < 15 min | `lastKnown` |

**Alte/gecachte Position:** bleibt auf der Karte sichtbar (`lastKnown`), erhält korrekten Messzeitpunkt, erzeugt **kein** Live-Badge und keine Live-Map-Animation (`isLiveTracking` an `LiveMapOverview` nur bei `positionClass === 'live'`).

### Koordinatenvalidierung

| Fall | Ergebnis |
|------|----------|
| `lat`/`lng` nicht finite | verworfen |
| `lat` ∉ [-90, 90] oder `lng` ∉ [-180, 180] | verworfen |
| Null Island (0, 0) | verworfen |
| Gültige Koordinaten | akzeptiert |

### Out-of-order Updates

`shouldAcceptNewerMeasurement(current, incoming)` — eingehende `measuredAt` älter als aktuelle wird verworfen (Hook + `mergeGpsMeasuredAt`). Verhindert Rücksprung des Markers und Rejuvenation der Freshness.

### Geänderte Dateien (Prompt 12/36)

| Layer | Datei | Änderung |
|-------|-------|----------|
| Frontend | `overview-map-position.ts` | `positionClass`, Live-Eligibility-Matrix, Koordinatenvalidierung |
| Frontend | `telemetry-timestamp-semantics.ts` | `shouldAcceptNewerMeasurement`, out-of-order in `mergeGpsMeasuredAt` |
| Frontend | `OverviewLiveMapCard.tsx` | `measuredAt`/`signalAgeMs` wiring; Live-Animation nur bei `positionClass === 'live'` |
| Frontend | `useLiveVehicleTelemetry.ts` | Koordinatenvalidierung, out-of-order vor Position-Apply |
| Tests | `overview-map-position.test.ts` | Vollständige Modus- und Grenzfall-Abdeckung |
| Tests | `telemetry-timestamp-semantics.test.ts` | `shouldAcceptNewerMeasurement` + merge out-of-order |
| Fixtures | `vehicle-detail-baseline.fixtures.ts` | Live-Szenario mit `measuredAt` + `signalAgeMs` |

### Tests (Prompt 12/36)

| Suite | Abdeckung |
|-------|-----------|
| `overview-map-position.test.ts` | live, lastKnown, none; cache≠live; stale measuredAt; 0,0; bounds; loading/error |
| `telemetry-timestamp-semantics.test.ts` | out-of-order accept/reject, mergeGpsMeasuredAt guard |
| `vehicle-detail-baseline.test.ts` | live-position baseline mit measuredAt |

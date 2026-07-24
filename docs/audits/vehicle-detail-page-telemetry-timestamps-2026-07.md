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

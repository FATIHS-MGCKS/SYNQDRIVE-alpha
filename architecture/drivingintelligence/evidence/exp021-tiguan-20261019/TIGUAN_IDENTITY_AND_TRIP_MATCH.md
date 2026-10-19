# Tiguan EXP021 — Identität und Fahrtzuordnung

**Stand:** 2026-10-19 (Research, read-only Production-DB)

## Referenzpaket

- Kompaktpaket `TIGUAN_COMPACT_SHA256.csv`: alle 13 Dateien SHA256-verifiziert (Hashes stimmen; CSV nutzt Windows-Zeilenenden in der Hash-Spalte).
- Masterreferenz unverändert aus Videoauswertung; keine Decoder-Rückwirkung.

## Fahrzeug

| Feld | Wert | Quelle |
|------|------|--------|
| `vehicleId` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | Production `vehicles` |
| Kennzeichen | `WOB L  7503` | Production `vehicles` |
| Marke/Modell | Volkswagen Tiguan | Production `vehicles` |
| `dimo_vehicle_id` | `ded052d6-642d-4498-beed-3753afa7e36c` | Production `vehicles` |
| `dimoTokenId` | **192922** | Gepinnte S4-Positionsnutzlast (`DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1`) |
| `organizationId` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | Snapshot-Scope |

Die historische Kandidatenliste (token 192922, gleiche `vehicleId`) wird durch die gepinnte Evidenz am Aufnahmetag **gestützt**, nicht allein durch die Medien-Metadaten.

## Abgeglichene Fahrt

| Feld | Wert |
|------|------|
| **`tripId`** | **`632dc9c5-a8d9-45ce-a269-abe89d22d677`** |
| `start_time` (UTC) | 2026-10-19 10:15:00 |
| `end_time` (UTC) | 2026-10-19 10:39:39.603 |
| `distance_km` | ~12 |
| Video-Gerätefenster (UTC-Kandidat) | 10:29:19 – 10:38:24 |
| Aufnahmelücke (lokal) | 12:33:40 – 12:34:55 (76 Referenz-GAP-Sekunden) |

**Räumlich/zeitlich:** Das Video-Kernfenster liegt vollständig innerhalb des Trip-Fensters. Kein alternativer Trip im Suchfenster 10:25–10:45Z mit vergleichbarer Überlappung und gleichem Fahrzeug identifiziert.

## DIMO-/S4-Evidenz

| Artefakt | Wert |
|----------|------|
| `pinnedSnapshotHash` | `DI_V0_S4_EVIDENCE_V1:sha256:b14c6bba122a44d36faa245e7950341cc124ec4e5a2536a698c720393338088a` |
| Acquisition Window | 10:15:00Z – 10:39:40Z |
| Position-Payload SHA256 | `f0b3de33821bc71b36e55df7ffb67eb84aa52a2db9ecb6cf4245338a19c00b1d` |
| 1-Hz-Buckets | 1480 (`TIGUAN_POSITION_GRID.json`) |

Export: read-only `payload_gzip` aus `di_v0_s4_evidence_snapshots` (keine Produktionsmutation).

## Grenzen

- Keine unabhängige UTC-Kalibrierung Gerät ↔ DIMO (siehe `TIGUAN_TIME_ALIGNMENT_REPORT.md`).
- Medien-Zeitstempel belegen nicht allein die Fahrzeugbindung; Bindung hier über Trip + gepinnte DIMO-Positionsnutzlast.
- `vehicle_position_updates` wurde in diesem Lauf nicht separat exportiert; Replay nutzt die verifizierte S4-Positionsnutzlast.

## Widersprüche

Keine belastbaren Widersprüche zwischen Referenz-Gerätezeit, Trip-Fenster und DIMO-Bucket-Raster festgestellt.

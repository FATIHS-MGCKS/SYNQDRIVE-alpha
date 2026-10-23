# REPRO — P1 DIMO Temporal Probe

## Voraussetzungen

- Repository-Checkout mit `backend/node_modules` (für `axios`, `ethers`)
- Umgebungsvariablen (Runtime Secrets, **nicht** committen): `DIMO_CLIENT_ID`, `DIMO_PRIVATE_KEY`; optional `DIMO_DOMAIN` / `DIMO_REDIRECT_URI`, `DIMO_TOKEN_EXCHANGE_URL`, `DIMO_VEHICLE_NFT_CONTRACT_ADDRESS`, `DIMO_TELEMETRY_API_URL`
- **Keine** Produktionsmutation; nur 4 GraphQL-POSTs

## Live-Probe (optional erneut ausführen)

```bash
cd research/driving-intelligence/evaluations/ds4-dimo-p1-temporal-probe-20261023
P1_PROBE_OUT=/tmp/p1_dimo_probe_out node scripts/p1_dimo_temporal_probe.mjs
node scripts/build_summary.cjs /tmp/p1_dimo_probe_out/p1_probe_report.json
```

Ausgabe: abgeleitete Metriken (Leg-Längen, Δt, HDOP, FIRST≡LAST-Flags) — **keine** Koordinaten im Summary.

## Fest eingefrorene Referenz (dieser Lauf)

| Artefakt | SHA256 |
| --- | --- |
| `outputs/p1_probe_summary.json` | siehe `outputs/manifest.json` |

Vollständiger Probe-JSON (inkl. aller Buckets im Fenster): nur lokal unter `/opt/cursor/artifacts/p1_dimo_probe/p1_probe_report.json` (nicht im Git).

## Parität Fixture ↔ Live (TES16)

Kritische 1s-Legs aus Live-Probe = `TES16_TRACE.csv` / `TESLA_POSITION_GRID.json` (z. B. :23 → 71,1 m / 256 km/h).

## Produktionscode

Kein Diff an `backend/src`. DI-Referenz-SHA: `579ee8b2fed06593d7d2aa57cffb6036dbf53a24`.

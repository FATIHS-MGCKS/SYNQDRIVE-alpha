# P1B synthetic replay fixtures

These files support **unit replay only** for `hv-charging-counter-evidence.p1b-research-replay.spec.ts`.

## Required for replay

| Artifact | Purpose |
|----------|---------|
| `caseNN-dimo-response.json` | Minimal DIMO interval rows (`timestamp`, `addedKwhLast/Min/Max`) plus synthetic `sessionWindow` / `queryWindow` for boundary forensics |
| `p1b-research-expectations.v1.json` | Expected `energyDerivationQuality`, `reliableSessionCounterDelta`, physical/H4 layer outcomes per `caseId` |
| `session-authority-fixtures.v1.json` | Minimal HV session authority inputs (`source`, `isOngoing`, `endAt`, `metadata.qualityStatus`) |

## Intentionally omitted (not needed for replay)

- Production UUIDs, segment fingerprints, DIMO token IDs
- GPS coordinates, odometer, SOC/energy session totals, reconcile timestamps
- Raw GraphQL HTTP metadata (`queriedAt`, `elapsedMs`, `httpStatus`)
- Non-counter row fields (`socPctLast`, `packEnergyKwhLast`)

## Regeneration

`backend/scripts/test/sanitize-p1b-research-fixtures-once.mjs` documents the one-off transform from legacy research exports. **Do not re-run** unless replacing the upstream scientific matrix; local/off-repo research archives remain the canonical historical record.

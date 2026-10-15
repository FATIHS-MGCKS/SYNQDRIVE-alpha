# VSI-03 P2D — one-vehicle Capture pilot activation (operator)

**Status:** preparation only — do not enable without explicit owner authorization.

**Production baseline SHA (recovery):** `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb`

## Preconditions

- Migrations `20261014200000_vsi03_p2c_provider_source_observations` and `20261014210000_vsi03_p2c_r1_continuity_hardening` applied.
- Recommended pilot vehicle (production evidence): **DIMO token 192922** (VW Tiguan, vehicle id `19fedd4b-c4e8-4de8-a125-dab293326e7e`, org `faa710c9-6d91-4079-a7d5-91fdccdec14a`).
- **Do not** pilot Tesla token 186946 for LV-centric validation (SOFTWARE_INTEGRATION; LV unsupported in provider payload).
- **Exclude** token 187336 (`registryLifecycle=OFFBOARDED`, stale VLS, DIMO 403).
- Strict Read flag remains **OFF** until a separate gate.

## Environment (both replicas)

Set in `backend.env` on **both** `synqdrive` and `synqdrive-b` hosts (env mirror / deploy-state attestation applies):

```bash
VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED=true
VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED=true
VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON='{"version":1,"entries":[{"organizationId":"faa710c9-6d91-4079-a7d5-91fdccdec14a","vehicleId":"19fedd4b-c4e8-4de8-a125-dab293326e7e"}]}'
```

Leave `VSI03_P2C_STRICT_ADVANCE_FROM_OBSERVATIONS_ENABLED` unset or `false`.

## Verification (read-only SQL)

After at least one successful snapshot poll for the pilot vehicle:

```sql
SELECT COUNT(*) FROM vehicle_provider_source_observations
WHERE vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e';

SELECT COUNT(*) FROM vehicle_provider_source_observation_counters
WHERE vehicle_id = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
```

Confirm non-pilot vehicles remain at **0** rows.

## Expected write volume (pilot)

- Observed fleet cadence: ~340–470 successful snapshot fetches/day/vehicle.
- Up to **2 rows** per successful apply path (`PROVIDER_FETCH` + `VLS_APPLICATION`).
- Pilot (1 vehicle): order-of-magnitude **~700–940 rows/day**, **~20–25 MB / 30 days** at ~200 B/row (see `VSI03_P2C_SOURCE_OBSERVATIONS.md`).

## Monitoring

- Table growth: `vehicle_provider_source_observations`, `vehicle_provider_source_observation_counters`.
- Application logs: `VSI P2C` warnings (persistence tombstones) — must not block snapshots.
- Replica parity: compare row counts per pilot vehicle after dual-replica polling window.

## Retention

- **No automatic destructive pruning** in P2D.
- Before any prune: preserve counter head continuity or accept strict-advance `UNKNOWN` for affected scopes.
- Align future retention with `dimo_poll_logs` policy only after separate architecture review.

## Emergency disable (no code deploy)

1. Set `VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED=false` (or remove allowlist enable flag).
2. Rolling PM2 reload on both replicas per standard ops (only when owner authorizes).
3. Existing rows remain append-only evidence; disable stops new writes immediately.

## Rollback

- Disable flags; optional leave data for forensic analysis.
- Do not delete counter rows without continuity review.

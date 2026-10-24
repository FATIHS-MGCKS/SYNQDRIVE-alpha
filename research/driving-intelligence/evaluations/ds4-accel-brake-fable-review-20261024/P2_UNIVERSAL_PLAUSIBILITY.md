# P2 — Universal plausibility (implementation note)

Shadow implementation in PR #2154 uses **`MOTION_EVENT_PLAUSIBILITY_UNIVERSAL_V0_2`**, not the Fable report’s nameplate `physEnvelope` proposal.

## Design

- **Fleet-wide:** no make/model/mass/power inputs; unknown vehicles are not mapped to Tesla or any profile.
- **Conservative:** marks `ARTEFACT_SUSPECT` only when event fields are internally contradictory:
  - kind vs `deltaKmh` sign;
  - `deltaKmh` vs endpoint speeds;
  - `meanAccelMps2` vs `|Δv|/t` beyond grid/rounding tolerance.
- **Not sufficient:** high mean acceleration alone (TIG22 19:04:34 / 19:04:49 remain LIMITED/DEGRADED when kinematically self-consistent).
- **P1 unchanged:** spike-bracket (K3 extension) still marks TES16 03:50:20.

## Regression vs `baseline_fable_base_7340637`

| Expected quality delta | Reason |
|------------------------|--------|
| TES16 03:50:20 → `ARTEFACT_SUSPECT` | P1 spike bracket |
| TIG22 19:04:34 / 19:04:49 | **No change** vs baseline (documented deviation from nameplate P2) |

Gate: `backend/scripts/test/motion-event-p1-p2-four-drive-regression.harness.ts`

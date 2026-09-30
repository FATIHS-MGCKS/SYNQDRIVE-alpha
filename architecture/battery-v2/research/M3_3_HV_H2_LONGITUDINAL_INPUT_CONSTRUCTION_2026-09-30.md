# M3.3-HV-H2 — Longitudinal input candidate construction (2026-09-30)

## Purpose

Deterministic, read-only composition of **HV longitudinal input candidates** for a single `(organizationId, vehicleId)` at `evaluationAt`. Answers: which traceable HV evidence points exist over time, which method produced each point, which battery lifecycle segment applies, and whether the point is eligible as input to a **future** HV longitudinal model.

## Out of scope (H2 V1)

- Longitudinal degradation / slope / SynqDrive HV health score
- Customer publication, canonical health semantics changes
- Automatic runtime, materialized H2 tables, schema migrations
- LV D3/F5/E2/E3 logic import
- Cross-method pooling (default **NO**)

## Contracts

| Contract | Role |
|----------|------|
| `M3_3_HV_H2_LONGITUDINAL_INPUT_CANDIDATE_V1` | Typed candidate with value semantic, fingerprint, lifecycle segment, eligibility |
| `M3_3_HV_H2_LONGITUDINAL_INPUT_REPORT_V1` | Envelope: candidates, validation anchors, lifecycle segments, summary |

H1 contract `M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1` remains **frozen** (design-only); H2 extends with numeric value, semantics, source identity, lifecycle.

## Sources (supported now)

| Logical method | Persisted authority | Value semantic | Role |
|----------------|---------------------|----------------|------|
| `M2_CURRENT_ENERGY_SOC` | `HvCapacityObservation` `CURRENT_ENERGY_OVER_SOC` + M2 shadow metadata | `ESTIMATED_USABLE_CAPACITY_KWH` | `METHOD_SHADOW_EVIDENCE` |
| `M3_ADDED_ENERGY_DELTA_SOC` | `HvCapacityObservation` `SEGMENT_ADDED_ENERGY_OVER_SOC` + M3 session gates | `ESTIMATED_USABLE_CAPACITY_KWH` | `VALIDATION_ONLY` |
| `PROVIDER_HV_SOH` | `BatteryEvidence` HV + `SOH_PERCENT` + `PROVIDER_REPORTED` | `PROVIDER_SOH_PERCENT` | `PROVIDER_EVIDENCE` |

## Provider SOH authority correction (H1)

H1 readiness `providerSohEvidenceReady` previously counted `HvCapacityObservation.estimatedSohPct`. **Correct durable source:** `BatteryEvidence` (HV, provider-reported SOH). H1 report service updated in same workstream; H2 loads the same authority.

## Lifecycle segmentation

- Only **confirmed active HV** `BATTERY_REPLACEMENT` ground truth (`effectiveAt`) splits segments (`HV_SEGMENT_0`, …).
- LV GT does not split HV lifecycle.
- Session crossing replacement → `INTERVENTION_BOUNDARY_INTERSECTION`.
- Superseded/revoked GT ignored via shared active authority + supersession check.

## Operator tooling

```bash
npm run battery:hv-h2:longitudinal-input-report -- \
  --organization-id=<uuid> --vehicle-id=<uuid> [--evaluation-at=<ISO>]
```

Production DB requires `BATTERY_HV_H2_ALLOW_PRODUCTION_READONLY=true`. Transaction: `READ ONLY`, `RepeatableRead`.

## Validation

- Unit: `npm run test:battery:v2:hv-h2`
- Postgres: `npm run test:battery:v2:hv-h2:postgres:ci`
- Static: `architecture/battery-v2/scripts/validate-h2-longitudinal-input-contracts.sh`

## Next stage

M3.3-HV-H3+ — longitudinal model design / calibration (not authorized in H2).

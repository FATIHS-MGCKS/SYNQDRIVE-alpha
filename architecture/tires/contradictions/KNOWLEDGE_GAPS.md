# Tires Health — Knowledge Gaps (canonical)

Every gap has a graph node (`TIRE-GAP-*`). Closing a gap requires evidence and a ledger entry; never delete, mark closed with a pointer.

| ID | Gap | Epistemic | Blocking for |
|----|-----|-----------|--------------|
| TIRE-GAP-DS4-PERSISTED-INTENSITY-FIELDS-001 | Persisted DS4 event rows lack `meanAccelMps2`, `durationS`, peak values (Fable B7); consumer must re-derive from labels and Δv | CONFIRMED | ordinal intensity in shadow adapter |
| TIRE-GAP-DS4-COVERAGE-ALLOWLIST-001 | DS4 shadow covers 4 of 6 Production vehicles (allowlist) | CONFIRMED | fleet-wide shadow comparison |
| TIRE-GAP-DS4-OUT-OF-SAMPLE-VALIDITY-001 | Detector/P1/P2 tuned on four drives; fleet behaviour unverified | UNKNOWN | any numeric use; Fable required |
| TIRE-GAP-DS4-INTENSITY-ATTENUATION-B3-001 | Systematic −0.13…−0.55 m/s² attenuation; intensities not physically validated | CONFIRMED | absolute thresholds (forbidden) |
| TIRE-GAP-DS4-SPEED-AUTHORITY-MIX-001 | C4_ONLY vs C5_1_PREFERRED across trips of one vehicle | CONFIRMED | cross-trip comparability |
| TIRE-GAP-V2-GROUND-TRUTH-SPARSE-001 | 5 tread measurements, 0 wear data points fleet-wide | CONFIRMED | validation of V2 and any successor |
| TIRE-GAP-DI-GRAPH-NO-DS4-NODE-001 | Driving Intelligence graph has no motion-core/DS4 node to attach the tire consumer edge | **PARTIALLY_CLOSED** (2026-10-28 PR-0) | Design + decision [`DI-DEC-DS4-AUTHORITY-001`](../../drivingintelligence/decisions/DECISION_REGISTER.md) and [`DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md`](../../drivingintelligence/design/DS4_AUTHORITATIVE_ASSESSMENT_MIGRATION.md) record the DS4 authority chain; machine graph node YAML update deferred to implementation PR |
| TIRE-GAP-ACTIVE-SETUP-COUNT-RECONCILE-001 | Active setups read as 5 vs 6 under two filters during the audit | CONTRADICTED | promotion gate |
| TIRE-GAP-CODE-VIEWS-NOT-UPDATED-001 | SynqDrive Code → Changes / Architektur (`frontend/src/master/components/*View.tsx`) not updated because this PR is documentation-only | CONFIRMED | governance completeness; first implementation PR |

## Explicitly unknown (not reconstructed in this bootstrap)

- Exact frontend presentation rules of tire status/uncertainty per Figma (no UI change requested).
- Full history of tire module before July 2026 remediation.
- Whether `tire_wear_data_points` is populated by any current path (0 rows since July 2026).

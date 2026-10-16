# LDI10A — Result

## Provenance

- LDI08 snapshot SHA-256: `effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009`
- LDI08 candidates SHA-256: `2f2cfabdd40e6744cda364641c80896e4559845ab62fdd927d6a23907e27231c`
- Pin hash: `DI_V0_S4_EVIDENCE_V1:sha256:79635496216a2588666db3f1be87609f803d073421db6ebc64e65f7c88b264fa` (LDI-06 expected: **match**)
- Candidate reproducibility from snapshot rows: **PASS** (40 accel / 35 decel)

## Coverage (explicit denominator)

- Shadow grid denominator: **362** seconds
- Strict TRUSTED: **79.8%**
- TRUSTED ∪ TRUSTED_LIMITED: **81.2%**
- Fusion-assessable seconds: **28**

## Candidates

- Accel / decel: **40** / **35**
- Independent steps: **75**; grouped maneuvers: **32**
- Confidence: HIGH **59**, LIMITED **0**, CONFLICTED **16**, UNKNOWN **0**
- Cross-source: L3-only **72**, OBD witness **3**, HF witness **3** (not independent lineage)

## Blockers

1. No native accel/brake on this pin — longitudinal candidates are L3-kinematic only.
2. HF/OBD sparse — most candidates lack second-channel corroboration.
3. Independent test drive needed: video/IMU/pedal logging + dense GPS + owner-approved S4 pin on event-rich trip (`a682d3df…` or successor).

## Repro

```bash
cd backend && npm run ldi10a:longitudinal-candidate-forensics
```

## Result block

```
LDI10A_RESULT=OFFLINE_LONGITUDINAL_AUDIT_COMPLETE
TRIP=f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9
SNAPSHOT_SHA256=effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009
CANDIDATE_REPRO=PASS
COVERAGE_DENOMINATOR=362
STRICT_TRUSTED_PCT=79.8
CANDIDATES_INDEPENDENT=75
MANEUVERS_GROUPED=32
HIGH_CONF_ACCEL=24
HIGH_CONF_DECEL=35
L3_ONLY_CANDIDATES=72
OBD_WITNESS_CANDIDATES=3
PRODUCTION_MUTATIONS=NONE
STOP=LDI10A_complete_no_LDI10B_no_deploy
```
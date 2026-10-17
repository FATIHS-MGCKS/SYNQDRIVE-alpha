# LDI10B — Result

## Coverage (denominator 362)

- Strict TRUSTED: **79.83%**
- TRUSTED ∪ LIMITED: **81.22%**
- UNTRUSTED buckets: **52**
- ROW_ABSENT GPS: **16**

## Groups

- Count: **32**
- Plausible / implausible peak / unclear: **24** / **0** / **8**
- Taxonomy: accel **12**, decel **16**, mixed **0**, unclear **4**

## Cross-source

- OBD witness candidate steps: **3**
- Distinct witness union: **3** (correlated lineage)

## Repro

```bash
cd backend && npm run ldi10b:maneuver-physics-audit
```

```
LDI10B_RESULT=MANEUVER_PHYSICS_AUDIT_COMPLETE
GROUP_COUNT=32
CANDIDATE_COUNT=75
GROUP_SIZE_DIST={"1":7,"2":12,"3":9,"4":3,"5":1}
PLAUSIBLE_GROUPS=24
IMPLAUSIBLE_GROUPS=0
UNCLEAR_GROUPS=8
CROSS_SOURCE_OBD_WITNESS_STEPS=3
COVERAGE_DENOMINATOR=362
STRICT_TRUSTED_PCT=79.83
OPEN_EVIDENCE_GAPS=native_accel_brake_missing;sparse_obd_hf;no_pedal_regen;shared_provider_lineage
PRODUCTION_MUTATIONS=NONE
STOP=LDI10B_complete_no_LDI10C_no_deploy
```
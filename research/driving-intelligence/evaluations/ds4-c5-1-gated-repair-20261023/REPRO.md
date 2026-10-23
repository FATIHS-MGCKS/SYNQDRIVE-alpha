# C5.1 reproduction

**Design:** PR #2143 @ `30b3f29b855d777838263e219f57cc71e425d64d`  
**Algorithm pin (frozen):** `53f5acebc13f8ac45498b9ff7311e4152f30f1fe` — `scripts/c5-1-gated-repair.cjs` must not change during test-integrity work.  
**Production C4 pin (DI):** `579ee8b2fed06593d7d2aa57cffb6036dbf53a24` — `backend/…/driving-intelligence` must be clean.

## Commands (test integrity audit)

```bash
cd research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023
node scripts/c5-1.support.test.cjs
node scripts/c5-1.synthetic.test.cjs
node scripts/run_c5_1_experiment.cjs --code-root <repo-root-with-DI-pin>
```

## Authoritative outputs

| File | Role |
| --- | --- |
| `outputs/c5_1_experiment_summary.json` | Four-drive regression + gates |
| `outputs/c5_1_test_integrity_audit.json` | Test audit (synthetics + regression fingerprint) |
| `outputs/c5_1_synthetic_test_audit.json` | Per-scenario synthetic kinematics |
| `outputs/baselines/c5_1_v1_1_regression_fingerprint_53f5acebc.json` | Frozen V1.1 video-drive fingerprint |
| `outputs/C5_1_REPORT.md` | Derived gate report (status labels, not `pass` alone) |

Inputs: sealed fixtures under `ds4-accel-brake-video-reference-20261023` and `ds4-speed-video-reference-20261023` (unchanged).

# C5.1 reproduction

**Design:** PR #2143 @ `30b3f29b855d777838263e219f57cc71e425d64d`  
**V1.1 algorithm pin (historical):** `53f5acebc13f8ac45498b9ff7311e4152f30f1fe` — sealed outputs in `outputs/v1_1/`.  
**V1.2 algorithm:** `scripts/c5-1-gated-repair.cjs` at this PR head (C1 null-neighbour fail-closed). Its SHA-256 is recorded in `outputs/v1_2/c5_1_experiment_summary.json` → `testIntegrityAudit.algorithmFileSha256` and in `outputs/baselines/c5_1_v1_2_regression_fingerprint.json`.  
**Production C4 pin (DI):** `579ee8b2fed06593d7d2aa57cffb6036dbf53a24` — `backend/…/driving-intelligence` must be clean.

## Commands (V1.2)

```bash
cd research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023
node scripts/c5-1.support.test.cjs
node scripts/c5-1.synthetic.test.cjs        # writes outputs/v1_2/c5_1_synthetic_test_audit.json
node scripts/run_c5_1_experiment.cjs --code-root <repo-root-with-DI-pin>
```

The runner compares the V1.2 fingerprint field-wise against the frozen V1.1 baseline. Only the documented
deltas (`c51Version`, new `tig22_19_04_38` field) may differ; any other difference sets
`finalVerdict = REGRESSION`.

## Reproducing the V1.1 observation for TIG22 19:04:38

```bash
git show 53f5acebc:research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023/scripts/c5-1-gated-repair.cjs > /tmp/c5-1-v1_1.cjs
```

Run `computeC5_1GatedRepair` from that file on the sealed TIG22 fixture (`ds4-accel-brake-video-reference-20261023`,
`vehicleClass: TIGUAN`) and read the sample at `2026-10-22T19:04:38Z`: `REPAIR_ACCEPTED`, 74.45 km/h,
`q5Detail {vCand: 0, vC4: 0}`. Note: the V1.1 file `require`s its sibling `event_eval_lib.cjs` by relative path,
so copy it next to the originals or adjust the path.

## Authoritative outputs

| File | Role |
| --- | --- |
| `outputs/v1_2/c5_1_experiment_summary.json` | Four-drive regression + gates (schema `C5_1_EXPERIMENT_SUMMARY_V3_NULL_NEIGHBOR_FAIL_CLOSED`) |
| `outputs/v1_2/c5_1_test_integrity_audit.json` | Test audit (synthetics + regression vs V1.1) |
| `outputs/v1_2/c5_1_synthetic_test_audit.json` | Per-scenario kinematics and repair-path activity (schema `…_V2_ACTIVE_REPAIR_PATH`) |
| `outputs/v1_2/C5_1_REPORT.md` | Derived report incl. TIG22 19:04:38 before/after |
| `outputs/baselines/c5_1_v1_1_regression_fingerprint_53f5acebc.json` | Frozen V1.1 fingerprint (unchanged) |
| `outputs/baselines/c5_1_v1_2_regression_fingerprint.json` | V1.2 fingerprint (written by the runner) |
| `outputs/v1_1/*` | Sealed V1.1 artefacts — do not regenerate |

Inputs: sealed fixtures under `ds4-accel-brake-video-reference-20261023` and `ds4-speed-video-reference-20261023` (unchanged).

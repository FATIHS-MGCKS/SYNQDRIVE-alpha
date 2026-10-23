# C5.1 reproduction

**Design:** PR #2143 @ `30b3f29b855d777838263e219f57cc71e425d64d`  
**Production C4 pin (DI):** `579ee8b2fed06593d7d2aa57cffb6036dbf53a24` — `backend/…/driving-intelligence` must be clean at this SHA for strict parity checks.

```bash
cd research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023
node scripts/c5-1.synthetic.test.cjs
node scripts/run_c5_1_experiment.cjs --code-root <repo-root-with-DI-pin>
```

Authoritative metrics: `outputs/c5_1_experiment_summary.json`  
Derived: `outputs/C5_1_REPORT.md`

Inputs: same sealed fixtures as `ds4-accel-brake-video-reference-20261023` and `ds4-speed-video-reference-20261023` (no extra snapshots committed).

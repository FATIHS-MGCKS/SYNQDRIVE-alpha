# C5 PTQ V0 — reproduction

Prerequisites: Node 20+, `backend/npm ci` + `npx prisma generate` once in the worktree (for `ts-node` + DI imports).

```bash
cd research/driving-intelligence/evaluations/ds4-c5-ptq-v0-20261023

# DI must match production pin (no local edits under driving-intelligence/)
git diff 579ee8b2fed06593d7d2aa57cffb6036dbf53a24 -- backend/src/modules/vehicle-intelligence/driving-intelligence

node scripts/run_c5_regression.cjs --code-root "$(git rev-parse --show-toplevel)"
node scripts/c5-ptq-v0.synthetic.test.cjs
node scripts/render_charts.cjs
```

Outputs:

- `outputs/c5_regression_summary.json` — metrics + acceptance gates
- `C5_REGRESSION_MATRIX.csv` — per-drive C4/C5 table
- `outputs/charts/*.svg` — TES16 / TIG22 time series
- `outputs/*_lost_seconds.json` — coverage losses with reasons

No network, DB, or production access required.

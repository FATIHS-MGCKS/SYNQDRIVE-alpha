# Reproduction

All steps are read-only with respect to production and to the production code checkout. Requires `backend/node_modules`
(ts-node) in the production checkout; a symlink to an installed `node_modules` is sufficient.

## 1. Pin the inputs

```bash
# production code at the reviewed SHA (DI directory identical to origin/main 393ae9da2)
git worktree add /tmp/prod-7340637 7340637274c40d4fc03d968cdb943f16171a4a39
ln -s "$PWD/backend/node_modules" /tmp/prod-7340637/backend/node_modules   # if not installed there

# upstream harness + inputs (PR #2139 head; contains the #2136 eval_lib as sibling)
git fetch origin cursor/ds4-accel-brake-video-eval-192d
git worktree add /tmp/research/ds4-accel-brake-video-eval-192d 6d1de00e5
export DS4_ACCEL_EVAL_ROOT=/tmp/research/ds4-accel-brake-video-eval-192d/research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023
```

## 2. Baseline (production detector, v2_gap2s)

```bash
cd "$DS4_ACCEL_EVAL_ROOT"
node scripts/replay_event_eval.cjs --code-root /tmp/prod-7340637 --tag fable_base_7340637 --matching v2_gap2s \
  --expect-sha 7340637274c40d4fc03d968cdb943f16171a4a39
# outputs/fable_base_7340637/* → copied here as outputs/baseline_fable_base_7340637/
# expected: identical to PR #2139 outputs/match2s; TIG22 production.identical = true
```

## 3. A/B candidates and probes (this directory)

```bash
cd research/driving-intelligence/evaluations/ds4-accel-brake-fable-review-20261024
node scripts/candidates_ab.cjs --code-root /tmp/prod-7340637 --tag fable_base_7340637 > outputs/ab/run.log
node scripts/probe.cjs       --code-root /tmp/prod-7340637 --tag fable_base_7340637 > outputs/probe_windows.txt
node scripts/probe_c51.cjs   --code-root /tmp/prod-7340637 --tag fable_base_7340637 > outputs/probe_c51.txt
node scripts/probe_fsm.cjs   --code-root /tmp/prod-7340637 --tag fable_base_7340637 > outputs/probe_fsm.txt
```

Expected first line of `outputs/ab/run.log`:

```
generic re-implementation parity: OK on TIG22, TES21-1, TES21-2, TES16 (code 7340637274c40d4fc03d968cdb943f16171a4a39)
```

`candidates_ab.json` differs between runs only in `generatedAtUtc`. The `--tag` argument is forwarded to the upstream
replay module (it names the baseline tag; the module creates `outputs/<tag>/` in the upstream tree on require).

## 4. Regression gate for a future implementation (P1/P2 in `REPORT.md` §10)

Run step 2 against the candidate code root and diff `*_events.csv` against `outputs/baseline_fable_base_7340637/`.
Allowed deltas are exactly:

- `TES16` `ACCELERATION 2026-10-16T03:50:20Z→03:50:23Z`: quality `DEGRADED` → `ARTEFACT_SUSPECT` (P1)
- `TIG22` `ACCELERATION 2026-10-22T19:04:34Z→19:04:38Z`: quality `LIMITED` → `ARTEFACT_SUSPECT` (P2)
- `TIG22` `ACCELERATION 2026-10-22T19:04:49Z→19:04:52Z`: quality `DEGRADED` → `ARTEFACT_SUSPECT` (P2)

Any other change in any of the four drives is a regression.

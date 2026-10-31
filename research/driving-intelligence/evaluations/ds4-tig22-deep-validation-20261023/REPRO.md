# REPRO — TIG22 deep validation (2026-10-23)

Deterministic offline replay. **No** production SSH, DB, deploy, or sealed reference mutation.

## Preconditions

- Node.js 20+ (tested on 22.x)
- `backend/node_modules` installed at repository root (`cd backend && npm ci`)
- Clean `backend/src/modules/vehicle-intelligence/driving-intelligence/` in the code pin checkout
- Sealed inputs:
  - `../ds4-speed-video-reference-20261023/inputs/tiguan-20261022/` (PR **#2136**)
  - `inputs/tiguan-prod-shadow-v4/` (prod shadow export from PR **#2139**)
- Event oracle rules: `scripts/event_eval_lib.cjs` (unchanged copy from PR **#2139**, matching `v2_gap2s`)

## Code pins

| Pin | SHA / version |
| --- | --- |
| **Primary production** | `716f93fedd9d5408fa1db2de5b4cd1a786d9685c` |
| **C5.1** | `MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_2_NULL_NEIGHBOR_FAIL_CLOSED` |
| **C4** | `MOTION_CORE_SPEED_C4_V0_5_DEV` (as recorded in `outputs/metrics.json` at pin time) |

Optional worktree (recommended for exact prod tree):

```bash
git worktree add .worktrees/prod-716f93f 716f93fedd9d5408fa1db2de5b4cd1a786d9685c
```

## Run

From this directory:

```bash
node scripts/run_tig22_deep_validation.cjs \
  --code-root /path/to/repo-or-worktree-at-716f93fed \
  --expect-sha 716f93fedd9d5408fa1db2de5b4cd1a786d9685c
```

Outputs (overwrite only under `outputs/` in this package):

- `per_second.csv`
- `anomalies.csv`
- `events_comparison.csv`
- `metrics.json`
- `INPUT_MANIFEST.json` (refreshed at repo root relative paths)

## Cross-checks (optional)

Speed-only replay (all drives) at same code pin:

```bash
cd ../ds4-speed-video-reference-20261023
node scripts/replay_speed_eval.cjs --code-root /path/to/716f93fed --tag prod_716f93 --expect-sha 716f93fedd9d5408fa1db2de5b4cd1a786d9685c
```

Compare TIG22 `replay_c4.all` block to `metrics.json` → `speed.c4` (should match at 0 s shift).

Full accel/brake package (PR **#2139** head) if merged or checked out separately:

```bash
node scripts/replay_event_eval.cjs --code-root /path/to/716f93fed --tag match2s --matching v2_gap2s
```

TIG22 oracle status counts should match `metrics.json` → `events.c4.oracleStatus` when the same code pin is used.

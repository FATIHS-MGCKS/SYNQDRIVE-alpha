# DS4 Acceleration & Braking — Fable independent review (2026-10-24)

**Research-only.** No production code, env flags, DB migrations or algorithm changes. Everything here is a read-only
adversarial review of the production event detector at SHA `7340637274c40d4fc03d968cdb943f16171a4a39` on the four
pinned reference drives, plus reproducible A/B replays of small-fix candidates and alternative detectors.

| File | Content |
|---|---|
| `REPORT.md` | Full report (German): architecture separation, verified parameters, bug audit B1–B7, C5.1 and FSM/Gap-Bridge benefit assessment, alternatives table (EVAL vs DEV), prioritised recommendation A–E, implementation packages P1–P3, final completion block |
| `REPRO.md` | Exact commands to regenerate every output |
| `scripts/paths.cjs` | Resolves the upstream PR #2139 / #2136 harness roots (`DS4_ACCEL_EVAL_ROOT`, sibling dir, or detached worktree) |
| `scripts/candidates_ab.cjs` | A/B harness: generic re-implementation of the production detector with hooks (parity asserted against `core/kinematics/motion-event-detector.ts`), 11 candidates, EVAL/DEV pooling, intensity errors vs oracle |
| `scripts/probe.cjs` | Per-second probe (reference, C4, step acceleration, quality, forward chord, flags) for the audit windows |
| `scripts/probe_c51.cjs` | C4 vs C5.1 V1.2 series with repair states / trace for TES16 03:50, TIG22 19:04, TIG22 18:44 |
| `scripts/probe_fsm.cjs` | FSM V0.3 vs V0.4 Gap Bridge labels (empty auxiliary set — documented replay limitation) for the same windows |
| `outputs/baseline_fable_base_7340637/` | Production detector replay (`replay_event_eval.cjs --matching v2_gap2s`), byte-identical to PR #2139 `match2s`; TIG22 `prodIdentical=true` |
| `outputs/ab/CANDIDATES_AB.md`, `candidates_ab.json`, `run.log` | Candidate comparison tables, changed-event lists, physics constants, intensity errors |
| `outputs/probe_windows.txt`, `probe_c51.txt`, `probe_fsm.txt` | Probe transcripts quoted in the report |

## Ground-truth and role integrity

- TIG22 video ground truth ends at **19:03:02 UTC**; the 19:04 tail is assessed for plausibility only and is never counted as a hit.
- TIG22 and TES16 are **EVAL**; TES21-1 and TES21-2 are **DEV** (used during detector development). Pools are never mixed.
- TES16 was the C5.1 development set (#2144): C5.1 results on TES16 are **not independent evidence**.
- No new videos, no re-captured data; oracle/operator tables are taken unchanged from PR #2139 (`v2_gap2s`, not `v1`).

## Upstream input dependencies (not duplicated here)

| PR | Directory | Role |
|---|---|---|
| [#2139](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2139) (head `6d1de00e5`) | `research/driving-intelligence/evaluations/ds4-accel-brake-video-reference-20261023/` | `replay_event_eval.cjs`, `event_eval_lib.cjs`, four-drive inputs, oracle tables |
| [#2136](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2136) (head `db6ce37dd`) | `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/` | `eval_lib.cjs` |

`scripts/paths.cjs` locates them via `DS4_ACCEL_EVAL_ROOT`, the sibling directory (after #2139 merges), or the detached
worktree path used for this review.

## Headline result

Production detector is sound (EVAL: 27 hits, 1 hard false alarm, 1 hard miss, 0 fragments). Three confirmed defects:
K3 blind to dip→spike artefacts whose start sample is the artefact (TES16 03:50:20); no physics envelope (two
impossible TIG22 19:04 events accepted and shown unmarked); systematic intensity attenuation from the implicit 3-s
kernel. Recommended: two additive marking guards (spike-bracket/K-B + physics envelope on event mean), no threshold
change, no new detector, no ML, no FSM coupling. See `REPORT.md` §10–§12.

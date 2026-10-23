# DS4 C5.1 gated repair — offline experiment (2026-10-23)

Isolated research implementation of **C5.1** per design PR #2143 (`30b3f29b8`). No production code changes.

**V1.1 safety hardening** (`MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_1_SAFETY_HARDENED`): fixes A–F from Fable implementation QA; authoritative JSON schema `C5_1_EXPERIMENT_SUMMARY_V2_SAFETY_HARDENED`.

| Path | Role |
| --- | --- |
| `scripts/c5-1-gated-repair.cjs` | Repair engine on frozen C4 replay |
| `scripts/run_c5_1_experiment.cjs` | Four-drive regression + gates → `outputs/c5_1_experiment_summary.json` |
| `scripts/c5-1.synthetic.test.cjs` | Eight meaningful synthetic scenarios |
| `scripts/c5-1.support.test.cjs` | Support counting boundary tests (4–7 points) |
| `REPRO.md` | Commands and pins |

`PRODUCT_CODE_CHANGED=NO` · `PRODUCTION_MUTATIONS=NO`

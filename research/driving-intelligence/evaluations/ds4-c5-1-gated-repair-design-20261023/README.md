# DS4 C5.1 gated repair — design gate (2026-10-23)

Design-only package. Builds on PRs #2139–#2142; does **not** modify `ds4-c5-ptq-v0-20261023` artifacts.

**Revision:** Post–Fable review (`9283a6e30` → current HEAD). Reference-free acceptance, revised support rule, restricted S6 seeding, offline time semantics.

| Document | Content |
| --- | --- |
| [C5_1_ARCHITECTURE.md](./C5_1_ARCHITECTURE.md) | Layering, pass-through, three-layer time semantics |
| [ELIGIBILITY_AND_REPAIR_SPEC.md](./ELIGIBILITY_AND_REPAIR_SPEC.md) | Windows, PTQ repair, reference-free acceptance |
| [VALIDATION_GATES.md](./VALIDATION_GATES.md) | Pre-registered offline experiment |
| [RISKS_AND_OPEN_QUESTIONS.md](./RISKS_AND_OPEN_QUESTIONS.md) | Fable disposition, residual risks |

**Design audit log (read-only):** `/opt/cursor/artifacts/c51_revised_design_stats.log` (eligibility % and TES16 support verification).

`PRODUCT_CODE_CHANGED=NO`

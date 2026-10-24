# Tires Health — Open Questions

| # | Question | Owner to answer | Blocking |
|---|----------|-----------------|----------|
| Q1 | Should DS4 persistence be extended with `meanAccelMps2`, `durationS`, `coverageRatio` per event (Fable B7), or should the tire adapter rely on label-derived duration only? Extension is a Driving Intelligence change and requires Fable sign-off. | Driving Intelligence + owner | ordinal intensity quality |
| Q2 | Which vehicles/orgs should be allowlisted for DS4 shadow so that tire shadow coverage reaches the full fleet? (Not a tire-side decision; currently 4 of 6.) | Owner / DI ops | fleet-wide comparison |
| Q3 | What is the replacement gate for V2 → successor (minimum number of tread measurements per setup, maximum MAE vs measurements, duration of shadow run)? | Owner | V2 supersession |
| Q4 | Where should the tire shadow adapter be scheduled: inside the hourly recalculation tick (shadow branch) or a separate low-frequency scheduler? | Implementation PR | adapter design |
| Q5 | Reconcile the active-setup count (5 vs 6) with one canonical read-only query. | Next read-only pass | promotion gate |
| Q6 | Should `harsh*` ledger fields be renamed to `hard*` when the ledger schema is next touched? | Tires Health | naming contradiction |
| Q7 | How are SynqDrive Code → Changes / Architektur views updated for documentation-only PRs (data file vs code component)? | Governance | TIRE-GAP-CODE-VIEWS-NOT-UPDATED-001 |

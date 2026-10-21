# P5B2 Phase 2 — Source advance research boundaries (read-only inventory)

This note documents persisted APDS shadow fields **without** implying strict DIMO source advance or polling savings.

## `new_top_level_source_observed`

- Set in `AdaptivePollingShadowService.observePostPollInner` when `newTopLevelSourceMs > previousTopLevelSourceMs` (or previous is null).
- The main `dimo-snapshot.processor` path passes `previousTopLevelSourceMs: null` and `newTopLevelSourceMs` from post-pipeline `snapshotSourceTimestamp`.
- **Therefore** a `true` value is **not** independent proof of strict monotonic top-level source advance; it often means “post-poll snapshot source timestamp present” on SUCCESS.

## `new_lv_source_observed`

- Requires strict increase of visible LV provider timestamp vs pre-poll baseline.
- Phase 2 production cohort inventory (2026-10-17 → 2026-10-21): **0** rows with `new_lv_source_observed=true`.

## `real_poll_id` / `real_poll_status`

- Written on successful or failed post-poll correlation for B2 and B4 twin rows (same poll id for both policy versions per opportunity).

## P2C observations

- `vehicle_provider_source_observations` had **0** rows for the cohort when capture flags (`VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENABLED`) are OFF in production.

## HTTP SUCCESS

- Poll log SUCCESS or `real_poll_status=SUCCESS` does **not** prove new signal payload or strict source advance.

No P2C activation or DIMO polling policy changes belong in the manifest operator workstream.

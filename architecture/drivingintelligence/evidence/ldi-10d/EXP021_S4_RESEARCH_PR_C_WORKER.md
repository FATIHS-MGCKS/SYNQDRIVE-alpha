# EXP-021 S4 Research PR C — Post-S4 Shadow Road Matching V2 Worker

**Status:** Draft implementation (stacked on PR B #2065).  
**Date:** 2026-10-17.

## Hook (S4 completion)

- **Not** inside S4C T06.
- **P2-style** `di_v0_s4_research_outbox_v1` discovers eligible `di_v0_s4_work_items` where `status=COMPLETED`, `run_purpose=PRIMARY`, `pinned_snapshot_hash` + `shadow_run_id` present, within research allowlists and `DI_V0_S4_RESEARCH_ENABLED_SINCE`.
- Scheduler: `DiV0S4ResearchV2Scheduler` / leader job `di_v0_s4_research_v2`.

## Failure isolation

- Processor and service **never** update `di_v0_s4_work_items.status`.
- Outbox errors → `FAILED_RETRYABLE` or `SKIPPED_INELIGIBLE` on research outbox only.
- Neutral research statuses: `ROAD_CONTEXT_UNAVAILABLE`, `SNAPSHOT_INVALID`.

## Pinned snapshot reuse

- `verifyAndParseDiV0PinnedEvidenceSnapshot` + gzip payload from `di_v0_s4_evidence_snapshots`.
- No DIMO re-fetch for positions.

## OSM strategy (bounded)

- Corridor bbox from GPS buckets + margin (75 m).
- Default runtime: `DiV0S4ResearchNullOsmProvider` → `ROAD_CONTEXT_UNAVAILABLE`.
- Cache table `di_v0_s4_research_osm_cache_v1` for future bounded FILE_REGISTRY / OVERPASS_BOUNDED providers.
- Frozen Tesla OSM remains evidence-only (not used for arbitrary trips).

## Artifacts

- Table `di_v0_s4_research_runs_v1`: windows JSON, summary, `independent_road_id_accuracy=NOT_ASSESSABLE`, geometry projection id, bundle version `DI_V0_S4_RESEARCH_BUNDLE_VERSION_V2`.

## Performance reference

- Owner reference: ~78.6 s Viterbi for 1,136 buckets (LDI-10D).
- CI/local budget test: 180 s cap (`di-v0-s4-research-performance.unit.spec.ts`).

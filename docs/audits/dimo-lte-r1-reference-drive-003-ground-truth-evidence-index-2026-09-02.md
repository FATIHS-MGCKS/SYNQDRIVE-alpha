# RD003 Segmented Video Ground Truth Evidence Index (Pending Ingest)

**Evidence ID:** DI-EV-0032

**Related:** DI-EV-0033 — canonical telemetry correlation source (`docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl`). DI-EV-0033 is **not** Ground Truth itself; it is the lossless telemetry source against which the nine external video clips will be aligned.

## Coverage model

| Field | Value |
|-------|-------|
| RD003_TELEMETRY_COVERAGE | FULL_SESSION |
| RD003_VIDEO_GT_COVERAGE | PARTIAL_SEGMENTED |
| VIDEO_GROUND_TRUTH_AVAILABLE | CLIPS_AVAILABLE_EXTERNALLY (9 segmented instrument-cluster clips) |
| VIDEO_ALIGNMENT_STATUS | PENDING_CORRELATION |
| GROUND_TRUTH_VALIDATED | NO |
| CONTINUOUS_VIDEO_ASSUMPTION | REMOVED |

RD003 did **not** record one continuous ~37 minute instrument-cluster video. Telemetry covers the full session; video Ground Truth is **partial / segmented** — multiple short clips (~1 min each) around interesting driving states (acceleration, braking, coasting, cornering, cruise, etc.).

**Do not assume:** single VIDEO_START_TIME, VIDEO_END_TIME, global VIDEO_DURATION, or continuous video coverage.

## Clip taxonomy (examples only — pending ingest)

| Example clipId | Behavioral label |
|----------------|------------------|
| GT_ACCELERATION_01 | acceleration |
| GT_BRAKING_01 | braking |
| GT_COASTING_01 | coasting / rolling without throttle |
| GT_CORNERING_01 | faster / curved driving |
| GT_CRUISE_01 | steady cruise |

Actual clip IDs are assigned at ingest. Multiple clips per category are allowed.

## Per-clip schema (populated at ingest)

Each ingested clip must store independently:

- clipId, behavioral label, file name, SHA-256
- creation timestamp / media metadata, duration, FPS, camera clock metadata
- estimated telemetry window, synchronization method, synchronization anchors
- alignment confidence, alignment residual/error
- speed / RPM / gear (if visible) alignment metrics
- acceleration onset alignment, braking/deceleration onset alignment
- notes / evidence classification

## Unrecorded windows

Telemetry windows without a corresponding video clip remain **TELEMETRY_ONLY** and must NOT be classified as Ground Truth.

## Telemetry correlation source (DI-EV-0033)

| Field | Value |
|-------|-------|
| Correlation source | `docs/audits/data/dimo-lte-r1-reference-drive-003-video-gt-correlation-source.jsonl` |
| Canonical SHA-256 | `69209a6d9e488d51c3aaf3b55dee5584ce622dc072a191b81e7061597cdda87a` |
| Exported rows | 5010 |
| FULL_SESSION_FILTERED_EXPORT | YES |
| VIDEO_CANDIDATE_WINDOWS_USED_AS_FILTER | NO |

Nine segmented clips (IMG_2803–IMG_2811) are available to the external analysis authority. Candidate vehicle-clock regions are documented in the DI-EV-0033 summary only — **not** applied as telemetry filters.

## Telemetry reference

| Field | Value |
|-------|-------|
| TELEMETRY_CLOCK_REFERENCE | session `0fa040aa-6105-4872-9b2c-f8ad477009b8` |
| Sealed SHA-256 | `81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4` |

**No alignment metrics are reported until segmented video files are ingested and SHA-verified.**

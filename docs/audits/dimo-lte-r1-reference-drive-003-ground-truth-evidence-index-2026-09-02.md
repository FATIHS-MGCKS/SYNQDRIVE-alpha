# RD003 Segmented Video Ground Truth Evidence Index (Pending Ingest)

**Evidence ID:** DI-EV-0032

**Related:** DI-EV-0033 — canonical telemetry correlation source. DI-EV-0034A — alignment workbench. DI-EV-0034B — first real external sparse video GT ingestion + candidate alignments (`docs/audits/data/rd003-video-ground-truth-observations.json`, `docs/audits/data/rd003-video-gt-alignment/`). None is validated Ground Truth.

## Coverage model

| Field | Value |
|-------|-------|
| RD003_TELEMETRY_COVERAGE | FULL_SESSION |
| RD003_VIDEO_GT_COVERAGE | PARTIAL_SEGMENTED |
| VIDEO_GROUND_TRUTH_AVAILABLE | CLIPS_AVAILABLE_EXTERNALLY (9 segmented instrument-cluster clips) |
| VIDEO_ALIGNMENT_STATUS | REAL_CANDIDATE_ALIGNMENTS_AVAILABLE (DI-EV-0034B) |
| GROUND_TRUTH_VALIDATED | NO |
| CONTINUOUS_VIDEO_ASSUMPTION | REMOVED |
| WORKBENCH_READY | YES (DI-EV-0034A) |
| EXTERNAL_GT_INGESTED | YES (DI-EV-0034B) |
| EXTERNAL_GT_SHA256 | `ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e` |

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
| Authoritative sealed source | `/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-003/observations.jsonl` |
| Exported rows | 5010 |
| FULL_SESSION_FILTERED_EXPORT | YES |
| VIDEO_CANDIDATE_WINDOWS_USED_AS_FILTER | NO |
| ROW_SELECTION_BASIS | SEALED_RD003_SESSION_OBSERVATIONS_BY_ACQUISITION |
| PROVIDER_TIMESTAMP_USED_AS_SESSION_FILTER | NO |
| PROVIDER_TIMESTAMP_MAY_PREDATE_SESSION_START | YES |
| VIDEO_TO_TELEMETRY_CLOCK_MODEL_STATUS | PENDING_MULTI_CLOCK_CORRELATION |

Nine segmented clips (IMG_2803–IMG_2811) registered in DI-EV-0034A external GT schema.

## Alignment workbench (DI-EV-0034A)

| Field | Value |
|-------|-------|
| External GT schema | `docs/audits/data/rd003-video-ground-truth-observations.json` |
| Alignment outputs | `docs/audits/data/rd003-video-gt-alignment/` |
| WORKBENCH_READY | YES |
| EXTERNAL_GT_VALUES_COMPLETE | YES (DI-EV-0034B) |
| VIDEO_ALIGNMENT_STATUS | REAL_CANDIDATE_ALIGNMENTS_AVAILABLE |
| REAL_ALIGNMENT_EXECUTED | YES (DI-EV-0034B) |
| GROUND_TRUTH_VALIDATED | NO |

## External sparse video GT (DI-EV-0034B)

| Field | Value |
|-------|-------|
| Ingestion authority | EXTERNAL_OWNER_PLUS_CHATGPT_MANUAL_VISUAL_REVIEW |
| Source method | EXTERNAL_MANUAL_FRAME_REVIEW_CHATGPT_2026_09_03 |
| Clips with GT | 9 / 9 |
| Total raw observations | 198 |
| Alignment-eligible SPEED points | 182 |
| NO_VIDEO_GT_INTERPOLATION | YES |
| NO_VIDEO_GT_30HZ_FABRICATION | YES |
| EXTERNAL_GT_SHA256 | `ea0d78ee71b5c83f104e8de31056ccfccc7b476733b676da5bf8828badc9592e` |

VALIDATED on SPEED observations denotes external visual observation authority — not telemetry alignment validation.

## Telemetry reference

| Field | Value |
|-------|-------|
| TELEMETRY_CLOCK_REFERENCE | session `0fa040aa-6105-4872-9b2c-f8ad477009b8` |
| Sealed SHA-256 | `81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4` |

**Candidate alignment metrics are available in `docs/audits/data/rd003-video-gt-alignment/` after DI-EV-0034B ingestion. DI-EV-0034C global fingerprint discovery preserved in `global-fingerprint-discovery/`. DI-EV-0034D corrected discovery v2 in `global-fingerprint-discovery-v2/`. GROUND_TRUTH_VALIDATED remains NO.**

## Global fingerprint discovery v2 (DI-EV-0034D)

| Field | Value |
|-------|-------|
| Evidence ID | DI-EV-0034D |
| Discovery mode | `GLOBAL_FINGERPRINT_DISCOVERY_V2` |
| Artifact path | `docs/audits/data/rd003-video-gt-alignment/global-fingerprint-discovery-v2/` |
| Prior runs preserved | `hard-clock-prior-run/` (0034B), `global-fingerprint-discovery/` (0034C) |
| `ZERO_PHASE_HARD_CLOCK_BOUND_CONCLUSION` | HARD_SECOND_PHASE_PRIOR_FALSIFIED |
| `IMG_2810_V2_STRONG_BASIN_AT_19_23_59` | YES |
| `IMG_2807_AND_IMG_2810_JOINTLY_POSSIBLE` | NO |
| `READY_FOR_DI_EV_0034E` | YES |
| `GROUND_TRUTH_VALIDATED` | NO |

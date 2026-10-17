# P22B — RD003 clip inventory (nine clips)

**Session:** `0fa040aa-6105-4872-9b2c-f8ad477009b8` · **Vehicle:** `19fedd4b-c4e8-4de8-a125-dab293326e7e` · **SynqDrive trip_id:** none in capture authority
**GT ingestion:** EXTERNAL_OWNER_PLUS_CHATGPT_MANUAL_VISUAL_REVIEW · **GROUND_TRUTH_VALIDATED:** NO

Original `IMG_28xx.mp4` files are **not** stored in this git repository (metadata + sparse labels only).

| Clip | File | Dur (s) | Neg ctrl | Video clock (display) | Candidate UTC start | ±s | Speed samples | 0 km/h labels | Min–Max km/h | Alignment | Match cov | Summary |
|------|------|--------:|----------|----------------------|---------------------|---:|--------------:|--------------:|-------------|-----------|----------:|---------|
| RD003_GT_CLIP_001 | IMG_2803.mp4 | 60 | no | 21:03 → 21:04 | 2026-09-02T19:03:49.400Z | 30 | 25 | 3 | 0–80 | INSUFFICIENT_GROUND_TRUTH | 32% | STOP → LAUNCH → STRONG_ACCELERATION → HIGH_RPM_S… |
| RD003_GT_CLIP_002 | IMG_2804.mp4 | 36.9 | yes | 21:06 | — | — | 8 | 0 | 64–69 | INSUFFICIENT_GROUND_TRUTH | 63% | STABLE_CRUISE negative-control baseline ~64–69 k… |
| RD003_GT_CLIP_003 | IMG_2805.mp4 | 24.3 | no | 21:08 → 21:09 | 2026-09-02T19:08:37.300Z | 30 | 20 | 0 | 38–90 | INSUFFICIENT_GROUND_TRUTH | 25% | ROLLING_CRUISE → STRONG_ACCELERATION → HIGH_RPM_… |
| RD003_GT_CLIP_004 | IMG_2806.mp4 | 35.3 | no | 21:09 → 21:10 | 2026-09-02T19:09:50.200Z | 30 | 17 | 0 | 70–103 | INSUFFICIENT_GROUND_TRUTH | 65% | MILD_PROGRESSIVE_ACCELERATION → NEAR_STEADY → MO… |
| RD003_GT_CLIP_005 | IMG_2807.mp4 | 61.2 | no | 21:12 → 21:13 | 2026-09-02T19:12:10.300Z | 30 | 16 | 1 | 0–67 | INSUFFICIENT_GROUND_TRUTH | 81% | DECELERATION → STOP → STRONG_ACCELERATION → INTE… |
| RD003_GT_CLIP_006 | IMG_2808.mp4 | 45.8 | no | 21:21 | — | — | 43 | 4 | 0–87 | INSUFFICIENT_GROUND_TRUTH | 56% | STOP → PROGRESSIVE_ACCELERATION → STRONGER_ACCEL… |
| RD003_GT_CLIP_007 | IMG_2809.mp4 | 31.5 | yes | 21:22 → 21:23 | 2026-09-02T19:22:30.450Z | 30 | 18 | 0 | 45–61 | INSUFFICIENT_GROUND_TRUTH | 94% | STABLE_CRUISE → CONTROLLED_DECELERATION (negativ… |
| RD003_GT_CLIP_008 | IMG_2810.mp4 | 21.4 | no | 21:23 | — | — | 10 | 0 | 48–91 | INSUFFICIENT_GROUND_TRUTH | 100% | STRONG_ACCELERATION → EXPLICIT_VISIBLE_SHIFT (S2… |
| RD003_GT_CLIP_009 | IMG_2811.mp4 | 34.3 | no | 21:24 → 21:25 | — | — | 25 | 1 | 0–50 | INSUFFICIENT_GROUND_TRUTH | 68% | FORWARD → DECELERATION → NEAR_STOP → REVERSE → S… |

**Observation provenance:** each speed point = `EXTERNAL_MANUAL_FRAME_REVIEW_CHATGPT_2026_09_03` at integer `videoTimeSeconds` (not full frame rate).

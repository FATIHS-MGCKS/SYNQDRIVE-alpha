# LDI-10D Phase 3E.6 — Owner review

## Integrity
- INPUT_INTEGRITY: **PASS**
- ORIGINAL_MOV_AVAILABLE: **NO** (SOURCE_VIDEO_UNAVAILABLE)
- Full 1-Hz OCR: **NOT COMPLETED** (206×5s handoff only)

## Spatial (dual evaluation)
| Set | N | Median m | P95 m |
| --- | ---: | ---: | ---: |
| **A** Independent (no DIMO filter) | 141 | 1.67 | 32.95 |
| **B** 3E.5 compatibility (biased) | 137 | 1.60 | 31.70 |

## Road matching
- ROAD_ID_GROUND_TRUTH: **NOT_ASSESSABLE**
- Baseline/Viterbi disagreements at compatibility iPhone UTCs: **22**

## Speed
- Pinned L3 MAE (historical): **2.303091434778604** km/h
- Holdout witness MAE (3C): **2.7321396260079056** · improvement proven: **NO**

## Stops / freeze
- GPS freeze cases reviewed: **7**
- OBSERVED standstills: **0**

**STOP: WAIT_OWNER_REVIEW**

```bash
cd backend && npm run ldi10d:phase3e6-full-video-forensics
cd backend && npx jest ldi10d-phase3e6 --runInBand
```
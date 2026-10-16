# EXP021 P22D — RD003 Independent UTC Anchor Recovery

**Result:** `UTC_RECOVERY_BLOCKED` · PR #2051 · HEAD `12843920f0b8d533e0db45053f5087fe9dc5b30b`

## Original sources

- Video files in repo: **false**
- Creation timestamps in repo: **false**
- Session bounds (sealed): 2026-09-02T18:59:15.695Z → 2026-09-02T19:36:22.970Z

## Anchor counts

- Independent (visual minute transitions only): **6**
- Visual + assumed CEST: **9**
- Telemetry-derived (HF fit): **9**

## Clips

| Clip | Earliest start UTC | Latest start UTC | Independent best | Telemetry fit start | Status |
|------|-------------------|------------------|------------------|---------------------|--------|
| RD003_GT_CLIP_001 | 2026-09-02T19:03:19Z | 2026-09-02T19:04:19Z | — | 2026-09-02T19:04:08.400Z | BLOCKED |
| RD003_GT_CLIP_002 | 2026-09-02T19:06:00.000Z | 2026-09-02T19:06:23.100Z | — | 2026-09-02T19:06:20.000Z | BLOCKED |
| RD003_GT_CLIP_003 | 2026-09-02T19:08:07Z | 2026-09-02T19:09:07Z | — | 2026-09-02T19:08:07.800Z | BLOCKED |
| RD003_GT_CLIP_004 | 2026-09-02T19:09:20Z | 2026-09-02T19:10:20Z | — | 2026-09-02T19:10:10.700Z | BLOCKED |
| RD003_GT_CLIP_005 | 2026-09-02T19:11:40Z | 2026-09-02T19:12:40Z | — | 2026-09-02T19:11:42.300Z | BLOCKED |
| RD003_GT_CLIP_006 | 2026-09-02T19:21:00.000Z | 2026-09-02T19:21:14.000Z | — | 2026-09-02T19:21:05.500Z | BLOCKED |
| RD003_GT_CLIP_007 | 2026-09-02T19:22:00Z | 2026-09-02T19:23:00Z | — | 2026-09-02T19:22:53.450Z | BLOCKED |
| RD003_GT_CLIP_008 | 2026-09-02T19:23:00.000Z | 2026-09-02T19:23:38.600Z | — | 2026-09-02T19:23:08.500Z | BLOCKED |
| RD003_GT_CLIP_009 | 2026-09-02T19:24:29.000Z | 2026-09-02T19:24:32.000Z | — | 2026-09-02T19:24:32.000Z | BLOCKED |

## Quality gates

- **A_tripIdentity:** {"status":"UNIQUE_CANDIDATE","tripId":"fe40356a-4605-4481-8280-cb44858cacc1","note":"P22C temporal containment — does not validate per-clip UTC"}
- **B_clipUtcSynchronization:** {"status":"BLOCKED","clipsWithValidatedUtc":0,"jointlyConsistentStrongCandidates":0}
- **C_independentVideoMotionLabels:** {"status":"PARTIAL","note":"198 sparse SPEED observations (visual review); not full-frame coverage; VALIDATED ≠ telemetry alignment"}
- **D_frozenV02ReplayReadiness:** {"status":"NOT_READY","reasons":["No VALIDATED clip UTC","No P21 work item pin on trip fe40356a…"]}

## Blockers

- No original video files or container creation timestamps in repository
- CEST timezone for instrument clock NOT VALIDATED (discovery v2)
- JOINTLY_CONSISTENT_STRONG_CANDIDATE_COUNT=0
- IMG_2807 and IMG_2810 strong basins mutually incompatible (−130.8s chronology conflict)
- HF alignment starts are telemetry-derived — cannot count as independent UTC
- CROSS_CLIP_CLOCK_MODEL eligibleClipCount=0
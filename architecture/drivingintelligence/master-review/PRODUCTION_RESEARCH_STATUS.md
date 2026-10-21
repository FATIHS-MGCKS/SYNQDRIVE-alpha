# Production vs Research Status Matrix

**Read-only assessment** at `origin/main` @ `0a16ffb5b`. **Do not infer activation from merge alone.**

Legend: **1** In Production deployed · **2** In Production activated · **3** Deployed flag OFF · **4** Merged not activated · **5** Research-only on main · **6** Research branch only · **7** Offline artifact · **8** Proposed only

| Component | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Notes |
|-----------|---|---|---|---|---|---|---|---|-------|
| Legacy HF enrichment | ✓ | ✓ | | | | | | | Whole-trip fetch |
| HF Recovery V2 policy | ✓ | | ✓ | | | | | | `HF_RECOVERY_POLICY_V2_ENABLED=false` |
| DI V2 master pipeline | ✓ | ✓* | | | | | | | *Production env `true` REPORTED C1D.10A; code default false |
| Reference Capture infra | ✓ | ✓ | | | | | | | Not HF authority |
| DI V0 pure core (L3/S1) | ✓ | | | ✓ | | | | | No runtime caller |
| S3A position acq | ✓ | | | ✓ | | | | | PR #1800 |
| S3B R1 OBD + native | ✓ | | | ✓ | | | | | Dormant |
| S2 shadow tables | ✓ | | | ✓ | | | | | 0 rows REPORTED at C1D.10A |
| S4A foundation DB | ✓ | | ✓ | | | | | | Kill / tiny staging series |
| S4B orchestration | ✓ | | | ✓ | | | | | Not AppModule registered |
| S4 shadow PRIMARY completion | ✓ | ✓* | | | | | | | *Scoped vehicles; kill gates |
| Speed QC V1 | ✓ | ✓* | | | | | | | Shadow/read paths |
| Speed QC V2 | ✓ | | ✓ | | | | | | Opt-in policy version |
| P2 auto QC after S4 | ✓ | | ✓ | | | | | | #2028 dormant |
| `s4-research` library | ✓ | | | | ✓ | | | | Tests only |
| S4 research worker | ✓ | | ✓ | | ✓ | | | | Flags OFF |
| OSM topology R1 (#2082) | ✓ | | | | ✓ | | | | In library |
| Route Viterbi (#2084) | ✓ | | | | ✓ | | | | In library |
| Direction-aware P1 (#2085) | ✓ | ✓* | | | | | | | Shadow wiring REPORTED |
| Viterbi backpointer (#2081) | | | | | | ✓ | | | OPEN PR |
| B6 safety gates | | | | | | ✓ | | | Not on main SHA |
| B7 micro-motion FSM | | | | | | | ✓ | ✓ | Cloud artifacts / design |
| Tesla/Tiguan replay pins | | | | | | | ✓ | | Evidence dir |
| F4-B promotion audit | ✓ | | | | ✓ | | | | Helpers in s4-research |

**PRODUCTION_RESEARCH_SEPARATION:** Documented — merges #2065/#2082/#2084 do **not** imply fleet road-matcher activation.

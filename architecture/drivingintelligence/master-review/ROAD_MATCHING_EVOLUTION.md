# Road Matching Evolution

## Production vs research split

| Track | Location | Activation on main @ `0a16ffb5b` |
|-------|----------|-----------------------------------|
| S4A–S4F shadow orchestration | `s4a-foundation/`, evidence S4P*, S4F7* | **REPORTED** partial — schema/tools; kill-gated |
| S4 research pure library | `s4-research/` (#2065) | **VERIFIED** merged; **no Nest production caller** |
| S4 research worker | `s4-research-worker/` | **VERIFIED** flags default OFF |
| Direction-aware emission P1 | #2085 shadow wiring | **REPORTED** — see PRODUCTION_RESEARCH_STATUS |

## Geometry correction (VERIFIED)

- **V1:** Legacy projection mismatch preserved under `s4-research/legacy/`
- **V2:** `S4_RESEARCH_LOCAL_EQUIRECTANGULAR_V2` — 488/1136 Tesla buckets changed labels (`LDI10D_GEOMETRY_V1_V2_BUCKET_DIFF.json`) — **not** accuracy improvement claim

## Algorithm lineage

1. **Baseline bucket matcher** — per-bucket nearest segment (`S4_RESEARCH_BASELINE_BUCKET_V2`)
2. **Forward Viterbi** — `S4_RESEARCH_VITERBI_FORWARD_V2` — separate hypothesis stream
3. **Backpointer decoder** — PR #2081 **OPEN** (not on main at dossier SHA)
4. **OSM node-id topology** — #2082 strict adjacency
5. **Route-aware Viterbi R1–R4.1** — #2084
6. **Direction-aware emission P1** — Tiguan + Tesla regression (`TESLA_DIRECTION_AWARE_P1_REGRESSION.md` — **135 way changes, NO accuracy claim**)
7. **B6 safety gates** — research branch only at dossier time

## Decoder & F4-B promotion

- `ASSOCIATED` ≠ confirmed road ID
- F4-B helpers: **STILL_AMBIGUOUS** preserved — PR B evidence
- PR #2051 title references F4-B; **commits on that PR are predominantly Tesla GT docs** — see [EVOLUTION_TIMELINE.md](./EVOLUTION_TIMELINE.md)

## Known topology limits (VERIFIED)

From `EXP021_S4_RESEARCH_PR_B_PURE_LIBRARY.md`:

- Rounded node coordinates for adjacency — no `layer`/`level`
- Turn restrictions largely **UNKNOWN** unless modeled
- Directed routing penalties — route-aware PR (#2084)

## Independent ground truth

**VERIFIED:** All shipped research contracts set `independentRoadIdAccuracy: NOT_ASSESSABLE`.

Tesla frozen fixture explicitly lacks complete road-ID GT (`TESLA_DIRECTION_AWARE_P1_REGRESSION.md`).

# Trip Detection & Lifecycle — Open Hypotheses

Hypotheses are **not confirmed** — distinct from gaps and open questions. Resolved hypotheses stay listed with their outcome.

| ID | Hypothesis | Epistemic | Basis |
|----|------------|-----------|-------|
| **TDL-HYP-001** | Small telematics-connected cohort explains 6 FSM rows vs ~2000 historical trips | **CONFIRMED** (Phase 5) | Prior: INFERRED from TDL-EV-PROD-005 vs PROD-006. Confirmed by TDL-DEC-OQ003-001 (lazy 1:0..1 row for scheduler-eligible cohort); re-observed 6 rows = 6 eligible @ `2b54a357…` (TDL-EVID-PHASE5-PROD-BASELINE-001) |
| **TDL-HYP-002** | Route artifact gap (~4.7%) correlates with Mapbox/FMM failures or pre-Route-V2 trips | **HISTORICAL** — superseded | Prior: UNKNOWN (TDL-EV-PROD-007; taxonomy not reconstructed). Superseded by TDL-DEC-OQ004-001: gap explained by eligibility + pre-Route-V2 era (confirmed part); Mapbox affects MATCHED quality, not artifact existence (Mapbox-causation part **rejected**) |
| **TDL-HYP-003** | R9 provider wake will reduce POSSIBLE_START validation latency for RESTING vehicles post-deploy | PROPOSED — open research hypothesis (non-blocking) | Historical R9 runtime @ `0ba96e03…` (superseded); provider wiring 5/5 validated; historical natural start wake observed (KS MS 661); recent fleet latency KPIs not measured (TDL-GAP-013) |

All three are indexed as `TDL-HYP-*` nodes in [`graph/nodes.yaml`](../graph/nodes.yaml). See also informal hypotheses in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

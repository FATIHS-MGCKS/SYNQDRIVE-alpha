# Road association comparison

**Baseline:** Phase 3E.1 per-bucket heuristic (pinned artifact).
**Candidate:** Causal forward-only Viterbi on top-K segment candidates (research-only).

{
  "baseline": {
    "roadAssociated": 264,
    "roadAmbiguous": 512,
    "roadUnknown": 360
  },
  "candidate": {
    "roadAssociated": 300,
    "roadAmbiguous": 357,
    "roadUnknown": 479
  },
  "bucketsChanged": 536,
  "implausibleTransitions": 15,
  "independentAccuracyValidation": "NOT_ASSESSABLE",
  "sensitivityRadius20": {
    "roadAssociated": 264,
    "roadAmbiguous": 512,
    "roadUnknown": 360
  },
  "note": "No independent driven-road ground truth in repo; higher ASSOCIATED rate is not claimed as accuracy improvement."
}
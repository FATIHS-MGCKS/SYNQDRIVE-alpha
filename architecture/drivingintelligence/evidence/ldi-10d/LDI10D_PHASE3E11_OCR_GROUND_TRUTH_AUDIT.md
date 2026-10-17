# Phase 3E.11 — OCR ground truth audit

## Method
- Stratified sample n=**142**, seed **311111**
- Overlay crops exported to `phase3e11-review-crops/` (not committed if large)
- **No automated visual ground truth** — agent did not perform human transcription

## Label counts
{
  "HUMAN_REVIEW_REQUIRED": 70,
  "REFERENCE_CORROBORATED": 18,
  "UNREADABLE": 54
}

## Field error rates (REFERENCE_CORROBORATED only)
{
  "latitude": {
    "n": 18,
    "errors": 0,
    "wilson": {
      "low": 0.8241154494176252,
      "high": 1.0000000000000002
    }
  },
  "longitude": {
    "n": 18,
    "errors": 0,
    "wilson": {
      "low": 0.8241154494176252,
      "high": 1.0000000000000002
    }
  },
  "note": "Rates computed only on REFERENCE_CORROBORATED (3E.4 pack vs checkpoint); not visual ground truth"
}

Assessable: **REFERENCE_SUBSET_ONLY**
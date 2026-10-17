# LDI-10D Phase 3A — Result

```json
{
  "LDI10D_PHASE": "3A",
  "LDI10D_RESULT": "TEMPORAL_EVENT_RECONSTRUCTION_COMPLETE",
  "INPUT_INTEGRITY": "PASS",
  "EVENTS_TOTAL": 69,
  "EVENTS_CONFIRMED": 31,
  "EVENTS_CANDIDATE": 24,
  "EVENTS_UNKNOWN": 14,
  "EVENT_TYPE_COUNTS": {
    "DECELERATION_APPROACH": {
      "confirmed": 16,
      "candidate": 0,
      "unknown": 0
    },
    "ACCELERATION_EXIT": {
      "confirmed": 9,
      "candidate": 6,
      "unknown": 1
    },
    "OBSERVED_STANDSTILL": {
      "confirmed": 0,
      "candidate": 0,
      "unknown": 0
    },
    "STOP_AND_GO_CANDIDATE": {
      "confirmed": 0,
      "candidate": 0,
      "unknown": 0
    },
    "CURVE_TRAVERSAL": {
      "confirmed": 0,
      "candidate": 12,
      "unknown": 0
    },
    "JUNCTION_APPROACH": {
      "confirmed": 6,
      "candidate": 6,
      "unknown": 0
    },
    "TURN_CANDIDATE": {
      "confirmed": 0,
      "candidate": 0,
      "unknown": 5
    },
    "UNRESOLVED_EVENT": {
      "confirmed": 0,
      "candidate": 0,
      "unknown": 8
    }
  },
  "MANEUVER_LINKED_EVENTS": 32,
  "STOP_AND_GO_CONFIRMED": 0,
  "STANDSTILL_CONFIRMED": 0,
  "REPLAY_TESTS": "PASS",
  "QC_MUTATIONS": "NONE",
  "PRODUCTION_MUTATIONS": "NONE",
  "OPEN_GAPS": "see LDI10D_PHASE3A_EVIDENCE_GAPS.md",
  "NEXT_SAFE_ACTION": "Owner_review_phase3a_timeline_before_phase3b",
  "STOP": "LDI10D_phase3a_complete_wait_owner_review_no_phase3b"
}
```

## Repro
```bash
cd backend && npm run ldi10d:phase3a-temporal-events
cd backend && npx jest ldi10d-phase3a --runInBand
```
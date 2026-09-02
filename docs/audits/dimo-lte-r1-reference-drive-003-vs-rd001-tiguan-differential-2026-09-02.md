# RD001 vs RD003 — Same Tiguan Differential

**Evidence ID:** DI-EV-0030

Vehicle: VW Tiguan WOB L 7503 (same vehicle, different sessions).

```json
{
  "sameVehicle": true,
  "vehicle": "WOB L 7503",
  "RD001_sessionId": "06638509-6213-419b-9df4-3def6c024f41",
  "RD003_sessionId": "0fa040aa-6105-4872-9b2c-f8ad477009b8",
  "durationSeconds": {
    "RD001": 2049.108,
    "RD003": 2227.291
  },
  "acquisitionStartGapSeconds": {
    "RD001": 703.987,
    "RD003": 0.254,
    "RD003_SESSION_START_TO_FIRST_SIGNAL_INGRESS_MS": 254,
    "classification": "RECORDER_ARCHITECTURE_CHANGE",
    "terminologyNote": "Use distinct timing metrics — do not conflate SESSION_START_TO_FIRST_SIGNAL_INGRESS_MS with ambiguous acquisition-start gap labels"
  },
  "cycleCount": {
    "RD001": 226,
    "RD003": 371
  },
  "signalObservations": {
    "RD001": 3451,
    "RD003": 6250
  },
  "hfRows": {
    "RD001": 1333,
    "RD003": 2783
  },
  "hfRowsPerMinute": {
    "RD001": 39.031617659976924,
    "RD003": 74.96999718492104
  },
  "availableSignals": {
    "RD001": 31,
    "RD003": 31
  },
  "observedFields": {
    "RD001": 31,
    "RD003": 31
  },
  "hfFieldParity": true,
  "videoGroundTruth": {
    "RD001": "NOT_AVAILABLE",
    "RD003": "PLANNED_VIDEO_GT_PENDING_INGESTION"
  },
  "majorFindings": [
    "RD003 eliminated ~704s ARM acquisition-start gap present in RD001 (RECORDER_ARCHITECTURE_CHANGE)",
    "RD003 longer drive (~37 min vs ~34 min) with more cycles (371 vs 226) and more HF rows (2783 vs 1333)",
    "Same 31-field Tiguan capability surface; HF field set unchanged (5 fields)",
    "REQUESTED_INTERVAL_1S≠OBSERVED_1HZ holds for Tiguan under motion (independent confirmation)",
    "Zero native events across both Tiguan drives — capability research finding"
  ]
}
```

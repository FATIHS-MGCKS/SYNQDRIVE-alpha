# EXP021 EV Ground Truth — video analysis protocol

**Status:** READY (procedure only). **`VIDEO_RECEIVED_AND_ANALYZED=NO`** until owner file handoff.

## Ingest

1. Store **original** file unmodified in protected evidence storage (not git).  
2. Record SHA-256, filename, byte size, ingest actor, ingest time.  
3. Do not publish raw video in PRs or public artifacts.

## Container inspection

- Record duration, codec, resolution, variable frame rate flags  
- Presentation timestamps vs decode order  
- Cuts, duplicated frames, dropped frames  
- OCR readability assessment per overlay region  

## Time bases (keep separate)

| Clock | Use |
|-------|-----|
| Video timeline (seconds from start) | Frame indexing |
| On-screen Berlin clock | Owner display; verify UTC+02:00 on 2026-10-16 |
| Video GPS overlay time | May differ from telemetry |
| SynqDrive / DIMO telemetry | `bucketLabelUtc` in per-second replay |

Second-display precision ≠ 1 s measurement accuracy — document uncertainty per quantity.

## Synchronization

- Use **multiple** anchor points across the drive  
- Estimate constant offset, drift, and display latency per overlay  
- Visual QA on OCR at events, disagreements, and ambiguous digits — **no guessing**

## Per-second video table (target columns)

- `videoTimeSec`, mapped `utc` / `Europe/Berlin`  
- tachometer speed  
- video GPS speed and coordinates (in protected store; redacted summaries in git)  
- pedal / power / recuperation display (if legible)  
- `S1` L3 speed, QC trust, data availability flags  
- observed state / event label  
- `source`, `confidence`, `timeUncertaintySec` per field  

## Independence

Establish whether video GPS speed/coordinates come from an onboard logger independent of DIMO/SynqDrive pipelines before treating as external GT.

## Completion criteria

`VIDEO_RECEIVED_AND_ANALYZED=YES` only after: ingest hash, container report, sync report, second table, and OCR QA log are stored beside baselines with updated `SHA256SUMS`.

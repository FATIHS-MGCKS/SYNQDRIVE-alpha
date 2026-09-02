# RD003 Video Ground Truth Evidence Index (Pending Video)

**Evidence ID:** DI-EV-0032

| Field | Value |
|-------|-------|
| VIDEO_GROUND_TRUTH_AVAILABLE | NOT_YET_INGESTED |
| VIDEO_ALIGNMENT_STATUS | PENDING_VIDEO |
| VIDEO_FILE_SHA256 | _empty — pending ingest_ |
| VIDEO_DURATION | _empty_ |
| VIDEO_FPS | _empty_ |
| VIDEO_START_TIME | _empty_ |
| VIDEO_END_TIME | _empty_ |
| CAMERA_CLOCK_REFERENCE | _empty_ |
| TELEMETRY_CLOCK_REFERENCE | session 0fa040aa-6105-4872-9b2c-f8ad477009b8 |

## Synchronization anchors (to be marked from video)

- START_IDLE
- THROTTLE_PULSE_1
- THROTTLE_PULSE_2
- THROTTLE_PULSE_3
- DRIVE_START
- FIRST_STOP
- DRIVE_END

## Future alignment targets

speed, RPM, gear (if visible), start/stop timing, acceleration onset, braking onset, accel→brake reversal

## Methodology (not yet executed)

clock offset estimation, drift estimation, anchor residuals, speed bias, MAE, RMSE, onset latency, steady-speed agreement

**No alignment metrics are reported until the actual video file is ingested and SHA-verified.**

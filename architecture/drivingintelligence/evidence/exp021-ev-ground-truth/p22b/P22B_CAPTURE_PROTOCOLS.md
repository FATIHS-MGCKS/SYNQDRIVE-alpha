# P22B — Minimum capture protocols (independent validation)

Safety: no dangerous maneuvers; camera mounted and started **before** driving; no operation while vehicle is moving.

## HALT_WITHOUT_SIGNAL

Parked/stop away from signalized intersection; dashcam + fixed UTC reference (NTP/phone network time photo at start); 60s include full stop with readable speed; passenger operates camera before drive.

## SLOW_ROLL_NO_FULL_HALT

Approach junction or yield; maintain 2–5 km/h for ≥15s without complete stop; single continuous clip; UTC sync at start; avoid camera handling while rolling.

## STOP_AND_GO

Two full stop→go cycles in one clip; visible speed display; honk/mark at stop line optional; UTC reference at clip start; post-drive only review.

## MOVEMENT_DURING_GAP

Drive through area with known GPS drop-out or sparse uplink segment; continuous video showing speed >0 throughout gap; log clip start against UTC; do not use map-only inference.

## MANEUVER_RETURN_SAME_POINT

Low-speed forward-reverse-forward in open lot; GPS visible on secondary logging if available; mark UTC at maneuver start; passenger sets camera before maneuver.

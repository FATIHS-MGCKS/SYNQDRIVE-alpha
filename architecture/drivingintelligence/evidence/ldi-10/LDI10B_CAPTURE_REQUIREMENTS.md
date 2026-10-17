# LDI10B — Capture requirements (independent Ruptela test drive)

## Required

1. **Dense GPS positions** (≤1 Hz sustained, no 7s waypoint gaps) for L3/QC on event windows.
2. **S4 pin** with POSITION + R1_OBD channels for same trip (owner-approved backfill).
3. **Native TELEMETRY_EVENTS** incl. accel/brake/corner with provider timestamps.
4. **Time sync record** — independent UTC reference (video clap / GNSS log) to bound bucket uncertainty.

## Optional (not in current pin)

- Brake pedal / master cylinder pressure (not inferable from decel).
- HV regen torque (not inferable from decel).
- IMU longitudinal accel (independent of DIMO path).
- Dashboard video for human context only.

## Success criteria

- Trip with both native accel **and** brake events **and** assessable multi-stream seconds ≫ 28.
- Event-rich historical trip `a682d3df…` or new drive with boundary admission for S4 discovery.
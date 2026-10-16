# LDI09 — Next capture requirements

1. **Event matrix trip:** need S4 pin **and** native accel/brake events on same vehicle (LDI-06/07 gap on `a682d3df…`).
2. **Dense GPS:** 7s waypoint cadence invalidates strict 1 Hz QC on historical trips without provider re-fetch (no interpolation).
3. **Fusion assessable surface:** only **28** s on this pin — expand with trips where HF/OBD numeric buckets align with trusted L3 each second.
4. **Conflicts:** 0 UNRESOLVED L3/OBD conflicts need owner policy or independent witness — not auto-merge.
5. **Cornering:** 2 provider corner events — bearing witness descriptive only; video or independent IMU not in pin.
6. **Brake pedal / regen:** not available in frozen pin — do not infer from deceleration candidates.

No production mutations, provider calls, or threshold changes in this workstream.
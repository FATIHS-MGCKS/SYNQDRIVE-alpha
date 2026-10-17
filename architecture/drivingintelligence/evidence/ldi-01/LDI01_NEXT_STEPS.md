# LDI01 — Next Steps

1. **LDI-02 (done — architecture):** `architecture/drivingintelligence/evidence/ldi-02/LDI02_RUPTELA_FUSION_FEASIBILITY.md` — GPS-L3-first fusion rules; pin multi-stream Ruptela export next.
2. **LDI-03 (proposed):** Read-only HF export on one **new** independent Tesla capture (power + speed + position), no threshold tuning.
3. **Ruptela slice:** Pin one LTE_R1 trip S4 combined snapshot + `DrivingEvent` overlap table (offline DB export if owner approves).
3. **P23 field protocol:** Use `exp021-ev-ground-truth/p22e/P23_FIELD_CAPTURE_READINESS.md` for longitudinal labels.
4. **Do not** conflate EXP021 halt v0_2 with accel/brake/regen product detectors.
5. **Design-only:** If regen product claims are needed, extend `driving-intelligence-v2-canonical-design.ts` epistemics before code.
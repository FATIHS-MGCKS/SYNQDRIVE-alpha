# LDI-10D Phase 3C — Architecture & baseline

## Speed authority

- **GPS / L3 (`LOCATION_DERIVED_SPEED_ESTIMATE`)** remains the numeric speed authority.
- OBD/HF on trip `f3e1fa83…` are **witness-only** comparisons, not automatic ground truth.
- Video tacho (EXP021 Kompakt) is an **independent reference witness** with quantized 1 s clock uncertainty.

## Production L3 (frozen pilot)

Implementation: `evaluateL3AtCenter` in `core/kinematics/l3-eligibility.ts`.

- Support window: calendar **t−1 s, t, t+1 s** (not adjacent array rows).
- Speed = mean of two adjacent leg speeds (haversine / Δt) when all support positions are eligible.
- Abstains on ROW_ABSENT, hold/frozen/release, gaps, duplicate bucket labels.

## Position pipeline (S4 / DI-V0)

- `classifyPositionRows` → hold/release/frozen states before L3.
- QC / V2 shadow paths are **unchanged** in this phase (read-only replay).

## Calibration stands (do not mix)

- **Video reference:** EXP021_V0_2_FROZEN_PRE_DEPLOY_BASELINE · snapshot `DI_V0_S4_EVIDENCE_V1:sha256:c703e9c41e5e65ab643f9416c469818d88a0fbfa93218885d7c5beb6fa284503`.
- **LDI-10D trip pin:** LDI08 combined snapshot sha256 `effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009`.

## Historical video metrics reproduction

Paired TRUSTED L3 vs tacho: n=748, MAE=2.3031 km/h, P95=4.4830 km/h, bias=-2.0676 km/h.

L3 replay vs pinned LDI08 (trip f3e1fa83…): n=307, MAE=2.164e-15 km/h.

# LDI01 — Architecture Audit (Existing Longitudinal Logic)

**Scope:** Read-only code + artifact review. Separate from EXP021 v0_2 halt workstream.

## GPS speed reconstruction

| Layer | Path | Production active? |
|-------|------|------------------|
| **L3 (DI V0 core)** | `backend/src/modules/vehicle-intelligence/driving-intelligence/core/` | Library + shadow/S4 replay paths; not customer-facing alone |
| **L3 + QC V2** | `trip-speed-quality/`, `speed-qc/di-v0-speed-qc-*.ts` | Pinned in EXP021 pre-deploy replay (`775/1136` trusted numeric) |
| **Legacy HF speed** | `DimoSegmentsService.fetchHighFrequency()` → `hf-preprocessing.ts` | **Yes** — post-trip behavior enrichment |

## L3/QC V1 vs V2

- **QC policy:** `DI_V0_SPEED_QC_POLICY_V2` on EXP021 Tesla pin (`pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json`).
- **Motion states:** `STATIONARY_SUPPORTED`, `TRANSITION_UNCERTAIN`, `NO_MOTION_EVIDENCE` — see `di-v0-p21-r3-forensic-classify.ts`.
- **Product read / admission:** gated (`ADMISSION_RECORD_MISSING` on pin) — forensic replay still valid.

## EXP021 video ground truth

- Tesla: `external-video-review-kompakt-2026-10-16/` — **development reference only** (6 clips).
- RD003: sparse speed labels; UTC blocked (P22D). Not used as detector input.

## Acceleration / braking (production)

| Component | File | Role |
|-----------|------|------|
| HF acceleration detector | `trips/hf-acceleration.ts` | Point-pair kinematics on 1s HF; LIGHT–EXTREME |
| HF braking detector | `trips/hf-braking.ts` | Same; intensity score |
| Behavior enrichment worker | `trip-behavior-enrichment.processor.ts` | Queues HF fetch + detectors |
| LTE R1 native events | `lte-r1-behavior-enrichment.service.ts` + `driving-events.query.ts` | `behavior.harsh*` events |
| Driving impact | `driving-impact-braking-provenance.ts` | End-speed provenance (measured vs proxy) |
| Brake health | `brakes/brake-health.service.ts` | Harsh brake wear multipliers (not longitudinal physics) |

## DIMO mappings

- Segments + HF: `backend/src/modules/dimo/dimo-segments.service.ts`
- Driving events GraphQL: `backend/src/modules/dimo/queries/driving-events.query.ts`
- Battery / traction power: `dimo-battery-signal.mapper.ts` (W→kW convention documented in Prisma comments)

## Tesla software integration (token 186946)

- Source family: **API_SYNTHETIC** (DIMO software integration).
- Frozen EXP021 S4 pin: **POSITION only**; R1 OBD **NOT_APPLICABLE**; native events **DISABLED**.

## Ruptela R1

- DI V0 R1 OBD query **V0_3**: speed, rpm, throttle, engine load, ECT (`r1-obd-acquisition/`).
- Production behavior events via LTE_R1 path (see `CURRENT_STATE.md`).

## HV battery / EED

- **HF recuperation summary:** `trips/hf-recuperation.ts` + `trip-behavior-enrichment.service.ts` (positive kW × time while speed ≥8 km/h).
- **EED:** `vehicle-intelligence/energy-events/` + DIMO `segments(mechanism: refuel|recharge)` — fuel/charge episodes, **not** on-road regen attribution.

## Driving Intelligence V2

- Flag `DRIVING_INTELLIGENCE_V2_ENABLED` — code default false; production may be true (`CURRENT_STATE.md`).
- **LDI-01 does not activate or extend V2.** Design notes on regen ambiguity: `driving-intelligence-v2-canonical-design.ts`.

## DI V0 S4 / shadow

- Position acquisition + R1 adapters are **dormant libraries**; S4 execution not authorized for new product logic in this task.

# R1 — Signal capability catalog (index)

Full per-vehicle matrices remain in historical Phase 2B–2F audits under `docs/audits/`. R1 does **not** duplicate 41-signal tables; it records **architecture** and **pointers**.

## Layers

| Layer | Description |
|-------|-------------|
| RAW DIMO / VSS field names | Query builders (`latest-vehicle-snapshot.query.ts`, `high-frequency.query.ts`, …) |
| `CAN_*` / normalized keys | VDC + health mappers |
| Feature consumers | Trip FSM, DI, Battery V2, EED, tank detection, tires, brakes |

## Capability preflight

| Mechanism | Gates queries dynamically? |
|-----------|----------------------------|
| `availableSignals` + `dataSummary` (Q018–Q019) | **NO** for driving acquisition — diagnostic persistence only (**CONFIRMED** Phase 2A + R1) |
| Battery capability preflight (Q020) | **PARTIAL** — battery domain only |
| DI `dimo-available-signals-preflight.service.ts` | Planner input; does not reshape Q001 |

## Hardware profiles (evidence locations)

| Profile | Audit / manifest references |
|---------|----------------------------|
| Ruptela LTE R1 | `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json` |
| Smart5 | Phase 2F capability strategy doc |
| Tesla/OEM | Partial in reference-capture / EXP-021 evidence |
| KS MS 661 | R9 wake evidence |

## Q001 static mismatch

Phase 2B: **65.6%** static selection mismatch on ICE audit set — still architecturally valid at R1 (**HISTORICAL** metric; re-measure in R2).

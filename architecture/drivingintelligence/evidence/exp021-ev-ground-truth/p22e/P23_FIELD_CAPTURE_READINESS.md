# EXP021 P23 — Field Capture Readiness

**Scope:** Independent new reference capture for blind validation. **Not** a repeat of the 2026-10-16 development Tesla trip (`358d0158-…`).

## Vehicle & integration

- **Vehicle:** Tesla Model 3
- **DIMO token:** `186946` (or successor token documented before capture)
- **Trip type:** New independent drive; org/vehicle IDs recorded at capture time

## Capture requirements

1. **UTC synchronization** — traceable time source (e.g. NTP-disciplined device clock) plus **verifiable sync marker** (photo of UTC reference + cluster clock, or documented sync event in reference-capture session).
2. **Original video** — container files with **unmodified metadata** (`creation_time`, filename, hash) retained; SHA-256 logged at ingest.
3. **Camera** — fixed mount; **no interaction** with phone/camera while driving.
4. **Rolling shutter** — recording **starts before** physical departure and **ends after** confirmed stop (covers trip prefix/suffix; no pre-video blind field like RD003/Tesla 101 s gap).
5. **Parallel evidence** — video tacho visibility, UTC reference, and **manual event log** (halt, gap, maneuver) with timestamps.
6. **No induced telemetry faults** — no intentional GPS disable, airplane mode games, or provider sabotage.
7. **Ground-truth labels** — defined **before** running frozen v0_2 on the new trip; labels must not copy EXP021 detector outputs.
8. **v0_2 execution** — run **only after** dataset + hashes + manifest are sealed (same freeze hash `dc4339e7…` until owner opens v0_3).

## Target states (five)

| # | State | Capture intent | If missing |
|---|--------|----------------|------------|
| 1 | Halt without traffic signal | Long tacho-0 or near-0 with GPS present | `NOT_OBSERVED` |
| 2 | Slow-roll | 1.5–5 km/h geometry / tacho 1–3 without full stop | `NOT_OBSERVED` |
| 3 | Stop-and-go | Clear stop then launch within <60 s | `NOT_OBSERVED` |
| 4 | Natural data gap during movement | ROW_ABSENT while video shows movement | `NOT_OBSERVED` |
| 5 | Maneuver / reverse | Parking, U-turn, reverse segment | `NOT_OBSERVED` |

## Gates (separate)

| Gate | Pass criteria |
|------|----------------|
| **G1 Capture quality** | Full-trip video; stable mount; readable tacho; hashes logged |
| **G2 UTC validation** | Independent UTC anchors per clip/trip; residual < agreed bound (e.g. 2 s) |
| **G3 Ground-truth coverage** | All five states observed or explicitly `NOT_OBSERVED` with reason |
| **G4 Replay evaluation** | Baseline parity optional on new trip; **blind** compare labels vs v0_2/L3 only after G1–G3 |

## Explicit non-goals

- No algorithm tuning on this capture before blind review.
- No production deploy or trip-boundary mutation from P23 prep.
- Ruptela hardware validation remains a **separate** campaign (not this Tesla software pin).

## Handoff from P22E

- Development trip explains **why** 775/1136 and 0 numeric recovery; P23 must **prove** generalization.
- RD003 UTC remains blocked until owner MP4+metadata (see P22D).
# EXP021 P22E — Pre-P23 Decision Brief

## Explained from today’s Tesla development trip (diagnostic only)

- L3/QC V2 numeric coverage **68.22%** with disjoint bucket parity (775/1136 trusted numeric).
- Why **45** PRESENT centers lack numeric: L3 support crosses ROW_ABSENT (Group A, 45/45).
- Why **32** TRANSITION_UNCERTAIN: abstained numeric with fresh support — state-only refinement conceivable, **0** trusted numeric recovery.
- Why **135** video tacho=0 ≠ V2 stop band: mostly ROW_ABSENT / incomplete support.
- v0_2 retrospective labels on gaps **≠** independent halt proof (002/003/008 documented).

## Requires independent new video evidence

- RD003 nine clips UTC sync (P22D blocked).
- GAP_EVT_002/003 pre-video windows.
- Decisive halt proof inside natural gaps where only geometry fired.

## Requires different telemetry channel

- Wheel speed / gear / park state (not in pinned Tesla DIMO software S4 manifest).
- Ruptela hardware path — **out of scope** for this Tesla pin; separate campaign.

## What another Tesla software-DIMO test would prove

- Whether admission + unchanged boundaries reproduce same 775/1136 pin.
- Whether new captures with sync markers improve **independent** halt/slow-roll validation (not hit-rate tuning on same video).

## P23 readiness

**CONDITIONAL** — proceed with P23 **field protocol** and independent capture; **do not** treat this trip as blind validation or justify v0_3 thresholds from it.
# Battery V2 — Domain Intent

**Epistemic status:** INFERRED (from product architecture rules + code structure)  
**Not verified exhaustively in this bootstrap.**

## Purpose

Battery V2 is the **canonical, multi-tenant, vehicle-centric** low-voltage (LV) and high-voltage (HV) battery health pipeline for SynqDrive. Stage 1 focuses on:

- **Shadow collection** of REST-window LV measurements after trip end
- Durable session/target lifecycle with reconciliation
- Conservative quality policies (no fabricated measurements)
- Foundation for future assessment and publication layers

## Non-goals (Stage 1)

- Auto-publishing health conclusions to operators without explicit flag enablement
- Historical backfill or silent repair of legacy mis-bound sessions at reconciliation scale
- Replacing all legacy `battery_features` surfaces in one step

## Vehicle-centric anchor

Trips are operational anchors. LV Rest Windows are keyed to **trip end time** when an authoritative finalized trip is known.

## Scientific posture

Battery V2 is an **open engineering workstream**. Unknowns and non-effects of fixes are first-class knowledge, not omissions.

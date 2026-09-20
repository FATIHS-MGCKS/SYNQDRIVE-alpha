# EED RFRF F10.6.8-A.2 — P21 irreversible canonical pinning regression alignment

**Date:** 2026-09-20  
**Base main:** `636fdd2eb6cf79415704641ea12a8c1282d5ed00` (#1702 merged)  
**Scope:** PostgreSQL integration contract only (no runtime flag or Production change)

## Problem

After F10.6.8-A.1 (#1702), runtime correctly pins `FINAL_CANONICAL` when an irreversible consumed owner matches the current chooser on a late SAME sibling with closed settlement and COMPLETED enrichment. P21 in `raw-fuel-refuel-fallback-f5-pr3-g2-handoff.postgres.integration.spec.ts` still asserted `INSUFFICIENT_EVIDENCE` forever.

## Change

- **P21:** Assert A.1 pinning invariants (same canonical owner, single enrichment-eligible owner, no duplicate enrichment, audit reason `irreversible_canonical_pinned_after_late_sibling`, `late_sibling_after_finalization` in `reasonCodes`).
- **P21B:** PostgreSQL negative control — canonical challenger (A≠B) remains fail closed.

## Runtime micro-closure (A.2)

- `evaluateIrreversibleCanonicalPinning` rejects pin when **more than one** component member is observed after the irreversible owner’s settlement close (P24 multi-late ambiguity preserved).

## Gates

- `rfrf-f5-pr3-g2-handoff-gate.sh` (via F9 bundle in Stage-3 / Stage-4)
- `physical-refuel-f10-6-8-a.spec.ts`, `physical-refuel-f10-6-8-a1.spec.ts` (unit regressions)

## Production

No deploy, no flag change, Stage 5 not authorized.

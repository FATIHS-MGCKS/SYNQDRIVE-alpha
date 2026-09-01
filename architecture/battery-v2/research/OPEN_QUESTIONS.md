# Battery V2 — Open Questions

Stable gap IDs (`BAT-V2-GAP-*`). Machine nodes in `graph/nodes.yaml`.

## Liveness / lifecycle

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | What is the intended recovery for `RUNNING` target metadata when Bull job is gone after handler crash? | CONFIRMED gap (#1445 remaining risk) |
| `BAT-V2-GAP-SKIPPED-REST-001` | When is `SKIPPED` set and is it terminal for reconciliation? | UNKNOWN |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | Is `lvBatteryObservedAt` absent on reachable classify payloads; do fallback rows enter REST evaluation? | UNKNOWN |

## Trip binding / bridge

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Full semantics when no authoritative finalized trip — ±120s resolution edge cases | INFERRED (architecture memo only) |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV signal authority and assessment model | UNKNOWN |
| `BAT-V2-GAP-CONSUMER-READ-001` | Which UI/API paths read canonical vs legacy battery data | UNKNOWN |

## Execution / policy

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Redis lock fail-open rationale on Battery V2 enqueue paths | UNKNOWN |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Provenance for physical/policy thresholds (speed 0.5, load 5, grace 30m) | UNKNOWN |

## Stage 2 / publication

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-PUB-READINESS-001` | Exact gates for enabling publication/readiness in production | INFERRED from flags only |

## Contradictions

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | Does LV timestamp fallback violate REST providerTimestamp evidence semantics in production? | CONTRADICTED / UNRESOLVED |

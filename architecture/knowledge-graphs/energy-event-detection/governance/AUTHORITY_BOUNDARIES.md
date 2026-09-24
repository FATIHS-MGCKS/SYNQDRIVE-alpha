# KG-EED Authority Boundaries

**Purpose:** Zero silent ownership overlap with KG-ATE and external graphs.

## Authority matrix

| Domain | Classification | Canonical owner | EED may state | EED must NOT state |
|--------|----------------|-----------------|---------------|-------------------|
| REFUEL detection semantics | EED_OWNS | KG-EED | Persist gate, coalesce, rise derivation | Trip FSM rules |
| RECHARGE detection semantics | EED_OWNS | KG-EED / **ERD** | Physical charge session lifecycle, native>fallback, projection contract | Trip FSM rules |
| RECHARGE product projection (`VehicleEnergyEvent.RECHARGE`) | EED_OWNS | KG-EED / **ERD** | Idempotent projection from canonical session (post-cutover E5) | Independent physical authority after cutover |
| `durationSeconds` REFUEL meaning | EED_OWNS | KG-EED | Detection envelope, not pump time | Trip wall-clock duration |
| `fuelLevelRise*` semantics | EED_OWNS | KG-EED | Observed telemetry transition | Physical nozzle duration |
| Sibling reconciliation | EED_OWNS | KG-EED | Token-scoped REFUEL delete rules | Trip row deletion |
| Coalesce prune authority | EED_OWNS | KG-EED | Requires coalesce provenance | Arbitrary overlap delete |
| VehicleEnergyEvent schema | EED_OWNS | KG-EED | Fields, upsert identity | VehicleTrip schema |
| Energy API DTO | EED_OWNS | KG-EED | EnergyEventDto contract | Behavior enrichment DTO |
| Trip timeline energy card UI | EED_OWNS | KG-EED | REFUEL vs RECHARGE presentation | Full timeline shell layout |
| `detectEnergyEvents` invocation | EED_REFERENCES_EXTERNAL | KG-ATE | "Runs when reconcile step 5 runs" | Reconciliation repair logic |
| Scheduler cadence / leader | SHARED_INFRASTRUCTURE | KG-Scaling-Process / ATE | Indirect detect cadence | Leader lease algorithm |
| Reconciliation mutex | SHARED_INFRASTRUCTURE | KG-Scaling-Process / ATE | Detect inside mutex scope | Mutex TTL implementation |
| DIMO provider budget | SHARED_INFRASTRUCTURE | KG-Scaling-Process | Fetches use gateway | Budget algorithm internals |
| DimoSegmentsService | SHARED_INFRASTRUCTURE | DIMO module | Energy + fuel sample queries | HF/repair segment ownership |
| Battery V2 HV charge session **code location** | SHARED_INFRASTRUCTURE | Battery V2 module tree | Implementation host for persist/ingest services | ERD physical semantics |
| Canonical physical EV charge session | EED_OWNS | **ERD** (EED sub-domain) | `HvChargeSession` semantic model; native>fallback; one episode invariant | Battery health scoring / SOH |
| Battery V2 analytics | EED_REFERENCES_EXTERNAL | Battery V2 | Consumes session evidence for capacity/M3 | Physical episode ownership |
| ClickHouse fuel sample mirror | OUT_OF_SCOPE | Analytics | — | CH adoption policy |

**AUTHORITY_CONFLICTS: 0** (explicit assignment per `ATE_EED_BOUNDARY_MAP_2026-09-01.md`)

## Cross-graph contract

### KG-ATE (Automatic Trip Enrichment)

```
ATE: MAY_TRIGGER detectEnergyEvents (reconciliation step 5, isolated try/catch)
EED: OWNS detection, persistence, REFUEL/RECHARGE semantics, sibling reconciliation
```

EED graph references: `EED-EXT-001`  
ATE graph references: `ATE-EXT-006` (KG-EED)

**Forbidden in KG-EED:** Documenting behavior enrichment FSM as EED-owned.  
**Forbidden in KG-ATE:** Canonicalizing REFUEL/RECHARGE field semantics (already merged in PR #1484).

### KG-Scaling-Process

```
EED: uses provider gateway/budget and inherits scheduler-gated reconcile cadence
Scaling Process: OWNS algorithms, limits, multi-replica deployment gates
```

### Battery V2

```
ERD (EED): OWNS canonical physical EV/PHEV charging episode semantics (Model A)
Battery V2: CONSUMES HvChargeSession evidence for HV capacity / health analysis
VehicleEnergyEvent.RECHARGE: PRODUCT_PROJECTION for trips timeline (post E5 cutover)
Code remains under battery-health/hv-charge-session/* until optional move; semantics owned by ERD
See EED-DEC-ERD-001 and decisions/ERD-E1-CANONICAL-PHYSICAL-CHARGE-AUTHORITY-2026-09-24.md
```

## External authority nodes (graph)

| Node ID | Authority |
|---------|-----------|
| EED-EXT-001 | KG-ATE |
| EED-EXT-002 | DIMO Provider Gateway / Budget |
| EED-EXT-003 | Battery V2 |
| EED-EXT-004 | Scheduler leader + reconciliation mutex |

## Deferred ATE topics (reference only)

| Topic | Owner | EED action |
|-------|-------|------------|
| FM-007 workers-disabled stuck PENDING | KG-ATE | Reference only; do not repair |
| Multi-replica scheduler assumptions | KG-ATE | EED inherits indirect cadence |

## Discovery boundary map

Full cross-graph relations (18): `architecture/knowledge-graphs/discovery/ATE_EED_BOUNDARY_MAP_2026-09-01.md`

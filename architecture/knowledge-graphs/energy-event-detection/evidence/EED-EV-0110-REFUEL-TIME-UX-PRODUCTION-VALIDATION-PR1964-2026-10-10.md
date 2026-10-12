# EED-EV-0110 — REFUEL Time UX Production Validation (PR #1964, 2026-10-10)

**Classification:** PRODUCTION_OBSERVATION + PRODUCT_API_READ  
**Production release:** `20261010184619_v4994`  
**Production SHA:** `7f47c9f5b5e35c425deb3c2b6bdaed9df73e5c7c` (merge PR **#1964** on `main`)  
**Predecessors:** Product timeline anchor + trips-tab display semantics (same release family); RFRF OQ-014 R4A **EED-EV-0109** (unchanged calibration posture)

## Safety attestations

| Attestation | Value |
|-------------|-------|
| PRODUCTION_DB_WRITES | **0** (validation read-only) |
| PRODUCTION_DEPLOY / RESTART | **Completed before this evidence** — no further ops in this workstream |
| PRODUCTION_NUMERIC_CAPS_SELECTED | **NO** |
| RFRF calibration population mutation | **NO** |

## 1. Event identity (independent identifiers)

| Field | Value |
|-------|-------|
| Vehicle label | **WOB L 7503** |
| `vehicleId` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| DIMO `tokenId` | **192922** (historical audits) |
| Calendar day (operator) | **2026-10-09** (Europe/Berlin) |
| Canonical product energy event | `412f17f7-7380-4dd0-8e24-6939be4809d6` |
| Suppressed sibling (raw persistence) | `5ba5a03c-8713-47c2-9373-a744e1bce30e` |
| Physical reconciliation | `SAME_PHYSICAL_REFUEL` on both rows; `canonical_event_id` → `412f17f7…`; `finality_state` **FINAL_CANONICAL** |

## 2. Evidence layers (do not conflate)

| Layer | Source | What it proves | Limits |
|-------|--------|----------------|--------|
| **A — Product API semantics** | Read-only replay of production `listCanonicalEnergyEvents` + `listEnergyEventsRaw` on live Postgres using release `7f47c9f5b` dist (equivalent to authenticated `GET …/energy-events` handler) | Canonical **1** REFUEL; raw envelope filter **2** REFUEL rows preserved | Not a substitute for Clerk-authenticated HTTP trace; equivalent service path |
| **B — Persisted row fields** | Production Postgres `vehicle_energy_events` | Rise start/end, envelope, `fuel_delta_liters` | Does not prove pump receipt |
| **C — Station enrichment** | `vehicle_energy_event_fuel_station_enrichments` joined to canonical + sibling rows | Resolver output surfaced to product DTO | OSM match ≠ ground-truth receipt |
| **D — Authenticated UI** | Operator live screenshot (external to git) | Primary time ~**20:48** Berlin; rise **20:48–20:55**; **+18.0 L**; station **WK Tank, Eisenschmiede, Kassel**; timeline order between trips **20:43–21:09** and **19:44–19:53** | Screenshot not committed in this repository; cite as **OPERATOR_UI_EVIDENCE** |
| **E — Independent fuel receipt** | **NOT RECORDED** | — | **No pump receipt, POS slip, or fleet card extract** archived for this event in EED authority |

**Ground truth rule:** Layers A–D support **product correctness** for time, deduplication, quantity telemetry, and station projection. Layer **E** is required before treating quantity or location as **calibration-grade ground truth** (R4A/R4B population).

## 3. Verified product read (layer A + B)

**Date filter (Berlin local day → UTC window used by trips date picker semantics):**

- `from` = `2026-10-08T22:00:00.000Z`
- `to` = `2026-10-09T21:59:59.999Z`

| Check | Result |
|-------|--------|
| Canonical REFUEL count | **1** (`412f17f7…`) |
| Raw REFUEL count (envelope `startTime` filter) | **2** (`412f17f7…`, `5ba5a03c…`) |
| `fuelLevelRiseStart` | `2026-10-09T18:48:52.000Z` → **20:48** Europe/Berlin |
| `fuelLevelRiseEnd` | `2026-10-09T18:55:22.000Z` → **20:55** Berlin |
| Detection envelope (`startTime` / `endTime`) | `2026-10-09T17:32:52.000Z` – `2026-10-09T19:09:14.000Z` → **19:32–21:09** Berlin — **secondary** to rise in UI contract |
| `fuelDeltaLiters` (canonical row) | **18** |
| Product-anchor post-filter | Canonical event retained in window via rise anchor (not envelope-only exclusion) |

## 4. Station enrichment (layer C)

Both persisted REFUEL rows carry identical enrichment (expected for siblings):

| Field | Value |
|-------|-------|
| `station_name` | **WK Tank** |
| `address` | **Eisenschmiede, 34127 Kassel** |
| `match_confidence` | **MEDIUM** |
| `resolution_status` | **MATCHED** |

This is the first **natural post-G2.2** WOB L 7503 observation of a **MATCHED** station on a production REFUEL row in Tankstellenerkennung evidence (see **FST-EVID-WOB-7503-PRODUCTION-REFUEL-2026-10-09-001**).

## 5. Timeline context (layer D + trip rows)

Production `vehicle_trips` on the same local day (Berlin):

| Trip `id` (prefix) | Start (Berlin) | End (Berlin) |
|--------------------|----------------|--------------|
| `efad939c…` | 20:43 | 21:09 |
| `d836fe46…` | 19:44 | 19:53 |

**UI contract (post-#1964):** After `normalizeTimelineItems`, descending order is **20:43 trip → refuel (~20:48) → 19:44 trip**. Operator screenshot confirms; API-only `buildTripsTimeline` merge sort still keys refuel on envelope `startTime` — frontend re-sort is intentional.

## 6. RFRF / calibration campaign linkage

| Topic | Status |
|-------|--------|
| Natural refuel suitable for **UX / product** closure | **YES** (this evidence) |
| Automatic addition to OQ-014 **authoritative calibration population** | **NO** — requires **FULL_REPLAY** spine + R4B promotion gate per **EED-EV-0109** §D–E |
| **EED-OQ-014** | **OPEN** — numeric caps still open; **CALIBRATION_INSUFFICIENT** unchanged |
| **EED-OQ-019** | **PARTIALLY_RESOLVED** — hybrid activation unchanged; durable calibration store still open |

## 7. Next natural campaign

See **governance/NATURAL-REFUEL-VALIDATION-PROTOCOL-2026-10-10.md** (read-only acquisition checklist).

## Validation (documentation)

```bash
node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
bash architecture/tankstellenerkennung/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
```

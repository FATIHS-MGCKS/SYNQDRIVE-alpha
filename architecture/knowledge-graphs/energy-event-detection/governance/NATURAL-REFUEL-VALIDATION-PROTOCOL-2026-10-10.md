# Natural REFUEL validation protocol (read-only)

**Effective:** 2026-10-10  
**Owner:** KG-EED (product + RFRF forensic); Tankstellenerkennung for station enrichment slice  
**Purpose:** Repeatable **read-only** acquisition for future **physical** refuel events — separate **product UX validation** from **OQ-014 calibration population** growth.

## 0. Authorization boundaries

| Action | Allowed in this protocol |
|--------|---------------------------|
| Production Postgres / API **SELECT** / authenticated UI observation | **YES** |
| Production **writes**, redeploy, flag changes, calibration cap selection | **NO** unless separate explicit authorization |
| Adding events to authoritative calibration population without **FULL_REPLAY** | **NO** |

**EED-OQ-014** remains **OPEN**. **EED-OQ-019** remains **PARTIALLY_RESOLVED**. No Production numeric caps are implied by following this protocol.

## 1. Capture checklist (per natural event)

Complete every section; mark **UNKNOWN** / **GAP** explicitly — do not infer.

### 1.1 Independent identity

- Vehicle label, `vehicleId`, org scope, DIMO `tokenId` (if known)
- Local calendar date (timezone stated, default **Europe/Berlin**)
- Canonical product `VehicleEnergyEvent.id` (after reconciliation)
- All raw sibling `VehicleEnergyEvent.id` values
- `dimoSegmentId` per row
- Reconciliation: `classification`, `canonical_event_id`, `finality_state`

### 1.2 Independent ground truth (receipt / operator)

- Pump or fleet-card **receipt timestamp** (local + UTC)
- **Receipt liters** (or mass → liters conversion note)
- Station name/address from receipt (if printed)
- Photo/hash storage location (private ops storage — **no secrets in git**)
- If absent: record **`GROUND_TRUTH_RECEIPT_NOT_RECORDED`** — product telemetry alone is **not** receipt ground truth

### 1.3 Operator-observed refuel window

- Arrival / nozzle on / nozzle off / departure (best effort)
- Location (lat/lon or named POI)

### 1.4 DIMO native detections

- Segment IDs and envelope `startTime` / `endTime`
- Count of native REFUEL rows persisted for the physical episode
- Reconciliation outcome (`SAME_PHYSICAL_REFUEL`, etc.)

### 1.5 Telemetry (absolute / relative fuel)

- `fuelLevelRiseStart` / `fuelLevelRiseEnd` / duration
- `fuelDeltaLiters` / `fuelDeltaPercent` on canonical row
- Absolute fuel level sample continuity (pre-rise baseline, post-rise settling)
- Relative fuel channel if present (note NULL vs populated)
- **Sampling continuity:** max gap inside rise window; gaps between peak and settled window (feeds OQ-014 locality symbols — do not reuse as Production caps)

### 1.6 RFRF candidate lifecycle (if applicable)

- `RawRefuelCandidate` ids / states (OPEN → READY → promoted / held / rejected)
- Hybrid trust outcome per observation (**TRUSTED** / **UNTRUSTED** / **UNKNOWN**)
- Promotion blockers (baseline recency, Option C absolute-only, etc.)
- **False positive:** candidate or native row with no physical refuel — record disposition  
- **False negative:** physical refuel with no canonical product row — record detection gap

### 1.7 Canonical product deduplication

- `listCanonicalEnergyEvents` (or equivalent) count for local day window
- `listEnergyEventsRaw` envelope-filter count for same window
- Confirm **raw rows preserved**, canonical **one episode**

### 1.8 Product UI / API presentation

- Primary displayed time (must cite `fuelLevelRiseStart` when present)
- Rise interval copy vs detection envelope (envelope **secondary** only)
- Reported quantity (+L) vs receipt (if any)
- Station enrichment: name, address, `match_confidence`, `resolution_status`
- Trips timeline order (canonical + fallback paths) for surrounding trips
- Authenticated screenshot or screen recording reference (artifact path or operator attestation)

### 1.9 RECHARGE regression spot-check

- Same vehicle/day or adjacent window: confirm RECHARGE cards unchanged (N/A for ICE-only vehicles — state **N/A**)

## 2. Date filter contract

Use the same local-day bounds as the rental trips date picker:

- Build `from` / `to` via `localDayRangeIso('YYYY-MM-DD')` semantics (browser-local midnight → UTC ISO).
- Document the exact ISO pair used in API calls.
- Compare **canonical product-anchor filter** vs **raw envelope filter** — counts may differ by design.

## 3. R4A / R4B sufficiency gates (calibration population)

From **EED-EV-0109** and **EED-EV-0104** — product validation **does not** satisfy these.

| Gate | Requirement before promoting event into authoritative OQ-014 calibration set |
|------|-------------------------------------------------------------------------------|
| **R4A integrity** | Event accounting row; verified canonical rise attribution (no `UNVERIFIED_EVENT_ANCHOR` for **authoritative** stats) |
| **FULL_REPLAY spine** | Committed sanitized absolute spine JSON per EED-EV-0104 pattern |
| **R4B promotion** | Bounded spine ingestion + fixture promotion gate — expand `COMMITTED_FULL_REPLAY` without runtime activation |
| **Fleet sufficiency** | Still requires broader fleet diversity (≥12 eligible naturals, de-cluster WOB, etc.) before **CALIBRATION_SUFFICIENT** |

Until gates pass: classify new naturals as **`PRODUCT_VALIDATED_ONLY`** or **`FORENSIC_PHYSICAL_EPISODE`** — not **`COMMITTED_FULL_REPLAY`**.

## 4. Evidence packaging

| Artifact | Location pattern |
|----------|------------------|
| EED production observation | `evidence/EED-EV-####-*.md` |
| Machine accounting (if calibration-bound) | `evidence/data/RFRF-OQ014-*.json` |
| Tankstellenerkennung station path | `architecture/tankstellenerkennung/evidence/FST-EVID-*.md` |
| Registry row | `evidence/EVIDENCE_REGISTRY.md` + `history/CHANGELOG.md` |

## 5. Reference closure example

**EED-EV-0110** — WOB L 7503 2026-10-09: product + UI layers closed; receipt ground truth **not** recorded; **not** added to calibration population.

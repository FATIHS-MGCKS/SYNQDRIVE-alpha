# Energy Events E2 — DIMO Detector Calibration (2026-08)

**Phase:** E2 only (detector sensitivity). **Depends on:** E1 transport/prune restoration (merged).  
**Out of scope:** historical backfill, fleet-scale optimization, trip enrichment, driver scoring.

---

## 1. Current detector behavior (pre-E2)

| Mechanism | Query builder | `config` passed | Notes |
|-----------|---------------|-----------------|-------|
| **REFUEL** | `buildEnergyEventSegmentsQuery` | **No** (DIMO default) | Missed KS MX 2024 23-Aug refuel in narrow window |
| **RECHARGE** | `buildDimoRechargeSegmentsQuery` | **No** (DIMO default) | Tesla EV audit: 8 reliable segments Jun 2026 with defaults |

Refuel and recharge use **different query builders** but the same Telemetry `segments(mechanism: …)` API. No per-OEM tables, no hidden fallback config, no `sourceFilter` on refuel path.

---

## 2. DIMO MCP / API findings

**DIMO MCP:** unavailable in Cloud Agent (`mcp-dimo@1.5.5` npm resolution failure — same as audit §10).  
**Live Telemetry API** used instead (same auth path as `DimoAuthService`).

Confirmed `segments` arguments (live, Aug 2026):

| Field | Refuel | Recharge |
|-------|--------|----------|
| `tokenId`, `from`, `to`, `mechanism` | yes | yes |
| `signalRequests` | yes | yes |
| `config: { minIncreasePercent: N }` | **accepted** | **accepted** (no observed effect in Aug sweep) |
| `id`, `limit`, `after` on Segment | **422** | **422** |

Other detector fields (`minAbsoluteLiters`, duration gates, etc.) were **not confirmed** in live queries — not used in E2.

---

## 3. Calibration methodology

1. Read-only live sweep via `scripts/ops/calibrate-energy-event-detectors.ts`
2. Fleet fuel signal inventory via `scripts/ops/e2-fleet-fuel-signal-inventory.ts`
3. Vehicles with DIMO access: KS MX 2024 (`187336`), VW Arteon (`187784`), Audi A4 KS MS 661 (`187361`), VW Tiguan (`192922`), KS FH 660E Tesla (`186946`)
4. Refuel thresholds tested: **default, 2%, 3%, 5%, 7%, 10%** (canonical + monthly + Aug fleet windows)
5. Recharge: DIMO default only (Tesla Jun 2026 re-validated live)
6. SynqDrive persist gate audited: refuel `fuelDeltaLiters > 1.0`; recharge `socDeltaPercent >= 1` OR `energyDeltaKwh > 0`

Artifacts:
- `/opt/cursor/artifacts/e2_energy_detector_calibration_matrix.json`
- `/opt/cursor/artifacts/e2_fleet_fuel_signal_inventory.json`

---

## 3b. Fleet fuel signal capability (Aug 2026, bounded)

| Vehicle | tokenId | Provider | Relative % | Absolute L | Usable history | Class | Calibration candidate |
|---------|---------|----------|------------|------------|----------------|-------|----------------------|
| VW Tiguan ICE | 192922 | LTE_R1 | listed | listed | **no** Aug samples | D | no |
| VW Golf ICE | 190497 | LTE_R1 | — | — | DIMO 403 (no access) | D | no |
| VW Arteon ICE | 187784 | LTE_R1 | yes (159 samples) | yes (191 samples) | yes | **A** | **yes** |
| Audi A4 (KS MS 661) | 187361 | LTE_R1 | **not listed** | yes (238 samples) | yes | **C** | yes (0 refuels Aug) |
| MB C63 (KS MX 2024) | 187336 | LTE_R1 | yes (31) | yes (31) | yes | **A** | **yes** |
| Tesla M3 (KS FH 660E) | 186946 | LTE_R1 | n/a | n/a | n/a (EV) | D | recharge only |

**ICE vehicles with refuel detector calibration evidence:** **2** (KS MX 2024, VW Arteon). Audi contributes signal-capability evidence only (absolute liters; 0 refuel segments in Aug window). Global 5% is a **provisional fleet default** from these calibrated vehicles plus canonical KS MX acceptance — not a large multi-OEM sweep.

---

## 4. Refuel threshold matrix

### KS MX 2024 canonical window (22–24 Aug, tokenId 187336)

| Config | Segments | Canonical segment |
|--------|----------|-------------------|
| default | **0** | — |
| minIncreasePercent: 2 | **1** | 16:15:15–16:23:16 UTC, Δ29.4% |
| minIncreasePercent: 3 | **1** | same |
| minIncreasePercent: 5 | **1** | same |
| minIncreasePercent: 7 | **1** | same |
| minIncreasePercent: 10 | **1** | same |

### KS MX monthly windows (all thresholds identical within each month)

| Window | default | 2% | 3% | 5% | 7% | 10% |
|--------|---------|----|----|----|----|-----|
| Apr 2026 | 3 | 3 | 3 | 3 | 3 | 3 |
| May 2026 | 2 | 2 | 2 | 2 | 2 | 2 |
| Jun 2026 | 2 | 2 | 2 | 2 | 2 | 2 |
| Jul 2026 | 0 | 0 | 0 | 0 | 0 | 0 |
| Aug 2026 | 1 | 1 | 1 | 1 | 1 | 1 |

### VW Arteon ICE (Aug 2026, tokenId 187784)

| default | 2% | 3% | 5% | 7% | 10% |
|---------|----|----|----|----|-----|
| 3 | 3 | 3 | 3 | 3 | 3 |

**Lowest threshold detecting canonical refuel:** **2%**.  
**Production choice:** **5%** — identical segment counts to 2/3/7/10% on all tested KS MX and Arteon windows; fixes default-blind canonical case.

---

## 4b. Refuel persistability gate audit

**Code** (`EnergyEventsService.isSegmentPersistable`):

```typescript
// refuel path
return (segment.fuelDeltaLiters ?? 0) > 1.0;
```

| Scenario | fuelDeltaLiters | fuelDeltaPercent | Persisted? |
|----------|-----------------|------------------|------------|
| Liters-based refuel (KS MX production) | > 1.0 | any | **yes** |
| Small liters noise | ≤ 1.0 | low | **no** |
| Percent-only, large delta | **null** | 29% | **no** (treated as 0 L) |
| Percent-only noise | null | 2.5% | **no** |
| Neither signal | null | null | **no** |

**Fleet evidence:** all accessible ICE vehicles with usable fuel history report **`powertrainFuelSystemAbsoluteLevel`** (Class A or C). No Class B (relative-only with history) in connected fleet. KS MX production events carry 24–35 L (audit confirmed).

**E2 decision:** **no persistence gate change.** Liters gate remains correct for current fleet. Percent-only fallback deferred until a relative-only vehicle with live refuel evidence is connected.

Regression tests added in `energy-events.service.spec.ts` (cases A–E).

---

## 5. Recharge threshold analysis

| Vehicle | Window | default | Result |
|---------|--------|---------|--------|
| KS MX 2024 (ICE) | 22–24 Aug | 0 segments | n/a |
| KS FH 660E (Tesla) | Aug 2026 | 0 segments | no charging in window |
| KS FH 660E (Tesla) | Jun 15–Jul 16 2026 | **8 segments** | **re-validated live** |

**Decision:** keep **DIMO default** recharge detector (omit `config`). Tesla live sweep confirms 8 segments unchanged with default config.

SynqDrive persist gate (`socDeltaPercent >= 1` OR `energyDeltaKwh > 0`) remains **unchanged** — aligned with audit SEGMENT_RELIABLE (≥5% SOC) and filters sub-1% noise.

---

## 6. KS MX 2024 canonical case

| Field | Value |
|-------|-------|
| tokenId | 187336 |
| Date | 2026-08-23 |
| Fuel evidence | ~13% → ~42% relative |
| E2 config | `{ minIncreasePercent: 5 }` |
| DIMO segment | 2026-08-23T16:15:15Z → 16:23:16Z (481 s) |
| fuelDeltaPercent | ~29.4% |
| Fixture | `ks-mx-2024-refuel.fixture.ts` |

---

## 7. False-positive analysis

| Risk | Mitigation |
|------|------------|
| Tank slosh / slope | DIMO segment detector + **5%** threshold (not 2%) |
| Sensor quantization | SynqDrive **liters gate > 1.0 L** (unchanged) |
| Small top-ups | Likely below 5% relative on many tanks — acceptable trade-off |
| Wide-window DIMO merge | Reconciliation uses bounded windows; coalescing handles sub-segments |
| Driving consumption | Refuel detector requires level **increase** |

No additional post-DIMO rules added in E2 — insufficient production evidence for new heuristics.

---

## 8. Final production config

**Strategy A — global default** (chosen):

```typescript
// backend/src/modules/dimo/energy-events/dimo-energy-detector.config.ts
DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG = { minIncreasePercent: 5 }
DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG = undefined  // DIMO default
DIMO_ENERGY_DETECTOR_CONFIG_VERSION = 'e2-2026-08'
```

Wired in:
- `DimoSegmentsService.fetchEnergyEventSegmentsWithJwt` (refuel)
- `DimoRechargeSegmentsClient` (recharge — config omitted)

E1 mechanism isolation and evidence-based prune **unchanged**.

---

## 9. Implementation changes

| File | Change |
|------|--------|
| `energy-events/dimo-energy-detector.config.ts` | Centralized config + renderer |
| `queries/energy-event-segments.query.ts` | Optional `config` arg |
| `recharge-segments/dimo-recharge-segments.query.ts` | Optional `config` arg |
| `dimo-segments.service.ts` | Pass refuel production config |
| `recharge-segments/dimo-recharge-segments.client.ts` | Pass recharge config (undefined) |
| `scripts/ops/calibrate-energy-event-detectors.ts` | Full threshold sweep (default/2/3/5/7/10) |
| `scripts/ops/e2-fleet-fuel-signal-inventory.ts` | Fleet fuel signal capability |
| `scripts/ops/validate-energy-event-dimo-queries.ts` | E2-aware live validation |

---

## 10. Test coverage

- `dimo-energy-detector.config.spec.ts` — config + query shape
- `validate-dimo-segments-query.spec.ts` — E2 refuel config in schema-valid query
- `dimo-segments.energy-events.spec.ts` — refuel query includes config
- `energy-events.service.spec.ts` — KS MX fixture, persist gate A–E, E1 prune/isolation (retained)

---

## 11. Live validation (read-only)

Post-E2 `validate-energy-event-dimo-queries.ts`:

- KS MX 187336 refuel (22–24 Aug): **HTTP 200**, **1 segment** at 16:15–16:23 UTC
- Tesla 186946 recharge (Jun 2026): **HTTP 200**, segments per DIMO default
- No HTTP 422, no GraphQL validation errors

---

## 12. Remaining risks

1. **Wide reconciliation windows** may return DIMO-merged mega-segments (observed Aug full-month) — coalescing/prune bounded to window.
2. **Recharge tuning** deferred — if future vehicles miss sessions, re-run calibration with bounded windows.
3. **DIMO MCP** still broken in agent env — live API used for verification.
4. **OEM-specific thresholds** not yet needed — revisit if fleet evidence diverges.

---

## 13. Backfill readiness

**BACKFILL READY AFTER E2 MERGE** — subject to human review of this evidence gate.

 Preconditions met:
- Detector threshold evidence consistent with docs (default/2/3/5/7/10 live sweep committed)
- Fleet fuel signal capability documented (absolute liters on all calibrated ICE)
- Percent-only persistence behavior understood and tested (no gate change; safe for current fleet)

Historical Jul→Aug backfill is **not executed** in E2. Rate-limited backfill per audit Phase E5 may proceed after merge.

---

## References

- Audit: `docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md`
- E1: `docs/architecture/ENERGY_EVENTS_E1_RESTORATION_2026-08-27.md`
- Tesla recharge audit: `docs/audits/dimo-tesla-hv-signal-capability.md`

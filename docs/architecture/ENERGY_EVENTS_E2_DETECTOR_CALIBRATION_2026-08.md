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
2. Vehicles: KS MX 2024 (`187336`), KS FH 660E Tesla (`186946`)
3. Refuel thresholds: default, 2%, 5% on canonical + monthly windows
4. Recharge thresholds: default, 1–5% on bounded windows (≤32 days)
5. Cross-check against audit live evidence + Tesla HV audit (`dimo-tesla-hv-signal-capability.md`)
6. SynqDrive persist gate retained: refuel `fuelDeltaLiters > 1.0`; recharge `socDeltaPercent >= 1` OR `energyDeltaKwh > 0`

Artifact: `/opt/cursor/artifacts/e2_energy_detector_calibration_matrix.json`

---

## 4. Refuel threshold matrix (KS MX 2024, tokenId 187336)

| Window | default | minIncreasePercent: 2 | minIncreasePercent: 5 |
|--------|---------|----------------------|----------------------|
| **22–24 Aug (canonical)** | **0** | **1** ✓ 16:15–16:23, Δ29.4% | **1** ✓ same |
| Apr 2026 | 3 | 3 (identical) | 3 (identical) |
| May 2026 | 2 | 2 (identical) | 2 (identical) |
| Jun 2026 | 2 | 2 (identical) | 2 (identical) |
| Jul 2026 | 0 | 0 | 0 |
| Aug 2026 (full month) | 1 | 1 (identical) | 1 (identical) |

**Lowest threshold detecting canonical refuel:** **2%**.  
**Production choice:** **5%** — identical results to 2% across all tested windows; matches audit reference; conservative margin without losing the canonical case.

---

## 5. Recharge threshold analysis

| Vehicle | Window | default | minIncreasePercent 1–5 |
|---------|--------|---------|------------------------|
| KS MX 2024 (ICE) | 22–24 Aug | 0 | 0 |
| KS FH 660E (Tesla) | Aug 2026 | 0 | 0 (no charging in window) |
| KS FH 660E (Tesla) | Jun 2026 (audit) | **8 reliable segments** | not re-swept (defaults sufficient) |

**Decision:** keep **DIMO default** recharge detector (omit `config`). Tesla audit shows default detector is reliable; tuning `minIncreasePercent` did not improve Aug window and is unproven for recharge.

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
| `scripts/ops/calibrate-energy-event-detectors.ts` | Calibration matrix tool |
| `scripts/ops/validate-energy-event-dimo-queries.ts` | E2-aware live validation |

---

## 10. Test coverage

- `dimo-energy-detector.config.spec.ts` — config + query shape
- `validate-dimo-segments-query.spec.ts` — E2 refuel config in schema-valid query
- `dimo-segments.energy-events.spec.ts` — refuel query includes config
- `energy-events.service.spec.ts` — KS MX fixture, noise gate, E1 prune/isolation (retained)

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

**E2 establishes detector config + tests + live proof.**  
Historical Jul→Aug backfill is **not executed** in E2.

**Backfill may start after E2 merge** using existing reconciliation/backfill architecture, rate-limited and off-peak per audit Phase E5.

---

## References

- Audit: `docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md`
- E1: `docs/architecture/ENERGY_EVENTS_E1_RESTORATION_2026-08-27.md`
- Tesla recharge audit: `docs/audits/dimo-tesla-hv-signal-capability.md`

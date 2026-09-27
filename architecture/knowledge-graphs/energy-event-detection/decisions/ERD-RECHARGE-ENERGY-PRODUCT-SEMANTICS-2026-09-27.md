# ERD — Recharge Energy Product Semantics (Option C)

**Workstream:** Energy Event Detection (EED) → EV Recharge Detection (ERD)  
**Date:** 2026-09-27  
**Status:** PROPOSED (architecture closure; **no runtime / schema change** in this ADR)  
**Production baseline SHA:** `1b5a7f6cd91d175e82f9ee0df111d4df015b3555`  
**Decision node:** `EED-DEC-ERD-003`  
**Evidence:** EED-EV-0091 (six-session Production energy closure)

---

## 1. Production energy evidence (six canonical sessions)

| Aggregate | kWh |
|-----------|-----|
| Sum of DIMO **charging-added** deltas (`addedEnergyKwh` / session `energyAddedKwh`) | **64.3599985614419** |
| Sum of **stored traction** deltas (`currentEnergyKwh` / legacy `energyDeltaKwh`) | **48.75999891012907** |
| Semantic gap | **15.599999651312828** |

All **6** primary-pair energy mismatches in shadow dry-run are explained by **different DIMO signal semantics**, not a mapping defect in legacy rows.

---

## 2. Decision B1 — lock `energyDeltaKwh` meaning (RECHARGE)

**ENERGY_DELTA_KWH_SEMANTIC=CHANGE_IN_STORED_TRACTION_BATTERY_ENERGY**

`VehicleEnergyEvent.energyDeltaKwh` for **`RECHARGE`** remains:

**Change in stored traction-battery energy** during the physical recharge session.

- Preserves historical legacy behavior (`currentEnergyKwh.delta` semantics).
- Preserves API stability, Trips UI stability, and ~176 historical legacy rows’ meaning.
- Shadow parity compares **like-for-like** stored-energy semantics after canonical mapper alignment.

**Do not** redefine `energyDeltaKwh` to mean provider charging-added energy.

---

## 3. Decision B2 — added charging energy (distinct signal)

**CHARGING_ENERGY_ADDED_KWH_SEMANTIC=PROVIDER_REPORTED_CHARGING_ADDED_ENERGY_DELTA**

Map from DIMO `PowertrainTractionBatteryChargingAddedEnergy` / session `energyAddedKwh` (added-energy delta).

**Do not** label as grid energy, charger-meter energy, energy purchased, or billing energy unless future evidence proves those semantics.

**PREFERRED_NEW_FIELD_NAME=chargingEnergyAddedKwh**

Alternative considered: `energyAddedKwh` — rejected as less explicit about charging context.

---

## 4. Decision B3 — Option C contract

**ENERGY_OPTION_SELECTED=OPTION_C**

| Field | Semantics |
|-------|-----------|
| `energyDeltaKwh` | Stored traction-battery energy delta |
| `chargingEnergyAddedKwh` | Provider-reported charging-added energy delta when available |

The two values **may legitimately differ**. Neither substitutes for the other.

---

## 5. Decision B4 — `HvChargeSession` session authority

Session row already retains:

- `startEnergyKwh` / `endEnergyKwh` — derived from **`currentEnergyKwh` extrema** (provider segment extrema, not necessarily temporal first/last samples)
- `energyAddedKwh` — derived from **`addedEnergyKwh.delta`**

Canonical VEE mapping can expose **both** semantics from persisted session evidence **without** refetching DIMO.

---

## 6. Decision B5 — canonical mapper contract (future)

**CANONICAL_ENERGY_DELTA_MAPPING_CONTRACT_DEFINED=YES**

Future canonical projection for `VehicleEnergyEvent.energyDeltaKwh`:

- Source: stored-energy evidence on `HvChargeSession`
- Prefer explicit helper, e.g. **`deriveStoredTractionEnergyDeltaKwh(session)`**, documenting extrema semantics

**Candidate formula (when both extrema finite):**

```text
max(0, endEnergyKwh - startEnergyKwh)
```

else `null`.

**Accuracy note:** Because `startEnergyKwh` / `endEnergyKwh` hold **provider segment extrema** rather than strict temporal endpoints, documentation and helper naming must state that explicitly — do **not** imply first/last sample subtraction without evidence.

**Not implemented in this ADR.**

---

## 7. Decision B6 — additive product field (future schema)

| Layer | Name |
|-------|------|
| Prisma column | `charging_energy_added_kwh` (`Float?`) |
| DTO / API | `chargingEnergyAddedKwh` |

**Canonical native DIMO RECHARGE:** map from `HvChargeSession.energyAddedKwh` when present.

**Historical legacy RECHARGE:** **nullable** unless reliable distinct evidence exists — **do not fabricate** from `energyDeltaKwh`.

**REFUEL:** always **null**.

**Fallback recharge:** nullable unless fallback source genuinely provides the same semantic.

This ADR: **`PRISMA_SCHEMA_CHANGED=NO`**, **`MIGRATION_ADDED=NO`**.

---

## 8. Decision B7 — historical data policy

**NEW_FIELD_BACKFILL_POLICY=NO_BACKFILL_NO_REINTERPRETATION**

- No conversion `legacy energyDeltaKwh → chargingEnergyAddedKwh` (different signals).
- Historical `chargingEnergyAddedKwh=null` is acceptable.
- Existing no-backfill policy remains unless separately authorized.

---

## 9. Decision B8 — API compatibility

**EXISTING_ENERGY_API_COMPATIBILITY_PRESERVED=YES**

- `energyDeltaKwh` — present, unchanged meaning.
- `chargingEnergyAddedKwh` — additive, nullable.
- No breaking rename, removal, or silent reinterpretation.

---

## 10. Decision B9 — UI contract (future)

Trips timeline **`+{energyDeltaKwh} kWh`** continues to mean **stored traction-battery energy increase**.

Do **not** silently switch that display to `chargingEnergyAddedKwh`.

If both are shown later, use distinct labels (e.g. DE: „Batterieenergie“ vs epistemically precise „Hinzugefügte Ladeenergie“ for provider-reported charging-added energy).

**No UI change in this ADR.**

---

## 11. Decision B10 — billing firewall

**BILLING_GRADE_ENERGY_AUTHORITY=NO**

Neither `energyDeltaKwh` nor `chargingEnergyAddedKwh` is billing-grade electricity consumption. Neither may drive invoice/payment calculations without separate metering authority.

---

## 12. Decision B11 — shadow comparator (after mapper alignment)

- `energyDeltaKwh` shadow parity: **stored vs stored** only.
- **`chargingEnergyAddedKwh` must NOT** be compared against legacy `energyDeltaKwh`.
- Optional future shadow dimension for charging-added energy requires **matching semantic evidence** on both sides.

---

## 13. Decision B12 — canonical cutover gate

Authoritative canonical cutover remains **blocked** until:

1. Comparator topology fix (E5-4A ADR implementation)
2. Canonical `energyDeltaKwh` stored-energy mapper alignment
3. Relevant Postgres tests pass
4. Production dry-run proves **physical** parity

Additive `chargingEnergyAddedKwh` may ship before or after cutover depending on migration/API risk; **semantic contract is fixed now**.

---

## 14. Implementation sequencing (full ERD E5.4 path)

| Step | Work |
|------|------|
| **1** | Comparator topology only (E5-4A) |
| **2** | Canonical `energyDeltaKwh` stored-energy mapper alignment |
| **3** | Full E5.4 dry-run `persist=false` — target: 6 primary comparisons; 0 true `LEGACY_ONLY`; 64 fragment diagnostics; 0 authority-critical/SOC/location mismatches; 0 stored-energy mismatches on `energyDeltaKwh` |
| **4** | Consider persisted shadow parity only after Step 3 clean |
| **5** | Separately: `chargingEnergyAddedKwh` schema/API/UI + dedicated migration |

**Step 5 vs cutover:** not assumed either way — evaluate migration/API risk at implementation time.

---

## 15. Future test design (not implemented)

| ID | Scenario | Expected |
|----|----------|----------|
| **E1** | `currentEnergy` delta ≠ `addedEnergy` delta | Canonical `energyDeltaKwh` uses stored delta |
| **E2** | Added-energy signal present | `chargingEnergyAddedKwh` preserves added-energy separately |
| **E3** | Missing stored-energy evidence | `energyDeltaKwh` null |
| **E4** | Missing added-energy signal | `chargingEnergyAddedKwh` null |
| **E5** | REFUEL row | `chargingEnergyAddedKwh` null |
| **E6** | Historical legacy VEE | Existing `energyDeltaKwh` unchanged |

---

## 16. Readiness (conceptual, post-ADR)

| Gate | Status |
|------|--------|
| `CANONICAL_ENERGY_READINESS` | **BLOCKED_PENDING_IMPLEMENTATION_OF_DECIDED_SEMANTIC** |
| `CANONICAL_IDENTITY_READINESS` | **PASS** |
| `CANONICAL_BOUNDARY_READINESS` | **PASS** |
| `CANONICAL_SOC_READINESS` | **PASS** |
| `CANONICAL_LOCATION_READINESS` | **PASS** |
| `CANONICAL_COVERAGE_READINESS` | **PASS** |
| `PRODUCT_DEDUPE_READINESS` | **PASS_FOR_POST_CUTOVER_NATIVE_IDENTITY** |
| `AUTHORITATIVE_CUTOVER_READINESS` | **BLOCKED** |

---

## 17. Related artifacts

- Topology ADR: `ERD-E5-4A-SHADOW-PARITY-PHYSICAL-EPISODE-TOPOLOGY-2026-09-27.md`
- Evidence: `evidence/ERD-E5-4-FRAGMENT-TOPOLOGY-PRODUCTION-CLOSURE-2026-09-27.md`

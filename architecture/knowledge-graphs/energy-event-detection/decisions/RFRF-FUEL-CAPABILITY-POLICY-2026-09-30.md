# RFRF — Fuel Signal Capability Policy (Alpha + Design)

**Date:** 2026-09-30  
**Status:** **PROPOSED** (normative for Alpha operations; runtime flags unchanged in this ADR)  
**Baseline main:** `45f5369b6aeefa0c91e02148c5c25d069367c058`  

---

## 1. Capability taxonomy (distinct from trust)

| Class | Definition | Detection | Auto fallback VEE promotion (Alpha) |
|-------|------------|-----------|-------------------------------------|
| **DUAL_CHANNEL** | Provider supplies semantically valid **absolute liters** and **relative %** in scan window | Allowed | Allowed **only if** F3 READY + Hybrid Trust v2 **TRUSTED** + activation allowlist |
| **ABSOLUTE_ONLY** | Absolute present; relative absent or never valid in window | Allowed | **BLOCKED** (Option C — approved Alpha policy) |
| **RELATIVE_ONLY** | Relative valid without absolute (theoretical) | Preserve current detector channel behavior | **BLOCKED** unless absolute path matures (document fail-closed) |
| **NO_FUEL_SIGNAL** | Neither channel admissible | Not eligible | **BLOCKED** |

**Do not conflate** capability class with `RawFuelAbsoluteSignalTrust` or Hybrid Trust classification.

---

## 2. Approved Alpha policy #2 — ABSOLUTE_ONLY

- RFRF **may detect**, persist, and audit `RawRefuelCandidate` rows.
- **Automatic fallback VEE promotion remains blocked.**
- Missing relative fuel **must not** be bypassed via derived `absolute/tankCapacity` percent.
- **Hybrid Trust v2 unchanged.**
- KS MS 661 natural candidate remains historical evidence — **no manual promotion**.

---

## 3. Fleet snapshot (FMS gasoline LTE_R1, Production read-only 2026-09-30)

| Masked vehicle | Capability (provider) | Hybrid v2 auto-promote eligible |
|----------------|----------------------|----------------------------------|
| HMÜ C 215 | DUAL_CHANNEL | Yes (when READY + TRUSTED) |
| **KS MS 661** | **ABSOLUTE_ONLY** | **No** |
| KS MX 2024 | DUAL_CHANNEL | Yes |
| WOB L 7503 | DUAL_CHANNEL | Yes |
| WOB L 9755 | DUAL_CHANNEL | Yes (no RFRF rows yet) |

**Scope:** Relative absence on KS MS 661 is **vehicle-specific** (token 187361), not entire LTE_R1 cohort.

---

## 4. EED-OQ-019 linkage

Hybrid Trust scoped Production activation (EED-EV-0102) is **complete**.  
Absolute-only auto-promotion **intentionally blocked** pending future **absolute-only trust authority** (separate design).  
OQ-019 remains **PARTIALLY_RESOLVED**.

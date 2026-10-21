# RFRF — Absolute-Only Trust Authority (Future Design Only)

**Date:** 2026-09-30  
**Status:** **DESIGN ONLY** — **no implementation authorization**  
**Proposed authority id:** `rfrf-absolute-only-trust-v1` (distinct from Hybrid Trust v2)  

---

## 1. Purpose

Enable eventual **auto-promotion** for **ABSOLUTE_ONLY** capability vehicles without weakening Hybrid Trust v2 or treating tank-derived percent as independent relative corroboration.

---

## 2. Non-negotiable rules

| Rule | Value |
|------|-------|
| **DERIVED_PERCENT_INDEPENDENT** | **NO** — `absoluteLiters / tankCapacityLiters` is same evidence family |
| **Hybrid v2 weakening** | **FORBIDDEN** |
| **Masquerading** | Absolute-only authority **must not** report as Hybrid Trust v2 TRUSTED |

---

## 3. Corroboration input classification

| Input | Class | Notes |
|-------|-------|-------|
| DIMO native `segments(refuel)` | **AUTHORITATIVE** when present & vehicle-accessible | KS MS 661: historically **UNAVAILABLE** on confirmed fills |
| Independent relative fuel signal | **AUTHORITATIVE** for dual-channel hybrid | **UNAVAILABLE** on ABSOLUTE_ONLY vehicles |
| Station / forecourt enrichment (GPS proximity, dwell) | **CORROBORATING_ONLY** | Does not alone prove liters added |
| Trip boundary / ignition / speed stationary | **CORROBORATING_ONLY** | Context for refuel window |
| Route / location vs known station | **CORROBORATING_ONLY** | |
| Post-level persistence after rise | **CORROBORATING_ONLY** | Same sensor — not independent |
| Downstream consumption while driving | **CORROBORATING_ONLY** | Slow, laggy |
| Tank-capacity-derived percent | **UNRELIABLE** as independent | Explicitly excluded |

Promotion under absolute-only authority requires **F3 maturity** (future settled-post) **plus** a documented minimum corroboration bundle (thresholds **TBD**).

---

## 4. Options assessment (long-term)

| Option | Assessment |
|--------|------------|
| **A — Hybrid required forever** | Safest FP; permanent FN for ABSOLUTE_ONLY without ops path |
| **B — Separate absolute-only trust v1** | Preferred **long-term** if fleet retains ABSOLUTE_ONLY vehicles; requires new authority, evidence schema, promotion gate |
| **C — Detect only, no auto-promote** | **Current Alpha policy**; low rollout risk |

---

## 5. Implementation gate

Future work must include: authority version, promotion-time revalidation, audit trail separate from `hybridAbsoluteSignalTrust`, fleet capability registry, and replay regression suite.

**ABSOLUTE_ONLY_AUTHORITY_IMPLEMENTED=NO**

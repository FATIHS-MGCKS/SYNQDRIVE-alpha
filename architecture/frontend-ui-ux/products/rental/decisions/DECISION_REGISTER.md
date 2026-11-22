# Decision Register — Rental UI/UX

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| RENTUX-DEC-INDEPENDENT-001 | Independently governed Rental UI/UX authority | VALIDATED | RENTUX-EVID-AUDIT-001 |
| RENTUX-DEC-REFERENCE-001 | Positive design reference not default layout donor | PROPOSED | RENTUX-EVID-CODE-001 |

---

## RENTUX-DEC-INDEPENDENT-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (repository governance) |
| **BEFORE** | Rental UI documented informally; fleet-health interior tabs underspecified in authority artifacts. |
| **WHY** | Rental is largest product surface (`rental/App.tsx` view union); needs dedicated screen matrix and fleet hub contracts. |
| **Considered alternatives** | (A) Keep only FEUX rental profile — superseded. (B) Split Rental into multiple registry modules — rejected: single SPA shell. |
| **CHANGE** | Registry **Rental UI/UX** with `RENTAL_SCREEN_MATRIX.md`, fleet tab reconstruction from `fleet-health-service.types.ts`. |
| **EXPECTED_EFFECT** | Fleet hub navigation documented at top + inner tab levels; empty source cells eliminated in matrix. |
| **VALIDATION** | Graph validator + grep-backed CONFIRMED rows in matrix. |
| **OBSERVED_EFFECT** | **CONFIRMED** fleet top tabs `status | condition-service | connectivity` and inner nav `overview | vehicles | work | history` + work sections at `413175e8c`. Browser verification **UNKNOWN**. |
| **NON_EFFECTS** | Does not change Rental routing code. |
| **TRADEOFFS** | Large matrix maintenance vs. onboarding clarity. |
| **REMAINING_GAPS** | Per-view loading/empty/error matrix still **PARTIAL**. |
| **EVIDENCE** | RENTUX-EVID-AUDIT-001 |

---

## RENTUX-DEC-REFERENCE-001

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **BEFORE** | Rental cited as implicit template for other products in team practice. |
| **WHY** | Architecture should encode that shared **patterns** may be reused, but Rental **layout/IA** is not copied blindly to Master/Operator. |
| **Considered alternatives** | (A) Export Rental `AppShell` as mandatory for all products — rejected. (B) Forbid cross-product pattern reuse — rejected: shared `components/patterns`. |
| **CHANGE** | Align with FEUX-DEC-RENTAL-REFERENCE-001; RENTUX owns Rental-specific evolution. |
| **EXPECTED_EFFECT** | PRs that clone Rental layout into Master flagged as PRODUCT_LOCAL misuse. |
| **VALIDATION** | Cross-linked README sections (FEUX + RENTUX). |
| **OBSERVED_EFFECT** | **UNKNOWN** (process). Operator still consumes Rental **context** providers — **CONFIRMED** coupling, not chrome donor. |
| **NON_EFFECTS** | Does not decouple Operator from RentalProvider. |
| **TRADEOFFS** | Pattern reuse vs. product identity. |
| **REMAINING_GAPS** | Metric for “layout donor” anti-pattern **UNKNOWN**. |
| **EVIDENCE** | RENTUX-EVID-CODE-001 |
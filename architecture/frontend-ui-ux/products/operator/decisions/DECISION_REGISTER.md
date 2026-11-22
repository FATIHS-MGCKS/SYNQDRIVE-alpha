# Decision Register — Operator UI/UX

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| OPUX-DEC-INDEPENDENT-001 | Independently governed Operator UI/UX authority | VALIDATED | OPUX-EVID-AUDIT-001 |
| OPUX-DEC-MOBILE-SHELL-001 | Operator owns mobile field shell UX | VALIDATED | OPUX-EVID-CODE-001 |

---

## OPUX-DEC-INDEPENDENT-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (repository governance) |
| **BEFORE** | Operator UX notes embedded in FEUX bootstrap only; deep links not fully traced in authority docs. |
| **WHY** | Operator is a distinct mobile field shell (`/operator`) with bottom-nav IA and sheet flows — requires own authority. |
| **Considered alternatives** | (A) Subsume under Rental UI — rejected: separate route tree and device gate. (B) Separate deployable app — rejected: same SPA in Alpha. |
| **CHANGE** | Registry **Operator UI/UX** with `OPERATOR_SCREEN_MATRIX.md` aligned to `operatorRoutes.ts` + `OperatorDeepLinkBridge.tsx`. |
| **EXPECTED_EFFECT** | Mobile UX contracts documented including deep links and tab param `?tab=`. |
| **VALIDATION** | Graph validator; matrix source paths filled. |
| **OBSERVED_EFFECT** | **CONFIRMED** deep link resolution for `/operator/vehicles/:id`, `/operator/bookings/:id`, scan query `?q=` at `413175e8c`. Production mobile UI **UNKNOWN**. |
| **NON_EFFECTS** | Does not implement offline mode. |
| **TRADEOFFS** | Rental context coupling vs. standalone operator backend (future). |
| **REMAINING_GAPS** | Touch-target audit; full E2E handover flow **UNKNOWN** without browser. |
| **EVIDENCE** | OPUX-EVID-AUDIT-001 |

---

## OPUX-DEC-MOBILE-SHELL-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED (shell contract) |
| **BEFORE** | Risk of desktop-first patterns leaking into operator without explicit mobile shell ownership. |
| **WHY** | `useIsOperatorDevice()` gate + `100dvh` + safe-area padding define a product-specific chrome contract. |
| **Considered alternatives** | (A) Responsive Rental only — rejected: Operator route exists. (B) Native app shell — out of scope. |
| **CHANGE** | Document bottom nav tabs (`today`, `scan`, `vehicles`, `tasks`, `more`), `OperatorShellContext`, sheet orchestration. |
| **EXPECTED_EFFECT** | Operator UI changes route through OPUX; shared tokens still FEUX. |
| **VALIDATION** | `OperatorShell.tsx`, `OperatorBottomNav.tsx`, view files under `operator/views/`. |
| **OBSERVED_EFFECT** | **CONFIRMED** tab list and desktop-only notice at audit SHA. Real device verification **UNKNOWN**. |
| **NON_EFFECTS** | Does not change Clerk/auth guards. |
| **TRADEOFFS** | Narrow `max-w-lg` mobile column vs. tablet layouts at `md`. |
| **REMAINING_GAPS** | mm-level touch audit; connectivity-offline UX **UNKNOWN**. |
| **EVIDENCE** | OPUX-EVID-CODE-001 |
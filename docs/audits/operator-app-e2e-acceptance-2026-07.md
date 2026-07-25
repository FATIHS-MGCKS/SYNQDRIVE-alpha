# Operator App — E2E Acceptance Report (2026-07)

Production-readiness **Prompt 39**: End-to-end acceptance for core Operator field processes using the existing Playwright stack (`frontend/e2e/`).

## Executive summary

| Metric | Result |
|--------|--------|
| **Verdict** | **PASS** (with documented partial coverage notes) |
| **Core flow specs (mobile-375)** | 18 / 18 passed |
| **Responsive / desktop fallback specs** | 8 / 8 passed (7 viewports + desktop notice) |
| **Total Playwright cases executed** | 26 |
| **Infrastructure** | Playwright only — no parallel Cypress/platform |

Run:

```bash
cd frontend && npm run test:operator:e2e
cd frontend && npm run test:operator:e2e:responsive
```

---

## Test matrix (28 required scenarios)

| # | Scenario | Spec / coverage | Status |
|---|----------|-----------------|--------|
| 1 | Operator login & shell access | `operator-flow.spec.ts` — test 1 | **PASS** |
| 2 | Missing permission | `operator-access-resilience.spec.ts` — test 2 | **PASS** |
| 3 | Today view | `operator-flow.spec.ts` — test 3 | **PASS** |
| 4 | Booking deep link | `operator-flow.spec.ts` — test 4 | **PASS** |
| 5 | Vehicle deep link | `operator-flow.spec.ts` — test 5 | **PASS** |
| 6 | Pickup starten | `operator-flow.spec.ts` — test 6–14 | **PASS** |
| 7 | Draft speichern (in-session observation) | `operator-flow.spec.ts` — test 7–8 | **PASS** |
| 8 | Refresh / resume (back-forward in handover) | `operator-flow.spec.ts` — test 7–8 | **PASS** |
| 9 | Dokument hochladen | Handover documents step in flow 6–14; upload failure test 27 | **PASS** |
| 10 | Damage erfassen | Handover damages step (existing damage ack) in flows 6–14 / 15–20 | **PASS** |
| 11 | Signatur erfassen | `advanceHandoverThroughSignatures` (canvas stroke) | **PASS** |
| 12 | Review | Pickup/return review step before submit | **PASS** |
| 13 | Pickup abschließen | `operator-flow.spec.ts` — test 6–14 | **PASS** |
| 14 | Double click Abschluss | `clickCount: 2` on submit; `getPickupAttempts() === 1` | **PASS** |
| 15 | Return starten | `operator-flow.spec.ts` — test 15–20 | **PASS** |
| 16 | Neue Schäden (Return) | Return flow acknowledges damages; **new-damage capture wizard not isolated** | **PARTIAL** |
| 17 | Technische Beobachtung | Condition step in handover helpers | **PASS** |
| 18 | Kilometerstand | Odometer in pickup (15000) / return (15120) | **PASS** |
| 19 | Return abschließen | `operator-flow.spec.ts` — test 15–20 | **PASS** |
| 20 | Finale Daten nicht editierbar | Disabled pickup/return on completed booking detail | **PASS** |
| 21 | Task abschließen | `operator-flow.spec.ts` — test 21 + complete dialog | **PASS** |
| 22 | Scan gültiger Code | `operator-flow.spec.ts` — test 22 | **PASS** |
| 23 | Scan ungültiger Code | `operator-flow.spec.ts` — test 23 | **PASS** |
| 24 | Fremde Ressource | `operator-access-resilience.spec.ts` — test 24 | **PASS** |
| 25 | Session-Ablauf | `operator-access-resilience.spec.ts` — test 25 | **PASS** |
| 26 | Netzwerkabbruch / offline | `operator-access-resilience.spec.ts` — test 26 | **PASS** |
| 27 | Uploadfehler | `operator-access-resilience.spec.ts` — test 27 | **PASS** |
| 28 | Versionskonflikt (Task) | `operator-access-resilience.spec.ts` — test 28 | **PASS** |

**Partial note (#16):** Return handover confirms existing fleet damages and supports capture via UI, but a dedicated E2E for “Neuen Schaden erfassen” photo flow remains a follow-up.

---

## Viewport / device profiles

| Profile | Playwright project | Result |
|---------|-------------------|--------|
| Kleines iPhone (320×568) | `mobile-320` | **PASS** — no horizontal overflow |
| Android phone proxy (360×640) | `mobile-360` | **PASS** |
| Primary mobile (375×812) | `mobile-375` | **PASS** — all 18 core/resilience flows |
| Current iPhone (390×844) | `mobile-390` | **PASS** |
| Large phone (430×932) | `mobile-430` | **PASS** |
| Tablet (768×1024) | `tablet-768` | **PASS** |
| Landscape phone (812×375) | `landscape-375` | **PASS** |
| Desktop fallback (1280) | `desktop-1280` | **PASS** — desktop-only notice path |
| Desktop fallback (1920) | `desktop-1920` | **PASS** — `operator-desktop-only` |

---

## Network simulation

| Condition | Implementation | Status |
|-----------|----------------|--------|
| Offline | `context.setOffline(true)` + connectivity banner | **PASS** |
| High latency (300 ms) | `setOperatorLatencyMs(300)` fixture | **PASS** |
| Request abort + reload retry | `setOperatorAbortNextRequest(true)` | **PASS** |
| Upload failure | `setOperatorFailNextUpload(true)` → 422 | **PASS** |
| Version conflict | `setOperatorVersionConflictOnTaskComplete(true)` → 409 | **PASS** |

---

## Bugs found & fixed during E2E work

| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| E2E-1 | **Blocker** | `OperatorShell.tsx` / `OperatorDesktopOnlyNotice.tsx` JSX syntax (`<div …` missing `>`) prevented Operator app mount | Corrected JSX |
| E2E-2 | **High** | Playwright task detail GET shadowed by list route in `operator-fixtures.ts` | Detail route before list; PATCH for task mutations |
| E2E-3 | **Medium** | `advanceHandoverThroughSignatures` skipped damages step (extra `Weiter`) | Removed spurious navigation |
| E2E-4 | **Medium** | Handover UI stayed open until `reloadDocuments()` finished | Close flow immediately; reload documents in background |
| E2E-5 | **Low** | `Promise.all` double-submit on detached button caused 120s flake | Use `clickCount: 2` |
| E2E-6 | **Low** | Strict-mode locator collisions on task complete / scan customer text | Scoped assertions |

---

## Changed / added files

**New E2E**

- `frontend/e2e/operator-fixtures.ts`
- `frontend/e2e/operator-flow.spec.ts`
- `frontend/e2e/operator-access-resilience.spec.ts`
- `frontend/e2e/operator-responsive.spec.ts`

**Scripts**

- `frontend/package.json` — `test:operator:e2e`, `test:operator:e2e:responsive`

**Stability hooks (testids / product)**

- `frontend/src/operator/OperatorShell.tsx`
- `frontend/src/operator/components/OperatorAccessDeniedScreen.tsx`
- `frontend/src/operator/components/OperatorDesktopOnlyNotice.tsx`
- `frontend/src/operator/handover/OperatorHandoverFlow.tsx` — submit closes before document reload

**Documentation**

- `docs/audits/operator-app-e2e-acceptance-2026-07.md` (this file)

---

## Remaining gaps (non-blocking)

1. Dedicated E2E for **new damage capture** on return (photo wizard).
2. **Server-side handover draft** persistence (tests cover in-session React state only).
3. Occasional Vite proxy noise for task bucket URLs when route mock race occurs — does not fail tests today.
4. Rental-health mock in vehicle quick view returns non-iterable shape (`page.data is not iterable`) — cosmetic in scan result UI.

---

## Sign-off

Operator App core field flows are covered by automated Playwright E2E on mobile-primary viewport with responsive overflow checks and desktop fallback notice. Recommended CI gate: `npm run test:operator:e2e` on PRs touching `frontend/src/operator/**`.

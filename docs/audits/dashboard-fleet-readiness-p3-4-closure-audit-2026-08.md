# P3.4 Post-Remediation Closure Audit — Dashboard / Fleet Readiness Workstream

**Audit date:** 2026-08-20  
**Audited main SHA:** `fb0509e8d018e8237b138dee73b62842d4f32025`  
**P3.3 merge:** PR #1079 — Dashboard Fleet Readiness Production Hardening  
**Prior audits:** P3.2 (`docs/audits/dashboard-fleet-readiness-p3-2-post-merge-audit-2026-08.md`), P3.1 (PR #1075)  
**Auditor mode:** Read-only independent verification on current `main`  
**Scope:** Dashboard Attention Split, Fleet Readiness summary + notifications, request identity, pagination UX, grouped lifecycle parity

---

## 1. Executive verdict

### **YELLOW — workstream may close with accepted debt**

The Dashboard / Fleet Readiness audit track **may be formally closed**. P3.3 remediated the principal production-confidence blocker (P32-F02). No competing canonical truth source was found on the split path. No stale station/org response can overwrite current scoped data under the verified request-generation model. Frontend P3 suites, typecheck, and build pass on the audited SHA.

**Why not GREEN:** Browser/mobile responsive behavior for the dual attention panels remains **code-level only** (P32-F05). Repository-wide backend CI typecheck/unit baseline debt persists and is unrelated to this workstream but affects global CI health. Several medium/low informational findings remain explicitly accepted or deferred.

**Why not ORANGE:** No material correctness or scoping defect was discovered on `main` after independent re-verification of merged P3.3 code and executed tests.

---

## 2. Audited main SHA

```
fb0509e8d018e8237b138dee73b62842d4f32025
```

Merge commit: `P3.3 — Dashboard Fleet Readiness Production Hardening (#1079)`

---

## 3. Scope

| In scope | Out of scope |
|----------|--------------|
| `useNotifications`, `useFleetReadinessSummary`, `request-generation.ts` | Backend Notification V2 API redesign |
| Fleet Readiness projection + partial-context UX | Server-side vehicle-context bundling |
| Dashboard Attention Split architecture on V2 ON | Fixing unrelated backend CI spec drift |
| Grouped lifecycle parity (split + operator-focus) | Mobile layout redesign |
| P3.2 finding disposition matrix | Production code changes |

**Production code modified in this audit:** **None** (document only).

---

## 4. P32-F01 closure evidence — pagination boundary

### Characterization verified: **MITIGATED (UX), not mathematically fixed**

Backend still paginates individual notifications. Client-side vehicle grouping operates on loaded pages only. P3.3 did **not** introduce server-side vehicle-context bundling.

### Exact audit scenario verified (code + tests)

**Before loadMore** — page 1: `VEHICLE_NOT_READY(vehicle A)` only, `hasMoreUnloadedPages=true`:

| Requirement | Verified | Evidence |
|-------------|----------|----------|
| One vehicle presentation | Yes | `fleet-readiness-attention-projection.test.ts` — `beforeLoadMore` length 1, `id: fleet-readiness:veh-a` |
| Indicates additional causes may exist | Yes | `fleetCausesMayBeIncomplete: true`; `NotificationGroupCard` renders `dashboardAttention.fleetReadiness.moreCausesPossible` |
| No definitive cause count | Yes | `subtitle: ''` when incomplete |
| Aggregate actionable | Yes | P3.3 correction: aggregate-only incomplete vehicles render as **one-child group** with `children: ['agg-a']` (not silent leaf) — `fleet-readiness-attention-projection.ts:214-224` |

**After loadMore** — adds `TIRE_CRITICAL(vehicle A)`, `hasMoreUnloadedPages=false`:

| Requirement | Verified | Evidence |
|-------------|----------|----------|
| Still one vehicle context | Yes | Test filters single `fleet-readiness:veh-a` group |
| Aggregate + cause coherent | Yes | Children `['agg-a', 'cause-critical']` |
| Critical severity | Yes | `severity: 'critical'` |
| Definitive cause count | Yes | `subtitle: '1'` when complete |
| Partial hint removed | Yes | `fleetCausesMayBeIncomplete: false` |

**Single concrete cause + hasMore=true:** second test confirms incomplete hint, empty subtitle; after `hasMore=false`, subtitle `'1'`.

### Production acceptability

Honest partial-context UX + `loadMore` convergence is **acceptable for production** provided operators understand unloaded pages may hide additional causes. This is a **completeness** limitation, not a **wrong-scope** defect. Does **not** block workstream closure.

### Disposition: **MITIGATED**

Server-side bundling remains **deferred** (Option A from P3.2).

---

## 5. P32-F02 closure evidence — stale request race

### Prior defect

P3.2 documented shared `cancelRef` boolean race in `useNotifications` and `useFleetReadinessSummary`.

### Current implementation (verified on `main`)

`useRequestGeneration()` provides monotonic generation tokens (`request-generation.ts`). Each fetch calls `nextGeneration()` before await; commits guarded by `isCurrent(generation)`. Context changes (org, station, `attentionScope`, `listMode`, disabled) bump generation via `nextGeneration()` in `fetchPage` / `fetchSummary`.

**`useNotifications` guards:** `apiRows`, `page`, `totalPages`, `total`, `error`, `loading` (finally), `tabCounts` / `primaryTabCounts` via `fetchCountsForGeneration(generation)`.

**No `cancelRef` in notification hooks** (confirmed grep — only unrelated `useVehicleHealth.ts` retains legacy pattern).

### Scenario reasoning (A–E)

| Scenario | Expected | Verified by |
|----------|----------|-------------|
| **A** Station A→B, B resolves first, A last | B authoritative | `useNotifications.request-race.test.ts` Test A |
| **B** A resolves while B pending | A commits nothing; B owns loading | Test D (explicit intermediate `loading===true`, rows `[]` after stale A) |
| **C** Station-A page 2, switch to B, B p1, A p2 | A p2 never appends | Test B |
| **D** Old error after current success | Current error/rows intact | Test C |
| **E** Org A→B | Same as station | `useNotifications.request-race.test.ts` org-switch test; `useFleetReadinessSummary.request-race.test.ts` org-switch test |

**Fleet summary:** station switch, org switch, refresh overlap, stale success, stale error, loading ownership — all covered in `useFleetReadinessSummary.request-race.test.ts`.

### Disposition: **CLOSED**

---

## 6. P32-F03 closure evidence — grouped lifecycle parity

### Canonical split path — `AttentionScopedList`

- Passes `resolveItemLifecycleHandlers={mutationHandlers}` to `NotificationGroupCard` (`AttentionScopedList.tsx:270`)
- `mutationHandlers(itemId)` wires mark read, acknowledge, snooze from scoped hook mutations
- Tests: `AttentionScopedList.lifecycle.test.tsx`, `NotificationGroupCard.lifecycle.test.tsx` (5 tests — canonical IDs, coexisting aggregates, cross-vehicle isolation)

### Operator-focus path — `NotificationPanel`

- P3.3 added `resolveItemLifecycleHandlers={mutationHandlers}` (`NotificationPanel.tsx:379`)
- Test: `NotificationPanel.lifecycle.test.tsx` — grouped child acknowledge via handler

### Capabilities verified

| Action | Split path | Operator-focus | Notes |
|--------|------------|----------------|-------|
| Mark read | Per child `itemId` | Per child `itemId` | Via `NotificationChildRow` + `availableActions` |
| Acknowledge | Yes | Yes | Tests assert canonical ID |
| Snooze | Yes | Yes | Tests assert canonical ID |
| Resolve/archive on grouped children | Not required | Not exposed on leaf UI either | Consistent with task scope |

No group-wide mutation routing found. Vehicle A handlers cannot target vehicle B (tested in `NotificationGroupCard.lifecycle.test.tsx`).

### Disposition: **CLOSED**

---

## 7. Canonical architecture verification

### Verified data flow on split path (`attentionSplitActive === true`)

```
GET /rental-health/fleet/summary (+ stationId)
        ↓
useFleetReadinessSummary → FleetReadinessAttentionPanel header

Notification V2 + attentionScope=FLEET_READINESS (+ stationId)
        ↓
useNotifications → projectFleetReadinessPresentationItems → Fleet Readiness panel

Notification V2 + attentionScope=OPERATIONS (+ stationId)
        ↓
useNotifications → groupActionQueueEntries → Operations panel
```

### Supplemental merge guard

When split active, `actionQueue` returns **operations scoped items only** — no `mergeV2WithSupplemental`, no `mergeV2NotificationsWithVehicleHealth` (`useDashboardViewModel.ts:1053-1059`).

`dashboard-attention-legacy-guard.test.ts` confirms supplemental vehicle health disabled when split active.

Shadow mode concatenates scoped items for diagnostics only — does not feed split UI.

### Not reintroduced on split path

| Anti-pattern | Status |
|--------------|--------|
| `derivedQueueItems` in split feed | Not merged into split panels |
| Vehicle health supplementals | Guarded off when split active |
| Handover supplementals | Not merged when split active |
| Client Fleet Readiness reconstruction for header | Header uses API summary only |
| Domain/category rerouting of scoped feeds | `attentionScope` passed to API; backend filters before pagination |

### Disposition: **No regression — architecture intact**

---

## 8. Station / org race verification

### Parameter forwarding

- `selectedStationId` → both scoped `useNotifications` hooks + `useFleetReadinessSummary` (`useDashboardViewModel.ts:309,317,326,332`)
- `listParams` includes `stationId` when set (`useNotifications.ts:130`)
- Test: `useNotifications.request-race.test.ts` — `forwards stationId on each scoped request after station change`
- `useNotifications.attention-scope.test.ts` — passes `attentionScope` + `stationId` to API

Request-generation hardening did not remove or bypass parameter forwarding.

---

## 9. Mutation-race verification

### Trace (`useNotifications.ts:229-265`)

1. `generation = currentGeneration()` captured at mutation start (does not increment)
2. Optimistic `setApiRows` applied immediately
3. On success: `if (!isCurrent(generation)) return` before `patchRow`; counts via `fetchCountsForGeneration(generation)` with same guard
4. On error: rollback only if `isCurrent(generation)`
5. `finally`: clears mutation state for matching `id`+`action` regardless of generation (prevents stuck spinner without corrupting rows)

### Verified scenarios (`useNotifications.mutation-race.test.ts` — 3/3 pass)

| Scenario | Result |
|----------|--------|
| Station A markRead → switch B → A fails | B rows intact, no rollback to A snapshot |
| Station A markRead → switch B → A succeeds | B rows not patched by stale A response |
| Org switch during markRead + count refresh | Stale counts cannot overwrite org-B tab counts |

### Disposition: **CLOSED** (within notification mutation scope)

---

## 10. Failure-isolation verification

Split path uses **three independent hooks** with separate React state:

| Source | Hook | Panel state key |
|--------|------|-----------------|
| Operations notifications | `operationsNotifications` | `dashboardAttention.operations` |
| Fleet notifications | `fleetReadinessNotifications` | `dashboardAttention.fleetReadiness` |
| Fleet summary | `fleetReadinessSummaryHook` | `dashboardAttention.fleetSummary` |

### Code-level isolation

| Failure | Other sources | Evidence |
|---------|---------------|----------|
| Operations notifications error | Fleet list + summary unaffected | Separate `error`/`loading` per hook in `dashboardAttention` model |
| Fleet notifications error | Summary header + operations unaffected | `FleetReadinessAttentionPanel` — summary header separate from `AttentionScopedList` |
| Fleet summary error | Fleet list still renders | `FleetSummaryHeader` shows unavailable i18n; list section independent |
| Both fleet sources fail | Operations panel independent | Separate hook instances |
| Manual refresh | `Promise.all` on independent `refresh()` calls | Each hook's `fetchPage`/`fetchSummary` catches errors internally; no cross-hook state mutation |

**Limitation:** `refreshAll` does not surface per-source partial failure to a unified banner — acceptable; no cross-corruption observed.

---

## 11. Feature-flag verification

| Mode | Split behavior | Verified |
|------|----------------|----------|
| V2 OFF | `attentionSplitActive=false`; V1 `actionQueue` | `shouldUseDashboardAttentionSplit` === V2 ON only |
| V2 shadow | Background fetch; split off; shadow compare uses scoped concat | `shouldFetchV2NotificationsInBackground` |
| V2 ON | Split active; no supplemental merge on split feed | `useDashboardViewModel.ts`, legacy guard tests |

P3.3 changes confined to hooks/projection used by split path — did not alter flag semantics in `notifications-v2-flag.ts`.

Legacy supplemental paths remain for non-split modes only — not simultaneous with canonical split feed.

---

## 12. i18n verification

### Partial-context key — all 8 locales present

`dashboardAttention.fleetReadiness.moreCausesPossible` verified in: `de`, `en`, `fr`, `nl`, `es`, `it`, `pl`, `cs`.

Static string (no interpolation variables) — parity is copy presence, not placeholder structure.

### Remaining hardcoded DE/EN debt (P32-F08)

Still present in:

- `AttentionScopedList.resolveErrorBanner` — `api_disabled`, `permission_denied`, `network`
- `NotificationPanel.errorBanner` — same pattern

These predate P3.3 and were not expanded by this workstream.

---

## 13. UI / accessibility assessment

### Partial-context presentation (`NotificationGroupCard.tsx:68-72`)

- Renders muted meta text below summary row when `fleetCausesMayBeIncomplete`
- Does not show numeric cause badge while incomplete (`subtitle: ''`)
- Aggregate-only incomplete groups remain expandable one-child groups — child lifecycle/CTA accessible via expand

### Accessibility

- Group cards use button toggle with chevron (`NotificationSummaryRow`)
- Lifecycle actions via `More actions` menu (test helpers confirm pattern)
- **No axe/browser audit performed in P3.4** — CI axe jobs exist on main workflows but this audit did not re-run them locally

### Mobile (P32-F05)

- `max-lg:max-h-[min(240px,30vh)]` per panel unchanged (`FleetReadinessAttentionPanel.tsx:107`, `OperationsAttentionPanel.tsx:46`)
- **Browser verification: NOT performed**

---

## 14. Test execution (independent run on `fb0509e8`)

**Command:** `npm test -- --run` on 12 P3-focused test files  
**Date:** 2026-08-20  
**Result:** **54/54 PASS** (12 files)

| File | Tests |
|------|-------|
| `useNotifications.request-race.test.ts` | 6 |
| `useNotifications.mutation-race.test.ts` | 3 |
| `useFleetReadinessSummary.request-race.test.ts` | 4 |
| `useNotifications.attention-scope.test.ts` | 3 |
| `useFleetReadinessSummary.test.ts` | 3 |
| `dashboard-attention-routing.test.ts` | 4 |
| `dashboard-attention-legacy-guard.test.ts` | 4 |
| `fleet-readiness-attention-projection.test.ts` | 17 |
| `FleetReadinessAttentionPanel.test.tsx` | 2 |
| `NotificationGroupCard.lifecycle.test.tsx` | 5 |
| `AttentionScopedList.lifecycle.test.tsx` | 2 |
| `NotificationPanel.lifecycle.test.tsx` | 1 |

### Test quality assessment

- **Race/mutation tests:** Use deferred promises; correctness assertions use `waitForHook` on hook state — not arbitrary timer sleeps for race outcomes
- **Minor settling delays:** Tests A/C in request-race use `setTimeout(30)` **after** stale resolution as microtask flush only — not used to assert race winners; acceptable
- **Projection tests:** Prove user-visible presentation contracts (group vs leaf, incomplete flags, severity convergence)
- **Lifecycle tests:** Prove canonical notification ID routing through rendered UI interaction helpers

### Build validation

| Check | Result |
|-------|--------|
| `npx tsc -b` (frontend) | **PASS** |
| `npm run build` (frontend) | **PASS** |
| Frontend lint (CI on main) | **PASS** (per main workflow jobs) |

---

## 15. CI baseline (main @ `fb0509e8`)

**Workflow:** `Vehicle Detail — Production Readiness CI` / `Legal Documents — Production Readiness CI`  
**Run:** `32376836105` / `32376836285` (push on P3.3 merge)

| Job | Dashboard/Fleet relevance | Status |
|-----|---------------------------|--------|
| Frontend component tests | **Direct** — includes P3 suites | **PASS** |
| Frontend lint | Relevant | **PASS** |
| Production build | Relevant | **PASS** (completed in workflow) |
| Typecheck (`backend` tsconfig incl. specs) | Unrelated baseline | **FAIL** — 5 pre-existing spec constructor errors |
| Backend unit tests (vehicle-detail verify) | Unrelated baseline | **FAIL** — `vehicles.controller.status-patch.spec.ts` |

### Baseline errors (unchanged from P3.2)

1. `billing.controller.security.characterization.spec.ts(184)` — Expected 23 args, got 22  
2. `vehicles-security-negative.spec.ts` — 3× constructor arity drift  
3. `vehicles.controller.status-patch.spec.ts(25)` — undefined `VehiclesOperationalService`

**Classification:** Dashboard/Fleet Readiness frontend regression surface is **green**. Global CI remains **red on unrelated backend spec debt**.

---

## 16. Full P3.2 finding disposition matrix

| ID | Severity | Disposition | Evidence summary |
|----|----------|-------------|------------------|
| **P32-F01** | HIGH | **MITIGATED** | Honest partial-context UX + aggregate-only one-child groups; tests pass; server bundling deferred |
| **P32-F02** | HIGH | **CLOSED** | Generation token + tests; no cancelRef in notification hooks |
| **P32-F03** | MEDIUM | **CLOSED** | NotificationPanel + AttentionScopedList parity; lifecycle tests pass |
| **P32-F04** | MEDIUM | **ACCEPTED DEBT** | Summary vs list semantic divergence unchanged; no new UX indicator |
| **P32-F05** | MEDIUM | **ACCEPTED DEBT** | Mobile height caps unchanged; browser QA not performed |
| **P32-F06** | LOW | **ACCEPTED DEBT** | Duplicate `api.vendors.list` per panel mount still present |
| **P32-F07** | LOW | **ACCEPTED DEBT** | Scoped hooks still skip global counts |
| **P32-F08** | LOW | **ACCEPTED DEBT** | Hardcoded DE/EN error strings remain in split + panel paths |
| **P32-F09** | INFO | **ACCEPTED DEBT** | `computeFleetReadiness` heuristic for focus mode unchanged |
| **P32-F10** | INFO | **ACCEPTED DEBT** | Split still coupled to V2 ON flag |
| **P32-F11** | INFO | **ACCEPTED DEBT** | Fleet summary cache TTL unchanged |
| **P32-F12** | INFO | **ACCEPTED DEBT** | Resolved list mode still operations-only in split |

### New findings discovered in P3.4

**None** at HIGH/BLOCKER severity.

---

## 17. Remaining accepted / deferred debt

| Item | Recommendation | Blocks closure? |
|------|----------------|-----------------|
| Server-side vehicle-context bundling (F01 Option A) | Future Notification V2 enhancement | No |
| Fleet summary vs list divergence copy (F04) | Operator help / tooltip | No |
| Mobile dual-panel height review (F05) | Browser QA + responsive pass | No (UX) |
| Vendor fetch dedupe (F06) | Shared cache when touched | No |
| i18n error banner keys (F08) | Incremental i18n cleanup | No |
| Backend CI spec drift | Separate backend maintenance | No (for this workstream) |
| Browser/mobile manual QA | Scheduled ops UX verification | No for code closure; limits GREEN verdict |

---

## 18. Final closure decision

### Closure criteria checklist

| # | Criterion | Met? |
|---|-----------|------|
| 1 | P32-F02 CLOSED | **Yes** |
| 2 | P32-F03 CLOSED | **Yes** |
| 3 | P32-F01 safely MITIGATED | **Yes** |
| 4 | No competing canonical truth | **Yes** |
| 5 | No stale station/org overwrite | **Yes** |
| 6 | No new HIGH/BLOCKER | **Yes** |
| 7 | Remaining findings accepted/deferred | **Yes** |
| 8 | Frontend tests/typecheck/build pass | **Yes** |

### Recommendation

**The Dashboard / Fleet Readiness workstream may be formally closed** with **YELLOW** verdict and documented accepted debt.

P3.3 merge on `main` independently satisfies the remediation intent of P3.2 ORANGE findings F01–F03 within their designed scope. Further work (server bundling, mobile UX, divergence copy, i18n cleanup, backend CI) should be tracked as **separate maintenance items**, not as blockers to this workstream closure.

---

## Appendix A — Commands executed by auditor

```bash
git checkout main && git pull  # fb0509e8
cd frontend && npm test -- --run [12 P3 test files]  # 54/54 pass
cd frontend && npx tsc -b  # pass
cd frontend && npm run build  # pass
gh run list --branch main --limit 5
gh run view 32376836105 --log-failed  # CI baseline
grep cancelRef frontend/src/rental/hooks/useNotifications.ts  # no matches
grep cancelRef frontend/src/rental/hooks/useFleetReadinessSummary.ts  # no matches
```

## Appendix B — Browser / manual QA

**Not performed.** Responsive layout, dual-panel scroll ergonomics, and end-to-end operator workflows were not browser-verified in this audit run. Confidence is derived from code inspection and automated frontend tests.

---

*End of P3.4 closure audit.*

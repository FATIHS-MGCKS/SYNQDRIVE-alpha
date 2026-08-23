# P2.2.27 — Post-P226 Operator Campaign Review & Vehicle Quick View Split Selection (Read-Only Pre-Flight)

**Date:** 2026-08-23  
**Mode:** STRICT READ-ONLY PRE-FLIGHT  
**Authoritative baseline:** `9f87c3d793fa1f8c784df1d03e230c803ae5c740`  
**Audit branch:** `cursor/p2227-post-p226-vehicle-quick-view-preflight-3c10`  
**Auditor:** Cursor Cloud Agent (independent verification)

---

## 0. Authoritative baseline / topology hard gate

| Check | Result |
|-------|--------|
| PR #1198 merged | **YES** (`mergedAt`: 2026-08-23T11:22:40Z) |
| Exact merge SHA | `9f87c3d793fa1f8c784df1d03e230c803ae5c740` |
| Commit exists locally | **YES** (`git cat-file -t` → commit) |
| Commit exists on remote | **YES** (checked out at baseline) |
| Audit branch created from baseline | **YES** |
| `git merge-base HEAD 9f87c3d7` | `9f87c3d793fa1f8c784df1d03e230c803ae5c740` |
| `git rev-list --count 9f87c3d7..HEAD` | **0** |
| Working tree clean (pre-artifact) | **YES** |

### P216–P226 ancestry (spot-check via `git log` from baseline)

| Phase | Evidence on baseline ancestry |
|-------|-------------------------------|
| P226 Tire Measure | Merge commit **is** P2.2.26 (#1198) |
| P225 Pickup Verification | `bbb4f574` — P2.2.25 (#1192) |
| P224 Damage Capture | `bf0a5a57` — P2.2.24 (#1189) |
| P223 Invoice Documents | `96dadcb3` — P2.2.23 (#1184) |
| P222 Send Invoice | `80dbba83` — P2.2.22 (#1172) |
| P221 Create Invoice | present in history |
| P220 Parts & Accessories | present in history |
| P219 Insurances | present in history |
| P218 Data Authorization | present in history |
| P217 Booking Vehicle Picker | present in history |
| P216A/B1/B2/C1/C2A/C2B | present in history (task/detail/timeline slices) |

**Topology verdict:** **VALID**

---

## 1. Post-P226 freeze verification

### `npm run i18n:check`

| Metric | Actual |
|--------|--------|
| Result | **PASS** |
| i18n suite tests | **322 / 322** |
| Structural health | passed |
| Canonical EN keys | **8430** |
| Canonical DE keys | **8430** |
| Parity | **100%** |
| Orphans | **0** (via `locales.test.ts`) |
| Shim inventory | **29** (18 prod, 11 test) |
| New compatibility consumers | **0** |
| Global enforce-clean debt | **0** |
| Hardcoded inventory total | 1579 unique findings |

### Phase-scoped enforce-clean debt (recomputed via `hardcoded-copy-guard.test.ts`)

| Phase | Debt |
|-------|------|
| P226 | **0** |
| P225 | **0** |
| P224 | **0** |
| P223 | **0** |
| P222 | **0** |
| P221 | **0** |
| P220 | **0** |
| P219 | **0** |
| P218 | **0** |
| P217 | **0** |
| P216A | **0** |
| P216B1 | **0** |
| P216B2 | **0** |
| P216C1 | **0** |
| P216C2A | **0** |
| P216C2B | **0** |

### Additional freeze checks

| Check | Result |
|-------|--------|
| CompanySections prior freeze | **CLEAN** — `getCompanySections(locale)` in `company-utils.ts`; P218 `DataAuthorizationTab` enforce-clean = 0; blind-spot guard present |
| Tire Measure locale-switch state preservation | **CLEAN** — 19/19 tests PASS in `operator-tire-measure-localization.test.tsx` |
| Raw Tire Measure validation/plausibility codes in presentation | **NONE** — codes remain in utils; adapter maps to keys (P226 frozen) |

**Freeze verdict:** **PASS — no baseline regression**

---

## 2. Purpose

Previous pre-flights identified **Operator Vehicle Quick View** as high operational leverage but too large for a single bounded slice. P2.2.27 must decompose Quick View and select **one** presentation-only first sub-surface with high daily UX impact and low semantic risk.

**Primary question answered:** Yes — Quick View can be split; the **Open Tasks** sub-surface (QV-G) is a tightly bounded, presentation-only first slice.

---

## 3. Fresh global residual inventory

Scanner source: `frontend/src/i18n/hardcoded-copy-inventory.json` (refreshed by `npm run i18n:check`).

| Domain | Scanner-visible | Hidden presentation | Fixed-locale | Active enforce-clean |
|--------|-----------------|---------------------|--------------|----------------------|
| **GLOBAL** | 1579 | 0 (scanner field) | 8 | **0** |
| **Operator** | 132 | significant (utils maps, `taskStatusLabelDe`, hook labels) | 1 | 0 |
| **Vehicle/Fleet** (Rental vehicle surfaces) | ~22 (vehicle/billing-adjacent) | moderate | 3 | 0 |
| **Rental** (total) | 372 | moderate | 3 | 0 |
| **Master Admin** | 1049 | high (logic/debug views) | 2 | 0 |
| **Shared/Shell** | 26 | low | 2 | 0 |
| **Communication** | ~81 (voice/whatsapp/support paths) | moderate | 0 | 0 |
| **Other** | remainder | — | — | 0 |

**Required:** global active enforce-clean debt = **0** ✓

---

## 4. Excluded frozen scopes (P216–P226)

The following remain **frozen** — do not reopen without demonstrated regression:

- P219 Rental Insurances
- P220 Rental Parts & Accessories
- P221 Rental Create Invoice
- P222 Rental Send Invoice
- P223 Rental Invoice Documents
- P224 Operator Damage Capture
- P225 Operator Pickup Verification
- P226 Operator Tire Measure (including Quick View tire section entry points — presentation only, no reopen)

---

## 5. P226 residual sanity

Inspected P226 exact production paths (`P226_ENFORCE_CLEAN_EXACT`):

| Path | Finding |
|------|---------|
| `operator/tire-measure/OperatorTireMeasureFlow.tsx` | 0 enforce-clean debt |
| `operator/tire-measure/OperatorTireMeasureTreadGrid.tsx` | 0 |
| `operator/tire-measure/operatorTireMeasure.utils.ts` | 0 |
| `operator/tire-measure/operatorTireMeasurePayload.ts` | 0 |
| `operator/tire-measure/useOperatorTireMeasureData.ts` | 0 |
| `operator/lib/operator-tire-measure-i18n.ts` | 0 |

**Classification of any residual near tire paths in Quick View:**

| Class | Count |
|-------|-------|
| A machine/domain | tire action sheet wiring, frozen payloads |
| B dynamic business data | tread values, measurement timestamps |
| C technical/internal | API field names in tire summary |
| D scanner false positive | 0 |
| **E presentation regression** | **0** |

---

## 6. Operator Vehicle Quick View — active path

### Primary files

| File | Role | Status |
|------|------|--------|
| `frontend/src/operator/components/OperatorVehicleQuickView.tsx` | Main Quick View UI (~610 lines) | **ACTIVE** |
| `frontend/src/operator/hooks/useOperatorVehicleQuickViewData.ts` | Data hook (vehicle, health, tasks, booking, damages, tire, docs) | **ACTIVE** |
| `frontend/src/operator/lib/operatorVehicleQuickView.utils.ts` | Status snapshot, filters, health labels, `formatOperatorDateTime` | **ACTIVE** (shared beyond QV) |

### Entry points / host / invocation

| Host | Pattern |
|------|---------|
| `OperatorVehiclesView.tsx` | Tablet split + mobile drill-down; `selectedVehicleId` from `OperatorShellContext` |
| `OperatorScanView.tsx` | Scan/search → select vehicle → Quick View detail pane |

### Integration

- **Action sheets:** `useOperatorShell().openSheet` — `task-create`, `task-detail`, `booking-create`, `tire-measure`, `ai-upload`
- **Handover:** `useOperatorHandover().openHandover` — pickup/return CTAs
- **Damage capture:** `useOperatorDamageCapture().openDamageCapture`
- **Props:** `vehicleId: string`, optional `onClose`
- **Close/navigation:** `onClose` clears selection; task rows open `task-detail` sheet with `taskId` + `task` object
- **Context:** `useRentalOrg`, `useFleetVehicles`, `useOperatorData`, vehicle-scoped API reload on `operator:task-updated`

**Classification:** **ACTIVE** (conditionally active when `vehicleId` resolves to a fleet vehicle)

---

## 7. Complete Vehicle Quick View presentation inventory

| Area | Visible concepts | Classification |
|------|------------------|----------------|
| Not found | `Fahrzeug nicht gefunden.` | D canonical |
| Hero header | plate, model, station | B dynamic + D chrome |
| Close | `aria-label="Schließen"` | D |
| Status chips | `snapshot.primaryLabel`, `fleetDisplay.statusBadge.label` | D (labels) + A (machine status) |
| Cleaning | `Reinigung offen` | D |
| Unreliable callout | `VehicleOperationalStatusCallout` (`locale: 'de'` hardcoded) | D + C coupling |
| Darf raus? | section title, release label, Rental Health state label | D |
| Quick actions | Pickup/Return/Booking CTAs, customer names | D + B |
| Booking section | `Buchung`, context label, customer, datetime | D + B |
| Blockers | `Blocker & Hinweise`, health error, blocking reasons | D + B |
| Rental Health | module labels, state labels, `stale` suffix | D + A |
| Damages | `Aktive Schäden`, empty, damage type/severity | D + B |
| **Open Tasks** | `Offene Aufgaben`, `Neu`, empty, task title, status, priority | **D + B** |
| Tire (frozen) | section + P226 action sheet | **OUT OF SCOPE** |
| Documents | `AI Uploads / Dokumente` | D |
| Tool actions footer | 4 action buttons | D |

**Uncertain (E):** 0 after inspection — all items classified.

**Total presentation concepts (full Quick View):** ~55–65 (too large for one slice)

---

## 8. Vehicle Quick View structural decomposition

| ID | Sub-surface | Components / lines | Visible concepts | Hidden concepts | Machine deps | State deps | Callback deps | Est. keys | Testability |
|----|-------------|-------------------|------------------|-----------------|--------------|------------|---------------|-----------|-------------|
| QV-A | Header / identity / primary status | `OperatorVehicleQuickView.tsx` L110–195; utils snapshot | ~15 | `PRIMARY_STATUS_LABELS`, `locale:'de'` fleet display | operational status, health | health loading | `onClose` | 25–35 | 3 |
| QV-B | Quick actions | L197–259 | ~6 | handover gate reasons (already i18n via `resolveHandoverGateReason`) | bookingId, gate | pickup/return rows | `openHandover`, `openSheet` | 8–12 | 3 |
| QV-C | Booking context | L261–273 + hook L162–217 | ~8 | hook labels (`Abholung heute`, etc.) | bookingId, status | bookingContext memo | none | 10–15 | 3 |
| QV-D | Blockers & hints | L275–296 | ~5 | contradiction strings in utils | `rental_blocked`, reasons | health error | none | 8–10 | 2 |
| QV-E | Rental Health modules | L298–331 + utils maps | ~12 | `HEALTH_MODULE_LABELS`, `RENTAL_HEALTH_STATE_LABELS` | module states | health loading | none | 20–30 | 2 |
| QV-F | Active damages | L333–358 | ~4 | `formatDamageType` | damage IDs | damages loading | none | 6–8 | 4 |
| **QV-G** | **Open Tasks** | **L360–404, `OperatorTaskQuickRow` L553–569** | **~8** | **`taskStatusLabelDe`, `Überfällig`, `PriorityBadge` EN labels** | **taskId, status, priority, isOverdue** | **task list sort** | **`openSheet(task-detail/task-create)`** | **12–20** | **5** |
| QV-H | Tire profile | L406–457 | ~8 | tire-health-detail-ui labels | P226 frozen | tire loading | tire-measure sheet | **EXCLUDED** | — |
| QV-I | Documents | L459–479 | ~4 | none | doc IDs | docs loading | none | 5–8 | 3 |
| QV-J | Tool actions footer | L481–539 | ~8 | none | vehicleId | none | multiple sheets | 10–14 | 4 |

---

## 9. Quick View split boundary test

| Sub-surface | Verdict |
|-------------|---------|
| QV-A Header | **TOO COUPLED** — hardcoded `locale: 'de'` for fleet display + unreliable callout |
| QV-B Quick actions | **SAFE WITH EXTRA FREEZE** — handover gates already localized; booking/customer dynamic |
| QV-C Booking | **SAFE WITH EXTRA FREEZE** — requires hook label extraction |
| QV-D Blockers | **TOO COUPLED** — dynamic `blocking_reasons` + contradiction derivation in utils |
| QV-E Rental Health | **TOO COUPLED** — shared utils maps used by `OperatorVehiclesView` |
| QV-F Damages | **SAFE WITH EXTRA FREEZE** — smaller leverage |
| **QV-G Open Tasks** | **SAFE BOUNDED SLICE** |
| QV-H Tire | **NOT WORTH ISOLATING** (frozen P226) |
| QV-I Documents | **SAFE BOUNDED SLICE** (lower leverage) |
| QV-J Tool actions | **SAFE BOUNDED SLICE** (moderate leverage, 8 strings) |

---

## 10. Header / vehicle identity audit

- **Dynamic (do not translate):** `vehicle.license`, `vehicle.model`, `vehicle.station`, customer names in action subtitles
- **Presentation debt:** close aria-label, cleaning chip, Darf raus? chrome, status badge labels (partially from fleet display with frozen `locale: 'de'`)
- **Risk:** localizing header without fixing `locale: 'de'` hardcodes would leave EN users with German fleet status labels

---

## 11. Task row audit (QV-G focus)

`OperatorTaskQuickRow` (inline, L553–569):

| Field | Machine value | Visible representation | Formatter/map | Logic/API use |
|-------|---------------|------------------------|---------------|---------------|
| Title | `task.title` | rendered as-is | none | display only |
| Status | `task.status` (`OPEN`/`IN_PROGRESS`/`WAITING`/…) | `taskStatusLabelDe(status)` | `apiTaskStatusLabelDe` → German map | sorting/filtering uses machine status |
| Overdue | `task.isOverdue` boolean | `'Überfällig'` or status label | hardcoded DE | sort in `allOpenTasks` uses boolean |
| Priority | `task.priority` (`CRITICAL`/`HIGH`/`NORMAL`/`LOW`) | `PriorityBadge` → English `PRIORITY_LABEL` | `normalizePriority` for tone | machine priority unchanged |
| Navigation | `task.id` | whole row button | `openSheet({ type:'task-detail', taskId, task })` | IDs preserved |

**No expand/collapse** in Quick View task rows (unlike full task detail).

---

## 12. Collapsed / expanded state

Not applicable — rows are flat buttons; no local expanded state. Locale switch must preserve:

- task list content/order (sorted by overdue, then due date)
- `taskId` on navigation callbacks

---

## 13. Priority semantics

| Machine (`ApiTaskPriority`) | Baseline label (DE/EN mix) | Badge styling | Sort/filter | API |
|-----------------------------|----------------------------|---------------|-------------|-----|
| CRITICAL | Kritisch / Critical | `critical` tone | machine | unchanged |
| HIGH | Hoch / High | `high` → warning | machine | unchanged |
| NORMAL | Normal / Medium | `medium` → watch | machine | unchanged |
| LOW | Niedrig / Low | `low` → neutral | machine | unchanged |

**Required architecture:** `task.priority` → `TranslationKey` → label via adapter; **never** use localized label for styling (use machine priority / `normalizePriority`).

---

## 14. Category semantics

Quick View task rows **do not display task category** — category IDs not shown. No P227 category mapping required for QV-G.

---

## 15. Due / overdue semantics

- Due timestamp **not rendered** in Quick View task rows (only `isOverdue` affects chip)
- `allOpenTasks` sort: overdue first, then `dueDate` ascending — **must remain machine-based**
- Localization may only change overdue **label** (`status.overdue` / `tasks.*`)

---

## 16. Assignment semantics

Assignee **not shown** in Quick View task rows. No assignment presentation in QV-G scope.

---

## 17. Status badges (QV-G scope)

| Badge | Machine | Presentation | Styling | Workflow |
|-------|---------|--------------|---------|----------|
| Task status chip | `task.status`, `task.isOverdue` | DE labels / Überfällig | `taskStatusTone` | machine |
| Priority badge | `task.priority` | English PRIORITY_LABEL | `PRIORITY_TONE` | machine |

**Safe with adapter** — pass explicit `label` prop to `PriorityBadge` from i18n adapter.

---

## 18. Vehicle readiness / health

Shown in QV-A/E — **out of scope** for QV-G. Canonical derivation in `deriveOperatorVehicleStatusSnapshot` must remain untouched.

---

## 19. Telemetry / connectivity

Not directly shown in QV-G. Fleet display telemetry states in QV-A use frozen `locale: 'de'` — out of scope.

---

## 20. Quick View actions (QV-G scope)

| Action | Label | Callback args | Permission |
|--------|-------|---------------|------------|
| Neu (create task) | `Neu` | `openSheet({ type:'task-create', vehicleId, vehicleLabel, bookingId?, onSuccess })` | shell | 
| Open task row | (row title = dynamic) | `openSheet({ type:'task-detail', taskId, task, onUpdated })` | shell |

**Presentation-only** for static labels.

---

## 21. Date/time formatters

QV-G does **not** render due dates. `formatOperatorDateTime` (`de-DE` fixed) used elsewhere in Quick View — **out of scope** for QV-G.

---

## 22. Shared helper audit (`operatorVehicleQuickView.utils.ts`)

| Export | Class | P227 target? |
|--------|-------|--------------|
| `deriveOperatorVehicleStatusSnapshot` | A machine derivation | NO |
| `detectOperatorStatusContradictions` | A (+ German strings) | NO |
| `vehicleMatchesOperatorFilter` | A | NO |
| `PRIMARY_STATUS_LABELS` / `RELEASE_LABELS` / health maps | E presentation maps | NO (QV-A/E) |
| `formatOperatorDateTime` | D fixed-locale formatter | NO |
| `formatModuleRow` | E | NO |

**QV-G does not require utils changes** if task row is extracted with its own adapter.

---

## 23. Machine/display separation score (0–5)

| Sub-surface | Score |
|-------------|-------|
| QV-A | 2 |
| QV-B | 3 |
| QV-C | 2 |
| QV-D | 1 |
| QV-E | 1 |
| QV-F | 4 |
| **QV-G** | **4** |
| QV-I | 5 |
| QV-J | 5 |

---

## 24. Operational leverage score (0–5)

| Sub-surface | Score |
|-------------|-------|
| QV-A | 5 |
| QV-B | 5 |
| QV-C | 4 |
| QV-D | 3 |
| QV-E | 4 |
| QV-F | 3 |
| **QV-G** | **5** |
| QV-I | 2 |
| QV-J | 4 |

---

## 25. Business risk score (0–5, higher = riskier)

| Sub-surface | Score |
|-------------|-------|
| QV-A | 4 |
| QV-B | 4 |
| QV-C | 3 |
| QV-D | 4 |
| QV-E | 4 |
| QV-F | 2 |
| **QV-G** | **1** |
| QV-I | 1 |
| QV-J | 2 |

---

## 26. Boundedness score (0–5)

| Sub-surface | Score |
|-------------|-------|
| QV-A | 2 |
| QV-B | 3 |
| QV-C | 3 |
| QV-D | 2 |
| QV-E | 1 |
| QV-F | 4 |
| **QV-G** | **5** |
| QV-I | 5 |
| QV-J | 4 |

---

## 27. Testability score (0–5)

| Sub-surface | Score |
|-------------|-------|
| QV-A | 3 |
| QV-B | 3 |
| QV-C | 3 |
| QV-D | 2 |
| QV-E | 2 |
| QV-F | 4 |
| **QV-G** | **5** |
| QV-I | 4 |
| QV-J | 4 |

---

## 28. Collision score (0–5, 5 = none)

Active PR inspection:

| PR | Title | QV-G collision |
|----|-------|----------------|
| #1200 | Communication C11.4 media attachments | **5** — no shared files |
| #1199/#1201 | P226 audits | **5** — read-only |
| Operator task UI PRs | none open for QV tasks | **5** |

**QV-G collision:** **5 (none)**

---

## 29. Quick View sub-slice ranking

| Rank | Sub-slice | Exact files | Visible | Hidden | Fixed | Op lev | Sep | Risk | Bound | Test | Coll | Keys | Recommendation |
|------|-----------|-------------|---------|--------|-------|--------|-----|------|-------|------|------|------|------------------|
| 1 | **QV-G Open Tasks** | `OperatorVehicleQuickView.tsx` (partial), new `OperatorVehicleQuickViewTasks.tsx`, new i18n adapter | 3 | 5 | 0 | 5 | 4 | 1 | 5 | 5 | 5 | 12–20 | **SELECT** |
| 2 | QV-J Tool actions | `OperatorVehicleQuickView.tsx` L481–539 | 8 | 0 | 0 | 4 | 5 | 2 | 4 | 4 | 5 | 10–14 | Next slice |
| 3 | QV-I Documents | L459–479 | 4 | 0 | 0 | 2 | 5 | 1 | 5 | 4 | 5 | 5–8 | Later |
| 4 | QV-F Damages | L333–358 | 4 | 0 | 0 | 3 | 4 | 2 | 4 | 4 | 5 | 6–8 | Later |
| 5 | QV-B Quick actions | L197–259 | 6 | 2 | 0 | 5 | 3 | 4 | 3 | 3 | 4 | 8–12 | Needs header freeze |
| 6 | QV-C Booking | L261–273 + hook | 4 | 4 | 1 | 4 | 2 | 3 | 3 | 3 | 4 | 10–15 | Coupled to hook |
| 7 | QV-A Header | L110–195 | 15 | 10+ | 2 | 5 | 2 | 4 | 2 | 3 | 4 | 25–35 | Too coupled |
| 8 | QV-E Rental Health | L298–331 + utils | 12 | 15+ | 1 | 4 | 1 | 4 | 1 | 2 | 3 | 20–30 | Shared utils |
| 9 | QV-D Blockers | L275–296 | 5 | 5 | 0 | 3 | 1 | 4 | 2 | 2 | 4 | 8–10 | Too coupled |
| 10 | QV-H Tire | frozen | — | — | — | — | — | — | — | — | — | — | **EXCLUDED** |

---

## 30. Non-Quick-View Operator alternatives (≥3)

| Candidate | Files | Visible | Hidden | Op lev | Sep | Risk | Bound | Test | Coll | Keys |
|-----------|-------|---------|--------|--------|-----|------|-------|------|------|------|
| **OperatorTaskCard** | `operator/tasks/OperatorTaskCard.tsx`, `operatorTaskCard.utils.ts` | 4 | 8+ | 4 | 4 | 2 | 4 | 4 | 4 | 15–25 |
| **OperatorBookingFormSheet** | `operator/bookings/OperatorBookingFormSheet.tsx` | 16 | moderate | 4 | 2 | 4 | 2 | 3 | 4 | 40+ |
| **OperatorTodayView** | `operator/views/OperatorTodayView.tsx` | 12 | moderate | 5 | 2 | 3 | 2 | 3 | 4 | 35+ |
| OperatorMoreView | `operator/views/OperatorMoreView.tsx` | 9 | low | 3 | 3 | 2 | 3 | 3 | 5 | 20+ |
| OperatorAiUploadFlow | `operator/ai-upload/OperatorAiUploadFlow.tsx` | 11 | high | 3 | 2 | 4 | 2 | 2 | 4 | 35+ |

**Best non-Quick-View Operator:** `OperatorTaskCard` (same task status/priority debt pattern, but QV-G is more bounded and higher centrality in vehicle workflow).

---

## 31. Vehicle/Fleet runner-up

**`rental/components/VehicleInsightsCard.tsx`** — 6 scanner findings; presentation-only insights card; moderate leverage; separation 4; risk 2; boundedness 4. Lower daily operator frequency than QV-G.

---

## 32. Rental / Master runner-up

| Domain | Candidate | Files | Notes |
|--------|-----------|-------|-------|
| **Rental** | Rental Tasks module residuals | various `rental/.../tasks/*` | 13 scanner findings; partially covered by P216 — higher collision |
| **Master** | `HealthTrackingView.tsx` | 132 findings | far too large; internal/admin |

**Strongest bounded Rental:** task-adjacent surfaces already partially frozen in P216; not recommended over QV-G.

---

## 33. Top 12 cross-domain ranking

| Rank | Domain | Surface | Files | Active | Vis | Hid | Fix | Op | Sep | Risk | Bnd | Tst | Coll | Keys | Rec |
|------|--------|---------|-------|--------|-----|-----|-----|----|----|------|-----|-----|------|------|-----|
| 1 | Operator | QV-G Open Tasks | QV tasks extract + adapter | Y | 3 | 5 | 0 | 5 | 4 | 1 | 5 | 5 | 5 | 12–20 | **P227** |
| 2 | Operator | QV-J Tool actions | QV footer | Y | 8 | 0 | 0 | 4 | 5 | 2 | 4 | 4 | 5 | 10–14 | P228 candidate |
| 3 | Operator | OperatorTaskCard | task card | Y | 4 | 8 | 0 | 4 | 4 | 2 | 4 | 4 | 4 | 15–25 | Alt operator |
| 4 | Operator | QV-F Damages section | QV damages | Y | 4 | 0 | 0 | 3 | 4 | 2 | 4 | 4 | 5 | 6–8 | Later QV |
| 5 | Operator | QV-I Documents | QV docs | Y | 4 | 0 | 0 | 2 | 5 | 1 | 5 | 4 | 5 | 5–8 | Later QV |
| 6 | Operator | OperatorMoreView | more menu | Y | 9 | 2 | 0 | 3 | 3 | 2 | 3 | 3 | 5 | 20+ | Later |
| 7 | Operator | OperatorTodayView | today dashboard | Y | 12 | 4 | 0 | 5 | 2 | 3 | 2 | 3 | 4 | 35+ | Large |
| 8 | Operator | OperatorBookingFormSheet | booking form | Y | 16 | 6 | 0 | 4 | 2 | 4 | 2 | 3 | 4 | 40+ | Large |
| 9 | Rental/Vehicle | VehicleInsightsCard | insights | Y | 6 | 2 | 0 | 3 | 4 | 2 | 4 | 3 | 5 | 10–15 | Cross-domain |
| 10 | Operator | QV-B Quick actions | QV actions | Y | 6 | 2 | 0 | 5 | 3 | 4 | 3 | 3 | 4 | 8–12 | Coupled |
| 11 | Operator | OperatorAiUploadFlow | AI upload | Y | 11 | 6 | 0 | 3 | 2 | 4 | 2 | 2 | 4 | 35+ | Complex |
| 12 | Operator | QV-A Header/status | QV hero | Y | 15 | 10 | 2 | 5 | 2 | 4 | 2 | 3 | 4 | 25–35 | Coupled |

---

## 34. Quick View winner vs best alternative

| Comparison | Winner |
|------------|--------|
| Best Quick View sub-slice (QV-G) vs best other Operator (`OperatorTaskCard`) | **QUICK VIEW SUB-SLICE WINS** (higher vehicle-workflow centrality, equal task semantics, better boundedness) |
| vs best non-Operator (`VehicleInsightsCard`) | **QUICK VIEW SUB-SLICE WINS** |

---

## 35. Campaign decision

**CONTINUE OPERATOR — VEHICLE QUICK VIEW SUB-SLICE**

---

## 36. Selected P2.2.27 target

**P2.2.27 — Operator Vehicle Quick View Open Tasks Sub-Surface Localization (QV-G)**

---

## 37. One slice / split decision

**SPLIT REQUIRED — FIRST SUB-SLICE SELECTED**

---

## 38. Exact P227 production scope

| Path | Role | Presentation ownership | Machine/business | Why required |
|------|------|------------------------|------------------|--------------|
| `frontend/src/operator/components/OperatorVehicleQuickViewTasks.tsx` | **NEW** — tasks section + `OperatorTaskQuickRow` | section title, empty, Neu, status/overdue/priority labels | task IDs, status, priority, isOverdue, callbacks | bounded enforce-clean surface |
| `frontend/src/operator/lib/operator-vehicle-quick-view-i18n.ts` | **NEW** — presentation adapter | status/priority/overdue → TranslationKey | maps only | avoid touching global PriorityBadge / task-labels |
| `frontend/src/operator/components/OperatorVehicleQuickView.tsx` | host wiring | import/render extracted component | vehicleId, openSheet wiring | minimal integration |
| `frontend/src/i18n/translations/operator.vehicleQuickView.tasks.en.ts` | dictionary | QV-G strings | — | canonical EN |
| `frontend/src/i18n/translations/operator.vehicleQuickView.tasks.de.ts` | dictionary | QV-G strings | — | canonical DE |
| `frontend/src/i18n/translations/en.ts` / `de.ts` | registry | import new module | — | wire dictionaries |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | guard | `P227_ENFORCE_CLEAN_EXACT` | — | freeze boundary |
| `frontend/src/operator/components/operator-vehicle-quick-view-tasks-localization.test.tsx` | **NEW** tests | EN/DE render + locale switch | machine assertions | regression guards |

**Substantive production files:** 3 (extract, adapter, host wire) — within ≤3 target.

---

## 39. Presentation inventory for selected slice (QV-G)

| Concept | Current (DE/EN mix) | Target |
|---------|-------------------|--------|
| Section title | `Offene Aufgaben` | `operator.vehicleQuickView.tasks.sectionTitle` |
| Create CTA | `Neu` | `operator.vehicleQuickView.tasks.new` |
| Empty state | `Keine offenen Aufgaben.` | `operator.vehicleQuickView.tasks.empty` |
| Task status OPEN | `Offen` | reuse `tasks.filter.status.OPEN` |
| Task status IN_PROGRESS | `In Bearbeitung` | reuse `tasks.filter.status.IN_PROGRESS` |
| Task status WAITING | `Wartend` | reuse `tasks.filter.status.WAITING` |
| Overdue chip | `Überfällig` | reuse `status.overdue` |
| Priority CRITICAL/HIGH/NORMAL/LOW | English via PriorityBadge | reuse `tasks.filter.priority.*` |
| Task title | dynamic | **unchanged** |

---

## 40. Selected slice machine freeze

| Machine value | Used by | Presentation mapping? | Must remain unchanged? |
|---------------|---------|----------------------|------------------------|
| `vehicleId` | create task sheet | no | **YES** |
| `task.id` | row key, task-detail sheet | no | **YES** |
| `task.status` | tone, chip | yes → TranslationKey | **YES** (machine) |
| `task.priority` | PriorityBadge tone | yes → TranslationKey | **YES** (machine) |
| `task.isOverdue` | tone, label branch | yes (overdue label only) | **YES** (boolean) |
| `task.title` | row title | no (dynamic) | **YES** (content) |
| `task.dueDate` | sort only (not shown) | no | **YES** |
| `bookingId` (optional on create) | openSheet | no | **YES** |
| `type: 'task-detail' \| 'task-create'` | routing | no | **YES** |
| Sort order (overdue, dueDate) | `allOpenTasks` | no | **YES** |

---

## 41. State-preservation contract

QV-G has **no local expanded/selected UI state**. Future implementation must preserve on same-mount `DE ↔ EN`:

- task list order and contents
- `taskId` passed to `openSheet`
- `vehicleId` / `bookingId` on create-task action

---

## 42. Date/time freeze

QV-G does not render due timestamps. No date/time presentation in scope. Sorting on raw `dueDate` ISO values remains frozen.

---

## 43. Dynamic data freeze

Do **not** translate: task titles, vehicle labels passed to sheets, booking IDs, customer names.

---

## 44. Presentation adapter strategy

**Required:** `operator-vehicle-quick-view-i18n.ts`

Allowed:

- `taskStatusPresentationKey(status: ApiTaskStatus): TranslationKey`
- `taskPriorityPresentationKey(priority: ApiTaskPriority): TranslationKey`
- `taskOverduePresentationKey(): TranslationKey` → `status.overdue`

Forbidden: sorting, overdue predicate, routing, API, permissions, state mutation.

Pass computed `label` into `PriorityBadge` and `StatusChip` children.

---

## 45. Key reuse

| Reuse (existing) | New (estimated) |
|------------------|-----------------|
| `tasks.filter.status.OPEN` | `operator.vehicleQuickView.tasks.sectionTitle` |
| `tasks.filter.status.IN_PROGRESS` | `operator.vehicleQuickView.tasks.new` |
| `tasks.filter.status.WAITING` | `operator.vehicleQuickView.tasks.empty` |
| `tasks.filter.status.DONE` (guard only) | |
| `tasks.filter.priority.CRITICAL/HIGH/NORMAL/LOW` | |
| `status.overdue` | |

- **Recommended namespace:** `operator.vehicleQuickView.tasks.*`
- **Estimated new keys:** 3–5 EN + 3–5 DE
- **Duplicate risk:** low — no overlap with P226 `operator.tireMeasure.*`

---

## 46. P227 enforce-clean boundary

```text
P227_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewTasks.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
]
```

**Rationale:** Applying enforce-clean to full `OperatorVehicleQuickView.tsx` would force migrating all 22 scanner findings (~60–90 keys). Sub-component extraction is required and is **presentation-only** (move JSX + row helper, no semantic refactor).

`OperatorVehicleQuickView.tsx` host wiring changes are allowed but not enforce-clean scoped (remaining debt stays frozen for future QV slices).

---

## 47. Blind-spot guards

- Assert no raw `API_TASK_STATUS_LABEL_DE` / `taskStatusLabelDe` in QV-G files
- Assert no hardcoded `Überfällig` / `Offene Aufgaben` / `Neu`
- Assert `PriorityBadge` receives explicit localized `label` prop in QV-G
- Assert no raw TranslationKey text in render
- Dictionary ownership test for new namespace

---

## 48. Future runtime test contract

| Test | Required |
|------|----------|
| EN render — section + row labels | YES |
| DE render — section + row labels | YES |
| Same-mount DE → EN | YES |
| Same-mount EN → DE | YES |
| `task.id` preserved on open | YES |
| `vehicleId` on create preserved | YES |
| `task.status` machine unchanged | YES |
| `task.priority` machine unchanged | YES |
| `task.isOverdue` unchanged | YES |
| Dynamic `task.title` unchanged | YES |
| Callback `openSheet` args unchanged | YES |
| No raw TranslationKey leakage | YES |
| Expanded state | N/A |

---

## 49. Category E contract

Selected target can satisfy **Category E = 0** — presentation-only label mapping; no business/runtime semantic modifications.

---

## 50. Global freeze contract

Future P227 implementation must preserve all post-P226 freeze metrics (§1).

---

## 51. Shim freeze

- Baseline shim: **29**
- Future: `new compatibility consumers = 0`, `shim <= 29`
- No shim cleanup in P227

---

## 52. Active feature collision

| Active work | Material overlap with QV-G |
|-------------|---------------------------|
| PR #1200 Communication C11.4 media | **NONE** |
| P226 audits (#1199, #1201) | read-only |
| Vehicle Health / Master | none on QV task rows |

**Collision risk:** **LOW** — safe to proceed.

---

## 53. Implementation contract (if GO)

**TITLE:** P2.2.27 — Operator Vehicle Quick View Open Tasks Sub-Surface Localization

**AUTHORITATIVE BASE:** `9f87c3d793fa1f8c784df1d03e230c803ae5c740`

**IN SCOPE:**

- QV-G files listed in §38
- Canonical EN/DE keys + adapter
- P227 enforce-clean boundary
- Localization tests + guards
- Architecture/audit docs

**OUT OF SCOPE:**

- Remaining Quick View sub-surfaces (QV-A–F, I, J)
- P216–P226 frozen work
- `operatorVehicleQuickView.utils.ts` label maps
- `useOperatorVehicleQuickViewData` booking labels
- Global `PriorityBadge` / `task-labels.ts` refactor
- Tire section (P226)
- Shim cleanup

**Acceptance:** per task spec §53 (presentation debt 0 in scope, machine semantics preserved, P227=0, global debt 0, tests PASS).

---

## 54–55. Audit artifact & PR topology

- **Artifact:** this file (sole change)
- **Branch:** `cursor/p2227-post-p226-vehicle-quick-view-preflight-3c10`
- **Base:** `9f87c3d793fa1f8c784df1d03e230c803ae5c740`
- **Production modified:** NO
- **Dictionaries modified:** NO
- **Tests modified:** NO
- **Scanner modified:** NO

---

## 56. Final report summary

See companion agent final report (62-point checklist).

---

## 57. Final verdict

# **B — GO, BUT SPLIT — VEHICLE QUICK VIEW FIRST SUB-SLICE SELECTED**

**Selected first sub-slice:** QV-G — Open Tasks (`OperatorVehicleQuickView` tasks section + task quick row presentation).

**Explicit confirmations:**

| Item | Value |
|------|-------|
| Production code modified | **NO** |
| Dictionaries modified | **NO** |
| Tests modified | **NO** |
| Scanner modified | **NO** |
| P2.2.27 implementation started | **NO** |
| Merged | **NO** |

---

*Changes / Architektur: not updated (read-only pre-flight audit only).*

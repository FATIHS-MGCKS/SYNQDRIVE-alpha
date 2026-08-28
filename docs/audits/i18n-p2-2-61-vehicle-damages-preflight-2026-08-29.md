# P2.2.61 — Vehicle Damages Pre-Flight Audit

**Date:** 2026-08-29
**Mode:** Strict read-only target validation
**Campaign:** RENTAL
**Selected candidate:** Vehicle Damages
**Implementation:** NOT STARTED

---

## PART A — P260 freeze

| Check | Result |
|-------|--------|
| PR #1400 merged | **YES** (`mergedAt: 2026-08-28T20:50:35Z`) |
| Merge SHA | `aa5c1f79826982fb1d4957026b0e3a5009a15c17` |
| Implementation HEAD | `5a350e4856a7262b07e4c2cde2bd53660854abd6` |
| Final audit PR #1404 | **B — READY WITH NON-BLOCKING OBSERVATIONS** (open, audit-only) |
| P216–P260 | **FROZEN** |
| EN / DE | **9239 / 9239** (parity 100%, orphans 0) |
| Global / Rental scanner | **1375 / 278** |
| P260 enforce-clean | **0** |
| Active mounted Vehicle Documents | **100% i18n-clean** |

P260 non-blockers (File ref assertion gap, stale `ArchitekturView` card) recorded as history only — **not reopened**.

---

## PART B — Data Analyse planned-removal classification

**Classification:** `DEFERRED — PLANNED REMOVAL`

**Dependency verdict:** **SAFE TO DEFER FOR REMOVAL**

| Question | Answer |
|----------|--------|
| A. Standalone active page only? | **YES** — `currentView === 'data-analyse'` in `App.tsx`; permission `data-analyse.read` |
| B. Shared presentation with retained Rental surfaces? | **NO** — only global `components/patterns/*` design system |
| C. Shared dictionary keys only? | **NO overlap with Damages** — only `nav.dataAnalyse` sidebar label |
| D. Shared hooks/services without presentation? | `useRentalOrg` (generic); `api.dataAnalyse.*` (DataAnalyse-only consumer); `device-connection-ui.ts` / `rpm-webhook-ui.ts` shared with Trips/Fleet, **not Damages** |
| E. Safe to tag PLANNED REMOVAL? | **YES** for Vehicle Damages i18n |

**P261 non-touch gate:** `DataAnalyseView.tsx` and Data-Analyse-specific dictionaries/governance must remain **ZERO diff**.

---

## PART C — Baseline / drift

| Item | Value |
|------|-------|
| Campaign baseline | `aa5c1f79826982fb1d4957026b0e3a5009a15c17` |
| Current main | `272ccdf25820b8f7494a9211c5f994204f411c6f` |
| Baseline strategy | **DIRECT FROM P260 MERGE BASELINE** |
| Damages-path drift | **LOW** (4 files, 9 lines — cosmetic `rounded-2xl` / shadow class removals only) |

**Baseline health (verified on `aa5c1f79`):**

| Check | Result |
|-------|--------|
| `npm run i18n:check` | PASS — EN/DE 9239/9239 |
| `npm run check:surface` | PASS |
| Global scanner | 1375 |
| Rental scanner | 278 |
| Finance/Billing scanner | 25 |
| P260 enforce-clean | 0 |

---

## PART D — Damages production mount

```
Rental App (currentView)
  → Fleet → select vehicle → VehicleDetailTabBar tab "damages"
  → VehicleDetailTabPanel tab="damages"
  → DamagesView
      ├── useVehicleDamages (GET list + stats)
      ├── useVehicleDamageActions (mutations)
      ├── useDamageHandoverRefs (booking handover context)
      ├── DamageControlSummary
      ├── DamageInsightsSection
      ├── DamageEvidenceCanvas
      │     ├── DamageMapBlueprint (fallback)
      │     └── DamageHeatmapOverlay
      ├── DamageWorkQueue
      ├── DamageDetailDrawer (conditional)
      │     ├── AddDamagePhotoPanel
      │     └── DamageRentalSections
      ├── CreateDamageDialog (conditional)
      ├── MarkRepairedDialog (conditional)
      ├── CreateRepairTaskDialog (conditional)
      └── DamageAiIntakeDialog (conditional, feature-gated)
```

**Alternate entry:** Overview quick card → `setCurrentView('damages')`; Document intake apply → damages view.

### Surface classification

| File | Classification |
|------|----------------|
| `DamagesView.tsx` | ACTIVE MOUNTED |
| `damages/DamageControlSummary.tsx` | ACTIVE MOUNTED |
| `damages/DamageInsightsSection.tsx` | ACTIVE MOUNTED |
| `damages/DamageEvidenceCanvas.tsx` | ACTIVE MOUNTED |
| `damages/DamageWorkQueue.tsx` | ACTIVE MOUNTED |
| `damages/DamageDetailDrawer.tsx` | ACTIVE CONDITIONAL |
| `damages/CreateDamageDialog.tsx` | ACTIVE CONDITIONAL |
| `damages/MarkRepairedDialog.tsx` | ACTIVE CONDITIONAL |
| `damages/CreateRepairTaskDialog.tsx` | ACTIVE CONDITIONAL |
| `damages/DamageAiIntakeDialog.tsx` | ACTIVE CONDITIONAL |
| `damages/AddDamagePhotoPanel.tsx` | ACTIVE CONDITIONAL |
| `damages/DamageRentalSections.tsx` | ACTIVE CONDITIONAL |
| `damages/DamageMapBlueprint.tsx` | ACTIVE CONDITIONAL |
| `damages/DamageHeatmapOverlay.tsx` | ACTIVE CONDITIONAL |
| `hooks/useVehicleDamages.ts` | ACTIVE MOUNTED |
| `hooks/useVehicleDamageActions.ts` | ACTIVE MOUNTED |
| `hooks/useDamageHandoverRefs.ts` | ACTIVE MOUNTED |
| `hooks/useDamageAiIntake.ts` | ACTIVE CONDITIONAL |
| `lib/damage*.ts` | ACTIVE SHARED |
| `damages/damage-summary-display.ts` | ACTIVE SHARED (presentation) |
| `damages/damage-control.utils.ts` | ACTIVE SHARED (presentation + logic) |
| `operator/damages/*` | OPERATOR (out of P261 rental mount) |
| `figma-rental/App.tsx` | LEGACY DEAD |

---

## PART E — Scanner / hidden debt

### Visible scanner (mounted subtree)

| Metric | Count |
|--------|-------|
| Visible findings | **93** |
| Files with findings | **11** |
| By category | TEXT 66, TITLE 11, ARIA 5, PLACEHOLDER 7, LABEL 4 |

**Top files:** `DamageRentalSections` (15), `DamageWorkQueue` (14), `DamageAiIntakeDialog` (14), `CreateRepairTaskDialog` (13), `DamageDetailDrawer` (10).

### Hidden host copy (0 scanner findings, active presentation)

| File | Hidden debt |
|------|-------------|
| `damage-summary-display.ts` | KPI labels, badge labels, subtitle templates |
| `damage-control.utils.ts` | Map view labels, image source labels, oldest-age strings |
| `damage-rental-impact.ts` | Rental gate labels |
| `damage-insights.ts` | Insight card labels/hints |
| `damage.types.ts` | `formatSeverity`, `formatDamageSource`, `formatDamageType`, `formatEuroCents` (hardcoded `de-DE`) |
| `useVehicleDamageActions.ts` | Toast success/error host strings |
| `useVehicleDamages.ts` | Load/refresh error host strings |
| `DamageControlSummary.tsx` | Uses `DAMAGE_SUMMARY_COPY` (0 direct scanner hits) |
| `DamageMapBlueprint.tsx` | Blueprint chrome |
| `DamageHeatmapOverlay.tsx` | Overlay chrome |

### Total actionable Damage debt

| Bucket | Estimate |
|--------|----------|
| Visible scanner | 93 |
| Hidden lib/hook/summary copy | ~35–45 |
| **Total active actionable** | **~128–138** |
| Dead/legacy | `figma-rental` only (excluded) |

---

## PART F — Machines / raw ownership

### Damage DTO (authoritative: `DamageResponse`)

`id`, `vehicleId`, `damageType`, `severity`, `status`, `description`, `locationView`, `locationX`, `locationY`, `locationLabel`, `estimatedCostCents`, `repairCostCents`, `chargedToCustomerCents`, `depositHoldCents`, `source`, `rentalImpact`, `evidenceStatus`, `liabilityStatus`, `liabilityNote`, `reportedBy`, `reportedAt`, `createdAt`, `updatedAt`, `repairStartedAt`, `repairedAt`, `bookingId`, `customerId`, `handoverProtocolId`, `taskId`, `images[]`.

**No separate `title` field** — drawer title is **HOST GENERATED** from `formatDamageType(damage.damageType)`.

### Raw ownership

| Field | Ownership |
|-------|-----------|
| `description` | **USER/BACKEND RAW** — fixture `Provider Damage Description X7` |
| `locationLabel` | **RAW** if free text; machine view separate |
| `liabilityNote` | **USER RAW** |
| `taskId` | **MACHINE ID** — raw |
| Linked task `title` | **BACKEND RAW** — fixture `Provider Task Title X7` |
| `images[].url`, `caption` | **BACKEND RAW** / user caption |
| `reportedBy` | **BACKEND RAW** |
| Error from API | **BACKEND RAW** — fixture `Backend Damage Error X7` |
| Toast `formatApiError` | **BACKEND RAW** precedence |

### Machine freeze matrix (summary)

| Machine | Values | May localize label? | Tone driver |
|---------|--------|----------------------|-------------|
| `damageType` | SCRATCH, DENT, CRACK, BROKEN_PART, PAINT_DAMAGE, GLASS_DAMAGE, TIRE_DAMAGE, INTERIOR_DAMAGE, OTHER | YES | — |
| `severity` | MINOR, MODERATE, MAJOR, CRITICAL | YES | pin variant input |
| `status` | OPEN, IN_REPAIR, REPAIRED, ARCHIVED | YES | badge/chip |
| `locationView` | FRONT, LEFT, RIGHT, REAR, ROOF, UNKNOWN | YES | — |
| `rentalImpact` | NONE, WATCH, BLOCK_RENTAL, SAFETY_CRITICAL | YES | gate tone |
| `evidenceStatus` | MISSING, PARTIAL, COMPLETE, DISPUTED | YES | — |
| `liabilityStatus` | 6 values | YES | — |
| `source` | MANUAL, PICKUP_HANDOVER, RETURN_HANDOVER, AI_UPLOAD, WORKSHOP, INSPECTION | YES | — |
| `DamageQueueFilter` | open, blocking, missing_evidence, unplaced, repaired, all | YES (UI-only) | — |
| `PinVisualVariant` | critical, blocking, warning, in_repair, repaired, neutral | NO (CSS class map) | machine-derived |

**No `statusLabel` / `severityLabel` API fields** — labels derived from machines via formatters.

### Date / cost semantics

- **Dates:** ISO timestamps in logic; `formatDamageDate` currently hardcoded `de-DE` — locale presentation change allowed, not comparison/sort.
- **Costs:** cents integers in payloads; `formatEuroCents` hardcoded `de-DE` — presentation-only locale switch.

---

## PART G — Mutations / photo / cost

| Action | Endpoint | Method |
|--------|----------|--------|
| Create | `/vehicles/:vehicleId/damages` | POST |
| Place on map | `/vehicles/:vehicleId/damages/:damageId/place` | PATCH |
| Add photo | `/vehicles/:vehicleId/damages/:damageId/images` | POST |
| Mark in repair | `/vehicles/:vehicleId/damages/:damageId` | PATCH (`status: IN_REPAIR`) |
| Mark repaired | `/vehicles/:vehicleId/damages/:damageId/repair` | PATCH |
| Archive | `/vehicles/:vehicleId/damages/:damageId` | PATCH (`status: ARCHIVED`) |
| Update liability/cost | `/vehicles/:vehicleId/damages/:damageId` | PATCH |
| Create repair task | `/vehicles/:vehicleId/damages/:damageId/repair-task` | POST |
| AI analyze exterior | `/vehicles/:vehicleId/damages/ai-analyze-exterior` | POST |

**Photo contract:** `AddDamageImageInput { imageData, caption?, uploadedBy? }`; create dialog may embed `images[]` in create payload. File → data URL via `readFileAsDataUrl`.

**P261 freeze:** All endpoints, methods, payloads, IDs, machine values, File identity, photo order — **unchanged**.

---

## PART H — Same-mount contract

**State to preserve DE→EN→DE:**

- Selected damage / open drawer
- Queue filter (`DamageQueueFilter`)
- Create/edit/repair dialog open + form values
- Raw `description`, `liabilityNote`, reupload-style text fields
- Severity/status/location machine selections
- Photo selection / uploaded `File` refs
- Cost input strings
- Confirmation modal open state
- Search (none today — filter chips only)

**React identity:** No `key={locale}` or `key={t(...)}` in damages subtree (verified).

**Locale side-effect gate:** Pure locale switch must produce **0** deltas for create, edit, delete, status, photo upload/delete, task navigation, business refetch.

---

## PART I — Key / reuse / split

### Canonical reuse candidates

| Existing | Reuse for Damages |
|----------|-------------------|
| `vehicle.damages` | EXACT — tab label |
| `damages.totalDamages`, `activeDamages`, etc. | WEAK — legacy keys, different context |
| `common.retry`, `common.cancel` | EXACT |
| `tasks.*` | WEAK — repair task dialog only where exact |
| Health severity/status | **DO NOT FORCE** — different semantics |

### Projected new keys

| Bucket | Estimate |
|--------|----------|
| Machine label maps (type/severity/status/location/impact/evidence/liability/source) | ~45 |
| Overview chrome (KPI, insights, queue, canvas) | ~40 |
| Drawer + rental sections | ~25 |
| Dialogs (create, repair, mark repaired, AI intake) | ~35 |
| Validation / toast / error host | ~15 |
| ARIA / placeholders | ~16 |
| **Gross** | **~130–145** |
| Minus exact reuse | ~10–15 |
| **Net projected** | **~115–130** |

**Key budget gate:** >60 → **must reassess/split**.

### Split options evaluated

| Option | Keys | Risk | Coherence |
|--------|------|------|-----------|
| A — COMPLETE | ~115–130 | High mutation/photo Category E risk | Best UX |
| B — LIST/OVERVIEW FIRST | ~50–60 | Lower | Half-localized tab |
| D — FORMS/MUTATIONS SEPARATE | ~60–70 deferred | Medium | Poor interim UX |
| E — PHOTO FLOW SEPARATE | splits File identity tests | High | Fragmented |

### Split decision

**ONE SLICE — VEHICLE DAMAGES COMPLETE**

Rationale: Single cohesive vehicle-detail tab (same pattern as P260 complete upload/extraction slice). Projected ~115–130 keys is within P260 precedent (157) and below 160 pre-flight hard stop. Splitting would leave mutation chrome English while overview localized — poor operator UX on a safety-critical surface.

**157-key exception analogue:** Projected ~120 keys justified for complete mounted tab with adapter + machine maps.

### Adapter strategy

Create `rental-vehicle-damages-i18n.ts`:

- `resolveDamageTypeLabel`, `resolveSeverityLabel`, `resolveStatusLabel`, `resolveLocationViewLabel`, `resolveRentalImpactLabel`, `resolveEvidenceLabel`, `resolveLiabilityLabel`, `resolveSourceLabel`, `resolveQueueFilterLabel`
- `resolveDamageHostError`, validation codes
- Delegate date/currency to locale-aware formatters (replace hardcoded `de-DE` in presentation path only)

**Forbidden in adapter:** eligibility, status transitions, cost math, sort/filter logic, permissions, payloads.

---

## PART J — Governance / tests

### Proposed P261 enforce-clean exact paths (17)

1. `rental/components/DamagesView.tsx`
2. `rental/components/damages/DamageControlSummary.tsx`
3. `rental/components/damages/DamageInsightsSection.tsx`
4. `rental/components/damages/DamageEvidenceCanvas.tsx`
5. `rental/components/damages/DamageWorkQueue.tsx`
6. `rental/components/damages/DamageDetailDrawer.tsx`
7. `rental/components/damages/CreateDamageDialog.tsx`
8. `rental/components/damages/MarkRepairedDialog.tsx`
9. `rental/components/damages/CreateRepairTaskDialog.tsx`
10. `rental/components/damages/DamageAiIntakeDialog.tsx`
11. `rental/components/damages/AddDamagePhotoPanel.tsx`
12. `rental/components/damages/DamageRentalSections.tsx`
13. `rental/components/damages/damage-summary-display.ts`
14. `rental/components/damages/damage-control.utils.ts` (presentation strings only — sort/filter logic frozen)
15. `rental/lib/rental-vehicle-damages-i18n.ts` (new)
16. `rental/hooks/useVehicleDamages.ts` (host error strings → codes)
17. `rental/hooks/useVehicleDamageActions.ts` (toast host keys → codes)

**Excluded:** Operator damages, `figma-rental`, `DataAnalyseView.tsx`.

### Category E feasibility

**FEASIBLE** with P260-proven patterns: machine codes at hook boundary, raw description/task title/errors preserved, locale-aware date/cost presentation only, File identity tests, mutation counter tests, real hook tests for create/confirm-equivalent mutations.

### Test plan (future implementation)

1. **Read-only:** DE/EN host copy, machine maps, tone from machines, raw fixtures, unknown fallbacks
2. **Same-mount:** Persistent `DamagesView` mount; selected damage + filter + open drawer + form input; DE→EN→DE
3. **Mutations:** Real `useVehicleDamageActions` contract — endpoint, method, payload, IDs, raw text, File ref
4. **Locale side-effects:** All mutation counters = 0 on pure locale switch
5. **P260 regression:** Vehicle Documents zero semantic diff

---

## PART K — Campaign progress

### Denominator rules

| Class | Data Analyse |
|-------|--------------|
| LOCALIZED | No |
| ACTIVE ACTIONABLE | No (excluded) |
| DEFERRED — PLANNED REMOVAL | **YES** |
| LEGACY DEAD | `figma-rental` |

### Metrics (post-P260, pre-P261)

| Metric | Value |
|--------|-------|
| A. Retained-product active mounted coverage | **~77%** (denominator excludes Data Analyse) |
| B. Literal active mounted coverage (incl. deferred Data Analyse) | **~75%** |
| C. Actionable presentation debt cleared (P216–P260) | **~80%** |
| D. Rental scanner debt remaining | **278** |
| Damages share of rental debt | **~46%** (~128/278) |

### Projected after P261 (complete slice)

| Metric | Projected |
|--------|-----------|
| Retained-product coverage | **~85%** |
| Literal coverage | **~83%** |
| Rental scanner reduction | **~128** → ~150 remaining |
| Actionable debt cleared | **~88%** |

---

## PART L — P262 forecast

| Rank | Target | Signal |
|------|--------|--------|
| 1 | **Users & Roles** (`users-roles/UsersTab.tsx`) | Multiple scanner findings, high admin visibility |
| 2 | Finance/Billing residual | 25 scanner findings |
| 3 | Tasks residual | 13 scanner findings |

**Likely P2.2.62:** Users & Roles

---

## Collision

**NONE** — no open PRs with HIGH/DIRECT overlap on Damages paths. Trip-detection PRs unrelated.

---

## Final verdict

**A — GO — P2.2.61 VEHICLE DAMAGES COMPLETE SELECTED**

Complete mounted Vehicle Damages tab in one bounded slice (~115–130 projected keys). Category E feasible with adapter + behavioral tests. Data Analyse safely deferred. Baseline: P260 merge SHA.

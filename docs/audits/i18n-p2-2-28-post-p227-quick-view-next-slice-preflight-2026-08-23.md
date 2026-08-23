# P2.2.28 — Post-P227 Vehicle Quick View Next-Slice Pre-Flight

**Date:** 2026-08-23
**Mode:** STRICT READ-ONLY PRE-FLIGHT (topology-recovered)
**Authoritative P228 baseline:** `314f20aabcf91eab8fd0e4ac44a10428af857c20` (merge commit of PR #1203 / P2.2.27 QV-G)
**Recovery branch:** `cursor/p2228-preflight-topology-recovery-3c10`
**Supersedes:** PR #1207 — **SUPERSEDED — INVALID AUDIT TOPOLOGY** (41 commits on `main`, base SHA `78c56496`, not authoritative baseline)

---

## 0. Topology recovery

| Check | #1207 (invalid) | Recovery (authoritative) |
|-------|-----------------|--------------------------|
| Base | `main` @ `78c56496` | `314f20aabcf91eab8fd0e4ac44a10428af857c20` |
| Ancestry commits | 41 | **1** (audit only) |
| Changed files | audit + unrelated history | **1** audit artifact |
| Production changes | 0 in audit commit | **0** |
| `merge-base(HEAD, baseline)` | ≠ baseline | **= baseline** ✓ |
| `git diff --check` | — | **PASS** |

**Recovery verification:**

```text
git merge-base HEAD 314f20aabcf91eab8fd0e4ac44a10428af857c20
→ 314f20aabcf91eab8fd0e4ac44a10428af857c20

git rev-list --count 314f20aabcf91eab8fd0e4ac44a10428af857c20..HEAD
→ 1
```

---

## 1. Post-P227 freeze (revalidated on authoritative baseline)

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** |
| i18n suite count | **325** tests |
| EN keys | **8434** |
| DE keys | **8434** |
| Parity | **100%** |
| Orphans | **0** |
| Global active enforce-clean debt | **0** |
| Shim inventory | **29** (prod 18, test 11) |
| New compatibility consumers | **0** |
| `status.overdue` DE | **`Überfällig`** ✓ |

### Per-slice enforce-clean (all **0**)

P227, P226, P225, P224, P223, P222, P221, P220, P219, P218, P217, P216A, P216B1, P216B2, P216C1, P216C2A, P216C2B

QV-G frozen boundary: `OperatorVehicleQuickViewTasks.tsx` + `operator-vehicle-quick-view-i18n.ts` tasks API — **0 findings**.

---

## 2. Remaining Quick View residual (revalidated)

| Surface | Scanner findings |
|---------|-----------------|
| `OperatorVehicleQuickView.tsx` (parent) | **20** |
| `OperatorVehicleQuickViewTasks.tsx` (QV-G) | **0** |
| `operator-vehicle-quick-view-i18n.ts` (QV-G) | **0** |
| `operatorVehicleQuickView.utils.ts` | **0** (label maps not scanner-flagged; presentation debt) |
| `useOperatorVehicleQuickViewData.ts` | **0** (4 German hook labels = hidden debt) |

**Logical residual areas confirmed:**

| ID | Area | Bounded? |
|----|------|----------|
| QV-A | Header / primary status / release | YES |
| QV-B | Quick actions (handover + booking CTA) | YES |
| QV-C | Booking/customer context | YES |
| QV-D | Blockers & hints | Partial |
| QV-E | Rental Health modules | NO (defer) |
| QV-F | Active damages | YES (low value) |
| QV-G | Open Tasks | **FROZEN** |
| QV-H | Tire profile | YES (P226 semantics freeze) |
| QV-I | Documents | YES (low value) |
| QV-J | Tool/footer actions | YES |

---

## 3. Fixed-locale claim (revalidated)

**CONFIRMED — REAL PRESENTATION DEBT**

| Path | Line | Symbol | Purpose | Machine input | Presentation output |
|------|------|--------|---------|---------------|---------------------|
| `OperatorVehicleQuickView.tsx` | 82 | `locale: 'de'` | `resolveFleetVehicleDisplayState` | vehicle + health | `statusBadge.label` forced German |
| `OperatorVehicleQuickView.tsx` | 152 | `locale="de"` | `VehicleOperationalStatusCallout` | vehicle + badge | callout copy forced German |
| `operatorVehicleQuickView.utils.ts` | 138 | `locale: 'de'` | `resolveUnreliableOperationalStatusDisplay` | vehicle | `primaryLabel` fallback forced German |

`useLanguage().locale` is read at L64 but **not threaded** to fleet display or callout — EN operators see German status chrome.

---

## 4. Selected P2.2.28 target (revalidated)

**P2.2.28 — Operator Vehicle Quick View Header & Primary Status Localization**

### Header surface (L70–193 + not-found L73)

- Vehicle identity chrome (license, model, station — dynamic, not translated)
- Close control (`aria-label`)
- Primary status chip (`snapshot.primaryLabel` / tone)
- Fleet status badge (`fleetDisplay.statusBadge`)
- Cleaning chip (`cleaningStatus === 'Needs Cleaning'`)
- Unreliable operational callout
- Release block ("Darf raus?" + `releaseLabel`)
- Rental Health suffix in hero (`overall_state`)

**Out of scope:** quick actions, booking, blockers, health modules, damages, tasks (frozen), tire, documents, footer tools.

### Machine/display separation (SAFE)

| Machine value | Presentation | Logic use |
|---------------|--------------|-----------|
| `vehicleId` | not translated | props/callbacks |
| `license`, `model`, `station` | raw display | identity |
| `OperatorPrimaryStatus` | label via adapter | snapshot derivation only |
| `OperatorReleaseDecision` | label via adapter | display only |
| `RentalHealthState` (`overall_state`) | label via adapter | display only |
| `cleaningStatus` enum | label via adapter | enum gate (`=== 'Needs Cleaning'`) |
| `primaryTone` / `releaseTone` | chip styling | style from machine, not label |

No translated text used for comparisons, sorting, filtering, API, routing, or permissions.

### Callbacks (unchanged)

| Callback | Scope |
|----------|-------|
| `onClose` | header close button |
| `data.reloadDetails` | callout refresh |

Handover/booking/sheet actions remain out of scope.

---

## 5. Adapter strategy (revalidated)

**EXTEND EXISTING ADAPTER**

Extend `operator-vehicle-quick-view-i18n.ts` with header/status presentation functions. QV-G task API remains frozen. Utils keeps machine derivation; adapter maps enums → `TranslationKey`.

---

## 6. Key estimate (revalidated)

| Type | Count | Examples |
|------|-------|---------|
| Reuse | ~8 | `common.close`, `health.state.*`, `dashboard.fleet.cleaningPending`, `dashboard.label.ready/blocked` |
| New | ~6–8 | `operator.vehicleQuickView.header.notFound`, `releaseQuestion`, `release.*`, `rentalHealthPrefix` |
| **Total new** | **≤ 12** | Well under 70-key gate |

---

## 7. P228 enforce-clean boundary (revalidated)

**Option B — narrow structural extraction required** (P227 precedent)

Parent `OperatorVehicleQuickView.tsx` contains later-slice residual. Enforcing on parent would broaden scope.

```text
P228_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewHeader.tsx',  // NEW extracted hero
  'operator/lib/operator-vehicle-quick-view-i18n.ts',        // header fns; QV-G frozen
]
```

No ignores/allowlists to hide later debt.

---

## 8. Split decision (revalidated)

**ONE SLICE** — Header & Primary Status only.

---

## 9. Quick ranking revalidation (abbreviated)

| Rank | Candidate | Ops | Sep | Risk | Bnd | Test | Coll | Total |
|------|-----------|-----|-----|------|-----|------|------|-------|
| **1** | **Header & Primary Status** | 5 | 3 | 2 | 3 | 4 | 5 | **27** |
| 2 | Quick Actions | 5 | 4 | 2 | 5 | 5 | 5 | 26 |
| 3 | Tool/Footer | 4 | 4 | 1 | 5 | 5 | 5 | 23 |
| 4 | Booking Context | 3 | 4 | 1 | 5 | 4 | 5 | 21 |
| 5 | Booking Form Sheet (non-QV) | 4 | 2 | 4 | 2 | 3 | 4 | 19 |

**Header & Primary Status remains #1** — fixed-DE debt + highest operator leverage.

---

## 10. Collision & main drift

| Check | Result |
|-------|--------|
| Communication Center #1205 | **NONE** |
| Active Operator/QV i18n work | **NONE** (audit PRs only) |
| Main SHA | `a3970671a98286577d9aa8ae813d6b2d84c0eb15` |
| Main commits after baseline touching P228 scope | **0** (ancestry-path) |
| Future implementation | branch from `314f20aa`; rebase to current `main` only if needed at impl time |

**Collision: NONE**

---

## 11. Campaign decision

**CONTINUE OPERATOR — VEHICLE QUICK VIEW**

---

## 12. Implementation contract

**TITLE:** P2.2.28 — Operator Vehicle Quick View Header & Primary Status Localization

**AUTHORITATIVE BASE:** `314f20aabcf91eab8fd0e4ac44a10428af857c20`

**IN SCOPE:**

- `OperatorVehicleQuickViewHeader.tsx` (extracted hero)
- `OperatorVehicleQuickView.tsx` (wiring only)
- `operator-vehicle-quick-view-i18n.ts` (header extension)
- `operatorVehicleQuickView.utils.ts` (presentation label resolution via adapter; derivation frozen)
- `operator.vehicleQuickView.header.{en,de}.ts`
- P228 tests, enforce-clean, docs

**OUT OF SCOPE:** QV-G Open Tasks, quick actions, tool/footer, booking context, health modules, blockers, damages, tire, documents, P216–P227 frozen work, business logic, API, routing, permissions, shim cleanup, Communication Center

**MACHINE FREEZE:** vehicle identity, status machine values, readiness/availability codes, assignee (N/A in header), callback args, routes, permissions, dynamic business data

**Acceptance:** selected visible/hidden/fixed-locale debt = 0; EN/DE correct; locale threading fixed; machine values unchanged; Category E = 0; P228 = 0; P227–P216 = 0; global enforce-clean = 0; tests + build + `git diff --check` PASS.

---

## 13. Source #1207 disposition

**SUPERSEDED — INVALID AUDIT TOPOLOGY**

Findings materially reproduced on authoritative baseline. This recovery artifact is authoritative P228 pre-flight evidence.

---

## 14. Final verdict

**A — GO — P2.2.28 TARGET SELECTED**

P2.2.28 implementation may now begin from authoritative baseline `314f20aabcf91eab8fd0e4ac44a10428af857c20`.

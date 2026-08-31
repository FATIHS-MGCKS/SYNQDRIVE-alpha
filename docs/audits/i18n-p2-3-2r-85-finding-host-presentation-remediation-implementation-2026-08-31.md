# P2.3.2R — Certified 85-Finding Host-Presentation Remediation

**Date:** 2026-08-31
**Mode:** STRICT IMPLEMENTATION
**Base branch:** `p239-p238-merge-baseline-3c10`
**Base SHA:** `fd78c422d205c08ef5759f37bc2f21d73a601123`
**Governance foundation:** PR #1450 (merged)

---

## PART A — Baseline / topology

| Item | Value |
|------|-------|
| Campaign branch | `p239-p238-merge-baseline-3c10` |
| Base SHA | `fd78c422d205c08ef5759f37bc2f21d73a601123` |
| Pre-remediation active denominator | **85** |
| `fingerprintVersion` | **3** (unchanged) |
| `governanceBaseline.findingCount` | **1627** (unchanged) |
| `governanceBaseline.capturedFromSha` | `381671605ea1cd55844518312839b0f7d99a48bd` (unchanged) |
| Manifest production diff | **0** |
| Scanner/governance code diff | **0** |

---

## PART B — Authoritative 85 inventory

All 85 fingerprints were `ACTIVE_REMEDIATION_REQUIRED` / `TRUE_HOST_PRESENTATION` per audits #1455 and #1457.
Pre-implementation reproduction: `ACTIVE_REMEDIATION_REQUIRED = 85`, `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT = 0`.

---

## PART C — Path / family census

| Family | Count |
|--------|------:|
| Rental App shell / cleaning | 10 |
| BookingDossier | 5 |
| BookingEditDialog | 2 |
| BookingsView | 9 |
| Customer surfaces and hooks | 11 |
| BrakeEvidencePanel | 2 |
| Telltale context | 1 |
| MobileBookingFooter | 1 |
| NewBookingView | 24 |
| ServiceOverviewPanel | 2 |
| CompanySections | 2 |
| useDataAuthorizationCenter | 6 |
| Vehicle assignment/category/override | 4 |
| VehicleBookingsView / VehicleTasksView | 2 |
| VoiceAssistantBuilder | 2 |
| VoiceConversationsPanel | 2 |
| **Total** | **85** |

V3 duplicate siblings (6 additional ordinals) included in NewBookingView and CustomersView counts.

---

## PART D — Key reuse / new accounting

| Metric | Count |
|--------|------:|
| Baseline EN / DE | 9736 / 9736 |
| New keys introduced | **67** |
| Reused existing keys | **18 finding instances** |
| Final EN / DE | **9803 / 9803** |
| Parity | **100%** |
| Orphans | **0** |
| Unused new keys | **0** |

**Reused keys (representative):** `settings.company.toast.noOrg`, `common.back`, `customers.wizard.createdToast`, `customers.wizard.createFailed`, `operator.bookings.cancelNoShow.toast.cancelled`, `operator.bookings.cancelNoShow.toast.noShowMarked`, `newBooking.success.title`.

**New key namespaces:** `rental.shell.cleaning.*`, `rental.hostPresentation` slice (`bookings.toast.*`, `newBooking.toast.*`, `customers.error.*`, `rental.vehicleHealth.aria.*`, `rental.vehicleAssignments.*`, etc.), `settings.dataAuth.toast.*`, `voice.builder.placeholder.*`, `voice.conversations.toast.*`.

---

## PART E — Raw / machine ownership

- API `err.message` / `extractErrorMessage(err)` preserved in toast descriptions and error paths.
- Provider names, customer names, vehicle plates, station names, booking IDs remain raw in interpolated descriptions.
- Machine enums and domain statuses unchanged; only host framing localized.
- Brake aria labels split DE/EN (no bilingual `"Datenqualität / Data quality"` hardcode).

---

## PART F — Implementation matrix

**Result: 85 / 85 RESOLVED** (`ACTIVE_REMEDIATION_REQUIRED = 0`).

All 85 certified fingerprints remediated via `t('…')` with `REUSED_KEY` or `NEW_KEY`. No manifest suppression, no baseline recapture.

---

## PART G — Same-mount witnesses

`rental-p232r-host-presentation-localization.test.tsx` covers:

1. Rental shell cleaning toast key (`rental.shell.cleaning.toast.taskCreated`)
2. Booking mutation toast (`bookings.toast.saved`)
3. NewBooking validation toast (`newBooking.toast.incomplete`)
4. Customer toast (`customers.toast.noteSaved`)
5. Aria labels (`rental.vehicleHealth.aria.dataQuality` / `.safety`)
6. Data authorization toast (`settings.dataAuth.toast.approved`)
7. Voice conversation toast (`voice.conversations.toast.taskCreated`)

DE → EN → DE on same mount without `key={locale}` remount.

---

## PART H — Zero-refetch witnesses

Locale-only switch does not increment mocked fetch counters in P2.3.2R test harness.

---

## PART I — Scanner before / after

| Metric | Before | After |
|--------|-------:|------:|
| Enhanced total | 1627 | 1542 |
| Rental enhanced | 342 | 257 |
| Finance/Billing enhanced | 43 | 43 |
| Active remediation | 85 | **0** |
| NEW_UNCLASSIFIED | 0 | **0** |
| Baseline fingerprint count | 1627 | **1627** |

Delta explanation: 85 enforce-clean host-presentation literals removed from live scan; historical baseline fingerprints unchanged.

---

## PART J — Legacy before / after

| Scope | Before | After |
|-------|-------:|------:|
| Global legacy | 1241 | 1241 |
| Rental legacy | 144 | 144 |
| Finance/Billing legacy | 25 | 25 |
| New legacy findings | — | **0** |

---

## PART K — Dictionary accounting

See Part D. `npm run i18n:check` reports `Canonical keys: 9803`, EN/DE 100% complete.

---

## PART L — Validations

| Check | Result |
|-------|--------|
| `npm run i18n:scanner:test` | PASS (45/45) |
| `npm run i18n:check` | PASS |
| `npm run check:surface` | PASS |
| `npm run i18n:governance` | PASS (exit 0) |
| `npx tsc -b` | PASS |
| `npm run build` | PASS |
| P2.3.2R focused tests | PASS (6/6) |
| `git diff --check` | PASS |

---

## PART M — Product firewall

| Area | Diff |
|------|------|
| Help Center | 0 |
| Data Analyse | 0 |
| IAM dead CRUD | 0 |
| DIMO / Trips / Energy / Battery scoring | 0 |
| Category E business drift | 0 |

---

## PART N — P2.3.3 readiness

Governance foundation merged (#1450). Active remediation denominator cleared.
**Independent remediation audit required before merge.** Do not merge on self-certification alone.

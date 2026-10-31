# VSI P2-B — Evidence Ledger UX Architecture (2026-10-31)

Status: `PROPOSED` design specification · Epistemic basis: repository code at `f7a21c48c86e94a48c4de1e9aa7f8a2cc48ebea7` + P2-A audit · No usability measurements were performed; all comprehension claims are reasoned, not tested.

Scope: Master Admin **Vehicle Signal Intelligence Evidence Ledger** (read-only). No backend contract changes are required for the MVP; optional follow-ups are listed under Data-contract gaps.

---

## 1. Executive recommendation

| Question | Recommendation | One-line rationale |
|----------|----------------|--------------------|
| Multi-axis evidence layout | **C — Hybrid: compact evidence summary strip + expandable dimension detail**, with **side-by-side lanes retained inside the RPM section only** | Keeps nine independent dimensions visible without a wall of cards; lanes stay where two sources genuinely coexist (snapshot vs HF). |
| Detail interaction | **A — Right-side drawer (desktop ≥1024px) / full-screen sheet (mobile)**, URL-synced via `signalKey` | Preserves ledger filters + scroll, supports prev/next signal, reuses existing `sheet.tsx`; dedicated route adds routing surface without benefit at current signal counts. |
| Fleet scaling | **Vehicle-scoped MVP**; org-wide view limited to a **bounded "pinned/recent vehicles" list (≤12)** using existing `overview` endpoint; org-wide matrix only after a dedicated aggregate read model exists | Avoids unbounded N+1; the current API has no fleet aggregate. |

Core principle: **every dimension gets its own cell/chip; nothing is merged into a single status**. `NEVER_OBSERVED` (Lane A snapshot) + `PROVEN_HISTORICAL_ONLY` (combined RPM) is a valid, displayable pair.

---

## 2. Decision matrices

### 2.1 Multi-axis evidence layout

| Criterion | A. Side-by-side lanes | B. Stacked dimension cards | C. Hybrid summary + expandable detail |
|-----------|----------------------|----------------------------|---------------------------------------|
| Operator comprehension of independence | Good for 2 sources; weak for 9 orthogonal dimensions (forces artificial lane assignment for applicability, declared support, limitations) | Strong: one card per dimension | Strong: chips name the dimension explicitly; detail expands per dimension |
| Information density | Medium | Low (9 cards × padding; long scroll on 390px) | High (one-line strip; detail on demand) |
| Failure mode: conflating historical vs live | Low (lanes separate) | Medium (cards visually equal; user may average them) | Low when combined-evidence chip is visually dominant and lanes are kept for RPM |
| Failure mode: UNKNOWN read as error | Depends on color | Depends on color | Mitigated by neutral chip tier |
| Implementation cost | Exists for RPM | New component system | Moderate: `EvidenceDimensionChip` + `DimensionDetailBlock` |
| Mobile | Lanes collapse to stack anyway | Long | Strip wraps; detail accordion |

**Decision: C**, with A embedded for the RPM snapshot/HF section (already implemented in `VsiEngineRpmDualProvenancePanel`).

### 2.2 Detail interaction

| Criterion | A. Drawer / mobile sheet | B. Dedicated route | C. Inline table expansion |
|-----------|--------------------------|--------------------|---------------------------|
| 1280px | Table remains visible (≈ 60/40 split or overlay 480–560px) | Table hidden; back navigation needed | Row expands; pushes other rows, loses column alignment for wide content |
| 390px | Full-screen sheet (native pattern) | Full page | Vertical explosion; hard to scan |
| Keyboard | Radix `Sheet` provides focus trap, Esc, restoration to trigger | Standard page focus; restoration must be manual | Needs custom aria-expanded + focus handling |
| Shareable URL | `signalKey` query param (same mechanism as `providerSourceLinkId`) | Native | Possible via query but ambiguous with scroll state |
| Switch signals | Prev/Next in drawer header + table row click while open (desktop) | Reload page per signal | Collapse/expand each |
| Preserve filters/scroll | Yes (table untouched) | No (unless state serialized) | Yes but layout shifts |
| Multi-link ambiguity | Drawer header shows link id + provider; link picker stays in scope bar | Must encode link in route | Same as drawer |
| Complexity | Low (reuse `components/ui/sheet.tsx`) | Medium (Master SPA uses `?view=` not router paths) | Medium (custom a11y) |

**Decision: A.** Master SPA navigation is query-param based (`?view=`); a dedicated route would introduce a second navigation paradigm.

### 2.3 Fleet scaling

| Option | Safety | Verdict |
|--------|--------|---------|
| Org-wide N+1 `overview` for all vehicles | Unbounded; 200 vehicles → 200 sequential/parallel calls | **Rejected** |
| Vehicle-scoped ledger (org → vehicle → link) | Bounded: 1 overview + 1 profile + 1 revisions | **MVP** |
| Bounded multi-vehicle strip: ≤12 vehicles (recent/pinned, stored client-side), explicit "Load" action, concurrency 3 | Bounded by constant | **Phase 2 optional** |
| Org aggregate read model (`GET …/vsi/organizations/:orgId/ledger-summary` with cursor pagination) | Server-bounded | **Required before any org-wide matrix, sorting or filtering by status across vehicles** |

Trigger to build the aggregate: any requirement to **sort or filter vehicles by signal status** across an organization, or any org with more vehicles than the bounded strip can show.

---

## 3. Master navigation and page hierarchy

```
Master Admin
└─ Connectivity
   ├─ VSI Intelligence  (existing nav id `vsi-intelligence`)  → becomes "Signal Evidence Ledger"
   │   ├─ Scope bar (org / vehicle / link / as-of)
   │   ├─ Tab: Overview          (profile per link, blockers, cross-links)
   │   ├─ Tab: Signal Ledger     (dense table + filters + detail drawer)
   │   └─ Tab: Revisions         (timeline, as-of resolver, capture status)
   ├─ APDS Intelligence (unchanged)
   └─ High Mobility (unchanged)
Fleet
└─ Connected Vehicles → Vehicle detail → Intelligence section → "Open Signal Ledger" (context deep link)
```

Tabs use existing `MasterPageTabs`; URL param `tab=overview|ledger|revisions` (default `overview`, or `ledger` when `signalKey` is present).

No new sidebar entry. Label change ("VSI Intelligence" → "Signal Evidence Ledger") is a translation update across 9 locales; nav id stays.

---

## 4. Scope selector behavior

| Element | Behavior |
|---------|----------|
| Organization | Combobox (searchable) over `api.organizations.listOperational`; selecting resets vehicle, link, signalKey |
| Vehicle | Combobox over `api.vehicles.listByOrg`; label `make · model · plate`; resets link + signalKey |
| Source link | Segmented control when ≤3 links, select otherwise; label `provider · rev N · active/inactive` (active flag not in DTO today — show provider + revision only); auto-select first when single |
| As-of (optional) | Date-time input writing `asOf`; only shown in Revisions tab; shows `NOT_CAPTURED` notice when history disabled |
| Sticky | Scope bar is `position: sticky; top: var(--master-header-offset)` on desktop; collapses into a one-line summary with "Change" button on mobile |
| Rejected params | Existing `rejectedParams` hint stays, rendered as `role="status"` |

Multi-link ambiguity: when `overview.profiles.length > 1`, show an inline notice "N source links — evidence shown for selected link only" above the ledger; the drawer header repeats `providerSourceLinkId` (monospace, copyable).

---

## 5. Overview tab structure

Order (top → bottom):

1. **Profile identity card** per link (grid `lg:grid-cols-2`): provider, link id, `profileRevision`, `evaluatedAt`, `lastMaterializedSourceTimestamp`, `lastMaterializedProviderFetchAt`, `contentFingerprintPrefix`. Timestamps as UTC + local via a shared `TimestampDual` component (`tabular-nums`).
2. **Evidence summary strip** (chips): LV standby profile, RPM active profile, RPM applicability, observed density, LV confidence — existing `SignalProfileBadge` / `ObservedDensityBadge` / `ProfileConfidenceIndicator`.
3. **Blockers & limitations**: `EvaluationBlockedBanner` when `evaluationBlocked`; `LimitationTagList` for `profileLimitations` (each code a tag with glossary tooltip; no comma-joined strings).
4. **Signal coverage mini-matrix**: one row per signal, columns = Applicability · Observation · Freshness · Combined (RPM only). Clicking a row opens the drawer and switches to the Ledger tab.
5. **Cross-links**: Vehicle detail · APDS · PDI (existing `IntelligenceCrossLink`), with the "context missing" state preserved for PDI when `physicalDeviceId` is unresolved.

Freshness semantics: the existing `EvidenceFreshnessHint` text "fetch time is not new-signal proof" stays and is promoted to the identity card footer (`fetchTimeIsNotNewSignalProof` is a DTO constant).

---

## 6. Signal Ledger table — column specification

Data source: `MasterVsiProfileDetailDto.signals[]` for the selected link (one API call). All columns map to DTO fields; no derived scores.

| # | Column | Source field(s) | Presentation | Sortable | Default width |
|---|--------|-----------------|--------------|----------|---------------|
| 1 | Signal | `canonicalSignalKey` (primary, mono) + `providerNativeSignalName` (secondary, muted) | Two-line cell | Yes (A–Z) | 220px, sticky left on desktop |
| 2 | Applicability | `powertrainApplicability` (fallback: `empiricalObservation === 'NOT_APPLICABLE'`) | Chip: APPLICABLE (neutral), NOT_APPLICABLE (muted/outline), UNKNOWN (neutral dashed) | Yes | 120px |
| 3 | Declared | `declaredSupport` | Chip: LISTED / NOT_LISTED / UNKNOWN; raw value fallback when not in set | Yes | 110px |
| 4 | Observation | `empiricalObservation` | Chip: OBSERVED, OBSERVED_STALE, NOT_OBSERVED_IN_WINDOW, NEVER_OBSERVED, NOT_APPLICABLE — all neutral tiers except OBSERVED (emphasis) | Yes | 150px |
| 5 | Freshness | `freshnessClassification` | FRESH (emphasis) / STALE (amber text, no fill) / UNKNOWN (neutral) / `—` when null | Yes | 100px |
| 6 | Quality / Confidence | `qualityClassification`, `confidenceLevel` | Two chips in one cell, labelled "Q" and "C" prefixes; `—` for null | Quality | 160px |
| 7 | Combined RPM | `rpmCombinedEvidenceAvailabilityV1` | Only for `engine_rpm`; chip PROVEN_LIVE (emphasis) / PROVEN_HISTORICAL_ONLY (neutral + clock icon) / NOT_PROVEN (amber outline) / NOT_APPLICABLE; others show `—`; amber "attribution" dot when `rpmCombinedEvidenceLimitationsV1` non-empty | Yes | 170px |
| 8 | Last valid observation | `lastValidObservationAt` | `TimestampDual` compact (local, UTC on hover/title); `—` when null | Yes | 170px |
| 9 | Limitations | `limitations.length` (+ cadence `limitations` length when blob parseable) | Count badge "3" with first code on hover; amber when any code matches `RPM_HF_*`/`*ATTRIBUTION*`/`*BLOCK*` | Yes (count) | 90px |
| 10 | Evidence | `evidenceProvenance` + cadence `provenance` (deduped) | Icon-only lane markers: snapshot (S) / HF (HF) / PG (LV) with tooltips | No | 80px |
| 11 | Action | — | Chevron; whole row clickable, `aria-label="Open details for {signal}"` | — | 40px |

Row states: `aria-selected` on the row whose `signalKey` is open; keyboard `Enter`/`Space` opens; row height 40px desktop, 56px mobile card.

Footer: "N signals · profile rev R · evaluated {time}" (tabular numerals).

Mobile (<768px): table becomes a card list with columns 1, 4, 5, 7 (when RPM) and the limitations count; remaining dimensions appear in the sheet.

---

## 7. Filtering / search model

Client-side on the loaded signal array (counts are small; no pagination required). Filter state is URL-encoded for shareability.

| Filter | URL param | Values |
|--------|-----------|--------|
| Search | `q` | substring over `canonicalSignalKey`, `providerNativeSignalName` |
| Applicability | `appl` | `APPLICABLE,NOT_APPLICABLE,UNKNOWN` (multi) |
| Observation | `obs` | enum multi |
| Freshness | `fresh` | `FRESH,STALE,UNKNOWN` |
| Combined RPM | `rpm` | enum multi |
| Has limitations | `lim` | `1` |
| Has HF cadence | `hf` | `1` (requires cadence blob with HF provenance or `observedSampleCount > 0`) |
| Hide NOT_APPLICABLE | `hideNA` | `1` (default off; off keeps the row visible so operators see exclusions) |

Filter chips render above the table with an "Clear all" action; the active count is announced via `aria-live="polite"`. Filters persist across drawer open/close and link switch; they reset on vehicle change.

---

## 8. Signal Detail — layout and reading order

Container: right drawer (desktop, width `clamp(480px, 38vw, 640px)`), full-screen sheet (mobile). Header is sticky.

Reading order (top → bottom; each block is a `<section aria-labelledby>`):

0. **Header**: canonical key (mono, `text-wrap: balance`), provider native name, chips: link provider · link id (copy) · profile rev · evaluated at. Prev/Next buttons (disabled at bounds) + close.
1. **Evidence summary strip** (always visible, wraps): Applicability · Declared · Observation · Freshness · Quality · Confidence · Combined RPM (engine_rpm only). Each chip labelled with its dimension name (not just value) to prevent merging.
2. **Plain-language reading** (deterministic templates, no inference beyond fields): one sentence per populated dimension, e.g. "Snapshot: never observed on this link." / "Combined RPM: proven historical only — HF trip evidence exists; no fresh live snapshot." Sentences are i18n templates keyed by enum value; they never produce a verdict.
3. **Timeline block**: three rows with explicit labels — *Last valid observation* (`lastValidObservationAt`), *Source timestamp* (`lastSourceTimestamp`), *Provider fetch* (`lastProviderFetchAt`) — followed by the fixed note "Provider fetch time does not prove a new measurement." Each row shows UTC and local.
4. **Provenance block**: two labelled lists — *Snapshot (Lane A)* from `evidenceProvenance`; *Cadence / HF (Lane B)* from `cadenceIntelligence.provenance` (deduped in UI as defensive measure). Empty list shows "none recorded", not an error.
5. **RPM dual-provenance** (engine_rpm only): existing `VsiEngineRpmDualProvenancePanel` lanes, with the combined-evidence chip repeated at the top and attribution limitations rendered as tags beneath it (see §10).
6. **Cadence profile** (when `cadenceIntelligence` present): active profile / density / `observedSampleCount` / `finalizedTripCount` / `evidenceConfidence`; `regimes[]` as a compact table (kind, median, p95, samples, confidence); `activeRpmProfile.tripClassifications[]` as a collapsible list; `rpmCadenceTierResolution` summary when present. All values parsed defensively (`asRecord`/`asFiniteNumber` helpers pattern); unknown shapes render "not available in this profile revision".
7. **LV cadence** (lv_voltage only): `lvStandbyTransmissionProfile.profile`, `classificationDecisionCode`, `evidenceConfidence`, limitations; blocked state uses `EvaluationBlockedBanner` when `OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION` present.
8. **Limitations**: full `LimitationTagList` (signal `limitations` + cadence `limitations` + `rpmCombinedEvidenceLimitationsV1`), grouped by family prefix (`RPM_HF_*`, `CLICKHOUSE_*`, `*_NOT_PROVEN`, other). Each tag has a glossary tooltip (i18n `master.intelligence.vsi.limitation.<CODE>` with raw-code fallback).
9. **Profile context**: provider identity, link id, `profileRevision`, `profileContractVersion`, `contentFingerprintPrefix`, `evaluatedAt`; link "View revisions" → Revisions tab.

Mobile reading order is identical; sections 5–7 default collapsed.

---

## 9. RPM dual-provenance presentation

- Combined chip is the **first** element of the RPM section; wording per value (P1-D contract):
  - `PROVEN_LIVE` — "Live proven (fresh snapshot)"
  - `PROVEN_HISTORICAL_ONLY` — "Historical only (HF trip evidence; no live snapshot)"
  - `NOT_PROVEN` — "Not proven"
  - `NOT_APPLICABLE` — "Not applicable (powertrain)"
- Lanes remain side-by-side ≥768px, stacked below; lane headers carry explicit window text (existing `snapshotWindow` / `cadenceWindow` keys).
- Lane A must never show HF numbers; Lane B must never show snapshot freshness.
- When Lane A is `NEVER_OBSERVED` and combined is `PROVEN_HISTORICAL_ONLY`, display an inline info note: "These statements are compatible: the live snapshot never carried RPM, while historical HF trip data exists."
- Duplicate provenance tags (historical rows pre-P1-G) are deduped for display with a muted "normalized" hint only in debug/tooltip; no error state.

---

## 10. LV cadence presentation

- Chip tier: `LV_8H_OBSERVED` / `LV_24H_OBSERVED` (neutral emphasis), `UNKNOWN` (neutral).
- `evaluationBlocked` → `UNKNOWN` label plus amber blocked banner with code; never render the underlying profile when blocked (mapper already masks it).
- Decision code shown as monospace tag with tooltip; confidence as separate chip ("Confidence: HIGH") — never merged with the profile label.
- Provenance expected `POSTGRES_BATTERY_MEASUREMENTS` (+ `VSI_LV_STANDBY_30D_WINDOW` on standby evidence); render as tags.

---

## 11. Source-link attribution warning semantics

| Signal in DTO | Visual | Copy intent |
|---------------|--------|-------------|
| `rpmCombinedEvidenceLimitationsV1` contains `RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN` | Amber outline on Combined chip + amber dot in ledger; warning tag in RPM section | "HF samples exist but cannot be attributed to this source link; historical proof withheld." |
| Cadence `limitations` contains `RPM_HF_*` attribution codes (P1-F) | Tags grouped first in Limitations block; Lane B header gets amber subtitle | Explain which attribution check failed (code tooltip) |
| Profile limitations `MULTI_ACTIVE_SOURCE_LINK_DECLARED_CATALOG_AMBIGUOUS`, `LATEST_STATE_NOT_ATTRIBUTED_TO_SOURCE_LINK`, `PROVIDER_IDENTITY_MISMATCH_DECLARED_CATALOG_DIMO_ONLY` | Overview blocker list + banner in drawer header | Link-level ambiguity affects all signals |

Rule: attribution warnings **downgrade visual emphasis** (emphasis → neutral/amber) and **never** add a "verified" or check-mark affordance. Amber is reserved for attribution/blocked states; red is not used in the ledger (no destructive semantics exist here).

---

## 12. Profile revision and historical evidence

- Revisions tab lists `MasterVsiRevisionTimelineItemDto` rows: rev · trigger · evaluatedAt · recordedAt · LV · RPM · fingerprint prefix; cursor pagination via "Load older" button (API `nextCursor`).
- `captureStatus = NOT_CAPTURED` → neutral informational banner (existing copy); tab remains visible so operators learn why history is empty.
- As-of resolver: date-time input → `revisionAsOf`; show `authority`, `limitations`, `selectedRevision`; `queryEvidence` in a collapsed "Raw query evidence" block (monospace, `<details>`).
- Historical revisions have no signal snapshot in the API; the UI must say "Signal-level detail is available for the current revision only" rather than implying drill-down.
- Current head `materializationTrigger` is not on the profile DTO; show it from the first revisions item when available, with the label "Latest recorded trigger".

---

## 13. Loading, empty, error, partial-evidence states

| State | Treatment |
|-------|-----------|
| No org/vehicle | `MasterEmptyState` with scope guidance (existing keys) |
| Overview loading | `MasterLoadingState variant="card"` ×2 |
| Ledger loading | `MasterLoadingState variant="rows"` with table header rendered (prevents layout shift) |
| Profile error | `MasterErrorState` + retry; overview cards stay visible |
| Revisions error | Isolated error inside Revisions tab only (existing isolation preserved) |
| No profiles | Empty state "No materialized VSI profiles" |
| Signal with null fields | `—` cells; chips show UNKNOWN only when the enum is literally `UNKNOWN`; null ≠ UNKNOWN |
| `cadenceIntelligence` null | Cadence sections hidden; summary strip omits HF marker |
| Blob shape unexpected | Section renders "not available in this profile revision" |
| Drawer for `signalKey` not in list | Drawer shows "Signal not present in this profile" with close action; URL param retained until user closes |

---

## 14. Responsive rules

| Breakpoint | Rules |
|------------|-------|
| ≥1280px | Scope bar sticky; ledger full table; drawer overlays right (no table reflow) |
| 1024–1279px | Same; column 3 (Declared) and column 10 (Evidence) collapse into the drawer |
| 768–1023px | Horizontal scroll with sticky first column; drawer width 100% − 48px |
| <768px | Card list; full-screen sheet; scope bar collapsed summary; filters in a bottom sheet |
| Touch targets | ≥44×44px for row actions, chips with tooltips get a tap-to-reveal popover |

---

## 15. Accessibility requirements

- Table: `<caption>` (visually hidden) naming vehicle + link; `<th scope="col">`; sortable headers as buttons with `aria-sort`.
- Rows: `role="row"` natural; clickable via inner button spanning the row name cell; `aria-selected` for the open signal.
- Drawer/sheet: Radix `Sheet` — focus trap, `Esc` to close, focus restoration to the originating row; `aria-labelledby` header.
- Prev/Next: `aria-keyshortcuts="ArrowLeft ArrowRight"` optional; disabled states announced.
- Chips: text label always present (dimension + value); color never the sole carrier; icons `aria-hidden`.
- Limitation tags: `<ul>`/`<li>`, tooltips also accessible via focus (`aria-describedby`).
- Live regions: filter count, load errors (`role="alert"`), as-of result (`role="status"`).
- Contrast: all chip tiers ≥4.5:1 in both themes; amber text on amber/10 fill validated.
- Reduced motion: drawer slide and chip stagger disabled under `prefers-reduced-motion` (existing theme already defines reduced-motion blocks).
- Timestamps: `<time dateTime>` elements; locale formatting from `useLanguage().locale`.

---

## 16. Light/dark design principles

- Surfaces: `surface-premium` for identity cards, `bg-muted/30` for the evidence strip, `bg-card` for drawer body; borders `--surface-premium-border`.
- Radii: base `--radius` (8px) for chips/cells; drawer shell `--radius-dialog` (12px); nested content radius = outer − padding (concentric rule from the installed skill).
- Color: two emphasis tiers only — *emphasis* (foreground on muted) and *neutral* (muted foreground); *amber* for attribution/blocked; no green/red status semantics.
- Typography: 12px table body, 11px chips, mono for keys/ids/codes, `tabular-nums` on all numbers and times; headings `text-wrap: balance`.
- Shadows over borders for the drawer (layered low-opacity shadows per theme tokens).
- Motion: CSS transitions on `transform, opacity` only; drawer enter 200ms, exit 150ms with small translate; no `transition: all`.
- Dark mode: rely on existing CSS variables; verify amber tiers via `dark:text-amber-100` pattern already used in `EvaluationBlockedBanner`.

---

## 17. Nine-locale translation strategy

- All new copy under `master.intelligence.vsi.ledger.*`, `master.intelligence.vsi.dimension.*`, `master.intelligence.vsi.limitation.*`, `master.intelligence.vsi.reading.*` in `frontend/src/i18n/translations/master.intelligence.{de,en,pl,fr,cs,nl,es,tr,it}.ts`.
- Enum labels keyed by value (`…dimension.observation.NEVER_OBSERVED`); unknown values render the raw code (mono) — never an English fallback masquerading as translated.
- Plain-language reading sentences are complete sentences per locale (no fragment concatenation); plural counts ("N limitations") use ICU-style keys with locale rules for pl/cs.
- Limitation glossary: start with codes present in P1-A/P1-D/P1-F/P1-G docs; missing glossary entries show the code only.
- `npm run i18n:check` is part of acceptance for every phase.

---

## 18. URL-state model

```
?view=vsi-intelligence
 &orgId=<uuid>
 &vehicleId=<uuid>
 &providerSourceLinkId=<uuid>
 &physicalDeviceId=<uuid>          (resolved async, existing)
 &asOf=<iso>                        (existing; Revisions tab)
 &tab=overview|ledger|revisions     (new)
 &signalKey=<canonical_key>         (new; opens drawer)
 &q=…&appl=…&obs=…&fresh=…&rpm=…&lim=1&hf=1&hideNA=1   (new; ledger filters)
```

Rules: `signalKey` validated against `^[a-z0-9_]{1,64}$`; filter enums validated against known sets, invalid values appended to `rejectedParams`. Drawer open/close uses `replaceState` for close and `pushState` for open so browser back closes the drawer. Vehicle change clears `signalKey` and filters.

---

## 19. Data-contract mapping

| UI element | DTO field | Status |
|------------|-----------|--------|
| Identity card | `providerIdentity`, `provider`, `providerSourceLinkId`, `profileRevision`, `profileContractVersion`, `evaluatedAt`, `lastMaterialized*`, `contentFingerprintPrefix` | Available |
| Applicability chip | `powertrainApplicability` (optional, nullable) / `rpmApplicability` (summary) | Available |
| Declared chip | `declaredSupport` (string) | Available |
| Observation chip | `empiricalObservation` | Available |
| Freshness chip | `freshnessClassification` (nullable) | Available |
| Quality / Confidence | `qualityClassification`, `confidenceLevel` (nullable) | Available |
| Combined RPM | `rpmCombinedEvidenceAvailabilityV1`, `rpmCombinedEvidenceLimitationsV1` (engine_rpm only) | Available |
| Timeline | `lastValidObservationAt`, `lastSourceTimestamp`, `lastProviderFetchAt` | Available |
| Provenance lanes | `evidenceProvenance`; `cadenceIntelligence.provenance` | Available / blob |
| Cadence metrics, regimes, tiers | `cadenceIntelligence.*` | Blob (untyped) |
| LV standby | `cadenceIntelligence.lvStandbyTransmissionProfile` + summary fields | Blob + summary |
| Limitations | `limitations`, `profileLimitations`, cadence `limitations`, `rpmCombinedEvidenceLimitationsV1` | Available / blob |
| Revisions | `MasterVsiRevisionHistoryPageDto`, `MasterVsiRevisionAsOfDto` | Available (gated by P5-H1) |

### Data-contract gaps (optional follow-ups, not MVP blockers)

1. Typed cadence slice on the Master DTO (`rpmCadenceSummaryV1`, `lvCadenceSummaryV1`) to retire blob parsing.
2. Head profile `materializationTrigger` on `MasterVsiProfileDetailDto`.
3. Source-link `isActive` / `activatedAt` on `MasterVsiProfileSummaryDto` for scope labels.
4. Org-scoped ledger summary endpoint (cursor-paginated) before any fleet matrix.
5. Limitation glossary source of truth (backend-exported code list) to keep i18n complete.

---

## 20. Component hierarchy (frontend/src/master/intelligence/ledger/)

```
VsiMasterIntelligenceView (refactor, keeps provider + data hook)
├─ LedgerScopeBar
├─ MasterPageTabs
├─ LedgerOverviewTab
│  ├─ ProfileIdentityCard (TimestampDual, LimitationTagList)
│  ├─ EvidenceSummaryStrip (EvidenceDimensionChip ×n)
│  ├─ SignalCoverageMiniMatrix
│  └─ IntelligenceCrossLink ×3 (existing)
├─ SignalLedgerTab
│  ├─ LedgerFilterBar (search, multi-select chips, clear)
│  ├─ SignalLedgerTable (MasterTableShell; mobile → SignalLedgerCardList)
│  └─ SignalDetailDrawer (components/ui/sheet)
│     ├─ DrawerHeader (prev/next, copy link id)
│     ├─ EvidenceSummaryStrip
│     ├─ PlainLanguageReading
│     ├─ EvidenceTimeline
│     ├─ ProvenanceLanes
│     ├─ VsiEngineRpmDualProvenancePanel (existing)
│     ├─ CadenceProfileBlock (defensive blob parse)
│     ├─ LvCadenceBlock
│     ├─ LimitationTagList (grouped)
│     └─ ProfileContextFooter
└─ RevisionsTab (timeline list, LoadOlder, AsOfResolver)
```

Shared primitives: `EvidenceDimensionChip`, `LimitationTagList`, `TimestampDual`, `ProvenanceLanes`, `CopyableMono`.

---

## 21. Evidence-state presentation matrix

| Dimension | Value | Tier | Never implies |
|-----------|-------|------|---------------|
| Applicability | APPLICABLE | neutral | observation |
| | NOT_APPLICABLE | outline/muted | error or NEVER_OBSERVED |
| | UNKNOWN | neutral dashed | failure |
| Declared | LISTED / NOT_LISTED / UNKNOWN | neutral | observation |
| Observation | OBSERVED | emphasis | freshness |
| | OBSERVED_STALE | neutral + clock | live |
| | NOT_OBSERVED_IN_WINDOW | neutral | never observed |
| | NEVER_OBSERVED | neutral | not applicable |
| | NOT_APPLICABLE | outline/muted | never observed |
| Freshness | FRESH | emphasis | observation |
| | STALE | amber text | error |
| | UNKNOWN / null | neutral / `—` | stale |
| Quality / Confidence | any | separate chips | each other |
| Combined RPM | PROVEN_LIVE | emphasis | HF cadence quality |
| | PROVEN_HISTORICAL_ONLY | neutral + clock | live |
| | NOT_PROVEN | amber outline | absence of HF data |
| | NOT_APPLICABLE | outline/muted | — |
| Attribution | unproven codes | amber tag | verified |
| Profile | evaluationBlocked | amber banner | signal error |

---

## 22. Open risks

1. Untyped `cadenceIntelligence` parsing can drift with backend changes; mitigate with production-shaped fixtures in `vsi-engine-rpm-dual-provenance.ui.test.ts` style tests.
2. `P5-H1` capture may be disabled in production → Revisions tab largely empty; copy must not imply missing data is an error.
3. Historical rows may still carry duplicate provenance until P1-G is deployed and profiles re-materialize; display-side dedupe hides it but must not alter P0-a audit semantics.
4. Drawer + table on 1024–1279px can feel cramped; fall back to overlay (not split) at that width.
5. Nav label change touches 9 locale files; keep nav id stable to avoid URL breakage.
6. No usability data; comprehension claims require a moderated test before declaring success.

---

## 23. Acceptance criteria (P2-C … P2-G reference)

1. Every ledger column maps to a listed DTO field; no computed scores, grades or percentages appear anywhere.
2. For a fixture with `empiricalObservation = NEVER_OBSERVED` and `rpmCombinedEvidenceAvailabilityV1 = PROVEN_HISTORICAL_ONLY`, the strip shows both chips with their dimension labels and the compatibility note; snapshot lane shows no HF values.
3. When `rpmCombinedEvidenceLimitationsV1` includes `RPM_HF_SOURCE_LINK_ATTRIBUTION_UNPROVEN`, Combined chip is amber-outlined and no "verified" affordance renders.
4. `NOT_APPLICABLE`, `NEVER_OBSERVED`, `UNKNOWN`, and null render as four distinct presentations.
5. Opening a row sets `signalKey` (pushState); browser back closes the drawer; filters and scroll offset are unchanged after close; focus returns to the row.
6. Prev/Next cycles only through the currently filtered rows.
7. Mobile (390px): card list and full-screen sheet; all drawer sections reachable; no horizontal overflow.
8. Keyboard-only: scope bar → filters → table rows → drawer → close, with visible focus at each step.
9. `prefers-reduced-motion` disables drawer slide and stagger.
10. `npm run i18n:check` passes with new keys in all nine locales; raw enum fallback shown only for values outside known sets.
11. Revisions tab renders `NOT_CAPTURED` informationally; "Load older" uses `nextCursor`.
12. No org-wide fetch loops exist; multi-vehicle strip (if built) is capped at 12 with explicit load action.
13. Existing tests (`vsi-master-intelligence-ui`, `vsi-engine-rpm-dual-provenance`, `useVsiMasterIntelligenceData`, `master-intelligence`) pass unchanged or with intentional updates.

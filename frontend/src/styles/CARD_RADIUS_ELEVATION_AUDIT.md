# SynqDrive Card Radius & Elevation Audit

> **Status:** Read-only audit complete · **V4.9.200 implementation cutover applied** (2026-08-24)  
> **Date:** 2026-08-24  
> **Branch:** `cursor/card-radius-elevation-audit`  
> **Scope:** Corner radius, card borders, shadows/elevation, inset highlights, L0/L1 hierarchy, local feature hardcodes  
> **Out of scope:** Surface fill colors (`--background`, `--card`, `--sidebar`), text tokens (`--foreground`, `--muted-foreground`) — already unified in V4.9.197–199  
> **Visual reference:** Vero (calm white cards on neutral canvas) — inspiration only, not a copy target

---

## 1. Executive Summary

SynqDrive defines a **coherent canonical geometry** in `theme.css`: `--radius: 0.5rem` (8px base), with L0/L1 surfaces at **`calc(var(--radius) + 2px)` = 10px**, subtle borders, and a layered shadow stack including inset highlight + bottom catch on L1.

**However, the implemented UI diverges significantly from that canon in practice:**

| Dimension | Canonical | Observed in features |
|-----------|-----------|----------------------|
| Main card radius | **10px** (`surface-*`) | **10px**, **12px**, **14px**, **16px**, **20px** coexist |
| Nested tile radius | Should inherit / step down | **`rounded-xl` (14px)** dominates nested dashboard items |
| L1 elevation | inset + catch + `4×16` drop | Often **duplicated** with local `shadow-[var(--shadow-1)]` or `shadow-lg` |
| Borders | `var(--border)` @ 7.5% opacity | Mostly consistent via `border-border`; some `/30`–`/50` local opacity |
| Dashboard | Same as product | **Intentional 16px panel override** + 12px KPI tiles |

### Key numbers (repo-wide, `frontend/src/**/*.{tsx,ts,css}`)

| Metric | Count |
|--------|------:|
| **Total radius utility hits** (`rounded-*`) | **3,844** |
| `rounded-lg` | 1,478 |
| `rounded-xl` | 1,025 |
| `rounded-md` | 366 |
| `rounded-2xl` | 341 |
| `rounded-full` | 557 |
| `rounded-sm` | 25 |
| `rounded-3xl` | 2 |
| Arbitrary `rounded-[...]` | 38 |
| Directional `rounded-t/b/l/r-*` | ~20 (14 files) |
| `border-radius:` in CSS | 47 (mostly `theme.css`) |
| Inline `borderRadius` | 6 files |
| **Shadow utility hits** | **388** |
| `shadow-[...]` arbitrary | 200 |
| `var(--shadow*)` references | 211 |
| `border-border` | 2,252 |
| Legacy `border-gray-*` | **0** |
| **Surface + radius override lines** (`surface-*` + `rounded-xl/2xl/3xl`) | **398** (190 files) |
| **Surface + local shadow override lines** | **160** |
| Files with `rounded-2xl` | 171 |
| Files with `rounded-xl` | 362 |
| `surface-premium` usages | 815 |
| `surface-solid` usages | 81 |
| `surface-elevated` usages | 37 |

### Distance from Vero-like calm aesthetic

The largest gaps are **not** canvas/card color (already aligned) but:

1. **Radius inflation** — widespread `rounded-xl` (14px) and `rounded-2xl` (20px) on main/nested cards overrides the 10px surface canon.
2. **L1 “premium” depth stack** — inset highlight + bottom catch + `0 4px 16px` drop makes white cards read more “floating SaaS” than Vero’s near-flat panels.
3. **Dashboard second dialect** — `!rounded-[16px]` panels and `!rounded-[12px]` KPI tiles create a third radius tier beside Tailwind and surface CSS.
4. **Duplicate elevation** — `surface-premium` + `shadow-[var(--shadow-1)]` / `shadow-lg` on the same element (137+ files with `surface-premium` + `rounded-2xl`).

**Recommendation preview (not implemented):** Standardize main cards at **10px**, nested tiles at **8px**, dialogs at **12px**; flatten L1 to border + `--shadow-xs` only; remove local radius/shadow overrides on `surface-*` classes.

---

## 2. Canonical Radius System

### 2.1 Base tokens (`theme.css`)

```css
--radius: 0.5rem;                              /* 8px */
--radius-sm: calc(var(--radius) - 2px);        /* 6px */
--radius-md: var(--radius);                    /* 8px */
--radius-lg: calc(var(--radius) + 2px);        /* 10px */
--radius-xl: calc(var(--radius) + 6px);        /* 14px */
--radius-2xl: calc(var(--radius) + 12px);      /* 20px */
```

Tailwind v4 maps utilities to these tokens (via `@theme` in `theme.css`).

| Utility | Token | Effective px |
|---------|-------|-------------:|
| `rounded-sm` | `--radius-sm` | 6 |
| `rounded-md` | `--radius-md` | 8 |
| `rounded-lg` | `--radius-lg` | **10** |
| `rounded-xl` | `--radius-xl` | 14 |
| `rounded-2xl` | `--radius-2xl` | 20 |
| `rounded-3xl` | (Tailwind scale) | 24 |

### 2.2 Surface-level radius (CSS classes)

| Level | Class | Radius | Notes |
|-------|-------|-------:|-------|
| **L0** | `.surface-solid`, `.sq-card` | `calc(var(--radius) + 2px)` = **10px** | Default Card primitive |
| **L1** | `.surface-premium`, `.surface-elevated`, `.sq-card-premium` | **10px** | Same radius as L0 |
| **L1 alt** | `.sq-card-interactive` | **10px** | Legacy alias |
| **L2** | `.surface-frosted`, `.sq-glass` | `calc(var(--radius) + 4px)` = **12px** | Frosted chrome |
| **L3** | `.surface-liquid`, map HUD | `--map-glass-radius` = `calc(var(--radius) + 6px)` = **14px** | Map only |
| **L4 overlay content** | `.sq-overlay` | `calc(var(--radius) + 4px)` = **12px** | Popover/dropdown panels |
| **Dialog** | `AppDialog` → `surface-elevated` | **10px** (inherited) | No separate dialog radius token |

### 2.3 Primitive resolvers (`surface.ts`)

| Primitive | Default surface | Effective radius |
|-----------|-----------------|-----------------:|
| `Card` | L0 `surface-solid` | 10px |
| `Card` + `interactive` | L1 `surface-elevated` | 10px |
| `DataCard` / `MetricCard` | L1 `surface-premium` | 10px |
| `DataCard` + `flush` | L0 `surface-solid` | 10px |
| `AppDialog` | L1 `surface-elevated` | 10px |

### 2.4 Dashboard intentional overrides (`dashboardShell.tsx`)

| Token | Value | Purpose |
|-------|------:|---------|
| `dashboardPanelRadius` | `!rounded-[16px]` | Auslastung, Meldungen, Aufgaben outer panels |
| `controlCenterCard` | `surface-premium !rounded-[16px]` | Control Center header shell |
| `controlCenterRadius` | `!rounded-[12px]` | Embedded KPI modules |
| `controlFinanceKpiCard` | `!rounded-[12px]` | Finance KPI tiles in control center |
| `financeKpiCard` | `rounded-xl sm:rounded-2xl` | Legacy finance KPI row (**12→16px responsive**) |

These are **documented local exceptions** — not bugs, but they break single-radius consistency.

---

## 3. Canonical Border System

### 3.1 Token values (light mode)

| Token | Value | Opacity equivalent |
|-------|-------|-------------------|
| `--border` | `rgba(17, 24, 39, 0.075)` | ~7.5% |
| `--input` | `rgba(17, 24, 39, 0.075)` | same as border |
| `--surface-premium-border` | `rgba(17, 24, 39, 0.085)` | ~8.5% (slightly stronger) |
| `--glass-border` | (L2, see `LIQUID_GLASS_SYSTEM.md`) | frosted chrome |

### 3.2 Surface border assignment

| Surface | Border | Width |
|---------|--------|------:|
| L0 `surface-solid` | `1px solid var(--border)` | 1px |
| L1 `surface-premium` | `1px solid var(--surface-premium-border)` | 1px |
| L1 `surface-elevated` | same as premium | 1px |
| L2 `surface-frosted` | `1px solid var(--glass-border)` | 1px |

### 3.3 Feature usage patterns

| Pattern | Count | Assessment |
|---------|------:|------------|
| `border-border` | 2,252 | ✅ Canonical |
| `border border-*` (generic) | 1,621 | Mixed — often `border-border/30`–`/50` for nested rows |
| `border-gray-*` / `border-neutral-*` | **0** | ✅ Clean post V4.9.199 |
| Local border on `surface-*` | Common | ⚠️ **Double-border risk** when `surface-premium` already has border + feature adds `border border-border/50` |

**Nested dashboard rows** typically use `border-border/20`–`/40` on inner tiles — softer than outer panel border. This is intentional hierarchy but not tokenized.

---

## 4. Canonical Shadow / Elevation System

### 4.1 Shadow tokens (light mode)

| Token | Value |
|-------|-------|
| `--shadow-xs` | `0 1px 2px rgba(17,24,39,0.04)` |
| `--shadow-sm` | `0 1px 3px rgba(17,24,39,0.05), 0 1px 2px rgba(17,24,39,0.03)` |
| `--shadow-md` | `0 4px 12px rgba(17,24,39,0.06), 0 2px 4px rgba(17,24,39,0.03)` |
| `--shadow-lg` | `0 12px 32px rgba(17,24,39,0.08), 0 4px 8px rgba(17,24,39,0.04)` |
| `--shadow-hover` | `0 8px 24px rgba(17,24,39,0.07), 0 2px 6px rgba(17,24,39,0.04)` |
| `--shadow-overlay` | `0 24px 64px rgba(17,24,39,0.14), 0 8px 16px rgba(17,24,39,0.06)` |
| `--shadow-1` … `--shadow-4` | Aliases → xs, sm, md, lg |

### 4.2 L1 premium depth tokens

| Token | Value | Role |
|-------|-------|------|
| `--surface-premium-highlight` | `rgba(255,255,255,0.42)` | Inset top highlight |
| `--surface-premium-catch` | `rgba(17,24,39,0.025)` | Inset bottom catch |
| `--surface-premium-shadow` | `0 4px 16px rgba(17,24,39,0.045), 0 1px 2px rgba(17,24,39,0.03)` | Drop shadow |

### 4.3 Per-surface shadow stacks

#### L0 — `surface-solid`

```css
box-shadow:
  inset 0 1px 0 color-mix(in srgb, var(--card) 88%, white 12%),
  var(--shadow-xs);
```

- **Inset highlight:** subtle white mix (not `--surface-premium-highlight`)
- **Drop:** `--shadow-xs` only
- **No catch**

#### L1 — `surface-premium`

```css
box-shadow:
  inset 0 1px 0 var(--surface-premium-highlight),
  inset 0 -1px 0 var(--surface-premium-catch),
  var(--surface-premium-shadow);
```

- **Full 3-layer depth stack** — strongest “floating card” signal

#### L1 interactive — `surface-elevated`

| State | Shadow |
|-------|--------|
| Default | inset highlight + catch + `--shadow-sm` |
| `:hover` | inset (brightened) + catch + `--shadow-hover` + `translateY(-1px)` |
| `:active` | inset + catch + `--shadow-xs` |

#### L2 — `surface-frosted`

- Inset glass edge highlight + catch + `--shadow-md`

#### L3 — `surface-liquid`

- `--map-glass-inner-shadow` + `--map-glass-shadow` (map HUD only)

#### L4 — `overlay-scrim`

- Backdrop dim + blur; content panels use L0/L1

### 4.4 Shadow utility inventory

| Class / pattern | Count | Typical use |
|-----------------|------:|-------------|
| `shadow-[...]` arbitrary | 200 | `shadow-[var(--shadow-1)]` on tabs, KPI cards |
| `var(--shadow*)` in class strings | 211 | Token-aware overrides |
| `shadow-sm` | 83 | Legacy cards, rows |
| `shadow-lg` | 39 | Modals, master admin modals |
| `shadow-md` | 32 | Panels |
| `shadow-xl` | 20 | Mobile bottom sheets |
| `shadow-2xl` | 18 | Heavy modals (`VehicleRegistrationModal`) |

### 4.5 Consumer map (canonical tokens)

| Token / stack | Primary consumers |
|---------------|-------------------|
| L0 inset + `--shadow-xs` | `Card` default, `surface-solid`, flush `DataCard` |
| L1 inset + catch + premium shadow | `DataCard`, `MetricCard`, dashboard `panelShellClass`, most KPI blocks |
| L1 hover `--shadow-hover` | `surface-elevated`, `ControlKpiStrip`, clickable cards |
| `--shadow-1` local add-on | Dashboard tabs, notification tabs, action queue tabs (**duplicates L1**) |
| `--shadow-overlay` | `.sq-overlay`, dialog backdrop siblings |
| `shadow-lg` / `shadow-2xl` hardcode | Master modals, station modals, legacy sheets |

---

## 5. L0 / L1 Comparison

### 5.1 Side-by-side

| Property | L0 `surface-solid` | L1 `surface-premium` | L1 `surface-elevated` |
|----------|-------------------|---------------------|----------------------|
| **Radius** | 10px | 10px | 10px |
| **Fill** | `var(--card)` flat white | white gradient (currently flat `#FFF→#FFF`) | same as premium |
| **Border** | `--border` (7.5%) | `--surface-premium-border` (8.5%) | same as premium |
| **Inset highlight** | color-mix white 12% | `--surface-premium-highlight` 42% white | same |
| **Inset catch** | none | `--surface-premium-catch` | same |
| **Drop shadow** | `--shadow-xs` | `--surface-premium-shadow` (4×16) | `--shadow-sm` |
| **Hover** | none | none | `--shadow-hover` + lift |

### 5.2 Optical difference assessment

On the current neutral white canvas (`#F6F6F6`):

- **L0 vs L1 radius:** identical (10px) — no hierarchy via radius.
- **L0 vs L1 border:** ~1% opacity delta — barely perceptible.
- **L0 vs L1 shadow:** **L1 is visibly deeper** due to 4×16 drop + 42% inset highlight + bottom catch. This is the primary hierarchy signal today.
- **Gradient fill:** currently flat white both ends — gradient adds no visible depth.

### 5.3 Is L1 too strong for the neutral SynqDrive look?

**Yes, likely.** Against the Vero reference (minimal elevation, hierarchy via canvas/card contrast only):

- L1’s **inset highlight at 42% white** creates a subtle “glossy top edge”.
- **`--surface-premium-shadow` at 4×16** is more aggressive than Vero’s near-imperceptible depth.
- **`--surface-premium-catch`** adds a dark inset bottom line — reinforces “lifted card” metaphor.

L0 alone (border + xs shadow + subtle inset) is closer to the target calm aesthetic. L1 as currently defined reads as **premium SaaS floating card**, which conflicts with the post-V4.9.199 flat neutral direction.

---

## 6. Repository Radius Inventory

### 6.1 Aggregate counts

See Executive Summary table. **3,844** total `rounded-*` utility occurrences across TS/TSX/CSS.

### 6.2 Semantic classification (A–H)

| Class | Description | Dominant radii | Notes |
|-------|-------------|----------------|-------|
| **A — Main Card / Panel** | Dashboard panels, settings sections, view heroes | 10px canon, **14px**, **16px**, **20px** in features | Highest inconsistency |
| **B — Nested Card / Tile** | Notification rows, task previews, KPI inner tiles | **`rounded-xl` (14px)**, `rounded-lg` (10px) | Dashboard notifications/tasks heavily `rounded-xl` |
| **C — Controls** | Buttons, inputs, tabs, switches | `rounded-md` (8px), `rounded-lg` (10px) | Generally consistent; tabs use `rounded-[calc(var(--radius-md)-2px)]` = 6px |
| **D — Badges / Pills** | Status, avatars, chips | `rounded-full` (557 hits) | ✅ Correct — exclude from card audit |
| **E — Modal / Dialog / Popover** | AppDialog, bottom sheets, drawers | 10px (AppDialog), **12–16px** (legacy modals) | `rounded-t-2xl sm:rounded-2xl` on mobile sheets |
| **F — L2 Frosted Glass** | Login hero, sticky chrome | **12px** | Canonical — separate track |
| **G — L3 Map Liquid Glass** | Map HUD controls | **14px** | Canonical — separate track |
| **H — Technical** | Charts, signature pad, crop, SVG | mixed | Document only |

### 6.3 Large-radius main card hits (`rounded-xl` / `rounded-2xl` / `rounded-3xl`)

**Potentially inconsistent main/nested cards (Category A/B):**

| Radius | Tailwind px | Est. main/nested card lines | Assessment |
|--------|------------:|----------------------------:|------------|
| `rounded-xl` | 14 | ~400+ (subset of 1,025) | ⚠️ **+4px over canon** on nested dashboard cards |
| `rounded-2xl` | 20 | ~200+ (subset of 341) | 🔴 **+10px over canon** — widespread with `surface-premium` |
| `rounded-3xl` | 24 | 2 | 🔴 `PlatformEmailSettingsPanel.tsx` icon container |

**Explicitly separate (not card inconsistency):**

- Modal sheets: `rounded-t-2xl sm:rounded-2xl` (E)
- Map liquid HUD (G)
- `rounded-full` badges (D)

### 6.4 Top files — `rounded-xl` (30+ hits)

| File | Hits | Dominant context |
|------|-----:|------------------|
| `HealthErrorsView.tsx` | 30 | Health module nested panels |
| `VehicleRegistrationModal.tsx` | 26 | Master modal sections |
| `BillingPricingTab.tsx` | 19 | Master billing cards |
| `PartsAccessoriesView.tsx` | 17 | Product cards |
| `FleetConditionDetailView.tsx` | 14+ | KPI / detail blocks |

### 6.5 Top files — `rounded-2xl`

| File | Hits | Dominant context |
|------|-----:|------------------|
| `ProspectsView.tsx` | 14 | Master CRM cards |
| `PartsAccessoriesView.tsx` | 8 | Product grid cards |
| `ChangesView.tsx` | 7 | Changelog entries |
| `TasksView.tsx` | 3+ | Task list container |
| `BillingPricingTab.tsx` | 6+ | Billing sections |

**171 files** contain `rounded-2xl`; **117** in `rental/`, **27** in `master/`.

### 6.6 Arbitrary radius (`rounded-[...]`)

**38 hits** — notable values:

| Value | Location | px |
|-------|----------|---:|
| `!rounded-[16px]` | `dashboardShell.tsx` | 16 |
| `!rounded-[12px]` | `dashboardShell.tsx` KPI tiles | 12 |
| `rounded-[calc(var(--radius-md)-2px)]` | Dashboard tabs | 6 |
| Various `rounded-[10px]`, `rounded-[14px]` | scattered features | ad hoc |

### 6.7 Inline `borderRadius` / `style={{ borderRadius }}`

**6 files** — mostly charts, map markers, signature/crop technical (Category H).

---

## 7. Main Card Radius Matrix

| Component / Surface | Level | Radius class/token | Effective px | Border | Shadow | Hover shadow | Inset highlight | Consumers (representative) |
|---------------------|-------|-------------------|-------------:|--------|--------|--------------|-----------------|---------------------------|
| `Card` (default) | L0 | `.surface-solid` CSS | **10** | `--border` | inset + `--shadow-xs` | — | subtle color-mix | Settings sections, generic cards |
| `Card` interactive | L1 | `.surface-elevated` | **10** | premium border | inset+catch+`--shadow-sm` | `--shadow-hover` + lift | premium highlight | Clickable cards |
| `surface-solid` | L0 | CSS | **10** | `--border` | inset + xs | — | color-mix | TripDetectionLogicView CARD const (**+rounded-2xl override → 20px**) |
| `surface-premium` | L1 | CSS | **10** | premium | full L1 stack | — | 42% white | DataCard default, dashboard panels |
| `surface-elevated` | L1 | CSS | **10** | premium | inset+catch+sm | hover stack | premium | ControlKpiStrip, FinanceKpiStrip |
| `DataCard` | L1 | via `resolveDataCardSurface` | **10** | inherited | inherited | if interactive | inherited | 60+ views (bookings, settings, master ops) |
| `MetricCard` | L1 | via `resolveDataCardSurface` | **10** | inherited | inherited | — | inherited | KPI strips, analytics |
| Dashboard `panelShellClass` | L1 | `surface-premium` + `!rounded-[16px]` | **16** | premium | full L1 stack | — | yes | Auslastung, Meldungen, Aufgaben |
| Dashboard Control Center | L1 | `surface-premium !rounded-[16px]` | **16** | premium | full L1 stack | — | yes | Ops summary header |
| Dashboard finance KPI | nested | `rounded-xl sm:rounded-2xl` | **12→16** | often none extra | `surface-elevated` | hover | yes | `financeKpiCards.tsx` |
| Dashboard notification card | nested B | `rounded-xl` + `border` | **14** | `border-border/25`–`/40` | none local | — | — | `NotificationCard.tsx`, `NotificationEntryCard.tsx` |
| Dashboard task preview | nested B | `rounded-xl` + `border` | **14** | border | — | — | — | `TaskPreviewCard.tsx` |
| Quick View / drilldown | A | `surface-premium` or `rounded-xl` | 10–14 | mixed | `shadow-sm` local | — | mixed | `DashboardDrilldownDrawer.tsx` |
| Vehicle cards | A | `surface-premium rounded-2xl` | **20** (override) | +local border | +`shadow-1` | some | yes | `VehicleLogbookView`, fleet views |
| Customer cards | A/B | `rounded-xl` / `surface-premium` | 14–20 | `border-border/50` | mixed | — | mixed | `CustomerListMobileCards`, detail tabs |
| Booking cards | A | `DataCard` / `rounded-xl` | 10–14 | canonical | canonical | interactive | — | `BookingsView`, timeline |
| Document panels | A | `surface-solid` / `rounded-xl` | 10–14 | canonical | xs–sm | — | — | `DocumentsView`, archive panels |
| Workflow cards | A | `surface-premium rounded-2xl` | **20** | local | `shadow-1` | — | yes | `WorkflowAutomationView`, drawers |
| Parts / Accessories | A | `rounded-xl` / `rounded-2xl` | 14–20 | local | local | — | mixed | `PartsAccessoriesView.tsx` (17 xl, 8 2xl) |
| Settings panels | A | `DataCard` / `surface-premium` | 10 (+local 20) | canonical | mixed | — | yes | `SettingsView.tsx` (16 premium hits) |
| Master Admin cards | A | `surface-premium rounded-2xl` | **20** | +local | +`shadow-1` | — | yes | Billing, Integrations, Connected Vehicles |
| Master dashboard | A | `DataCard` / `MetricCard` | **10** | canonical | canonical | — | yes | `MasterDashboardView.tsx` |
| Operator mobile panels | A | `surface-premium rounded-2xl` | **20** | local | premium stack | — | yes | Operator app views (separate dialect) |

### Main-card radius deviation summary

| Effective radius | Role | Est. prevalence |
|-----------------|------|----------------|
| **10px** | Canonical L0/L1 | Primitives + CSS-only surfaces |
| **12px** | Dashboard KPI override | Control center embedded tiles |
| **14px** | Nested tiles + many feature cards | **Most common feature override** (`rounded-xl`) |
| **16px** | Dashboard outer panels | Intentional `dashboardShell` |
| **20px** | Feature `rounded-2xl` on `surface-premium` | **~137 files** — dominant Master Admin + legacy Rental pattern |

**Inconsistent main-card radius variants in active use: 5** (10, 12, 14, 16, 20 px).

---

## 8. Dashboard Audit

The Control Center (`rental/components/dashboard/`) is the visual reference surface for SynqDrive.

### 8.1 Zone inventory

| Zone | Surface | Radius | Border | Shadow | Nested radius |
|------|---------|-------:|--------|--------|---------------|
| **Operations / Organisation Summary** | `surface-premium !rounded-[16px]` | **16px** | premium 8.5% | L1 full stack | KPI tiles **12px** |
| **Control KPI strip** | `surface-elevated` + `!rounded-[12px]` | **12px** | premium | elevated + hover | icon wraps `rounded-md` |
| **Finance KPI (embedded)** | `surface-elevated` | **12px** | premium | elevated | — |
| **Finance KPI (legacy row)** | `surface-elevated` / local | **12→16px** sm breakpoint | premium | elevated | — |
| **Auslastung panel** | `panelShellClass` → premium + **16px** | **16px** | premium | L1 stack | calendar cells `rounded-sm`/`md` |
| **Calendar grid** | nested | 6–8px | none | none | heatmap `rounded-full` |
| **Notifications panel** | `panelShellClass` **16px** | **16px** | premium | L1 | cards **`rounded-xl` 14px** + `border-border/25` |
| **Tasks panel** | `panelShellClass` **16px** | **16px** | premium | L1 | previews **`rounded-xl` 14px** |
| **Notification tabs** | active: `surface-premium shadow-[var(--shadow-1)]` | 6px calc | — | **duplicate** shadow-1 on L1 | — |
| **Action queue rows** | `rounded-lg border-border/30` | **10px** | 30% opacity | none | — |
| **Business Pulse / Fleet** | `DataCard` / premium | 10px canon | premium | L1 | inner rows `rounded-lg` |
| **Drilldown drawer** | articles | `rounded-lg` | `border-border/30` | local `shadow-sm shadow-black/[0.02]` | — |

### 8.2 Dashboard-specific findings

1. **Three-tier radius system** within one view: 16px panels → 12px KPIs → 14px nested cards → 10px rows.
2. **Responsive radius escalation** on finance KPI: `rounded-xl sm:rounded-2xl` (12→16px) — one of few responsive radius patterns in repo.
3. **Shadow duplication** on tab active states: `surface-premium` already includes premium shadow + local `shadow-[var(--shadow-1)]`.
4. **Nested cards use larger radius than parent** (14px inside 16px panel) — inverted hierarchy vs typical design systems (parent ≥ child).

---

## 9. Master Admin Audit

### 9.1 Zone comparison vs Rental UI

| Area | Master pattern | Rental equivalent | Delta |
|------|---------------|-------------------|-------|
| **Dashboard** | `DataCard`/`MetricCard` at 10px | Dashboard 16px panels | Master **more canonical** on dashboard |
| **Organisations** | `OrganizationDetailView` DataCards | similar | Aligned |
| **Billing** | `surface-premium rounded-2xl shadow-[var(--shadow-1)]` | Tenant billing similar | Both use **20px override** |
| **Monitoring** | `SystemMonitoringView` DataCards | — | 10px canon |
| **Integrations** | `rounded-2xl` on every section card | — | **Heavy 20px dialect** |
| **Settings / Platform email** | `rounded-3xl` icon (24px), `rounded-2xl` cards | — | Outlier radii |
| **Admin tools** | `TripDetectionLogicView` CARD = `rounded-2xl surface-solid` | — | **20px on L0** — double override |
| **Modals** | `VehicleRegistrationModal` `rounded-xl shadow-2xl` | Station modals similar | **12px + heavy shadow** |

### 9.2 Master Admin CARD constant pattern

Several views define a shared CARD string:

```ts
// TripDetectionLogicView, PerformanceLogicView, HealthTrackingView
const CARD = 'rounded-2xl shadow-sm border overflow-hidden surface-solid border-border';
```

This applies **20px radius + shadow-sm on top of L0 inset+xs** — canonical anti-pattern (radius + shadow override on surface class).

**Files with this pattern:** `TripDetectionLogicView.tsx`, `PerformanceLogicView.tsx`, `HealthTrackingView.tsx`.

### 9.3 Master vs Rental file counts

| Metric | `master/` | `rental/` |
|--------|----------:|----------:|
| Files with `rounded-2xl` | 27 | 117 |
| `surface-premium` hits | ~200+ | ~600+ |

Master Admin is **not a separate radius system** — it reuses the same `rounded-2xl` + `surface-premium` dialect as Rental, with slightly fewer files but **higher density** in Billing/Integrations/Connected Vehicles.

---

## 10. Feature Hardcodes / Overrides

### 10.1 Override taxonomy

| Pattern | Lines | Files | Severity |
|---------|------:|------:|----------|
| `surface-*` + `rounded-xl/2xl/3xl` same element | **398** | **190** | 🔴 Radius override |
| `surface-premium` + `rounded-2xl` | ~300+ | **137** | 🔴 Most common |
| `surface-solid` + `rounded-xl` | ~30+ | **26** | 🟡 L0 inflated |
| `surface-*` + local `shadow-sm/md/lg/xl` | **160** | ~80 | 🟡 Shadow override |
| `surface-premium` + `shadow-[var(--shadow-1)]` | ~50+ | ~40 | 🟡 Duplicate elevation |
| `border` added to `surface-premium` | widespread | ~100+ | 🟡 Possible double border |
| `bg-card` + `rounded-2xl` (no surface) | ~40+ | ~30 | 🟡 Bypasses surface stack |

### 10.2 Representative override examples

```tsx
// TasksView.tsx — container override
<div className="surface-premium rounded-2xl border border-border/50 p-3 shadow-[var(--shadow-1)]" />

// TaskWorkItemCard.tsx — nested card
className="surface-premium ... rounded-2xl border ... shadow-[var(--shadow-1)]"

// TripDetectionLogicView.tsx — CARD constant
'rounded-2xl shadow-sm border overflow-hidden surface-solid border-border'

// BillingPricingTab.tsx — repeated pattern
<section className="surface-premium rounded-2xl p-5 shadow-[var(--shadow-1)]" />

// InsurancesView.tsx — DataCard with explicit override
<DataCard className="rounded-2xl shadow-[var(--shadow-1)]" />

// VehicleRegistrationModal.tsx — modal
<div className="... rounded-xl ... shadow-2xl surface-premium" />
```

### 10.3 Dashboard shell overrides (intentional)

```tsx
// dashboardShell.tsx
dashboardPanelRadius: '!rounded-[16px]',
controlCenterCard: 'surface-premium !rounded-[16px] overflow-hidden',
controlFinanceKpiCard: 'min-h-[72px] !rounded-[12px] ...',
financeKpiCard: '... rounded-xl ... sm:rounded-2xl ...',
```

### 10.4 Override impact

When `surface-premium` (10px, L1 shadow stack) receives `rounded-2xl` (20px) + `shadow-[var(--shadow-1)]`:

- Radius **doubles** vs canon
- Shadow **stacks** xs-equivalent on top of 4×16 premium shadow
- Border may **duplicate** (CSS border + Tailwind `border border-border/50`)

---

## 11. L2 / L3 Explicit Exceptions

Per `LIQUID_GLASS_SYSTEM.md` and `SURFACE_INSPIRATION_AUDIT.md` — **do not migrate these to L0/L1 card radius.**

| Level | Class | Radius | Border | Shadow | Valid consumers |
|-------|-------|-------:|--------|--------|-----------------|
| **L2** | `surface-frosted` | **12px** | `--glass-border` | inset glass + `--shadow-md` | Login hero, sticky tab bars, drawer footers |
| **L3** | `surface-liquid` | **14px** (`--map-glass-radius`) | map glass | map glass stack | Map HUD pills, `MapboxMap` controls |
| **L4** | `overlay-scrim` | n/a (backdrop) | n/a | dim + blur | Dialog/sheet backdrop |
| **L4 content** | `.sq-overlay` | **12px** | `--border` | `--shadow-overlay` | Popovers, dropdown panels |

**Map radius language is intentionally separate** — 14px + liquid shine stack. Not counted as app card inconsistency.

---

## 12. Responsive Radius Differences

### 12.1 Breakpoint-based radius switching

**Rare in codebase.** Grep for `rounded-* md:rounded-*` / `sm:rounded-2xl` patterns found **~8 instances** (not zero):

| Pattern | File | Behavior |
|---------|------|----------|
| `rounded-xl sm:rounded-2xl` | `dashboardShell.tsx` `financeKpiCard` | 12px → 16px on sm+ |
| `rounded-t-2xl sm:rounded-2xl` | `StationFormModal.tsx`, `StationAssignVehicleModal.tsx` | Mobile sheet top radius |
| `rounded-t-2xl sm:rounded-xl` | `TechnicalObservationsHealthModule.tsx` | Mobile sheet |
| `rounded-t-2xl sm:rounded-2xl` | `MasterAccountSheet.tsx` | Mobile sheet |
| `hidden ... md:block` + different skeleton radius | `InvoiceList.tsx` | Table vs card skeleton |

### 12.2 Assessment

- **No systematic mobile/desktop card radius strategy** — ad hoc per feature.
- Dashboard finance KPI is the **only normal card** with intentional responsive radius escalation.
- Mobile bottom sheets consistently use `rounded-t-2xl` (Category E — acceptable).

---

## 13. Vero Reference Comparison

### 13.1 Vero characteristics (external reference, not copied)

| Property | Vero (approx.) | SynqDrive canonical | SynqDrive observed |
|----------|---------------|--------------------|--------------------|
| Canvas | `#F6F6F6` | `#F6F6F6` ✅ | aligned |
| Cards | `#FFFFFF` | `#FFFFFF` ✅ | aligned |
| Main card radius | **8–10px** | **10px** | **10–20px** mixed |
| Borders | extremely subtle | 7.5% opacity | mostly aligned; L1 +8.5% |
| Shadows | minimal | L0 xs; L1 4×16 | L1 + local duplicates |
| Elevation | low | L1 high | **too high for target** |
| Inset highlights | none visible | L0 subtle; L1 42% | L1 glossy edge |
| Hierarchy | canvas/card contrast | shadow-driven | shadow + radius inflation |

### 13.2 Largest SynqDrive ↔ Vero gaps (ranked)

1. **L1 elevation stack** (inset highlight + catch + 4×16 shadow) — cards float more than Vero.
2. **`rounded-2xl` (20px) on main cards** — reads as rounded SaaS, not calm ops UI.
3. **Dashboard 16px panels** — third radius tier above canon.
4. **Nested `rounded-xl` (14px) inside panels** — busy corner language.
5. **Shadow duplication** on tabs/KPI (`surface-premium` + `shadow-1`).

---

## 14. Recommended Target Architecture

> **Recommendation only — not implemented in this audit.**

### 14.1 Radius — Option **B+** (10px main, stepped nested)

| Surface type | Target radius | Rationale |
|--------------|---------------:|-----------|
| **Main cards / panels** | **10px** (`rounded-lg` / surface CSS) | Matches current canon + Vero 8–10px band |
| **Nested tiles / list cards** | **8px** (`rounded-md`) | Step down from parent — fixes inverted hierarchy |
| **Controls (button/input)** | **8px** (`rounded-md`) | Keep current |
| **Dialogs / sheets** | **12px** (`calc(radius+4)` / L2 token) | Slight lift for overlay context |
| **Badges / pills** | `rounded-full` | unchanged |
| **L2 frosted** | **12px** | unchanged |
| **L3 map HUD** | **14px** | unchanged |
| **Dashboard panels** | **10px** (retire 16px override) OR **12px** if hierarchy needed | Align with product, not separate dialect |

**Not recommended:** uniform 8px everywhere (too sharp for data-dense cards) or 20px main cards.

### 14.2 Borders

| Action | Detail |
|--------|--------|
| **Keep** | `--border` at 7.5% for L0 |
| **Reduce** | `--surface-premium-border` from 8.5% → **7.5%** (match L0) OR eliminate separate token |
| **Tokenize** | nested row borders as `--border-subtle` at ~5% instead of ad hoc `/20`–`/50` |
| **Remove** | redundant `border border-border` on elements already using `surface-*` |

### 14.3 Shadows / elevation

| Level | Proposed stack |
|-------|----------------|
| **L0** | `border` + `--shadow-xs` only; **remove inset highlight** or reduce to L0 current subtle mix |
| **L1** | `border` + `--shadow-xs` OR `--shadow-sm` max; **remove inset highlight + catch** |
| **L1 hover** | border darken only OR `--shadow-sm` — **no translateY** for calm UI |
| **Retire** | `--surface-premium-shadow` 4×16 as default; reserve for rare emphasis |
| **Ban** | `surface-premium` + `shadow-[var(--shadow-1)]` on same node |

### 14.4 L1 flattening

**L1 should not carry:** inset highlight at 42%, bottom catch, and 4×16 drop simultaneously.

Proposed L1 = **L0 + slightly stronger border** OR **L0 + `--shadow-sm`** — hierarchy via border weight, not gloss.

---

## 15. Proposed Migration Scope

### 15.1 Phase estimate

| Phase | Scope | Files (est.) | Effort |
|-------|-------|-------------:|--------|
| **P0 — Token flatten** | Reduce L1 shadow stack in `theme.css` | 1 | S |
| **P1 — Primitive enforcement** | ESLint/codemod: ban `rounded-xl/2xl` on `surface-*` | 190 | M |
| **P2 — Dashboard align** | Retire `!rounded-[16px]` / `!rounded-[12px]` constants | 5–8 | S |
| **P3 — Feature sweep** | Remove 398 override lines | 190 | **L** |
| **P4 — Master Admin CARD const** | Replace `rounded-2xl surface-solid` pattern | 3–5 | S |
| **P5 — Modal normalization** | Standardize sheet radius to 12px token | ~15 | M |
| **P6 — Nested tile pass** | `rounded-xl` → `rounded-md` on dashboard notifications/tasks | ~20 | M |

**Total affected files (unique):** ~**200–220** (radius overrides + shadow duplicates).

**Lines to touch (est.):** ~**550–650** (398 radius + 160 shadow overrides, some overlap).

### 15.2 Non-goals

- L2/L3 glass systems
- `rounded-full` badges
- Chart/canvas/signature technical radii
- Color/surface fill tokens (already done)

---

## 16. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dashboard visual regression | High | High | Visual snapshot tests; staged rollout per panel |
| L1 flatten makes cards “too flat” | Medium | Medium | A/B with design review; keep `--shadow-sm` fallback |
| Master Admin billing cards feel cramped at 10px | Low | Medium | Validate with longest German labels |
| Operator mobile relies on 20px | Medium | Medium | Exclude operator app or separate token |
| Codemod breaks compound class strings | Medium | High | AST-based migration; manual review top 20 files |
| Dark mode shadow regression | Medium | High | Test both themes; dark L1 already stronger |
| Removing inset highlight kills “premium” brand | Low | Low | Brand now neutral/Vero-aligned per V4.9.199 |

---

## 17. Acceptance Criteria for Future Cutover

### 17.1 Radius

- [ ] **100%** of Category A main cards use **10px** (or documented 12px dialog exception)
- [ ] **0** `rounded-2xl` / `rounded-3xl` on `surface-solid` / `surface-premium` / `surface-elevated` (grep gate)
- [ ] Dashboard panels use same radius as rest of product (no `!rounded-[16px]` without design sign-off)
- [ ] Nested Category B tiles ≤ parent radius (8px inside 10px)

### 17.2 Borders

- [ ] No duplicate `border` on `surface-*` elements unless nested row (tokenized `--border-subtle`)
- [ ] `border-gray-*` remains at 0

### 17.3 Shadows

- [ ] No `shadow-*` utility on same element as `surface-premium` / `surface-elevated`
- [ ] L1 stack documented and ≤ `--shadow-sm` apparent depth
- [ ] Visual diff vs Vero reference: cards readable as flat white on `#F6F6F6` without obvious drop shadow at 100% zoom

### 17.4 Tooling

- [ ] `check:surface` or new `check:geometry` script fails on `surface-*` + `rounded-xl|2xl|3xl`
- [ ] Storybook/pattern gallery documents L0/L1/L2 radius map

### 17.5 Verification views

- [ ] Rental Dashboard (all zones §8)
- [ ] Master Billing + Integrations
- [ ] Vehicle detail + Bookings list
- [ ] Settings company tab
- [ ] Mobile bottom sheet (one modal)
- [ ] Dark mode pass on above

---

## Appendix A — Scan methodology

- **Tool:** `rg` (ripgrep) on `frontend/src/**/*.{tsx,ts,css}`
- **Date:** 2026-08-24
- **Classification:** Manual semantic review of top-hit files + pattern greps; Category D (badges) excluded from inconsistency counts
- **Canonical sources read:** `theme.css`, `THEME_COLOR_CONTRACT.md`, `LIQUID_GLASS_SYSTEM.md`, `SURFACE_INSPIRATION_AUDIT.md`, `LIGHT_MODE_SURFACE_CUTOVER_AUDIT.md`, `card.tsx`, `surface.ts`, `data-card.tsx`, `app-dialog.tsx`, `dashboardShell.tsx`

## Appendix B — Related documents

| Document | Relevance |
|----------|-----------|
| `LIGHT_MODE_SURFACE_CUTOVER_AUDIT.md` | Fill colors — prerequisite, complete |
| `LIQUID_GLASS_SYSTEM.md` | L2/L3 exceptions |
| `SURFACE_INSPIRATION_AUDIT.md` | L0/L1 policy |
| `THEME_COLOR_CONTRACT.md` | Token ownership |

---

## 18. V4.9.200 Implementation Cutover (2026-08-24)

### 18.1 Previous state (pre-cutover)

- L1: inset highlight (42% white) + catch + `4×16` drop shadow + hover `translateY(-1px)`
- Dashboard: `!rounded-[16px]` panels, `!rounded-[12px]` KPI tiles
- Features: **398** `surface-*` + `rounded-xl|2xl` override lines across **190** files
- **160** duplicate shadow lines on `surface-premium` / `surface-elevated`

### 18.2 Final canonical radius hierarchy

| Surface type | Token / class | px |
|--------------|---------------|---:|
| Main cards / panels | `.surface-solid`, `.surface-premium`, `.surface-elevated`, `Card`, `DataCard` | **10** |
| Nested tiles / inner rows | `rounded-md` | **8** |
| Dialogs / sheets | `--radius-dialog`, `.sq-dialog-panel`, `rounded-dialog` | **12** |
| L2 frosted | `.surface-frosted` | **12** (unchanged) |
| L3 map HUD | `--map-glass-radius` | **14** (unchanged) |
| Badges / pills | `rounded-full` | unchanged |

### 18.3 Elevation changes (`theme.css`)

| Level | Before | After |
|-------|--------|-------|
| L1 `surface-premium` | inset highlight + catch + `4×16` shadow | `var(--shadow-sm)` only |
| L1 `surface-elevated` hover | `--shadow-hover` + `translateY(-1px)` | border-color emphasis only |
| L0 `surface-solid` | inset + `--shadow-xs` | unchanged |
| L2 / L3 | glass stacks | unchanged (frozen) |

### 18.4 Migration execution

| Phase | Action |
|-------|--------|
| P1 | Token + CSS flatten in `theme.css`; `--radius-dialog`; `.sq-dialog-panel` |
| P2 | Dashboard: removed `dashboardPanelRadius`, `controlCenterRadius`, `!rounded-[16px]` |
| P3 | `scripts/migrate-card-geometry.py` — **276** feature files |
| P4 | Shadow/radius cleanup + `scripts/cleanup-dialog-radius.py` — **70** files |
| P5 | Manual fixes: `support-ops.utils.ts` (L2 frosted), broken shadow tokens (3 files) |

### 18.5 Files changed

**~281** TS/TSX/CSS files + `theme.css` + migration scripts + this audit.

Key primitives: `theme.css`, `app-dialog.tsx`, `dashboardShell.tsx`, `ControlKpiStrip.tsx`, `FinanceKpiStrip.tsx`.

### 18.6 Overrides removed (automated counts)

| Metric | Removed |
|--------|--------:|
| Radius overrides on `surface-*` | **392** |
| Shadow overrides on `surface-*` | **190** |
| Dashboard `!rounded-[16px]` | **4** constants |
| `translateY(-1px)` on cards | **all** (CSS) |
| Nested dashboard `rounded-xl` → `rounded-md` | **5** |

### 18.7 Residual audit (post-cutover)

| Pattern | Remaining | Classification |
|---------|----------:|----------------|
| `surface-*` + `rounded-xl\|2xl\|3xl` | **0** | ✅ migrated |
| `!rounded-[16px]` | **0** | ✅ migrated |
| `translateY(-1px)` card hover | **0** | ✅ migrated |
| `surface-premium` + `shadow-[...]` duplicate | **1** (`TopBar.tsx` focus ring) | **B** — focus glow, not card elevation |
| `rounded-dialog` | **~8 files** | **B** — true modal/sheet shells |
| `rounded-2xl` | **2** (`MapboxMap.tsx` L3 empty state) | **G** — map HUD exception |
| `surface-frosted` L2 panels | `support-ops.utils.ts` | **F** — intentional frosted chrome |

**Category C (must fix): 0**

### 18.8 Intentional exceptions (documented)

1. **L2** `support-ops.utils.ts` — Master Support Ops inbox uses `surface-frosted` only (no `surface-premium` stacking).
2. **L3** `MapboxMap.tsx` — `rounded-2xl` on map liquid empty-state HUD.
3. **E** Modal shells — `rounded-dialog sq-dialog-panel` on `AppDialog`, `SettingsView`, `StationFormModal`, `HandoverProtocolDialog`, `MasterAccountSheet`, `MfaStepUpDialog`, `VendorDetailView`.
4. **C** `TopBar.tsx` — `focus-within:shadow-[0_0_0_3px_var(--brand-soft)]` is focus ring semantics, not L1 card elevation.
5. **E** `rental-surface-ui.ts` `popover` — `rounded-xl shadow-xl` on dropdown overlays (overlay tier, not main card).

### 18.9 Test results

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass |
| `npm run check:surface` | ✅ Pass |

### 18.10 Final verdict

**READY FOR INDEPENDENT REVIEW** → **DEPLOYED**

| Field | Value |
|-------|-------|
| **Merged** | PR #1257 → `main` @ `cf55badc` (2026-08-24T19:50:17Z) |
| **Production release** | `20260824195040_v4994` |
| **Health** | ✅ `https://app.synqdrive.eu/api/v1/health` |
| **PM2** | `synqdrive` online |

Controlled cutover complete. Main-card radius unified at 10px via surface primitives; L1 flattened; dashboard 16px dialect removed; residual Category C = 0.

---

*Audit originally read-only (2026-08-24). Implementation cutover V4.9.200 applied same day on branch `cursor/card-radius-elevation-cutover`.*

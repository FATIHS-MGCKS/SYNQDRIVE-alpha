# SynqDrive Surface / Glass / Liquid System

> **Status:** Architecture contract (documentation only — no visual migration applied yet)  
> **Canonical CSS:** `frontend/src/styles/theme.css`  
> **Color tokens:** `frontend/src/styles/THEME_COLOR_CONTRACT.md`  
> **Entry:** `frontend/src/styles/index.css`

---

## Purpose

SynqDrive uses **five surface levels** (L0–L4) so engineers, designers, and agents can distinguish:

- **Normal cards** (opaque, scroll-safe)
- **Frosted glass** (small, soft blur — not liquid)
- **Liquid glass** (map HUD only — multi-layer refraction)
- **Overlay scrims** (modal backdrops)

**Liquid Glass is not a general UI skin.** It is reserved for small floating HUD elements over map imagery.

---

## 1. Normal Card vs. Frosted Glass vs. Liquid Glass

| Dimension | Normal Card (L0/L1) | Frosted Glass (L2) | Liquid Glass (L3) |
|-----------|---------------------|--------------------|--------------------|
| **Opacity** | Solid or near-solid `--card` | Translucent `--glass-bg` | Translucent `--map-glass-*` stack |
| **Backdrop filter** | None | `blur(20–24px)` + moderate saturate | `blur(20–22px)` + high saturate + contrast |
| **Pseudo-layers** | Inset highlight only (box-shadow) | Top highlight + bottom catch (inset) | `::before` shine + `::after` edge + gradients |
| **Token family** | `--card`, `--border`, `--shadow-*` | `--glass-*` | `--map-glass-*` |
| **Typical size** | Large panels, grids, tables | Sticky bars, login hero, drawer footers | Pills, badges, compact HUD clusters |
| **Scroll context** | Allowed everywhere | Small chrome only | **Never** on scroll bodies |
| **Background** | App canvas | App canvas or over subtle UI | **Map / imagery only** |
| **Reduced transparency** | N/A (already solid) | Falls back to `--card` | Falls back to `--card` |

### Mental model

```
L0 surface-solid     ████  opaque card on canvas
L1 surface-elevated  ████▲ hover lift, still opaque
L2 surface-frosted   ░░░░  soft blur, no liquid shine stack
L3 surface-liquid    ✦✦✦✦  map HUD: blur + shine + edge refraction
L4 overlay-scrim     ▓▓▓▓  dimmed backdrop; content stays L0/L1
```

### Naming traps (read carefully)

| Name | Sounds like | Actually is |
|------|-------------|-------------|
| `sq-card` | “glass card” in changelog copy | **L0 baseline / L1 premium** — uses `--card`, no blur |
| `sq-overlay` | glass overlay | **L1 solid** popover (`--popover`) — not translucent |
| `sq-glass` | liquid | **L2 frosted** only |
| `sq-map-liquid-*` | marketing “liquid” | **L3 true liquid** — only valid use of the term |

---

## 2. Five surface levels (L0–L4)

### L0 — `surface-solid`

**Role:** Baseline opaque surface. Maximum readability, zero decoration cost. For dense data and structural grouping.

| Property | Rule |
|----------|------|
| Background | `var(--card)` — **opaque** in practice (dark `#121214`; light may use near-solid card token) |
| Blur | **None** |
| Border / shadow | `var(--border)`, `var(--shadow-xs)` |
| Gradient | **None** (flat fill) |
| Use for | Table containers, admin panels, detail section bodies, settings forms, nested list wrappers, flush `DataCard` with `flush` |

**Canonical classes:** `.surface-solid`, `.sq-card` (legacy alias), shadcn `Card` with `bg-card`, table outer shells.

**When L0 is enough:** See §2.1 decision matrix below.

---

### L1 — `surface-premium` (Premium Solid)

**Role:** High-quality **normal** SaaS card — tactile depth without transparency or blur. **Not glass. Not liquid.**

| Property | Rule |
|----------|------|
| Background | Opaque `var(--card)` + **subtle surface gradient** (2–4% lightness shift) |
| Blur | **None** |
| Border | Fine `var(--border)` hairline |
| Shadow | Inset top highlight + ambient `--shadow-sm` / `--shadow-md` |
| Pseudo-layers | **Inset box-shadow only** — no `::before` shine stack (that is L3) |
| Interaction | Optional hover lift → use `.sq-card-elevated` or `DataCard interactive` |
| Use for | Dashboard KPIs, customer/vehicle/booking cards, health modules, admin summary cards, fleet command rows (when card-wrapped), featured `MetricCard` / `DataCard` |

**Canonical classes (today):** `.surface-premium`, `.sq-card-premium` + domain tiles (`booking-kpi-tile`, `fleet-health-kpi-tile`) + `dashboardKpiVisual` status gradients + `MetricCard` / `DataCard`.

**Tokens:** `--surface-premium-bg-start`, `--surface-premium-bg-end`, `--surface-premium-border`, `--surface-premium-highlight`, `--surface-premium-catch`, `--surface-premium-shadow`.

**Icon bubble:** `sq-tone-*` soft tiles or `getKpiIconTileClass()` — semantic tint, not glass.

---

### L1 — `surface-elevated` (Interactive Premium Solid)

**Role:** Same material as L1 premium with **interaction affordance** (lift, stronger shadow, border emphasis).

| Property | Rule |
|----------|------|
| Background | Same as L1 premium — opaque, no blur |
| Interaction | Hover `translateY(-1px)`, `--shadow-hover`, border `color-mix` toward foreground |
| Use for | Clickable KPI cards, fleet command rows (navigable), customer/vehicle cards with `onClick`, modal/dialog **content**, dropdown panels (`sq-overlay`) |

**Canonical classes:** `.surface-elevated` (premium interactive), `.sq-card-elevated` (legacy solid interactive), `DataCard` with `interactive`, `.sq-overlay`, Sheet/Dialog content (`bg-popover`).

**Not glass:** `sq-overlay` is a **solid elevated panel** — do not add backdrop-filter to it.

---

### L2 — `surface-frosted`

**Role:** Soft frosted glass for **small** UI chrome where translucency adds depth without liquid effects.

| Property | Rule |
|----------|------|
| Tokens | `--glass-bg`, `--glass-border`, `--glass-blur` (24px light / 28px dark) |
| Blur | **20–24px** effective (token-driven) |
| Effects | Inset edge highlight + catch light — **no** `::before` shine stack |
| Use for | Login hero, sticky tab bars, drawer footers, light mobile scrims |
| Avoid | Large scroll regions, KPI grids, table rows, full-page panels |

**Canonical classes:** `.surface-frosted`, `.sq-glass` (legacy alias)

**Future alias:** ~~`.surface-frosted`~~ — **implemented V4.9.275**

---

### L3 — `surface-liquid`

**Role:** SynqDrive **Liquid Glass** — premium floating HUD over imagery.

| Property | Rule |
|----------|------|
| Tokens | `--map-glass-bg`, `--map-glass-bg-strong`, `--map-glass-border`, `--map-glass-highlight`, `--map-glass-shine`, `--map-glass-shadow`, `--map-glass-blur` |
| Blur | **20–22px** + `saturate(185%+)` + optional `contrast(1.03)` |
| Pseudo-layers | `::before` (shine gradient), `::after` (edge catch) on pill/badge/glass variants |
| Placement | `position: absolute` / fixed HUD over **map or imagery** |
| Use for | Map HUD, map controls, map badges, marker callouts, trip map overlays |
| **Never** | Tables, sidebars, top bars, dashboard cards, operator list cards |

**Canonical class families:**

| Class | HUD element |
|-------|-------------|
| `.sq-map-liquid-glass` | Container chip (legend, layer bar, summary strip) |
| `.sq-map-liquid-pill` | Metric pill / action pill |
| `.sq-map-liquid-badge` | Status / address / hint badge |
| `.sq-map-liquid-empty` | Empty state over map |
| `.sq-map-liquid-loading` | Loading state over map |
| `.sq-map-liquid-hud` | Footer metric group wrapper |
| `.sq-map-liquid-tile` | Inner tile (transparent — no extra stack) |
| `.sq-map-glass-controls` | Horizontal control cluster (Fit / Locate / Stations) |
| `.sq-map-marker-callout` | DOM marker label callout |

**Future alias:** ~~`.surface-liquid`~~ — **implemented V4.9.275** (base class); map-specific classes remain granular.

---

### L4 — `overlay-scrim`

**Role:** Modal/sheet **backdrop** — dims and slightly blurs content behind.

| Property | Rule |
|----------|------|
| Background | `color-mix(foreground 28%, transparent)` light; `rgba(0,0,0,0.58)` dark |
| Blur | **6px** on scrim only |
| Content on top | **L1 solid** (`sq-overlay`, `bg-popover`, `bg-card`) — not liquid |
| Use for | Dialog overlay, sheet overlay, full-screen modal scrims |

**Canonical class:** `.overlay-scrim`, `.sq-backdrop` (legacy alias)

---

### 2.1 When to use L0 / L1 premium / L2 / L3

| Question | → Level |
|----------|---------|
| Dense table wrapper, settings section, plain grouping? | **L0** `surface-solid` |
| Featured KPI, health module, vehicle/customer card, admin summary? | **L1** `surface-premium` |
| Same card but clickable / navigable? | **L1** `surface-elevated` (interactive) |
| Login hero, sticky tab chrome, drawer footer, mobile scrim edge? | **L2** `surface-frosted` |
| Small HUD floating over map imagery? | **L3** `surface-liquid` |
| Modal backdrop? | **L4** `overlay-scrim` |

**Hard rules:**

- If the surface **scrolls with lots of text/rows** → L0 (not L2, not L3).
- If there is **no map/imagery underneath** → L3 forbidden.
- If the goal is **readability on data** → L0 or L1 premium (opaque), never frosted full panel.
- **Premium ≠ glass.** Gradients and inset highlights on opaque `--card` are L1, not L2.

Full inspiration analysis: `SURFACE_INSPIRATION_AUDIT.md` §14–17.

---

## 3. Class → level mapping (current codebase)

| Class / pattern | Level | Notes |
|-----------------|-------|-------|
| `.surface-solid` | **L0** | Canonical opaque baseline |
| `.sq-card` | **L0** | Legacy alias of `.surface-solid` |
| `.surface-premium` | **L1 premium** | Canonical premium solid (opt-in) |
| `.sq-card-premium` | **L1 premium** | Legacy alias of `.surface-premium` |
| `.surface-elevated` | **L1 interactive** | Premium solid + hover/active |
| `.sq-card-elevated` | **L1 interactive** | Legacy solid interactive (no premium gradient) |
| `.surface-frosted` | **L2** | Canonical frosted glass |
| `.sq-glass` | **L2** | Legacy alias of `.surface-frosted` |
| `.glass-card` | **L2** (deprecated) | Alias of `.sq-glass` — **no TSX usage**; do not use in new code |
| `.glass-panel` | **L2** (deprecated) | `.sq-glass` + bottom catch — **no TSX usage** |
| `.surface-liquid` | **L3** | Canonical liquid HUD base |
| `.sq-map-liquid-glass` | **L3** | Liquid container |
| `.sq-map-liquid-pill` | **L3** | Liquid pill |
| `.sq-map-liquid-badge` | **L3** | Liquid badge |
| `.sq-map-liquid-empty` | **L3** | Liquid empty state |
| `.sq-map-liquid-loading` | **L3** | Liquid loading state |
| `.sq-map-liquid-hud` | **L3** | HUD layout wrapper |
| `.sq-map-liquid-tile` | **L3** | Inner metric cell (no extra glass stack) |
| `.sq-map-glass-controls` | **L3** | Map toolbar cluster |
| `.sq-map-marker-callout` | **L3** | Marker callout |
| `.overlay-scrim` | **L4** | Canonical modal/sheet scrim |
| `.sq-backdrop` | **L4** | Legacy alias of `.overlay-scrim` |
| `.sq-overlay` | **L1** | Solid popover — **not** frosted or liquid |
| `.sq-tab-bar` | **L0** | Segmented control track; solid muted + solid active tab |
| `.sq-3d-btn` | — | **Not a surface level** — tactile button chrome (orthogonal to L0–L4) |

### Related but not surface levels

| Item | Treatment |
|------|-----------|
| `.sq-chip-*`, `.sq-tone-*` | Status tints — not surfaces |
| `.sq-nav-rail` | Navigation accent — not glass |
| `.booking-kpi-tile` | **L1 premium** compact tile (opaque, subtle border) |
| `.trips-summary-bar__inner` | **L2-like** ad-hoc (blur 8px) — migrate to tokenized frosted or L0 |
| `dashboardKpiVisual` gradients | **L1 premium** tinted cards — status gradient on opaque base, not glass |
| `OperatorGlassCard` | **L2 ad-hoc** (`bg-card/80 backdrop-blur-md`) — deprecated pattern |

---

## 4. Deprecated patterns (do not use in new code)

| Pattern | Why deprecated | Target replacement |
|---------|----------------|-------------------|
| `.glass-card`, `.glass-panel` | Unused aliases; duplicate of `.sq-glass` | `.sq-glass` → future `.surface-frosted` |
| `sq-card` + `sq-glass` on same node | Double stack; conflicting backgrounds/blur | Single level: L0 **or** L2, never both |
| `bg-card/95 backdrop-blur-sm` (inline Tailwind) | Bypasses tokens; no reduced-transparency fallback | `.sq-glass` or stay L0 solid |
| `OperatorGlassCard` component pattern | Local blur recipe parallel to `.sq-glass` | `.sq-glass` wrapper or L0 `.sq-card` |
| `backdrop-blur-[2px]`–`md` scattered in TSX | Inconsistent strength; missing a11y fallback | L2 utility or L4 scrim class only |
| Calling KPI/dashboard cards “liquid glass” | Misleading — no liquid stack | **L0** + optional status gradient |
| Applying `--glass-*` on map HUD | Wrong token family | `--map-glass-*` only for L3 |

**Removal timeline:** Deprecated classes remain in `theme.css` until migration phase 5 — no breaking delete until call sites are zero.

---

## 5. Where Liquid Glass (L3) is allowed

### Allowed ✅

- Fleet map controls (`MapGlassControls`, `FleetMapControls`)
- Vehicle overview live map HUD (`OverviewLiveMapCard` footer pills)
- Trip map overlays (`TripsMapCard`, `TripMapLegend`, `TripMapSummaryOverlay`, …)
- Live map badges, empty/loading states (`LiveMapOverview`, `MapboxMap`)
- Marker callouts (`sq-map-marker-callout`)
- Mapbox native zoom control styling (map-glass tokens)

### Forbidden ❌

- Dashboard, sidebar, top bar, settings, admin
- Table rows, list items, KPI grids
- Full-width panels or scrollable page sections
- Dialog/drawer **content** panels
- Operator booking cards (use L0 or L2 — not L3)
- Health module cards, invoice tables, booking timelines

### Placement rules

1. **Map or imagery underneath** — if there is no live map/static map tile, use L0/L1/L2 instead.
2. **Small absolute footprint** — HUD clusters, pills, badges; not full-bleed bars (exception: compact footer HUD strip on map).
3. **`pointer-events` discipline** — HUD wrappers often `pointer-events-none` with selective `pointer-events-auto` on controls.
4. **Token family** — only `--map-glass-*`; never `--glass-*` for L3.
5. **Z-index** — map HUD sits above map canvas, below global modals (L4).

---

## 6. Reduced transparency (`prefers-reduced-transparency: reduce`)

### Contract

Users who opt out of translucency must see **solid, legible** surfaces. All L2 and L3 utilities must degrade to `background: var(--card)` and `backdrop-filter: none`.

### Currently covered in `theme.css` (V4.9.275)

- **L2:** `.surface-frosted`, `.sq-glass`, `.glass-card`, `.glass-panel`
- **L3:** `.surface-liquid`, `.sq-map-liquid-glass`, `.sq-map-liquid-pill`, `.sq-map-liquid-badge`, `.sq-map-liquid-empty`, `.sq-map-liquid-loading`, `.sq-map-liquid-hud`, `.sq-map-liquid-tile`, `.sq-map-glass-controls`, `.sq-map-marker-callout`
- **L4:** `.overlay-scrim`, `.sq-backdrop`
- **`@supports not (backdrop-filter)`** — solid fallbacks for all L2/L3/L4
- **Pseudo-layers** (`::before` / `::after`) disabled under reduced transparency

### Known gaps (component migration — phase 3+)
- Inline `backdrop-blur-*` in TSX — **not** centrally governed
- `.trips-summary-bar__inner` — ad-hoc blur without fallback
- `DetailDrawer` footer inline blur — migrate to L2 utility with fallback

### Rules for new work

1. **Do not add new inline `backdrop-blur-*`** in components — use `.sq-glass` (L2) or `.sq-backdrop` (L4).
2. Any new L2/L3 class **must** be added to the `@media (prefers-reduced-transparency: reduce)` block in `theme.css`.
3. L0/L1 surfaces are always safe — prefer them when blur is decorative only.
4. Test with macOS *Reduce transparency* and `prefers-reduced-transparency: reduce` in DevTools.

---

## 7. Token reference (by level)

| Level | CSS variables |
|-------|---------------|
| L0 | `--card`, `--border`, `--shadow-xs` |
| L1 premium | `--surface-premium-bg-start`, `--surface-premium-bg-end`, `--surface-premium-border`, `--surface-premium-highlight`, `--surface-premium-catch`, `--surface-premium-shadow` |
| L1 interactive | `--shadow-sm`, `--shadow-hover` (+ premium tokens when using `.surface-elevated`) |
| L2 | `--glass-bg`, `--glass-border`, `--glass-blur`, `--glass-edge-highlight`, `--glass-edge-catch` |
| L3 | `--map-glass-bg`, `--map-glass-bg-strong`, `--map-glass-border`, `--map-glass-highlight`, `--map-glass-shine`, `--map-glass-shadow`, `--map-glass-blur` |
| L4 | Scrim uses foreground mix / dark rgba — blur 6px on `.sq-backdrop` only |

Light/dark values: see `THEME_COLOR_CONTRACT.md` § Glass / Map glass.

---

## 8. Migration plan (no visual change until each phase)

| Phase | Scope | Visual change? |
|-------|--------|----------------|
| **1 — CSS system** | Canonical `.surface-*` classes, `.sq-card-premium`, fallbacks, tokens | **No** (opt-in premium only) |
| **2 — Documentation** | This file + audits + contract cross-links | **No** |
| **3 — Component opt-in** | `MetricCard` / featured surfaces adopt `.surface-premium` | Per call site |
| **4 — Map HUD consolidate** | Map classes extend `.surface-liquid` base | Minimal |
| **5 — Local blur replacement** | Replace inline `backdrop-blur` → `.surface-frosted` | Per call site |
| **6 — Deprecation cleanup** | Remove `.glass-card`, `.glass-panel`; remove `sq-card sq-glass` stacks | After zero references |

**Explicitly out of scope for early phases:** Sidebar, TopBar, Dashboard layout, component API changes.

### Suggested file order for phase 4

1. `trips/trips-view-ui.ts`, `vehicle-overview-ui.ts`, `support-center.utils.ts`, `service-center-ui.ts`
2. `operator/components/OperatorGlassCard.tsx`
3. `components/patterns/detail-drawer.tsx` (footer)
4. `customer-detail/customer-detail-ui.ts` (sticky chrome)
5. Remaining `backdrop-blur` grep hits (batch by feature)

---

## 9. Decision checklist (for PRs)

Before adding or changing a surface, answer:

1. **Which level?** (L0–L4 only one)
2. **Is there a map underneath?** If no → L3 is forbidden.
3. **Does it scroll?** If yes → L0/L1 only.
4. **Is blur necessary?** If decorative → prefer L0.
5. **Does reduced transparency have a fallback?** If L2/L3 → must be in `theme.css` block.
6. **Are you stacking `sq-card` + `sq-glass`?** If yes → stop; pick one level.

---

## 10. Cross-references

| Document | Role |
|----------|------|
| `SURFACE_INSPIRATION_AUDIT.md` | External liquid vs frosted research, recipes, license guidance |
| `THEME_COLOR_CONTRACT.md` | Color + token values, shadcn bridge |
| `theme.css` | Implementation + a11y media queries |
| `components/patterns/data-card.tsx` | L0/L1 pattern reference |
| `components/patterns/app-dialog.tsx` | L4 + L1 pattern reference |
| `components/map/MapGlassControls.tsx` | L3 reference implementation |

---

*Last updated: 2026-07-09 — V4.9.275 Phase 1 CSS system.*

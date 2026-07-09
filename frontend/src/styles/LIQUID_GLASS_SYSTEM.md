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
| `sq-card` | “glass card” in changelog copy | **L0 solid** — uses `--card`, no blur |
| `sq-overlay` | glass overlay | **L1 solid** popover (`--popover`) — not translucent |
| `sq-glass` | liquid | **L2 frosted** only |
| `sq-map-liquid-*` | marketing “liquid” | **L3 true liquid** — only valid use of the term |

---

## 2. Five surface levels (L0–L4)

### L0 — `surface-solid`

**Role:** Default product surface. Readable, scroll-safe, no performance cost from blur.

| Property | Rule |
|----------|------|
| Background | `var(--card)` |
| Blur | **None** |
| Border / shadow | `var(--border)`, `var(--shadow-xs)` |
| Use for | Dashboard KPIs, admin tables, bookings, invoices, health modules, detail drawer **bodies**, settings forms, data tables |

**Canonical classes:** `.sq-card`, `DataCard` (non-interactive), shadcn `bg-card` surfaces.

---

### L1 — `surface-elevated`

**Role:** Same material as L0 with interaction affordance (lift, stronger shadow).

| Property | Rule |
|----------|------|
| Background | `var(--card)` |
| Blur | **None** |
| Interaction | Hover translateY, `--shadow-hover` |
| Use for | Clickable cards, list rows, modal/dialog **content**, dropdown panels (`sq-overlay`), drawer panels |

**Canonical classes:** `.sq-card-elevated`, `DataCard` with `interactive`, `.sq-overlay`, Sheet/Dialog content (`bg-popover`).

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

**Canonical classes:** `.sq-glass`

**Future alias (migration phase 2):** `.surface-frosted` → same rules as `.sq-glass`

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

**Future alias (migration phase 2):** `.surface-liquid` → semantic wrapper; map classes remain granular.

---

### L4 — `overlay-scrim`

**Role:** Modal/sheet **backdrop** — dims and slightly blurs content behind.

| Property | Rule |
|----------|------|
| Background | `color-mix(foreground 28%, transparent)` light; `rgba(0,0,0,0.58)` dark |
| Blur | **6px** on scrim only |
| Content on top | **L1 solid** (`sq-overlay`, `bg-popover`, `bg-card`) — not liquid |
| Use for | Dialog overlay, sheet overlay, full-screen modal scrims |

**Canonical class:** `.sq-backdrop`

**Future alias:** `.overlay-scrim` → same as `.sq-backdrop`

---

## 3. Class → level mapping (current codebase)

| Class / pattern | Level | Notes |
|-----------------|-------|-------|
| `.sq-card` | **L0** | Solid card; comment “soft glass” in history refers to inset highlight only |
| `.sq-card-elevated` | **L1** | Solid + hover lift |
| `.sq-glass` | **L2** | Frosted glass |
| `.glass-card` | **L2** (deprecated) | Alias of `.sq-glass` — **no TSX usage**; do not use in new code |
| `.glass-panel` | **L2** (deprecated) | `.sq-glass` + bottom catch — **no TSX usage** |
| `.sq-map-liquid-glass` | **L3** | Liquid container |
| `.sq-map-liquid-pill` | **L3** | Liquid pill |
| `.sq-map-liquid-badge` | **L3** | Liquid badge |
| `.sq-map-liquid-empty` | **L3** | Liquid empty state |
| `.sq-map-liquid-loading` | **L3** | Liquid loading state |
| `.sq-map-liquid-hud` | **L3** | HUD layout wrapper |
| `.sq-map-liquid-tile` | **L3** | Inner metric cell (no extra glass stack) |
| `.sq-map-glass-controls` | **L3** | Map toolbar cluster |
| `.sq-map-marker-callout` | **L3** | Marker callout |
| `.sq-backdrop` | **L4** | Modal/sheet scrim |
| `.sq-overlay` | **L1** | Solid popover — **not** frosted or liquid |
| `.sq-tab-bar` | **L0** | Segmented control track; solid muted + solid active tab |
| `.sq-3d-btn` | — | **Not a surface level** — tactile button chrome (orthogonal to L0–L4) |

### Related but not surface levels

| Item | Treatment |
|------|-----------|
| `.sq-chip-*`, `.sq-tone-*` | Status tints — not surfaces |
| `.sq-nav-rail` | Navigation accent — not glass |
| `.booking-kpi-tile` | **L0** compact tile (near-solid, no blur) |
| `.trips-summary-bar__inner` | **L2-like** ad-hoc (blur 8px) — migrate to tokenized frosted or L0 |
| `dashboardKpiVisual` gradients | **L0** tinted cards — not glass despite changelog “glass KPI” language |
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

### Currently covered in `theme.css`

- `.sq-glass`, `.glass-card`, `.glass-panel`
- `.sq-map-liquid-glass`, `.sq-map-liquid-pill`, `.sq-map-liquid-badge`, `.sq-map-liquid-empty`, `.sq-map-liquid-loading`
- `.sq-map-marker-callout`
- `.sq-backdrop` (scrim becomes solid tint, blur off)

### Known gaps (fix in migration phase 3)

- `.sq-map-glass-controls` — **not yet** in fallback block
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
| L0/L1 | `--card`, `--border`, `--shadow-xs`, `--shadow-sm`, `--shadow-hover`, `--shadow-overlay` |
| L2 | `--glass-bg`, `--glass-border`, `--glass-blur`, `--glass-edge-highlight`, `--glass-edge-catch` |
| L3 | `--map-glass-bg`, `--map-glass-bg-strong`, `--map-glass-border`, `--map-glass-highlight`, `--map-glass-shine`, `--map-glass-shadow`, `--map-glass-blur` |
| L4 | Scrim uses foreground mix / dark rgba — blur 6px on `.sq-backdrop` only |

Light/dark values: see `THEME_COLOR_CONTRACT.md` § Glass / Map glass.

---

## 8. Migration plan (no visual change until each phase)

| Phase | Scope | Visual change? |
|-------|--------|----------------|
| **1 — Documentation** | This file + theme.css comments + contract cross-links | **No** |
| **2 — CSS aliases** | Add `.surface-solid`, `.surface-elevated`, `.surface-frosted`, `.surface-liquid`, `.overlay-scrim` as aliases mapping to existing classes | **No** (aliases only) |
| **3 — Map HUD consolidate** | Single source for mapbox ctrl styles; add `.sq-map-glass-controls` to reduced-transparency block | Minimal / a11y only |
| **4 — Local blur replacement** | Replace `bg-card/95 backdrop-blur-sm` and `OperatorGlassCard` recipe with L2 utility | Yes — per call site |
| **5 — Deprecation cleanup** | Remove `.glass-card`, `.glass-panel`; remove `sq-card sq-glass` stacks | Yes — after zero references |

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

*Last updated: 2026-07-08 — V4.9.272 documentation pass (architecture only).*

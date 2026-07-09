# SynqDrive Surface Inspiration & Technique Audit

> **Status:** Research & concept derivation only — **no code changes, no dependencies**  
> **Date:** 2026-07-09  
> **Internal contracts:** `LIQUID_GLASS_SYSTEM.md`, `theme.css`, `THEME_COLOR_CONTRACT.md`  
> **Scope:** Separate evaluation of **Liquid Glass (L3)** vs **Frosted Glass / Glassmorphism (L2)**

---

## 1. Executive Summary

SynqDrive already implements a **sound split** between frosted app chrome (L2, `--glass-*`) and map HUD liquid (L3, `--map-glass-*`). External “liquid glass” hype mostly conflates three unrelated techniques:

| Technique | What it actually is | SynqDrive level |
|-----------|---------------------|-----------------|
| **Glassmorphism / frosted** | `backdrop-filter: blur()` + semi-opaque fill | **L2** — small readable chrome |
| **CSS “liquid” stack** | Frosted blur + pseudo shine/edge (no real refraction) | **L3 today** — map HUD only |
| **True liquid refraction** | SVG `feDisplacementMap` / WebGPU displacement | **Not in product** — prototype-only candidate |

**Key findings:**

1. **Do not adopt external UI libraries** (`glinui`, `shadcn-glass-ui`, full glass design systems). They promote glass/liquid on cards, tables, navbars, and modals — opposite of SynqDrive L0/L1 policy.
2. **L2 should stay CSS-only** via `theme.css` tokens. Josh Comeau’s frosted-glass optimizations (extended blur sampling, semi-opaque fallback) are the best external inspiration for L2 — not displacement libraries.
3. **L3 is already correctly scoped** to map HUD. Current implementation is **CSS liquid-analog** (blur + saturate + `::before` shine + `::after` edge), not geometric refraction. That is **appropriate** for fleet SaaS: legible, performant, no WebGPU dependency.
4. **True displacement** (Aave technique, `liquid-glass-web-react`, `nikdelvin/liquid-glass`) is viable only as a **small internal prototype** for 1–2 map HUD elements — never for app surfaces.
5. **`liquid-dom` (WebGPU)** is impressive demo tech but **unsuitable** for SynqDrive production: Chrome flags, WebGPU requirement, massive complexity, wrong surface area.
6. **`backdrop-filter` is Baseline 2024** (~97% global support). Always pair with `@supports` + `prefers-reduced-transparency` solid fallbacks (partially done; gaps remain per `LIQUID_GLASS_SYSTEM.md` §6).

**Recommendation:** Keep L0/L1 solid. Refine L2 frosted tokens using glassmorphism best practices. Keep L3 as CSS HUD; optionally prototype SVG displacement on a single map pill in a branch — do not ship WebGPU or npm liquid libraries.

---

## 2. SynqDrive Surface Goals

Aligned with `LIQUID_GLASS_SYSTEM.md`:

| Level | Name | Goal |
|-------|------|------|
| **L0** | `surface-solid` | Default product UI — KPIs, tables, health, bookings, admin |
| **L1** | `surface-elevated` | Interactive solid — rows, dialog content, popovers |
| **L2** | `surface-frosted` | Small **readable** translucent chrome — login hero, sticky tabs, drawer footer, mobile scrim |
| **L3** | `surface-liquid` | Small **floating HUD** over map/imagery only |
| **L4** | `overlay-scrim` | Modal backdrop — dim + light blur; content stays L0/L1 |

### Two topics — never mix

```
┌─────────────────────────────────────────────────────────────┐
│  LIQUID GLASS (L3)          │  FROSTED GLASS (L2)           │
│  Map HUD feeling            │  Transparent app chrome       │
│  Edge / shine / refraction  │  Blur + readable fill         │
│  --map-glass-*              │  --glass-*                    │
│  Pseudo-layers OK           │  NO shine stack, NO displ.    │
│  Map/imagery required       │  App canvas OK                │
└─────────────────────────────────────────────────────────────┘
```

### Explicitly NOT recommended to convert

Dashboard KPIs · tables · list rows · vehicle/customer rows · health modules · bookings · invoices · admin settings · large scroll bodies · sidebar · top bar.

---

## 3. Liquid Glass Source Analysis (L3)

### 3.1 Evaluation matrix

| Source | Tech | Chrome | Safari / iOS | Firefox | Mobile perf | Vite/React | Reduced transparency | License | SynqDrive fit |
|--------|------|--------|--------------|---------|-------------|------------|----------------------|---------|---------------|
| [AndrewPrifer/liquid-dom](https://github.com/AndrewPrifer/liquid-dom) | **WebGPU** + DOM→texture (HTML-in-Canvas flag) | Flag + WebGPU | Limited | WebGPU only | Heavy GPU | React 19 pkg | Unknown | MIT | **Reject** — demo/experimental |
| [PallavAg/liquid-glass-web-react](https://github.com/PallavAg/liquid-glass-web-react) | SVG `feDisplacementMap` + computed PNG map | ✓ | ✓ (filter ID refresh) | ✓ | Moderate; map regen on resize | SSR-safe (`use client`) | Not built-in | MIT | **Prototype only** — map pill |
| [nikdelvin/liquid-glass](https://github.com/nikdelvin/liquid-glass) | SVG displacement + `backdrop-filter` | ✓ | Partial → glassmorphism fallback | ✓ | Moderate | Astro components | Safari fallback to blur | MIT | **Inspiration** — edge/shine params |
| [Mael-667/Liquid-Glass-CSS](https://github.com/Mael-667/Liquid-Glass-CSS) | SVG displacement + dynamic tint | ✓ | ✓ | ✓ | Unknown on large surfaces | React provider | Not documented | Unclear (check LICENSE) | **Reject as dep** — general-purpose glass |
| [Rethink-JS/rt-liquid-glass](https://github.com/Rethink-JS/rt-liquid-glass) | SVG displacement + `backdrop-filter` + attr API | ✓ | Fallback blur | Firefox SVG toggle | Per-element SVG cost | Vanilla / CDN | Explicit fallback blur | MIT | **Inspiration** — fallback pattern |
| [creativoma/liquid-glass](https://github.com/creativoma/liquid-glass) | SVG `feTurbulence` + displacement + Tailwind | ✓ | iOS fallback claimed | ✓ | Noise + displacement = costly | React lib | Partial | MIT | **Reject** — mislabels glassmorphism as liquid |
| [glincker/glinui](https://github.com/glincker/glinui) | Full design system: glass + liquid variants, `useLiquidGlass` hook | ✓ | backdrop fallback | ✓ | 77 components, many effects | Radix + Tailwind | Reduced motion only | MIT | **Reject** — wrong product model |
| [Aave — Building Glass for the Web](https://aave.com/design/building-glass-for-the-web) | `feDisplacementMap` + WebGL for video/canvas | ✓ | ✓ (workarounds) | ✓ | Optimized per lens | Concept article | Not discussed | N/A | **Best technical reference** for true liquid |
| SynqDrive `sq-map-liquid-*` (current) | CSS `backdrop-filter` + gradients + `::before/::after` | ✓ | ✓ | ✓ | **Good** — small HUD footprint | Native CSS | Partial (gap: `sq-map-glass-controls`) | — | **Keep** — production L3 |

### 3.2 Per-source notes

#### AndrewPrifer/liquid-dom ⛔

- **Technique:** WebGPU renderer; DOM nodes as GPU textures; requires `navigator.gpu` and Chrome **Canvas Draw Element** flag for live HTML.
- **Fit:** Zero production fit for SynqDrive. Useful only to understand where the industry is heading (GPU composited glass).
- **Risk:** WebGL/WebGPU on every map control = battery drain, broken UX on unsupported browsers, impossible SSR story.

#### PallavAg/liquid-glass-web-react ⚠️ Prototype

- **Technique:** Generates displacement PNG; `feDisplacementMap` with chromatic aberration; lens moves without map regen (performance win).
- **Useful for L3:** Edge highlight, glow, strength/curvature parameters; Safari filter-ID refresh pattern.
- **Not for:** General cards, navbars, tables (demo uses full dashboards).
- **SynqDrive:** If ever tried, wrap **one** map pill in an isolated prototype branch; default remains CSS stack.

#### nikdelvin/liquid-glass ⚠️ Inspiration

- **Technique:** Pure CSS + SVG filters; chromatic aberration; Safari auto-fallback to glassmorphism.
- **Useful:** Parameter naming (`depth`, `strength`, `chromaticAberration`); demonstrates that **Safari cannot do `backdrop-filter: url()`** reliably.
- **Risk:** README examples use hero cards and full panels — wrong scale for SynqDrive.

#### Mael-667/Liquid-Glass-CSS ⛔

- **Technique:** React provider injects global SVG filters; “dynamic tint” from colored sections.
- **Problem:** Encourages wrapping entire app; `large` variant for nav — conflicts with L0 sidebar policy.
- **Dependency:** npm package — unnecessary when SynqDrive owns tokens.

#### Rethink-JS/rt-liquid-glass ✓ Inspiration (fallback pattern)

- **Technique:** Attribute-driven; detects capabilities; `rt-liquid-glass-fallback-blur` when SVG disabled.
- **Useful:** Explicit dual-mode (liquid vs frosted fallback) — aligns with SynqDrive reduced-transparency contract.
- **Not a dependency:** Pattern only.

#### creativoma/liquid-glass ⛔

- **Technique:** `feTurbulence` + displacement — visually “wavy” glass.
- **Problem:** Marketing says “liquid frosted glass”; examples include **navbar, modal, full cards**.
- **Risk:** Turbulence displacement on scrolling UI = nausea + perf cost.

#### glincker/glinui ⛔

- **Technique:** 5 glass elevation levels + `useLiquidGlass` SVG hook; 77 components.
- **Problem:** Entire product skin as glass/liquid; `Data Table`, `Glass Navbar`, `Glass Card` — direct conflict with SynqDrive L0–L4.
- **Verdict:** Study token naming only; never install.

#### Aave article ✓ Canonical technique reference

- **Core insight:** Displacement bends **the element’s own pixels**, not live backdrop (differs from pure `backdrop-filter`).
- **Cross-browser cost:** Filter ID rotation (Safari), quarter-map symmetry, footprint limits, WebGL for `<video>`.
- **SynqDrive takeaway:** True liquid is **engineering-heavy**. CSS HUD already delivers 80% of the perceived quality at 5% of the cost.

### 3.3 What is usable for L3 Map HUD?

| Idea | Verdict | Notes |
|------|---------|-------|
| Inset edge highlight + top shine gradient | ✅ Already in `sq-map-liquid-*` | Keep tuning tokens only |
| `saturate(185–190%)` + `contrast(1.03–1.04)` | ✅ Keep | Separates L3 from L2 `saturate(140%)` |
| Pill/badge compact footprints | ✅ Keep | Map controls, callouts, trip overlays |
| Chromatic aberration at edges | ⚠️ Optional prototype | Subtle only; can look cheap on data UI |
| SVG `feDisplacementMap` lens | ⚠️ Later prototype | One HUD element max; measure iOS |
| WebGPU / liquid-dom | ❌ No | Wrong stack for SaaS fleet app |
| Liquid on switches/sliders/toggle groups | ❌ No | Aave pattern — product chrome, not map |
| Full-width liquid bars | ❌ No | Exception: compact map footer strip only |
| Displacement on tables/KPIs | ❌ No | Demo-ware |

### 3.4 Demo-only / too risky

- WebGPU liquid-dom showcase
- `feTurbulence` wavy glass on large surfaces
- Glass navbars / glass data tables from any library
- Chromatic aberration on text-heavy panels
- Multiple stacked displacement filters per viewport
- Copying Aave switch/slider lens for settings UI

---

## 4. Glassmorphism / Frosted Glass Source Analysis (L2)

### 4.1 Evaluation matrix

| Source | Real frosted? | CSS-only | Tailwind | shadcn/Radix | Readable text | Reduced-transparency | SynqDrive fit |
|--------|---------------|----------|----------|--------------|---------------|----------------------|---------------|
| [Josh Comeau — backdrop-filter](https://www.joshwcomeau.com/css/backdrop-filter/) | ✅ Yes | ✅ | N/A | Compatible | ✅ Emphasizes opacity | ✅ `@supports` + opaque fallback | **Best L2 reference** |
| [ui.glass generator](https://ui.glass/generator/) | ✅ Yes | ✅ | Export CSS | N/A | Depends on params | Manual | Token calibration aid |
| [Yhooi2/shadcn-glass-ui-library](https://github.com/Yhooi2/shadcn-glass-ui-library) | ✅ (59 glass components) | CSS + TW | ✅ TW 4.1 | ✅ shadcn CLI | Varies | Theme-level | **Reject as dep** — scope creep |
| [rahuldotdev/glassmorphism](https://github.com/rahuldotdev/glassmorphism) | ✅ Demo | ✅ | Unknown | No | Demo | No | Inspiration only |
| [LuanEdCosta/react-tailwindcss-glassmorphism](https://github.com/LuanEdCosta/react-tailwindcss-glassmorphism) | ✅ Learning demo | ✅ | ✅ | No | Demo | No | Inspiration only |
| [sanjay-mali/css-glassmorphism-generator](https://github.com/sanjay-mali/css-glassmorphism-generator) | ✅ Generator | ✅ | Export | No | Manual | Manual | Parameter reference |
| [Tailwind discussion #2884](https://github.com/tailwindlabs/tailwindcss/discussions/2884) | ✅ Concept | ✅ | `backdrop-blur-*` utilities | N/A | N/A | N/A | Use tokens, not ad-hoc utilities |
| [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter) | ✅ Spec | ✅ | Compatible | Compatible | Warns backdrop-root traps | N/A | **Required reading** |
| [Can I Use — backdrop-filter](https://caniuse.com/css-backdrop-filter) | ✅ | ✅ | — | — | — | — | ~97% support; `@supports` still required |
| SynqDrive `.sq-glass` | ✅ | ✅ | Via theme | Compatible | Good with current alpha | ✅ In reduce block | **Production L2** |

### 4.2 Relevant parameters (L2)

From generators + Comeau + current `theme.css`:

| Parameter | L2 recommended range | SynqDrive current | Notes |
|-----------|---------------------|-------------------|-------|
| Background alpha | 0.66–0.85 light; 0.72–0.85 dark | 0.66 light / 0.78 dark | Below 0.55 → text fails WCAG on busy bg |
| Blur | 16–28px | 24px light / 28px dark | >32px on mobile = jank; <12px = plastic, not frosted |
| Saturate | 120–150% | 140% | L3 uses 185%+ — keep separation |
| Border alpha | 0.06–0.12 | 0.08 light / 0.08 dark | Hairline; dark needs light border |
| Shadow | Soft outer + inset highlight | `--shadow-md` + inset | Comeau: separate opacity from blur |
| Inner highlight | `inset 0 1px 0` light edge | `--glass-edge-highlight` | **No** `::before` shine stack on L2 |
| Inner catch | `inset 0 -1px 0` dark edge | `--glass-edge-catch` | Grounds the panel |
| Noise/grain | Optional 1–2% | Not used | Skip unless brand asks — adds visual noise |
| Dark mode | Higher bg alpha, lower highlight | Implemented | Dark needs **more** opacity, not more blur |

### 4.3 Josh Comeau techniques applicable to L2

| Technique | Apply to SynqDrive? | Target |
|-----------|---------------------|--------|
| Extended backdrop child (`height: 200%` + mask) | ⚠️ Maybe | Sticky tab bar over scrolling content only |
| `pointer-events: none` on backdrop child | ✅ If extended blur used | Prevent click blocking |
| Top gradient to stop scroll flicker | ⚠️ Maybe | Fixed login hero / sticky chrome |
| Semi-opaque `background` under blur | ✅ Already via `--glass-bg` | Increase if text busy |
| `@supports (backdrop-filter)` fallback | ✅ Add in migration phase | Opaque `--card` when unsupported |
| “Glassy edge” second backdrop element | ❌ No for L2 | That is L3-style depth — wrong level |

### 4.4 shadcn-glass-ui assessment

- **What it is:** 59 glass components (MetricCardGlass, SidebarGlass, DataTable…) — full glass product skin.
- **Verdict:** Useful as **anti-pattern catalog** — shows what SynqDrive must **not** become.
- **Salvageable:** 15-line custom theme idea → SynqDrive already has `THEME_COLOR_CONTRACT.md`.
- **Do not install:** Parallel component system, purple glass aesthetic, conflicts with existing patterns barrel.

### 4.5 SynqDrive L2 target surfaces

| Surface | L2 appropriate? | Notes |
|---------|-----------------|-------|
| Login hero card | ✅ | Single panel, no scroll body |
| Sticky tab bars | ✅ | Small chrome; consider L0 if blur unnecessary |
| DetailDrawer footer | ✅ | Migrate inline `backdrop-blur` → `.sq-glass` |
| Mobile sidebar scrim | ✅ L4 + L2 edge | Scrim = L4; optional frosted edge strip |
| Service Center control bars | ⚠️ | Only if compact fixed chrome — not list rows |
| Operator mobile overlays | ⚠️ | Small floating panels OK; not booking cards |

### 4.6 Mistakes SynqDrive must avoid (L2)

| Mistake | Why bad |
|---------|---------|
| Too transparent (`bg-card/50`) | Text unreadable on fleet photos / maps |
| Too much blur (`blur(40px+)`) | GPU cost; muddy text behind |
| Too little contrast | Muted text on muted glass |
| Glass on glass | `sq-card` + `sq-glass` double stack |
| Glass on scroll bodies | iOS compositor thrash |
| Glass on table/list rows | Scanning friction; accessibility |
| Inline `backdrop-blur-*` without fallback | Bypasses `prefers-reduced-transparency` |
| Using `--map-glass-*` on app chrome | Wrong token family |

---

## 5. Liquid vs Frosted Comparison

| Criterion | Liquid Glass (L3) | Frosted Glass / Glassmorphism (L2) | SynqDrive decision |
|-----------|--------------------|------------------------------------|--------------------|
| **Purpose** | Premium floating HUD over imagery | Translucent readable chrome | Strict separation |
| **Placement** | Map / imagery only, `position: absolute` | Small fixed chrome (login, tabs, footer) | L3 map-only; L2 chrome-only |
| **Background requirement** | Live map tiles / satellite / street imagery | App canvas or subtle UI behind | No L3 without imagery |
| **Blur** | 20–22px + high saturate + contrast | 20–28px + moderate saturate (140%) | Token-driven; no overlap |
| **Border** | `--map-glass-border` + highlight mix | `--glass-border` hairline | Separate tokens |
| **Pseudo-layers** | `::before` shine + `::after` edge catch | Inset box-shadow only | **No pseudo shine on L2** |
| **Refraction / displacement** | Optional future prototype; CSS analog today | **None** | L2 never gets displacement |
| **Performance** | OK if &lt;10 small HUD nodes per viewport | OK if &lt;3 frosted chrome nodes | Count and cap |
| **Accessibility** | Decorative; must solid-fallback | Text must stay readable; solid fallback | `prefers-reduced-transparency` |
| **Reduced transparency** | → `var(--card)`, no blur | → `var(--card)`, no blur | Central block in `theme.css` |
| **Allowed for** | Map controls, pills, callouts, trip overlays | Login, sticky tabs, drawer footer, scrim edge | Per `LIQUID_GLASS_SYSTEM.md` |
| **Forbidden for** | Dashboard, tables, rows, sidebars, settings | Same + KPI grids, health modules, bookings | **L0/L1 for product content** |

**Target statement:**

> **Liquid Glass = L3, map-HUD-only.**  
> **Frosted Glass = L2, small readable app chrome.**  
> **Normal content = L0/L1 solid/elevated.**

---

## 6. Browser & Performance Risks

### 6.1 `backdrop-filter` support

- **Baseline 2024** (MDN): Chrome 76+, Safari 9+/iOS 9+, Firefox 103+, Edge 79+.
- **~97% global** (Can I Use, 2026).
- **Still required:** `@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` with opaque fallback.

### 6.2 Backdrop root traps (MDN)

Elements with `opacity < 1`, `filter`, `transform`, `will-change`, etc. become **backdrop roots** — child `backdrop-filter` only blurs content between parent and child, not the full page. Risk in nested modals/drawers if L2 applied inside transformed parents.

### 6.3 Mobile / iOS

| Risk | L2 | L3 |
|------|----|----|
| GPU compositing cost | Medium on scroll | Low (fixed HUD) |
| `backdrop-filter` during scroll | **Avoid** on scrolling containers | HUD is fixed — OK |
| iOS Safari filter limits | Standard blur OK | SVG displacement footprint limits (Aave) |
| Battery | Multiple blurs = drain | Few pills OK |

### 6.4 SVG displacement (if prototyped)

- Safari: filter output size ceiling; filter ID caching.
- Firefox: may need displacement disable (`rt-liquid-glass` pattern).
- **Never** on scroll surfaces or full viewport.

### 6.5 WebGPU (liquid-dom)

- Not production-viable 2026 for SynqDrive.
- Chrome-only flags for DOM capture.

---

## 7. Accessibility / Reduced Transparency

### Contract (from `LIQUID_GLASS_SYSTEM.md`)

```css
@media (prefers-reduced-transparency: reduce) {
  /* L2 + L3 → background: var(--card); backdrop-filter: none */
}
```

### Current coverage

| Class | Covered? |
|-------|----------|
| `.sq-glass` | ✅ |
| `.sq-map-liquid-*` | ✅ |
| `.sq-map-marker-callout` | ✅ |
| `.sq-map-glass-controls` | ❌ Gap |
| Inline `backdrop-blur-*` in TSX | ❌ Ungoverned |
| `.sq-backdrop` (L4) | ✅ Solid tint |

### Additional a11y rules

1. **L2 text:** Minimum effective contrast 4.5:1 for body; increase `--glass-bg` alpha if failing.
2. **L3 HUD:** Decorative — never sole carrier of critical status (pair with icon/text).
3. **`prefers-reduced-motion`:** Already disables animations; independent from transparency.
4. **Feature query fallback:** When `backdrop-filter` unsupported → opaque `--card` (not invisible).

---

## 8. License Assessment

| Repo | License | Dependency? | Copy code? |
|------|---------|-------------|------------|
| AndrewPrifer/liquid-dom | MIT | ❌ No | ❌ No — WebGPU stack |
| PallavAg/liquid-glass-web-react | MIT | ❌ No (prototype only) | ⚠️ Concept only; do not paste |
| nikdelvin/liquid-glass | MIT | ❌ No | Inspiration only |
| Mael-667/Liquid-Glass-CSS | Check repo LICENSE | ❌ No | ❌ No |
| Rethink-JS/rt-liquid-glass | MIT | ❌ No | Fallback pattern concept |
| creativoma/liquid-glass | MIT | ❌ No | ❌ No |
| glincker/glinui | MIT | ❌ No | ❌ No — parallel design system |
| Yhooi2/shadcn-glass-ui-library | MIT | ❌ No | ❌ No |
| Josh Comeau article | N/A | N/A | ✅ Techniques are general CSS knowledge |
| Aave article | N/A | N/A | ✅ Algorithm concepts, not code copy |

**GPL:** None identified in audited set. **Do not** import GPL displacement shaders.

**Conceptual adoption without copying:**

- Layered inset highlights (already in SynqDrive)
- `@supports` + opaque fallback (Comeau)
- Dual-mode liquid/frosted fallback (rt-liquid-glass, Aave Safari notes)
- Token-separated blur/saturate tiers (glinui idea, implemented differently)

---

## 9. SynqDrive L2 Frosted Recipe

**For:** Login card · sticky tabs · drawer footer · mobile sidebar scrim edge · compact control bars.

### Tokens (align with `theme.css` — tuning guide, not mandate to change)

```css
/* Light */
--glass-bg: rgba(255, 255, 255, 0.66);        /* 0.70–0.78 if text busy */
--glass-border: rgba(17, 24, 39, 0.08);
--glass-blur: 24px;                              /* range 20–24 */
--glass-edge-highlight: rgba(255, 255, 255, 0.75);
--glass-edge-catch: rgba(17, 24, 39, 0.10);

/* Dark */
--glass-bg: rgba(18, 18, 20, 0.78);             /* higher alpha than light */
--glass-border: rgba(255, 255, 255, 0.08);
--glass-blur: 28px;                              /* range 24–28 */
--glass-edge-highlight: rgba(255, 255, 255, 0.08);
--glass-edge-catch: rgba(0, 0, 0, 0.55);
```

### Utility recipe (`.sq-glass`)

```css
.sq-glass {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  border: 1px solid var(--glass-border);
  border-radius: calc(var(--radius) + 4px);
  box-shadow:
    inset 0 1px 0 var(--glass-edge-highlight),
    inset 0 -1px 0 var(--glass-edge-catch),
    var(--shadow-md);
}
```

### Rules

- **No** `::before` shine gradients
- **No** `feDisplacementMap` / turbulence
- **No** `--map-glass-*` tokens
- **No** `contrast()` boost (reserve for L3)
- Saturate: **120–150%** only

### Reduced transparency fallback

```css
@media (prefers-reduced-transparency: reduce) {
  .sq-glass { background: var(--card) !important; backdrop-filter: none !important; }
}
```

### `@supports` fallback (future migration)

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .sq-glass { background: var(--card); }
}
```

---

## 10. SynqDrive L3 Liquid Map HUD Recipe

**For:** Map controls · pills · marker callouts · trip overlays.

### Tokens (current production — refinement band)

```css
/* Light */
--map-glass-bg: rgba(255, 255, 255, 0.58);
--map-glass-bg-strong: rgba(255, 255, 255, 0.76);
--map-glass-border: rgba(17, 24, 39, 0.10);
--map-glass-highlight: rgba(255, 255, 255, 0.82);
--map-glass-shine: rgba(255, 255, 255, 0.42);
--map-glass-blur: 20px;                         /* range 18–22 */
--map-glass-shadow: multi-layer soft graphite;

/* Dark */
--map-glass-bg: rgba(18, 18, 20, 0.62);
--map-glass-bg-strong: rgba(18, 18, 20, 0.78);
--map-glass-highlight: rgba(255, 255, 255, 0.16);
--map-glass-shine: rgba(255, 255, 255, 0.06);
--map-glass-blur: 22px;
```

### CSS stack (production pattern)

```css
/* Base liquid HUD */
backdrop-filter: blur(var(--map-glass-blur)) saturate(185%) contrast(1.03);
box-shadow:
  inset 0 1px 0 var(--map-glass-highlight),
  inset 0 -1px 0 var(--glass-edge-catch),
  var(--map-glass-shadow);

/* ::before — top shine gradient (L3 only) */
linear-gradient(180deg, var(--map-glass-shine), transparent 48%),
radial-gradient(circle at 50% -24%, var(--map-glass-highlight), transparent 38%);

/* ::after — edge catch / refraction hint (L3 only) */
/* subtle border-radius inset ring — see theme.css */
```

### Controls cluster (`.sq-map-glass-controls`)

- Hardcoded `blur(20px) saturate(190%) contrast(1.04)` — consider tokenizing to `--map-glass-blur`
- Radial highlight at 12% 0% — keep subtle
- **Must add** to reduced-transparency block

### Optional SVG displacement (prototype phase only)

- Reference: Aave / `liquid-glass-web-react`
- Scope: **one** pill or callout in map sandbox
- Fallback: current CSS stack
- Do **not** ship WebGPU

### Reduced transparency fallback

Same as L2 → solid `var(--card)`, disable pseudo shine visibility (already suppressed when bg opaque).

---

## 11. L0/L1 Solid / Elevated Recipe

**For:** Cards · KPIs · tables · rows · health · bookings · admin · scroll bodies.

```css
/* L0 .sq-card */
background: var(--card);
border: 1px solid var(--border);
box-shadow:
  inset 0 1px 0 color-mix(in srgb, var(--card) 88%, white 12%),
  var(--shadow-xs);
/* NO backdrop-filter */

/* L1 .sq-card-elevated */
/* Same + hover lift + --shadow-hover */
```

### Rules

- **No transparency** on operational data surfaces (use opaque `--card` even in light mode).
- **No blur.**
- Status gradients (`dashboardKpiVisual`, `sq-tone-*`) = **tinted L0**, not glass.
- Dialog/sheet **content** = L1 solid (`--popover`), not L2/L3.

---

## 12. What Remains Explicitly Forbidden

| Pattern | Level violation |
|---------|-----------------|
| Liquid glass on dashboard KPIs | L3 on L0 surface |
| Frosted glass on table rows | L2 on data scanning surface |
| `sq-map-liquid-*` on sidebar/topbar | L3 without imagery |
| Glass library as product skin | Architecture bypass |
| WebGPU / liquid-dom in production | Unsupported / flag-gated |
| npm install `glinui`, `shadcn-glass-ui`, `liquid-glass-*` | Parallel design system |
| `feTurbulence` wavy glass on UI chrome | Motion sickness + perf |
| GPL shader/code copy | License risk |
| Multiple `backdrop-filter` on scroll container | Mobile jank |
| Marketing “glass KPI” → actual blur | Mislabeling; stay L0 gradient |

---

## 13. Recommendation for Next Implementation Phase

Phased plan (extends `LIQUID_GLASS_SYSTEM.md` migration):

| Phase | Action | Visual change? |
|-------|--------|----------------|
| **A — Docs** | This audit + cross-links | No |
| **B — L2 hardening** | Add `@supports` fallback; migrate inline `backdrop-blur` → `.sq-glass`; fix DetailDrawer footer | Per call site |
| **C — L3 a11y** | Add `.sq-map-glass-controls` to reduced-transparency block; tokenize hardcoded `20px` blur | Minimal |
| **D — L2 polish (optional)** | Josh Comeau extended-backdrop for sticky tab bar only | Subtle |
| **E — L3 prototype (optional)** | Branch: one map pill with SVG displacement + CSS fallback | Isolated experiment |
| **F — Never** | WebGPU, glass UI libraries, glass tables/cards | — |

### Decision summary

| Question | Answer |
|----------|--------|
| External library for standard UI? | **No** |
| External library for liquid? | **No** — CSS HUD + optional internal prototype |
| Frosted glass implementation? | **CSS-only** via `theme.css` + `.sq-glass` |
| WebGPU/WebGL for normal UI? | **No** |
| GPL code? | **Never** |
| Convert product surfaces to glass? | **No** — L0/L1 remain default |

---

## 14. Premium Solid / Elevated Cards (L0 / L1) — Inspiration

> **Not glass. Not liquid.** Opaque SaaS surfaces with depth from gradient, border, inset highlight, and shadow — the default material for SynqDrive product UI.

### 14.1 What “premium solid” means

Premium solid cards achieve quality through **material cues**, not translucency:

| Technique | Purpose | SynqDrive status |
|-----------|---------|------------------|
| Subtle surface gradient (2–4% shift) | Break flat `#card` monotony | Partial — `dashboardKpiVisual`, status tints |
| Inset top highlight | Simulates light from above | ✅ `.sq-card` inset shadow |
| Inset bottom catch | Grounds edge | ✅ `.sq-card` / L2 only on bottom — L1 uses top only |
| Ambient shadow stack | Float on canvas | ✅ `--shadow-xs` → `--shadow-md` |
| Fine hairline border | Crisp silhouette | ✅ `--border` |
| Hover lift (`translateY(-1px)`) | Interactive affordance | ✅ `.sq-card-elevated` |
| Icon bubble (`sq-tone-*`) | Semantic icon housing | ✅ KPI tiles, admin views |
| Header / body / footer split | Scan hierarchy | ✅ `DataCard`, shadcn `Card*` |
| Status tint gradient (opaque) | Operational urgency | ✅ `getKpiCardSurfaceClass()` |

**Anti-patterns from external “premium SaaS” demos:**

| Demo pattern | Why reject for SynqDrive |
|--------------|------------------------|
| `backdrop-blur-2xl` bento cards (GoSnippets, Vercel clones) | Glass, not solid — wrong level |
| Dark navy + neon gradient cards | Conflicts with graphite/charcoal dark V2 |
| Heavy `shadow-2xl` colored glow | Too marketing; fleet ops need calm |
| Rainbow status card backgrounds | Use semantic `--status-*-soft` only |
| 3D perspective / glossy folds (tokyn) | Marketing-only; not data UI |

---

## 15. External SaaS Card Inspiration Analysis

### 15.1 Source evaluation

| Source | Type | Premium solid? | SynqDrive takeaway |
|--------|------|----------------|-------------------|
| [shadcn/ui Card](https://ui.shadcn.com/docs/components/card) | Component pattern | ✅ Opaque `bg-card`, `ring-1`, `--card-spacing` | **Align** — Header/Content/Footer composition; tokenized spacing |
| [tokyn elevation.md](https://github.com/jshmllr/tokyn/blob/main/patterns/elevation.md) | Design patterns | ✅ Inset highlight + layered shadows | **Adopt concepts** — elevation scale maps to `--shadow-*` |
| [tokyn surface-detailing.md](https://github.com/jshmllr/tokyn/blob/main/docs/02-surface-detailing.md) | Dark UI detailing | ✅ Inner highlight on dark cards | **Adopt for dark L1** — `inset 0 0 0 1px rgba(255,255,255,0.05)` optional |
| [rvanbaalen SaaS gist](https://gist.github.com/rvanbaalen/4ec7551c7793c44b2630625922c67190) | Data-dense dashboard | ✅ Minimal shadow, border-first | **Align** — density + typography hierarchy |
| [Stratum / Aura framework](https://www.aura.build/design-systems/stratum-system-coordination-framework) | Hardware-inspired | ⚠️ Double-bezel + gradient border shell | **Cherry-pick** — inset highlight only; skip gradient border shell |
| [Linear / Vercel / Framer clones](https://gosnippets.com/tailwind/glassmorphism-bento-grid-saas-dashboard-card) | Marketing glass bento | ❌ Glassmorphism | **Reject** — wrong surface level |
| Stripe Dashboard, Notion, Attio (industry reference) | Production SaaS | ✅ Flat/near-flat cards, strong spacing | **Align** — calm surfaces, status via chips not card glow |

### 15.2 shadcn / Radix / Tailwind patterns

**shadcn Card (SynqDrive `components/ui/card.tsx`):**

- `bg-card` + `border-border` + `shadow-[var(--shadow-xs)]` + `rounded-xl`
- Composable: `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`
- New `--card-spacing` variable for consistent inset

**SynqDrive pattern barrel (`DataCard`, `MetricCard`):**

- Uses `.sq-card` / `.sq-card-elevated` instead of raw shadcn Card
- `DataCard`: header border-b, optional footer border-t, `flush` for tables
- `MetricCard`: label + mono tabular value + optional `StatusDot` + icon

**Recommendation:** Keep pattern barrel as primary API. shadcn Card for simple forms/wizards only. Converge spacing toward `--card-spacing` in a future pass.

### 15.3 Subtle gradients (L1 only)

| Use case | Gradient style | Example in codebase |
|----------|----------------|---------------------|
| Neutral premium | `linear-gradient(180deg, card+2% white, card)` | Proposed `.sq-card-premium` |
| Status KPI (warning/critical) | `color-mix` 2–7% status into opaque base | `getKpiCardSurfaceClass()` |
| Ready / positive KPI | Icon tile tint only; card stays neutral | `getKpiIconTileClass()` |
| Value text emphasis | `bg-clip-text` gradient on numbers | `getKpiValueGradientClass()` |

**Rules:**

- Gradient opacity on card **body** ≤ 7% status mix — must stay readable.
- Never gradient + `backdrop-filter` on same node.
- Dark mode: prefer **lighter top edge** via inset highlight, not bright gradient fills.

### 15.4 Border, inset highlight, shadow stacks

**Current `.sq-card` (baseline → premium foundation):**

```css
background: var(--card);
border: 1px solid var(--border);
box-shadow:
  inset 0 1px 0 color-mix(in srgb, var(--card) 88%, white 12%),
  var(--shadow-xs);
```

**Premium solid enhancement (proposed `.sq-card-premium`):**

```css
background:
  linear-gradient(
    180deg,
    color-mix(in srgb, var(--card) 96%, white 4%) 0%,
    var(--card) 100%
  );
border: 1px solid var(--border);
box-shadow:
  inset 0 1px 0 color-mix(in srgb, var(--card) 82%, white 18%),
  inset 0 -1px 0 color-mix(in srgb, var(--card) 94%, black 6%),
  var(--shadow-sm);
```

**Dark mode adjustment:**

```css
.dark .sq-card-premium {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--card) 92%, white 8%) 0%,
      var(--card) 100%
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
    var(--shadow-sm);
}
```

### 15.5 Hover / pressed states

| State | L1 premium static | L1 elevated (interactive) |
|-------|-------------------|----------------------------|
| Default | `--shadow-sm` | `--shadow-sm` |
| Hover | — | `translateY(-1px)`, `--shadow-hover`, border toward foreground |
| Active / pressed | — | `translateY(0)`, `--shadow-xs`, `border-color` hold |
| Focus | `outline` via `--ring` on focusable child | Same |

Use `.sq-press` / `.sq-3d-btn` for **buttons inside** cards — not on the card root unless the whole card is clickable (`sq-card-elevated`).

### 15.6 Icon bubble patterns

| Pattern | Class / helper | Use |
|---------|----------------|-----|
| Semantic soft tile | `sq-tone-success`, `sq-tone-critical`, … | Admin entity icons |
| KPI icon tile | `getKpiIconTileClass(slice)` | Dashboard operational KPIs |
| Muted icon in header | `text-muted-foreground/80` on `MetricCard` | Non-status metrics |

**Rules:**

- Icon bubble = **opaque** `color-mix(status 10%, transparent)` or `sq-tone-*` — not glass.
- Size: 28–36px for KPI; 32px standard admin tiles.
- Do not stack icon bubble + full-card status gradient unless card is in warning/critical state.

### 15.7 Section header patterns

| Pattern | Component | Surface |
|---------|-----------|---------|
| Page-level | `PageHeader` | No card — title on canvas |
| Section within page | `SectionHeader` (patterns) | No card — divider or spacing |
| Card-internal | `DataCard` title row | `border-b border-border/70` |
| shadcn | `CardHeader` + `CardAction` | Inside card inset |

**Rule:** Section headers sit **on canvas or inside L0/L1 card** — never on L2 frosted strip for data sections.

### 15.8 Light / dark mode & data-heavy readability

| Concern | Light | Dark |
|---------|-------|------|
| Card base | Near-solid white `#fff` at 86% in token — **prefer opaque for L1 premium** | Solid `#121214` |
| Border visibility | `rgba(17,24,39,0.075)` | `rgba(255,255,255,0.075)` |
| Muted text | `#7C8490` on card — verify 4.5:1 | `#8F98A6` |
| Status tint on card | Max 7% status mix | Max 10% status mix |
| Shadow strength | Soft graphite | Stronger black shadows |

**Data-heavy surfaces (tables in cards):**

- Use L0 `DataCard flush` — no gradient on card body.
- Row hover: `bg-muted/50` or `sq-table-row` — not glass.
- Keep numeric columns `tabular-nums`.

---

## 16. SynqDrive L1 Premium Solid Recipe

**Contract name:** `surface-premium` (future `.sq-card-premium`)

### Properties

| Property | Value |
|----------|-------|
| `backdrop-filter` | **none** |
| Transparency | **none** on surface (opaque `--card`) |
| Liquid effects | **forbidden** |
| Surface gradient | Subtle 180deg, ≤ 4% lightness shift |
| Border | `1px solid var(--border)` |
| Inset top highlight | `inset 0 1px 0` color-mix toward white (light) / `rgba(255,255,255,0.06)` (dark) |
| Inset bottom catch | Optional subtle `inset 0 -1px 0` (premium only — not on bare L0) |
| Ambient shadow | `var(--shadow-sm)` default; `var(--shadow-md)` for featured KPI grid |
| Hover lift | Only with `.sq-card-elevated` / `interactive` |
| Icon bubble | Optional — `sq-tone-*` or domain helper |
| Structure | Header (`border-b`) · body (`p-4`) · footer (`border-t`) |

### Proposed CSS (documentation — not yet in `theme.css`)

```css
.sq-card-premium {
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--card) 96%, white 4%) 0%,
      var(--card) 100%
    );
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--card) 82%, white 18%),
    inset 0 -1px 0 color-mix(in srgb, var(--card) 96%, black 4%),
    var(--shadow-sm);
}

.sq-card-premium.sq-card-elevated:hover,
.sq-card-elevated.sq-card-premium:hover {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--card) 85%, white 15%),
    inset 0 -1px 0 color-mix(in srgb, var(--card) 96%, black 4%),
    var(--shadow-hover);
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--border) 72%, var(--foreground) 28%);
}
```

### Status variant (opaque — from `dashboardKpiVisual`)

```css
/* Warning example — stays opaque */
.sq-card-premium--warning {
  border-color: color-mix(in srgb, var(--status-warning) 30%, var(--border));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--status-warning) 7%, var(--card)),
    color-mix(in srgb, var(--status-warning) 2%, var(--card))
  );
}
```

### Domain-specific compact tiles

`booking-kpi-tile`, `fleet-health-kpi-tile` = **L1 premium compact** — dense padding, no shadow stack, border-only depth. Do not add blur.

---

## 17. Surface Level Decision Matrix (Complete)

| Surface / context | Level | Class / pattern |
|-------------------|-------|-----------------|
| Table outer wrapper, flush data panel | **L0** | `.sq-card` + `DataCard flush` |
| Settings form section, admin read-only box | **L0** | `.sq-card` or plain `bg-card` |
| Dashboard KPI card | **L1 premium** | `MetricCard` / `dashboardKpiVisual` |
| Customer / vehicle summary card | **L1 premium** | `DataCard` / domain card |
| Health module summary box | **L1 premium** | `DataCard` + status chips |
| Booking operative KPI strip | **L1 premium compact** | `.booking-kpi-tile` |
| Clickable fleet command row (card mode) | **L1 elevated** | `.sq-card-elevated` |
| Dialog / drawer content | **L1 elevated** | `.sq-overlay`, `bg-popover` |
| Login hero panel | **L2 frosted** | `.sq-glass` |
| Sticky tab bar over content | **L2 frosted** or **L0** | `.sq-glass` if blur justified |
| Detail drawer footer chrome | **L2 frosted** | `.sq-glass` (migrate from inline blur) |
| Mobile sidebar scrim | **L4** + optional L2 edge | `.sq-backdrop` |
| Map control cluster | **L3 liquid** | `.sq-map-glass-controls` |
| Map metric pill / callout | **L3 liquid** | `.sq-map-liquid-*` |

### When L0 is enough

- Container exists only to group content — no promotional emphasis.
- Inner content is a **table, list, or form** where card chrome adds noise.
- Nested inside another L1 card (avoid card-in-card stacking).
- High-frequency refresh surfaces (live logs) — minimize paint cost.
- Dense admin grids with 6+ cards visible.

### When L1 premium is used

- Card carries **semantic weight** — KPI, health score, booking status.
- Card is a **primary navigation target** (vehicle/customer identity).
- Card needs **icon bubble + header hierarchy**.
- Operational status tint helps scanning (warning/critical) — opaque gradient only.
- Featured dashboard or fleet command summary.

### When L2 frosted is allowed

- **Small** chrome with **no heavy text body** (login hero, footer bar).
- Translucency serves **context** (see page behind sticky tab).
- Never for KPI grids, table rows, or health module bodies.

### When L3 liquid is allowed

- **Map or imagery** underneath.
- **Small absolute HUD** footprint.
- Never for product content cards.

---

## 18. Premium Solid — Next Implementation Phase

| Phase | Action | Notes |
|-------|--------|-------|
| **1 — Docs** | L1 premium defined in this audit + `LIQUID_GLASS_SYSTEM.md` | ✅ |
| **2 — CSS system** | Canonical `.surface-*`, `.sq-card-premium`, fallbacks in `theme.css` | ✅ V4.9.275 |
| **4 — L2 frosted cleanup** | Sticky chrome, control bars, drawer footers → `.surface-frosted`; backdrops → `.overlay-scrim` | ✅ V4.9.277 |
| **4 — KPI consolidation** | Align `booking-kpi-tile` inset with premium tokens | Optional |
| **5 — Never** | Blur/transparency on L1; glass libraries for cards | — |

---

## References

### Liquid Glass (L3)

- https://github.com/AndrewPrifer/liquid-dom
- https://github.com/PallavAg/liquid-glass-web-react
- https://github.com/nikdelvin/liquid-glass
- https://github.com/Mael-667/Liquid-Glass-CSS
- https://github.com/Rethink-JS/rt-liquid-glass
- https://github.com/glincker/glinui
- https://github.com/creativoma/liquid-glass
- https://aave.com/design/building-glass-for-the-web

### Frosted Glass / Glassmorphism (L2)

- https://www.joshwcomeau.com/css/backdrop-filter/
- https://ui.glass/generator/
- https://github.com/Yhooi2/shadcn-glass-ui-library
- https://github.com/rahuldotdev/glassmorphism
- https://github.com/LuanEdCosta/react-tailwindcss-glassmorphism
- https://github.com/sanjay-mali/css-glassmorphism-generator
- https://github.com/tailwindlabs/tailwindcss/discussions/2884
- https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter
- https://developer.mozilla.org/en-US/docs/Web/CSS/filter
- https://caniuse.com/css-backdrop-filter

### Premium Solid (L0 / L1)

- `frontend/src/components/patterns/data-card.tsx` — `DataCard`, `MetricCard`
- `frontend/src/rental/components/dashboard/dashboardKpiVisual.ts` — status gradients
- `frontend/src/components/ui/card.tsx` — shadcn Card composition
- https://ui.shadcn.com/docs/components/card
- https://github.com/jshmllr/tokyn/blob/main/patterns/elevation.md
- https://github.com/jshmllr/tokyn/blob/main/docs/02-surface-detailing.md

### Internal

- `frontend/src/styles/LIQUID_GLASS_SYSTEM.md`
- `frontend/src/styles/THEME_COLOR_CONTRACT.md`
- `frontend/src/styles/theme.css`

---

*V4.9.277 — L2 frosted glass cleanup (chrome + backdrops).*

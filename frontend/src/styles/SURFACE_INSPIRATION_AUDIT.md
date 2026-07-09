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

### Internal

- `frontend/src/styles/LIQUID_GLASS_SYSTEM.md`
- `frontend/src/styles/THEME_COLOR_CONTRACT.md`
- `frontend/src/styles/theme.css`

---

*V4.9.273 — inspiration & technique audit (research only, no implementation).*

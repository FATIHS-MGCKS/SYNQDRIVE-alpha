# SynqDrive Theme Color Contract

> **Scope:** Central design tokens in `frontend/src/styles/theme.css`  
> **Surface levels (L0–L4):** `frontend/src/styles/LIQUID_GLASS_SYSTEM.md`  
> **Inspiration & technique audit:** `frontend/src/styles/SURFACE_INSPIRATION_AUDIT.md`  
> **Tailwind bridge:** `@theme inline` block in the same file (Tailwind v4 — no separate `tailwind.config.*`)  
> **Entry point:** `frontend/src/styles/index.css` → `fonts.css` → `tailwind.css` → `theme.css`

---

## Design intent

| Mode | Direction | Principles |
|------|-----------|------------|
| **Light** | Premium Soft Glass / Cool Offwhite | Cool canvas (`#F2F3F5`), translucent glass cards, silvery surfaces, soft brand blue `#4F86E8`, graphite foreground `#111827` |
| **Dark** | Premium Graphite / Charcoal | Near-black canvas (`#0B0B0D`), neutral dark cards (`#121214`), no navy/blue base surfaces, sparse high-quality accents (light gray brand, not blue canvas) |

**Rules**

1. **Brand Blue** (`#4F86E8`) is used softly in Light Mode — CTAs, focus rings, nav rail — not as large canvas fills. Info status uses neutral blue-gray (`#5B6B7F`).
2. **Dark Mode** must not use blue/navy canvas or card bases; brand shifts to neutral light gray (`#E5E7EB`) for primary CTAs.
3. **Status colors** stay semantic (`--status-positive`, `--status-warning`, etc.) — never decorative rainbow UI.
4. **No large hardcoded Tailwind `blue-*` / `slate-*` surfaces** in feature code; prefer `bg-card`, `bg-muted`, `text-foreground`, `sq-tone-*`, `sq-chip-*`.
5. **Token names are stable** — do not rename `--brand`, `--background`, shadcn aliases, or `@theme` mappings without a migration pass.

---

## Light theme tokens (`:root`) — V4.9.192

### Core shadcn semantic palette

| Token | Value | Role |
|-------|-------|------|
| `--background` | `#F2F3F5` | Cool off-white canvas |
| `--foreground` | `#111827` | Graphite text |
| `--card` | `rgba(255, 255, 255, 0.86)` | Translucent glass card |
| `--card-foreground` | `#111827` | Card text |
| `--popover` | `rgba(255, 255, 255, 0.92)` | Dropdowns, menus |
| `--popover-foreground` | `#111827` | Popover text |
| `--primary` | `#111827` | Default primary (dark ink) |
| `--primary-foreground` | `#ffffff` | On primary |
| `--secondary` | `#EAEDF1` | Secondary fill (soft grey) |
| `--secondary-foreground` | `#111827` | On secondary |
| `--muted` | `#EAEDF1` | Inset / subtle backgrounds |
| `--muted-foreground` | `#7C8490` | Muted text |
| `--accent` | `#EEF3FA` | Soft blue-grey hover surface |
| `--accent-foreground` | `#111827` | On accent |
| `--destructive` | `#EF4444` | Destructive actions |
| `--destructive-foreground` | `#ffffff` | On destructive |
| `--border` | `rgba(17, 24, 39, 0.075)` | Subtle hairline |
| `--input` | `rgba(17, 24, 39, 0.075)` | Input border |
| `--input-background` | `rgba(255, 255, 255, 0.72)` | Translucent input fill |
| `--switch-background` | `#CBD5E1` | Switch track |
| `--ring` | `rgba(79, 134, 232, 0.28)` | Focus ring (soft brand blue) |

### Brand

| Token | Value | Role |
|-------|-------|------|
| `--brand` | `#4F86E8` | Soft premium blue |
| `--brand-hover` | `#3F76D8` | Hover |
| `--brand-active` | `#3266C4` | Active / pressed |
| `--brand-soft` | `rgba(79, 134, 232, 0.12)` | Soft tint surface |
| `--brand-glow` | `rgba(79, 134, 232, 0.18)` | Glow / pulse |
| `--brand-foreground` | `#FFFFFF` | Text on brand buttons |
| `--brand-ink` | `#3266C4` | Deeper ink for chips, active tabs |

Legacy aliases (keep): `--accent-indigo`, `--accent-indigo-soft`, `--accent-indigo-glow` → point to brand tokens.

### Status (semantic — both themes share names, values differ in `.dark`)

| Token | Light value |
|-------|-------------|
| `--status-positive` | `#16A34A` |
| `--status-positive-soft` | `rgba(22, 163, 74, 0.10)` |
| `--status-attention` / `--status-watch` | `#D97706` |
| `--status-attention-soft` / `--status-watch-soft` | `rgba(217, 119, 6, 0.11)` |
| `--status-warning` | `#EA580C` |
| `--status-warning-soft` | `rgba(234, 88, 12, 0.10)` |
| `--status-critical` | `#DC2626` |
| `--status-critical-soft` | `rgba(220, 38, 38, 0.10)` |
| `--status-info` | `#5B6B7F` (neutral blue-gray) |
| `--status-info-soft` | `rgba(91, 107, 127, 0.11)` |
| `--status-nodata` | `#7C8490` |
| `--status-nodata-soft` | `rgba(124, 132, 144, 0.09)` |
| `--status-ai` | `#7C3AED` |
| `--status-ai-soft` | `rgba(124, 58, 237, 0.09)` |

### Glass (light) — L2 `surface-frosted` tokens

| Token | Value |
|-------|-------|
| `--glass-bg` | `rgba(255, 255, 255, 0.66)` |
| `--glass-border` | `rgba(17, 24, 39, 0.08)` |
| `--glass-blur` | `24px` |
| `--glass-edge-highlight` | `rgba(255, 255, 255, 0.75)` |
| `--glass-edge-catch` | `rgba(17, 24, 39, 0.10)` |

### Map glass (light) — L3 `surface-liquid` tokens

| Token | Value |
|-------|-------|
| `--map-glass-bg` | `rgba(255, 255, 255, 0.58)` |
| `--map-glass-bg-strong` | `rgba(255, 255, 255, 0.76)` |
| `--map-glass-border` | `rgba(17, 24, 39, 0.10)` |
| `--map-glass-highlight` | `rgba(255, 255, 255, 0.82)` |
| `--map-glass-shine` | `rgba(255, 255, 255, 0.42)` |
| `--map-glass-shadow` | soft graphite multi-layer shadow |
| `--map-glass-blur` | `20px` |

### Body ambient (light)

```css
body {
  background-image:
    radial-gradient(at 78% 6%,  rgba(255, 255, 255, 0.55), transparent 58%),
    radial-gradient(at 14% 94%, rgba(79, 134, 232, 0.016), transparent 64%),
    radial-gradient(at 50% 48%, rgba(234, 237, 241, 0.35), transparent 72%);
}
```

Whisper-soft offwhite lift with a barely perceptible blue hint — no strong SaaS-blue glow.

### Sidebar (light)

| Token | Value |
|-------|-------|
| `--sidebar` | `rgba(255, 255, 255, 0.92)` |
| `--sidebar-foreground` | `#111827` |
| `--sidebar-primary` | `var(--brand)` |
| `--sidebar-primary-foreground` | `#ffffff` |
| `--sidebar-accent` | `#EEF3FA` |
| `--sidebar-accent-foreground` | `#111827` |
| `--sidebar-border` | `rgba(17, 24, 39, 0.075)` |
| `--sidebar-ring` | `rgba(79, 134, 232, 0.22)` |

### Elevation (light)

Shadows use soft graphite `rgba(17, 24, 39, …)` — cards float on cool off-white without blue-tinted hover glow.

---

## Dark theme tokens (`.dark`)

### Core shadcn semantic palette

| Token | Value | Role |
|-------|-------|------|
| `--background` | `#0B0B0D` | Near-black charcoal canvas |
| `--foreground` | `#F3F4F6` | Primary text |
| `--card` | `#121214` | Neutral dark card |
| `--card-foreground` | `#F3F4F6` | Card text |
| `--popover` | `#161719` | Elevated overlay surface |
| `--popover-foreground` | `#F3F4F6` | Popover text |
| `--primary` | `#F3F4F6` | Primary = light ink |
| `--primary-foreground` | `#0B0B0D` | On primary |
| `--secondary` | `#181A1D` | Secondary graphite |
| `--secondary-foreground` | `#E5E7EB` | On secondary |
| `--muted` | `#181A1D` | Muted fill |
| `--muted-foreground` | `#8F98A6` | Muted text |
| `--accent` | `#1E2024` | Hover surface |
| `--accent-foreground` | `#F3F4F6` | On accent |
| `--destructive` | `#F87171` | Destructive |
| `--destructive-foreground` | `#ffffff` | On destructive |
| `--border` | `rgba(255, 255, 255, 0.075)` | Neutral hairline |
| `--input` | `rgba(255, 255, 255, 0.06)` | Input border |
| `--input-background` | `rgba(255, 255, 255, 0.055)` | Charcoal input fill |
| `--ring` | `rgba(255, 255, 255, 0.16)` | Neutral focus ring |

> **Note:** Dark mode intentionally avoids `#0B1220`, `#111A2E`, `#141E36` navy bases from earlier iterations.

### Brand (dark — neutral accent, not blue canvas)

| Token | Value | Role |
|-------|-------|------|
| `--brand` | `#E5E7EB` | Light gray primary CTA |
| `--brand-hover` | `#FFFFFF` | Hover |
| `--brand-active` | `#C9CDD3` | Active |
| `--brand-soft` | `rgba(255, 255, 255, 0.08)` | Soft highlight |
| `--brand-glow` | `rgba(255, 255, 255, 0.12)` | Glow |
| `--brand-foreground` | `#09090B` | Text on light CTA |
| `--brand-ink` | `#D1D5DB` | Nav / tab active ink |

### Status (dark — brighter variants for contrast)

| Token | Dark value |
|-------|------------|
| `--status-positive` | `#37D67A` |
| `--status-positive-soft` | `rgba(55, 214, 122, 0.14)` |
| `--status-attention` / `--status-watch` | `#D6A13D` |
| `--status-warning` | `#F08A3E` |
| `--status-critical` | `#FF5F66` |
| `--status-info` | `#9CA8B8` (neutral slate, not blue) |
| `--status-nodata` | `#737B89` |
| `--status-ai` | `#A78BFA` |

### Glass (dark)

| Token | Value |
|-------|-------|
| `--glass-bg` | `rgba(18, 18, 20, 0.78)` |
| `--glass-border` | `rgba(255, 255, 255, 0.08)` |
| `--glass-blur` | `28px` |
| `--glass-edge-highlight` | `rgba(255, 255, 255, 0.08)` |
| `--glass-edge-catch` | `rgba(0, 0, 0, 0.55)` |

### Map glass (dark)

| Token | Value |
|-------|-------|
| `--map-glass-bg` | `rgba(18, 18, 20, 0.62)` |
| `--map-glass-bg-strong` | `rgba(18, 18, 20, 0.78)` |
| `--map-glass-border` | `rgba(255, 255, 255, 0.12)` |
| `--map-glass-highlight` | `rgba(255, 255, 255, 0.16)` |
| `--map-glass-shine` | `rgba(255, 255, 255, 0.06)` |
| `--map-glass-shadow` | neutral black shadows |
| `--map-glass-blur` | `22px` |

### Body ambient (dark)

```css
.dark body {
  background-image:
    radial-gradient(at 78% 6%,  rgba(255, 255, 255, 0.014), transparent 58%),
    radial-gradient(at 18% 94%, rgba(0, 0, 0, 0.18), transparent 64%),
    radial-gradient(at 50% 48%, rgba(24, 26, 29, 0.22), transparent 72%);
}
```

Neutral graphite vignette only — no blue/navy ambient glow.

### Sidebar (dark)

| Token | Value |
|-------|-------|
| `--sidebar` | `#09090B` |
| `--sidebar-foreground` | `#F3F4F6` |
| `--sidebar-primary` | `var(--brand)` |
| `--sidebar-accent` | `#181A1D` |
| `--sidebar-border` | `rgba(255, 255, 255, 0.075)` |
| `--sidebar-ring` | `rgba(255, 255, 255, 0.16)` |

---

## Tailwind / shadcn bridge

Defined in `@theme inline` inside `theme.css`:

| CSS variable | Tailwind utility prefix |
|--------------|-------------------------|
| `--background` | `bg-background`, `text-background` |
| `--foreground` | `text-foreground` |
| `--card` | `bg-card`, `text-card-foreground` |
| `--primary` | `bg-primary`, `text-primary-foreground` |
| `--muted` | `bg-muted`, `text-muted-foreground` |
| `--accent` | `bg-accent`, `text-accent-foreground` |
| `--border` | `border-border` |
| `--ring` | `ring-ring` |
| `--brand` | `bg-brand`, `text-brand` |
| `--status-*` | `bg-status-warning`, `text-status-positive`, etc. |
| `--sidebar-*` | `bg-sidebar`, `text-sidebar-foreground`, … |

**shadcn/ui** components under `frontend/src/components/ui/**` consume these utilities (`bg-card`, `text-muted-foreground`, `ring-ring`). Buttons delegate to `.sq-3d-btn` surface classes defined in `theme.css`. **V4.9.195**: Card uses `border-border` + `--shadow-xs`; Badge default/neutral → `secondary`/`muted` (not `bg-primary`); Tabs list glass container + neutral active; Input/Textarea unified on `bg-input-background` + `border-border`; Dialog uses `sq-backdrop` + `sq-overlay` + `bg-popover`.

**Patterns** (`frontend/src/components/patterns/**`) use tokens exclusively — no hardcoded `bg-blue-*` / `bg-slate-*` found. `DataCard` → `.sq-card`/`.sq-card-elevated`; `AppDialog` → `sq-backdrop` + `sq-overlay`; `DetailDrawer` → `bg-card` + token borders.

---

## Surface system (L0–L4)

Full contract: **`LIQUID_GLASS_SYSTEM.md`**

| Level | Name | Canonical classes | Blur |
|-------|------|-------------------|------|
| L0 | `surface-solid` | `.surface-solid`, `.sq-card` | None |
| L1 | `surface-premium` | `.surface-premium`, `.sq-card-premium` | None |
| L1 | `surface-elevated` | `.surface-elevated`, `.sq-card-elevated`, `.sq-overlay` | None |
| L2 | `surface-frosted` | `.surface-frosted`, `.sq-glass` | `--glass-blur` (20–28px) |
| L3 | `surface-liquid` | `.surface-liquid`, `.sq-map-liquid-*`, `.sq-map-glass-controls` | `--map-glass-blur` |
| L4 | `overlay-scrim` | `.overlay-scrim`, `.sq-backdrop` | 6px scrim only |

**Deprecated (do not use in new code):** `.glass-card`, `.glass-panel`, `sq-card`+`sq-glass` stacks, inline `backdrop-blur-*` in TSX.

---

### Premium solid (L1) — V4.9.275

| Token | Light | Dark |
|-------|-------|------|
| `--surface-premium-bg-start` | `color-mix(card 96%, white 4%)` | `color-mix(card 92%, white 8%)` |
| `--surface-premium-bg-end` | `var(--card)` | `var(--card)` |
| `--surface-premium-border` | `var(--border)` | `var(--border)` |
| `--surface-premium-highlight` | `color-mix(card 82%, white 18%)` | `rgba(255,255,255,0.06)` |
| `--surface-premium-catch` | `color-mix(card 96%, black 4%)` | `rgba(0,0,0,0.35)` |
| `--surface-premium-shadow` | `var(--shadow-sm)` | `var(--shadow-sm)` |

---

## Surface utilities (same file)

| Class | Level | Purpose |
|-------|-------|---------|
| `.surface-solid`, `.sq-card` | L0 | Opaque baseline card |
| `.surface-premium`, `.sq-card-premium` | L1 | Premium solid (opt-in) |
| `.surface-elevated` | L1 | Premium interactive (hover/active) |
| `.sq-card-elevated` | L1 | Legacy solid interactive |
| `.surface-frosted`, `.sq-glass` | L2 | Frosted glass (`--glass-*`) |
| `.surface-liquid` | L3 | Liquid HUD base (`--map-glass-*`) |
| `.sq-map-liquid-*`, `.sq-map-glass-controls`, `.sq-map-marker-callout` | L3 | Map HUD variants |
| `.sq-overlay` | L1 | Solid popover — **not** glass |
| `.overlay-scrim`, `.sq-backdrop` | L4 | Modal/sheet scrim |
| `.glass-card`, `.glass-panel` | L2 (deprecated) | Alias of frosted — do not use |
| `.sq-tab-bar` | L0 | Segmented control (solid track + active tab) |
| `.sq-3d-btn--*` | — | Tactile buttons (orthogonal to surface levels) |
| `.sq-chip-*`, `.sq-tone-*`, `.sq-dot-*` | — | Status semantics |
| `.sq-nav-rail` | — | Navigation accent rail |

Dark overrides live under `.dark .sq-*` (Dark Theme V2 section).

Reduced transparency + `@supports` fallbacks: all L2/L3/L4 classes in `theme.css` (V4.9.275).

---

## Audit notes (2026-07-05)

### Already aligned

- Dark canvas/cards are charcoal, not navy.
- Light canvas is cool off-white with glass tokens and soft blue brand.
- Central token layer is single source of truth; `@theme` bridge is complete.

### Light theme — acceptable blue/slate usage

- Foreground `#0F172A` (navy ink) — correct for enterprise readability.
- `--accent`, `--brand-soft`, `--sidebar-accent` blue tints — intentional soft glass.
- Body radial brand glow — subtle, on-brief.
- Shadow navy hue — supports floating card aesthetic.

### Recommended central token tweaks (future, optional)

| Token | Current | Suggestion | Rationale |
|-------|---------|------------|-----------|
| `--foreground` (light) | `#0F172A` | Consider `#111827` (warmer graphite-navy) | Slightly less slate-cold; low priority |
| Light body glow opacity | `0.055 / 0.030` | Could reduce to `0.04 / 0.02` | Even softer glass; cosmetic only |

### V4.9.194 Hardcoded color migration (applied)

- Rental + components + lib: slate/blue/indigo UI surfaces → semantic tokens
- Remaining intentional colors: fleet status map markers (purple/green/red), health severity tones, chart semantics

### V4.9.193 Dark Theme V2 (applied)

- Dark palette confirmed/formalized; added missing `--input-background`
- Body ambient: neutral graphite triple-vignette (no blue)
- Legacy navy `#0B1220`/`#111A2E` removed from active tokens (changelog history only)

### V4.9.192 Light Theme V2 (applied)

- Canvas shifted from `#F6F8FB` → `#F2F3F5` (cooler off-white, less blue SaaS canvas)
- Cards/popovers translucent glass (`rgba(255,255,255,0.86/0.92)`)
- Brand softened `#2563EB` → `#4F86E8`; body ambient blue reduced ~70%
- Dark theme unchanged

### Hardcoded color debt (feature code)

~**286 matches** across **42 files** (excluding changelog/architecture docs) for patterns:
`bg-slate-*`, `bg-blue-*`, `text-slate-*`, `text-blue-*`, `border-slate-*`, `from-blue-*`, etc.

Top offenders: `VehicleInsightsCard.tsx` (25), `PartsAccessoriesView.tsx` (19), `HealthErrorsView.tsx` (18), `WorkflowAutomationView.tsx` (17), `InvoicesView.tsx` (15), `FleetConditionDetailView.tsx` (15), `HighMobilityCompatibilityView.tsx` (15).

Legacy navy hex `#0B1220` / `#111A2E` appear only in `ChangesView.tsx` changelog history — not in active CSS tokens.

`frontend/src/components/ui/**` and `frontend/src/components/patterns/**` are clean.

---

## Change policy

When adjusting colors:

1. Edit **only** `:root` / `.dark` blocks in `theme.css` unless migrating a specific hardcoded component.
2. Preserve all token **names**.
3. Update this document and `ChangesView` / `ArchitekturView` when architecture or token semantics change.
4. Run `npm run lint`, `npm run build` in `frontend/`.
5. Do not change layouts, spacing, typography sizes, or business logic in color passes.

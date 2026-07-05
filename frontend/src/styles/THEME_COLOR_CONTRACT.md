# SynqDrive Theme Color Contract

> **Scope:** Central design tokens in `frontend/src/styles/theme.css`  
> **Tailwind bridge:** `@theme inline` block in the same file (Tailwind v4 — no separate `tailwind.config.*`)  
> **Entry point:** `frontend/src/styles/index.css` → `fonts.css` → `tailwind.css` → `theme.css`

---

## Design intent

| Mode | Direction | Principles |
|------|-----------|------------|
| **Light** | Premium Soft Glass / Cool Offwhite | Cool canvas (`#F6F8FB`), white cards, silvery glass surfaces, subtle blue brand tint, navy foreground for SaaS readability |
| **Dark** | Premium Graphite / Charcoal | Near-black canvas (`#0B0B0D`), neutral dark cards (`#121214`), no navy/blue base surfaces, sparse high-quality accents (light gray brand, not blue canvas) |

**Rules**

1. **Brand Blue** (`#2563EB`) is used softly in Light Mode — CTAs, focus rings, nav rail, status-info — not as large canvas fills.
2. **Dark Mode** must not use blue/navy canvas or card bases; brand shifts to neutral light gray (`#E5E7EB`) for primary CTAs.
3. **Status colors** stay semantic (`--status-positive`, `--status-warning`, etc.) — never decorative rainbow UI.
4. **No large hardcoded Tailwind `blue-*` / `slate-*` surfaces** in feature code; prefer `bg-card`, `bg-muted`, `text-foreground`, `sq-tone-*`, `sq-chip-*`.
5. **Token names are stable** — do not rename `--brand`, `--background`, shadcn aliases, or `@theme` mappings without a migration pass.

---

## Light theme tokens (`:root`)

### Core shadcn semantic palette

| Token | Value | Role |
|-------|-------|------|
| `--background` | `#F6F8FB` | Cool off-white canvas |
| `--foreground` | `#0F172A` | Deep navy text (Slate-900 family) |
| `--card` | `#ffffff` | Primary elevated surface |
| `--card-foreground` | `#0F172A` | Card text |
| `--popover` | `#ffffff` | Dropdowns, menus |
| `--popover-foreground` | `#0F172A` | Popover text |
| `--primary` | `#0F172A` | Default primary (dark ink) |
| `--primary-foreground` | `#ffffff` | On primary |
| `--secondary` | `#EEF2F7` | Secondary fill (cool gray) |
| `--secondary-foreground` | `#0F172A` | On secondary |
| `--muted` | `#EEF2F7` | Inset / subtle backgrounds |
| `--muted-foreground` | `#64748B` | Muted text (Slate-500) |
| `--accent` | `#EAF2FF` | Soft blue tint hover surface |
| `--accent-foreground` | `#0F172A` | On accent |
| `--destructive` | `#EF4444` | Destructive actions |
| `--destructive-foreground` | `#ffffff` | On destructive |
| `--border` | `rgba(15, 23, 42, 0.08)` | Blue-tinted hairline |
| `--input` | `transparent` | Input border mode |
| `--input-background` | `#F3F6FA` | Input fill |
| `--switch-background` | `#CBD5E1` | Switch track |
| `--ring` | `rgba(37, 99, 235, 0.22)` | Focus ring (brand blue) |

### Brand

| Token | Value | Role |
|-------|-------|------|
| `--brand` | `#2563EB` | Primary brand blue |
| `--brand-hover` | `#1D4ED8` | Hover |
| `--brand-active` | `#1E40AF` | Active / pressed |
| `--brand-soft` | `#EAF2FF` | Soft tint surface |
| `--brand-glow` | `rgba(37, 99, 235, 0.22)` | Glow / pulse |
| `--brand-foreground` | `#ffffff` | Text on brand buttons |
| `--brand-ink` | `#1E40AF` | Deeper ink for chips, active tabs |

Legacy aliases (keep): `--accent-indigo`, `--accent-indigo-soft`, `--accent-indigo-glow` → point to brand tokens.

### Status (semantic — both themes share names, values differ in `.dark`)

| Token | Light value |
|-------|-------------|
| `--status-positive` | `#16A34A` |
| `--status-positive-soft` | `rgba(34, 197, 94, 0.12)` |
| `--status-attention` / `--status-watch` | `#D97706` |
| `--status-attention-soft` / `--status-watch-soft` | `rgba(245, 158, 11, 0.14)` |
| `--status-warning` | `#EA580C` |
| `--status-warning-soft` | `rgba(234, 88, 12, 0.12)` |
| `--status-critical` | `#DC2626` |
| `--status-critical-soft` | `rgba(239, 68, 68, 0.12)` |
| `--status-info` | `#2563EB` (= brand) |
| `--status-info-soft` | `rgba(37, 99, 235, 0.12)` |
| `--status-nodata` | `#64748B` |
| `--status-nodata-soft` | `rgba(100, 116, 139, 0.10)` |
| `--status-ai` | `#7C3AED` |
| `--status-ai-soft` | `rgba(124, 58, 237, 0.10)` |

### Glass (light)

| Token | Value |
|-------|-------|
| `--glass-bg` | `rgba(255, 255, 255, 0.76)` |
| `--glass-border` | `rgba(15, 23, 42, 0.06)` |
| `--glass-blur` | `24px` |
| `--glass-edge-highlight` | `rgba(255, 255, 255, 0.72)` |
| `--glass-edge-catch` | `rgba(15, 23, 42, 0.03)` |

### Map glass (light)

| Token | Value |
|-------|-------|
| `--map-glass-bg` | `rgba(255, 255, 255, 0.42)` |
| `--map-glass-bg-strong` | `rgba(255, 255, 255, 0.58)` |
| `--map-glass-border` | `rgba(255, 255, 255, 0.62)` |
| `--map-glass-highlight` | `rgba(255, 255, 255, 0.88)` |
| `--map-glass-shine` | `rgba(255, 255, 255, 0.34)` |
| `--map-glass-shadow` | navy-tinted multi-layer shadow |
| `--map-glass-blur` | `20px` |

### Body ambient (light)

```css
body {
  background-image:
    radial-gradient(at 82% 4%,  rgba(37, 99, 235, 0.055), transparent 55%),
    radial-gradient(at 16% 96%, rgba(37, 99, 235, 0.030), transparent 60%);
}
```

Subtle brand glow on canvas — intentional for Premium Soft Glass direction.

### Sidebar (light)

| Token | Value |
|-------|-------|
| `--sidebar` | `#ffffff` |
| `--sidebar-foreground` | `#0F172A` |
| `--sidebar-primary` | `var(--brand)` |
| `--sidebar-primary-foreground` | `#ffffff` |
| `--sidebar-accent` | `#EAF2FF` |
| `--sidebar-accent-foreground` | `#0F172A` |
| `--sidebar-border` | `rgba(15, 23, 42, 0.06)` |
| `--sidebar-ring` | `rgba(37, 99, 235, 0.18)` |

### Elevation (light)

Shadows use navy hue `rgba(15, 23, 42, …)` and brand-tinted hover `--shadow-hover` — cards float on cool canvas without flat black drops.

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
| `--input-background` | *(inherits / same layer as input)* | — |
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
    radial-gradient(at 82% 4%,  rgba(255, 255, 255, 0.018), transparent 55%),
    radial-gradient(at 16% 96%, rgba(0, 0, 0, 0.22), transparent 62%);
}
```

Neutral charcoal vignette — **no blue ambient glow**.

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

**shadcn/ui** components under `frontend/src/components/ui/**` consume these utilities (`bg-card`, `text-muted-foreground`, `ring-ring`). Buttons delegate to `.sq-3d-btn` surface classes defined in `theme.css`.

**Patterns** (`frontend/src/components/patterns/**`) use tokens exclusively — no hardcoded `bg-blue-*` / `bg-slate-*` found.

---

## Surface utilities (same file)

| Class | Purpose |
|-------|---------|
| `.sq-card`, `.sq-card-elevated` | Solid matte cards |
| `.sq-glass`, `.glass-card`, `.glass-panel` | Frosted glass |
| `.sq-map-liquid-*` | Map HUD overlays |
| `.sq-overlay`, `.sq-backdrop` | Modals / drawers |
| `.sq-chip-*`, `.sq-tone-*`, `.sq-dot-*` | Status semantics |
| `.sq-tab-bar`, `.sq-nav-rail` | Navigation chrome |
| `.sq-3d-btn--*` | Tactile buttons |

Dark overrides live under `.dark .sq-*` (Dark Theme V2 section).

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

**No token changes applied in V4.9.191 audit** — current values match the stated contract.

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

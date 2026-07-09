/**
 * Canonical surface tokens for the rental app.
 * L0 solid · L1 premium/elevated · L2 frosted (chrome only) · L3 map liquid (not here).
 * @see frontend/src/styles/LIQUID_GLASS_SYSTEM.md
 */

export const rs = {
  /** L1 — primary content card / panel shell */
  card: 'surface-premium rounded-2xl overflow-hidden',
  cardMd: 'surface-premium rounded-xl overflow-hidden',
  cardSm: 'surface-premium rounded-lg overflow-hidden',
  cardPadding: 'surface-premium rounded-2xl p-4 sm:p-5 overflow-hidden',

  /** L1 elevated — interactive list rows / clickable cards */
  cardInteractive: 'surface-elevated rounded-xl overflow-hidden cursor-pointer',

  /** L0 — dense tables, flush containers, nested structural shells */
  panel: 'surface-solid rounded-xl overflow-hidden',
  panelLg: 'surface-solid rounded-2xl overflow-hidden',

  /** L2 — sticky chrome only (prefer chrome-tab-bar.ts for tab bars) */
  chrome: 'surface-frosted',

  /** Form controls — not card surfaces */
  input:
    'w-full px-3 py-2 rounded-xl border border-border/60 bg-background text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]',
  inputLg:
    'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-background text-xs text-foreground placeholder:text-muted-foreground transition-all outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]',

  /** Overlays */
  popover: 'bg-popover border border-border rounded-xl shadow-xl',
  popoverMenu: 'bg-popover border border-border rounded-xl shadow-xl py-1',

  /** Chips / filter pills inside cards */
  chip:
    'inline-flex items-center rounded-lg border border-border/60 bg-background/80 text-foreground hover:bg-muted/50 transition-colors',
  chipActive: 'surface-premium border-transparent text-foreground',

  /** Secondary button on card surfaces */
  buttonSecondary:
    'sq-press inline-flex items-center gap-2 rounded-xl border border-border/60 bg-background text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border',
} as const;

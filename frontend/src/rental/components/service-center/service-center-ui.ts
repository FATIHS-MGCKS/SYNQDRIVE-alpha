/** Shared UI tokens for Fleet → Service Center. */
export const sc = {
  shell: 'space-y-4',
  subTabBar:
    'sq-tab-bar flex flex-wrap items-center gap-1 p-1 rounded-xl border border-border/45 bg-muted/20',
  subTabBtn:
    'px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 whitespace-nowrap',
  subTabActive: 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-border/60',
  subTabIdle: 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
  controlBar:
    'sq-card sq-glass rounded-2xl border border-border/45 p-3 sm:p-4 shadow-[var(--shadow-1)] backdrop-blur-sm',
  kpiGrid: 'grid grid-cols-2 sm:grid-cols-4 gap-2',
  kpiTile:
    'rounded-xl border border-border/40 bg-card/70 px-3 py-2.5 text-left transition-all hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
  kpiTileActive: 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_25%,transparent)] bg-[color:var(--brand-soft)]',
  panel: 'sq-card rounded-2xl border border-border/45 bg-card/95 p-4 shadow-[var(--shadow-1)] min-w-0',
  sectionEyebrow: 'text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground',
  sectionTitle: 'text-[13px] font-semibold tracking-[-0.02em] text-foreground',
} as const;

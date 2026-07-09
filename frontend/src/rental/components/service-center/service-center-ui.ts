/** Shared UI tokens for Fleet → Service Center. */
export const sc = {
  shell: 'space-y-4',
  subTabBar:
    'sq-tab-bar flex flex-wrap items-center gap-1 p-1 rounded-xl border border-border/45 bg-muted/20',
  subTabBtn:
    'px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 whitespace-nowrap',
  subTabActive: 'surface-premium text-foreground',
  subTabIdle: 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
  controlBar: 'surface-frosted rounded-2xl p-3 sm:p-4',
  kpiGrid: 'grid grid-cols-2 sm:grid-cols-4 gap-2',
  kpiTile:
    'surface-elevated rounded-xl px-3 py-2.5 text-left transition-all hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
  kpiTileActive: 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_25%,transparent)] bg-[color:var(--brand-soft)]',
  panel: 'surface-premium rounded-2xl p-4 min-w-0 overflow-hidden',
  sectionEyebrow: 'text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground',
  sectionTitle: 'text-[13px] font-semibold tracking-[-0.02em] text-foreground',
} as const;

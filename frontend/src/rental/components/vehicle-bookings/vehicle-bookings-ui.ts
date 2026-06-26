/** Shared layout + surface tokens — Vehicle Bookings operator cockpit. */
export const vb = {
  page: 'flex flex-col gap-6',
  section: 'sq-card sq-glass rounded-2xl overflow-hidden shadow-[var(--shadow-1)]',
  sectionHeader: 'border-b border-border/50 bg-muted/10 px-4 py-4 sm:px-5',
  sectionBody: 'p-4 sm:p-5',
  sectionBodyTight: 'px-4 py-3 sm:px-5',
  title: 'text-[15px] font-semibold tracking-[-0.02em] text-foreground font-display',
  titleSm: 'text-[13px] font-semibold tracking-[-0.015em] text-foreground',
  subtitle: 'text-[12px] text-muted-foreground leading-relaxed',
  meta: 'text-[11px] text-muted-foreground tabular-nums',
  inset: 'rounded-xl border border-border/50 bg-background/35',
  divider: 'border-t border-border/50',
  gridMetrics: 'grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-4',
  gridAvailability: 'grid grid-cols-1 items-stretch gap-3 sm:grid-cols-3',
  focusRing:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  action:
    'sq-press inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/25 transition-[color,background,transform,box-shadow] duration-[var(--dur-fast)]',
  actionPrimary:
    'sq-press inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold sq-tone-brand border border-[color:var(--brand)]/20 transition-[color,background,transform,box-shadow] duration-[var(--dur-fast)]',
  actionSm:
    'sq-press inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/25 transition-[color,background,transform,box-shadow] duration-[var(--dur-fast)]',
  scrollRow: 'flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin',
} as const;

export function vbActionClass(primary?: boolean, sm?: boolean): string {
  const base = primary ? vb.actionPrimary : sm ? vb.actionSm : vb.action;
  return `${base} ${vb.focusRing}`;
}

/** Shared layout + surface tokens — Vehicle Bookings operator cockpit. */
export const vb = {
  page: 'flex flex-col gap-4 sm:gap-5',
  section: 'surface-premium rounded-2xl overflow-hidden',
  sectionHeader: 'border-b border-border/50 bg-muted/10 px-3 py-2 sm:px-3.5',
  sectionBody: 'p-2.5 sm:p-3',
  sectionBodyTight: 'px-3 py-2 sm:px-3.5',
  title: 'text-[12px] font-semibold tracking-[-0.01em] text-foreground',
  titleSm: 'text-[12px] font-semibold tracking-[-0.015em] text-foreground',
  subtitle: 'text-[10.5px] text-muted-foreground leading-snug',
  meta: 'text-[10px] text-muted-foreground tabular-nums',
  inset: 'rounded-xl border border-border/50 bg-background/35',
  divider: 'border-t border-border/50',
  /** Single compact summary grid — cards height follows content (no stretch). */
  gridSummary: 'grid grid-cols-2 items-start gap-1 sm:gap-1.5 lg:grid-cols-4',
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

/** Typography tokens for notification / action-queue cards (no ad-hoc 9.5px / 10.5px). */
export const NOTIFICATION_CARD_TYPO = {
  severityChip: 'px-1.5 py-0.5 text-[10px] font-semibold',
  eyebrow: 'text-[10px] font-semibold text-muted-foreground',
  time: 'text-[11px] leading-snug tabular-nums text-muted-foreground',
  title: 'text-xs font-bold leading-snug tracking-[-0.01em] text-foreground text-pretty line-clamp-2',
  context: 'text-[11px] leading-snug text-muted-foreground line-clamp-1',
  hint: 'text-[11px] leading-snug text-muted-foreground text-pretty line-clamp-2',
  cta: 'text-[11px] font-medium',
  iconWrap: 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
  icon: 'h-3 w-3',
} as const;

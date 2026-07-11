/**
 * Central typography tokens for the Dashboard Notification Panel (V2).
 * Sizes: 11px/16px meta, 12px/17px body, 14px/19–20px titles — no 9.5px / 10.5px.
 */
export const NOTIFICATION_PANEL_TYPO = {
  boxTitle: 'text-sm font-semibold leading-5 tracking-[-0.01em] text-foreground text-balance',
  meta: 'text-[11px] font-medium leading-4 text-muted-foreground',
  metaBadge: 'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4',
  cardTitle: 'text-sm font-semibold leading-[19px] tracking-[-0.01em] text-foreground text-pretty line-clamp-2',
  entity: 'text-xs font-medium leading-[17px] text-muted-foreground line-clamp-1',
  description: 'text-xs font-normal leading-[17px] text-muted-foreground text-pretty line-clamp-3',
  cta: 'text-xs font-medium leading-4',
  tab: 'text-xs font-semibold leading-4',
  tabBadge: 'inline-flex min-w-[1.125rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums leading-4',
  emptyTitle: 'text-sm font-semibold leading-5 text-foreground',
  emptyBody: 'text-xs leading-[17px] text-muted-foreground',
  filterButton: 'text-xs font-medium leading-4',
  iconWrap: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
  icon: 'h-4 w-4',
} as const;

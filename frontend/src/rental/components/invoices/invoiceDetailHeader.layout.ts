export type InvoiceHeaderLayoutMode = 'compact' | 'comfortable' | 'desktop';

/** Breakpoints aligned with mobile-first header (320 / 375 / 390+ / desktop). */
export function resolveInvoiceHeaderLayoutMode(widthPx: number): InvoiceHeaderLayoutMode {
  if (widthPx < 375) return 'compact';
  if (widthPx < 768) return 'comfortable';
  return 'desktop';
}

export function primaryActionsGridClass(mode: InvoiceHeaderLayoutMode): string {
  switch (mode) {
    case 'compact':
      return 'grid grid-cols-2 gap-2 w-full';
    case 'comfortable':
      return 'flex flex-wrap gap-2 w-full';
    default:
      return 'flex flex-wrap items-start justify-end gap-2 shrink-0';
  }
}

export interface InvoiceThemeClasses {
  isDarkMode: boolean;
  tp: string;
  ts: string;
  card: string;
  inputCls: string;
}

export function getInvoiceThemeClasses(isDarkMode: boolean): InvoiceThemeClasses {
  return {
    isDarkMode,
    tp: 'text-foreground',
    ts: 'text-muted-foreground',
    card: ` border surface-solid border-border`,
    inputCls: `w-full px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-muted border-border text-foreground placeholder:text-muted-foreground' : 'bg-background border-border text-foreground placeholder:text-muted-foreground'} outline-none`,
  };
}

export const INVOICE_ACTION_BTN =
  'sq-3d-btn sq-3d-btn--neutral flex items-center gap-1.5 px-3 py-2 text-xs font-semibold';

export const INVOICE_DISABLED_BTN =
  'sq-3d-btn sq-3d-btn--neutral flex items-center gap-1.5 px-3 py-2 text-xs font-semibold opacity-50 cursor-not-allowed';

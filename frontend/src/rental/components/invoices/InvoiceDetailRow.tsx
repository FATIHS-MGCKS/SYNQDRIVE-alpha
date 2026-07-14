import type { ElementType, ReactNode } from 'react';

import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceDetailRowProps extends Pick<InvoiceThemeClasses, 'tp' | 'ts'> {
  label: string;
  value: string | ReactNode;
  icon?: ElementType;
}

export function InvoiceDetailRow({ label, value, icon: RowIcon, tp, ts }: InvoiceDetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      {RowIcon && <RowIcon className={`w-4 h-4 mt-0.5 ${ts} shrink-0`} />}
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] ${ts} uppercase tracking-wider font-semibold`}>{label}</p>
        <div className={`text-xs mt-0.5 ${tp}`}>{value || '—'}</div>
      </div>
    </div>
  );
}

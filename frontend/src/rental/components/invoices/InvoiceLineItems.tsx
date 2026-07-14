import { formatAmount } from './invoiceFormatters';
import type { InvoiceLineItem } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceLineItemsProps extends InvoiceThemeClasses {
  lineItems: InvoiceLineItem[];
}

export function InvoiceLineItems({ lineItems, card, tp, ts, isDarkMode }: InvoiceLineItemsProps) {
  if (lineItems.length === 0) return null;

  return (
    <div className={`${card} p-5`}>
      <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Positionen</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={isDarkMode ? 'bg-muted/50' : 'bg-gray-50/80'}>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Beschreibung</th>
              <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Menge</th>
              <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Einzelpreis (netto)</th>
              <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>MwSt</th>
              <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Gesamt</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
            {lineItems.map((li, i) => {
              const unit = li.unitPriceNetCents ?? li.unitPriceCents ?? 0;
              const gross = li.grossCents ?? li.totalCents ?? unit * (li.quantity || 1);
              return (
                <tr key={i}>
                  <td className={`px-3 py-2 text-xs ${tp}`}>{li.description}</td>
                  <td className={`px-3 py-2 text-xs text-right ${ts}`}>{li.quantity}</td>
                  <td className={`px-3 py-2 text-xs text-right ${ts}`}>{formatAmount(unit)}</td>
                  <td className={`px-3 py-2 text-xs text-right ${ts}`}>
                    {li.taxRate != null ? `${li.taxRate}%` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-xs text-right font-semibold ${tp}`}>{formatAmount(gross)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { formatAmount, formatDate } from './invoiceFormatters';
import type { Invoice, InvoicePayment } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoicePaymentsProps extends InvoiceThemeClasses {
  invoice: Invoice;
  payments: InvoicePayment[];
}

export function InvoicePayments({ invoice, payments, card, tp, ts, isDarkMode }: InvoicePaymentsProps) {
  if (payments.length === 0) return null;

  return (
    <div className={`${card} p-5`}>
      <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Zahlungen</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={isDarkMode ? 'bg-muted/50' : 'bg-gray-50/80'}>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Datum</th>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Methode</th>
              <th className={`text-right px-3 py-2 text-[11px] font-semibold ${ts}`}>Betrag</th>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold ${ts}`}>Referenz</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
            {payments.map((p) => (
              <tr key={p.id}>
                <td className={`px-3 py-2 text-xs ${tp}`}>{formatDate(p.paidAt)}</td>
                <td className={`px-3 py-2 text-xs ${ts}`}>{p.method}</td>
                <td className={`px-3 py-2 text-xs text-right font-semibold ${tp}`}>
                  {formatAmount(p.amountCents, invoice.currency)}
                </td>
                <td className={`px-3 py-2 text-xs ${ts}`}>{p.reference || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

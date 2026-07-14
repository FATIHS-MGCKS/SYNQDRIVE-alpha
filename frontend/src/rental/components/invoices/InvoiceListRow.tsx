import { INVOICE_TYPE_MAP } from './invoiceConstants';
import { STATUS_MAP, displayNumber, formatAmount, formatDate } from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceListRowProps extends Pick<InvoiceThemeClasses, 'isDarkMode' | 'tp' | 'ts'> {
  invoice: Invoice;
  onSelect: (invoice: Invoice) => void;
}

export function InvoiceListRow({ invoice, isDarkMode, tp, ts, onSelect }: InvoiceListRowProps) {
  const st = STATUS_MAP[invoice.status] || STATUS_MAP.DRAFT;
  const ty = INVOICE_TYPE_MAP[invoice.type] || INVOICE_TYPE_MAP.OUTGOING_MANUAL;
  const TypeIcon = ty.icon;

  return (
    <tr
      onClick={() => onSelect(invoice)}
      className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-muted/40' : 'hover:bg-gray-50/60'}`}
    >
      <td className="px-4 py-3 text-xs font-bold text-brand">{displayNumber(invoice)}</td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${ty.color}`}>
          <TypeIcon className="w-3 h-3" /> {ty.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <p className={`text-xs font-semibold ${tp} truncate max-w-[200px]`}>{invoice.title}</p>
        <p className={`text-[10px] ${ts} truncate max-w-[200px]`}>
          {invoice.vendorName || (invoice.customerId ? 'Kunde' : '')}
        </p>
      </td>
      <td className={`px-4 py-3 text-xs font-bold ${tp}`}>
        {formatAmount(invoice.totalCents, invoice.currency)}
      </td>
      <td className={`px-4 py-3 text-[11px] ${ts}`}>{formatDate(invoice.invoiceDate)}</td>
      <td className={`px-4 py-3 text-[11px] ${ts}`}>{formatDate(invoice.dueDate)}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} /> {st.label}
        </span>
      </td>
      <td className="px-4 py-3">
        {invoice.tasks && invoice.tasks.length > 0 ? (
          <span
            className={`text-[10px] font-medium ${invoice.tasks[0].status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}
          >
            {invoice.tasks[0].status === 'DONE' ? 'Erledigt' : 'Offen'}
          </span>
        ) : invoice.status === 'PAID' ? (
          <span className="text-[10px] text-green-500">—</span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

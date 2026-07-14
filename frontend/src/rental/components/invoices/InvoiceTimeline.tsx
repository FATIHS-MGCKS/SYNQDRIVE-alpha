import { Calendar, CheckCircle, Clock, DollarSign, FileText } from 'lucide-react';

import { formatAmount, formatDate } from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import { InvoiceDetailRow } from './InvoiceDetailRow';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceTimelineProps extends InvoiceThemeClasses {
  invoice: Invoice;
  paidCents: number;
  outstanding: number;
}

export function InvoiceTimeline({
  invoice,
  paidCents,
  outstanding,
  card,
  tp,
  ts,
  isDarkMode,
}: InvoiceTimelineProps) {
  return (
    <div className={`${card} p-5`}>
      <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Rechnungsdetails</h3>
      <div className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
        <InvoiceDetailRow
          label="Betrag"
          value={<span className="font-bold text-sm">{formatAmount(invoice.totalCents, invoice.currency)}</span>}
          icon={DollarSign}
          tp={tp}
          ts={ts}
        />
        {invoice.subtotalCents !== invoice.totalCents && (
          <InvoiceDetailRow
            label="Netto"
            value={formatAmount(invoice.subtotalCents, invoice.currency)}
            tp={tp}
            ts={ts}
          />
        )}
        {invoice.taxCents > 0 && (
          <InvoiceDetailRow
            label="MwSt"
            value={formatAmount(invoice.taxCents, invoice.currency)}
            tp={tp}
            ts={ts}
          />
        )}
        {paidCents > 0 && (
          <InvoiceDetailRow
            label="Bezahlt"
            value={formatAmount(paidCents, invoice.currency)}
            icon={CheckCircle}
            tp={tp}
            ts={ts}
          />
        )}
        {outstanding > 0 && invoice.status !== 'PAID' && (
          <InvoiceDetailRow
            label="Offen"
            value={<span className="font-semibold text-amber-500">{formatAmount(outstanding, invoice.currency)}</span>}
            icon={Clock}
            tp={tp}
            ts={ts}
          />
        )}
        <InvoiceDetailRow
          label="Rechnungsdatum"
          value={formatDate(invoice.invoiceDate)}
          icon={Calendar}
          tp={tp}
          ts={ts}
        />
        <InvoiceDetailRow
          label="Fälligkeitsdatum"
          value={formatDate(invoice.dueDate)}
          icon={Clock}
          tp={tp}
          ts={ts}
        />
        {invoice.issuedAt && (
          <InvoiceDetailRow
            label="Ausgestellt am"
            value={formatDate(invoice.issuedAt)}
            icon={FileText}
            tp={tp}
            ts={ts}
          />
        )}
        {invoice.sentAt && (
          <InvoiceDetailRow
            label="Gesendet am"
            value={formatDate(invoice.sentAt)}
            icon={FileText}
            tp={tp}
            ts={ts}
          />
        )}
        <InvoiceDetailRow
          label="Bezahlt am"
          value={invoice.paidAt ? formatDate(invoice.paidAt) : '—'}
          icon={CheckCircle}
          tp={tp}
          ts={ts}
        />
        <InvoiceDetailRow
          label="Erstellt am"
          value={formatDate(invoice.createdAt)}
          icon={Calendar}
          tp={tp}
          ts={ts}
        />
      </div>
    </div>
  );
}

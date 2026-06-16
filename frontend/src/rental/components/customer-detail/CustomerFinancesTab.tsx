import { Icon } from '../ui/Icon';
import { DataCard, EmptyState, StatusChip } from '../../../components/patterns';
import {
  fineStatusApiToUiLabel,
  fineStatusTone,
  invoiceStatusApiToUiLabel,
  invoiceStatusTone,
} from '../../lib/entityMappers';
import { EM_DASH, formatCurrencyCents, formatDate } from './customerDetailUtils';

interface CustomerFinancesTabProps {
  invoices: any[];
  fines: any[];
  invoicesError?: string | null;
  finesError?: string | null;
}

export function CustomerFinancesTab({
  invoices,
  fines,
  invoicesError,
  finesError,
}: CustomerFinancesTabProps) {
  const openInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() !== 'PAID');
  const overdueInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() === 'OVERDUE');
  const paidInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() === 'PAID');
  const openFines = fines.filter((f) => !['RESOLVED', 'CLOSED'].includes((f.status ?? '').toUpperCase()));
  const totalRevenue = invoices.reduce((s, i) => s + (i.totalCents || 0), 0);
  const openAmount = openInvoices.reduce((s, i) => s + (i.totalCents || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: 'Offene Rechnungen', value: String(openInvoices.length) },
          { label: 'Überfällig', value: String(overdueInvoices.length) },
          { label: 'Bezahlt', value: String(paidInvoices.length) },
          { label: 'Offene Bußgelder', value: String(openFines.length) },
          {
            label: 'Gesamtumsatz',
            value: totalRevenue > 0 ? formatCurrencyCents(totalRevenue) : EM_DASH,
          },
          {
            label: 'Offener Betrag',
            value: openAmount > 0 ? formatCurrencyCents(openAmount) : EM_DASH,
          },
        ].map((c) => (
          <DataCard key={c.label} title={c.label} className="p-3">
            <p className="text-sm font-bold">{c.value}</p>
          </DataCard>
        ))}
      </div>

      <section className="space-y-2">
        <h4 className="text-xs font-bold">Rechnungen</h4>
        {invoicesError && <p className="text-xs text-[color:var(--status-critical)]">{invoicesError}</p>}
        {invoices.length === 0 ? (
          <EmptyState
            icon={<Icon name="file-text" className="w-5 h-5" />}
            title="Keine Rechnungen"
            description="Rechnungen erscheinen nach abgerechneten Buchungen."
          />
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Nr.', 'Datum', 'Titel', 'Betrag', 'Status', 'Fällig'].map((h) => (
                    <th key={h} className="text-left text-[10px] uppercase px-3 py-2 text-muted-foreground font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 text-xs">
                    <td className="px-3 py-2 font-semibold">#{inv.invoiceNumber}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-3 py-2">{inv.title || EM_DASH}</td>
                    <td className="px-3 py-2 font-semibold">{formatCurrencyCents(inv.totalCents, inv.currency)}</td>
                    <td className="px-3 py-2">
                      <StatusChip tone={invoiceStatusTone(inv.status)}>
                        {invoiceStatusApiToUiLabel(inv.status)}
                      </StatusChip>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(inv.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold">Bußgelder</h4>
        {finesError && <p className="text-xs text-[color:var(--status-critical)]">{finesError}</p>}
        {fines.length === 0 ? (
          <EmptyState
            icon={<Icon name="shield" className="w-5 h-5" />}
            title="Keine Bußgelder"
            description="Für diesen Kunden sind keine Bußgelder erfasst."
          />
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Datum', 'Typ', 'Ort', 'Betrag', 'Status'].map((h) => (
                    <th key={h} className="text-left text-[10px] uppercase px-3 py-2 text-muted-foreground font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fines.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/30 text-xs">
                    <td className="px-3 py-2">{formatDate(f.offenseDate)}</td>
                    <td className="px-3 py-2">{f.offenseType || f.title || EM_DASH}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate">
                      {f.location || EM_DASH}
                    </td>
                    <td className="px-3 py-2 font-semibold">{formatCurrencyCents(f.amountCents, f.currency)}</td>
                    <td className="px-3 py-2">
                      <StatusChip tone={fineStatusTone(f.status)}>
                        {fineStatusApiToUiLabel(f.status)}
                      </StatusChip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

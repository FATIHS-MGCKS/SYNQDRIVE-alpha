import { FileText, Shield } from 'lucide-react';

import { useLanguage } from '../../../i18n/LanguageContext';
import { DataCard, EmptyState, StatusChip } from '../../../components/patterns';
import {
  fineStatusApiToUiLabel,
  fineStatusTone,
  invoiceStatusApiToUiLabel,
  invoiceStatusTone,
} from '../../lib/entityMappers';
import { VehicleBookingSummaryCard } from '../vehicle-bookings/VehicleBookingSummaryCard';
import { EM_DASH, formatCurrencyCents, formatDate } from './customerDetailUtils';
import { cdv } from './customer-detail-ui';

interface CustomerFinancesTabProps {
  invoices: any[];
  fines: any[];
  invoicesError?: string | null;
  finesError?: string | null;
  onOpenInvoice?: (invoiceId: string) => void;
}

export function CustomerFinancesTab({
  invoices,
  fines,
  invoicesError,
  finesError,
  onOpenInvoice,
}: CustomerFinancesTabProps) {
  const { t } = useLanguage();
  const openInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() !== 'PAID');
  const overdueInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() === 'OVERDUE');
  const paidInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() === 'PAID');
  const openFines = fines.filter((f) => !['RESOLVED', 'CLOSED'].includes((f.status ?? '').toUpperCase()));
  const totalRevenue = invoices.reduce((s, i) => s + (i.totalCents || 0), 0);
  const openAmount = openInvoices.reduce((s, i) => s + (i.totalCents || 0), 0);

  const invoiceHeaders = [
    t('customers.detail.finances.col.number'),
    t('customers.detail.finances.col.date'),
    t('customers.detail.finances.col.title'),
    t('customers.detail.finances.col.amount'),
    t('common.status'),
    t('customers.detail.finances.col.due'),
  ];

  const fineHeaders = [
    t('customers.detail.finances.col.date'),
    t('customers.detail.finances.col.type'),
    t('customers.detail.finances.col.location'),
    t('customers.detail.finances.col.amount'),
    t('common.status'),
  ];

  return (
    <div className="space-y-3">
      <div className={cdv.summaryGrid}>
        <VehicleBookingSummaryCard
          label={t('customers.detail.finances.openInvoices')}
          value={String(openInvoices.length)}
          valueVariant="numeric"
          subdued={openInvoices.length === 0}
        />
        <VehicleBookingSummaryCard
          label={t('customers.detail.finances.overdue')}
          value={String(overdueInvoices.length)}
          valueVariant="numeric"
          status={overdueInvoices.length > 0 ? 'critical' : undefined}
          subdued={overdueInvoices.length === 0}
        />
        <VehicleBookingSummaryCard
          label={t('customers.detail.finances.paid')}
          value={String(paidInvoices.length)}
          valueVariant="numeric"
          subdued={paidInvoices.length === 0}
        />
        <VehicleBookingSummaryCard
          label={t('customers.detail.finances.openFines')}
          value={String(openFines.length)}
          valueVariant="numeric"
          subdued={openFines.length === 0}
        />
        <VehicleBookingSummaryCard
          label={t('customers.detail.finances.totalRevenue')}
          value={totalRevenue > 0 ? formatCurrencyCents(totalRevenue) : EM_DASH}
          valueVariant="numeric"
          subdued={totalRevenue <= 0}
        />
        <VehicleBookingSummaryCard
          label={t('customers.detail.finances.openAmount')}
          value={openAmount > 0 ? formatCurrencyCents(openAmount) : EM_DASH}
          valueVariant="numeric"
          subdued={openAmount <= 0}
        />
      </div>

      <DataCard title={t('customers.detail.finances.invoicesTitle')} flush bodyClassName="p-0">
        {invoicesError ? (
          <p className="px-4 py-3 text-[12px] text-muted-foreground">{invoicesError}</p>
        ) : null}
        {invoices.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<FileText className="size-5" />}
              title={t('customers.detail.finances.noInvoices')}
              description={t('customers.detail.finances.noInvoicesHint')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {invoiceHeaders.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`text-xs hover:bg-muted/20 ${onOpenInvoice ? 'cursor-pointer' : ''}`}
                    onClick={onOpenInvoice ? () => onOpenInvoice(inv.id) : undefined}
                    onKeyDown={
                      onOpenInvoice
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onOpenInvoice(inv.id);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onOpenInvoice ? 0 : undefined}
                    role={onOpenInvoice ? 'button' : undefined}
                  >
                    <td className="px-3 py-2 font-semibold">#{inv.invoiceNumber}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-3 py-2">{inv.title || EM_DASH}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {formatCurrencyCents(inv.totalCents, inv.currency)}
                    </td>
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
      </DataCard>

      <DataCard title={t('customers.detail.finances.finesTitle')} flush bodyClassName="p-0">
        {finesError ? (
          <p className="px-4 py-3 text-[12px] text-muted-foreground">{finesError}</p>
        ) : null}
        {fines.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Shield className="size-5" />}
              title={t('customers.detail.finances.noFines')}
              description={t('customers.detail.finances.noFinesHint')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {fineHeaders.map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fines.map((f) => (
                  <tr key={f.id} className="text-xs hover:bg-muted/20">
                    <td className="px-3 py-2">{formatDate(f.offenseDate)}</td>
                    <td className="px-3 py-2">{f.offenseType || f.title || EM_DASH}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">
                      {f.location || EM_DASH}
                    </td>
                    <td className="px-3 py-2 font-semibold tabular-nums">
                      {formatCurrencyCents(f.amountCents, f.currency)}
                    </td>
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
      </DataCard>
    </div>
  );
}

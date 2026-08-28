import { useEffect, useMemo, useRef, useState } from 'react';
import type { TenantInvoiceListItemDto } from '../../types/billing.types';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { Icon } from '../ui/Icon';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BillingInvoicesQuery } from './useBillingInvoices';
import type { BillingPaginatedMeta } from './billing-query.utils';
import {
  formatRentalTenantBillingDate,
  resolveTenantInvoiceFilterStatusLabel,
  resolveTenantInvoiceMachineStatus,
  resolveTenantInvoiceStatusLabel,
  resolveTenantInvoiceStatusTone,
} from '../../lib/rental-tenant-billing-i18n';
import { formatOpenAmount, mapInvoiceStatusFilter } from './tenant-invoices.utils';
import { TenantInvoiceDetailDrawer } from './TenantInvoiceDetailDrawer';

interface TenantInvoicesSectionProps {
  orgId: string | undefined;
  invoices: TenantInvoiceListItemDto[];
  loading?: boolean;
  error?: string | null;
  meta?: BillingPaginatedMeta | null;
  query?: BillingInvoicesQuery;
  onQueryChange?: (query: BillingInvoicesQuery) => void;
  onRetry?: () => void;
  canWrite?: boolean;
  onManagePaymentMethod?: () => void;
}

type StatusFilter = 'all' | 'PAID' | 'OPEN' | 'OVERDUE' | 'VOID' | 'DRAFT';

const STATUS_FILTERS: StatusFilter[] = ['all', 'DRAFT', 'OPEN', 'OVERDUE', 'PAID', 'VOID'];

const LIST_COLUMN_IDS = [
  'number',
  'date',
  'period',
  'net',
  'tax',
  'gross',
  'outstanding',
  'status',
  'due',
  'paid',
  'documents',
] as const;

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-background text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';

export function TenantInvoicesSection({
  orgId,
  invoices,
  loading = false,
  error = null,
  meta = null,
  query,
  onQueryChange,
  onRetry,
  canWrite = false,
  onManagePaymentMethod,
}: TenantInvoicesSectionProps) {
  const { t, locale } = useLanguage();
  const [search, setSearch] = useState(query?.search ?? '');
  const [status, setStatus] = useState<StatusFilter>(() => {
    const raw = query?.status;
    if (raw === 'PAID' || raw === 'OPEN' || raw === 'OVERDUE' || raw === 'VOID' || raw === 'DRAFT') {
      return raw;
    }
    return 'all';
  });
  const [selected, setSelected] = useState<TenantInvoiceListItemDto | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onQueryChange?.({
        ...(queryRef.current ?? {}),
        page: 1,
        search: search.trim() || undefined,
        status: mapInvoiceStatusFilter(status),
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, status, onQueryChange]);

  const totalLabel = useMemo(
    () =>
      t('invoices.list.filters.showing', {
        visible: invoices.length,
        total: meta?.total ?? invoices.length,
      }),
    [invoices.length, meta?.total, t],
  );

  const columnLabels = useMemo(
    () => ({
      number: t('invoices.list.col.invoiceNumber'),
      date: t('invoices.list.col.date'),
      period: t('bookings.period'),
      net: t('invoiceLineItem.summary.net'),
      tax: t('invoiceLineItem.summary.tax'),
      gross: t('invoiceLineItem.summary.gross'),
      outstanding: t('invoiceLineItem.summary.outstanding'),
      status: t('invoices.list.col.status'),
      due: t('invoices.list.col.dueDate'),
      paid: t('bookingPayment.field.paidAt'),
      documents: t('invoices.list.col.document'),
    }),
    [t],
  );

  if (loading && invoices.length === 0) {
    return <SkeletonCard className="h-56 rounded-2xl" />;
  }

  if (error) {
    return (
      <ErrorState
        title={t('tenantBilling.invoices.list.loadErrorTitle')}
        description={error}
        onRetry={onRetry ? () => void onRetry() : undefined}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <>
      <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {t('tenantBilling.invoices.list.title')}
            </h3>
            <p className="text-[12px] mt-0.5 text-muted-foreground">{totalLabel}</p>
          </div>
          {loading ? (
            <span className="text-[11px] text-muted-foreground">
              {t('tenantBilling.invoices.list.updating')}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3 mb-4">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('tenantBilling.invoices.list.searchPlaceholder')}
              className={`${inputClass} !pl-9`}
            />
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className={inputClass}
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {resolveTenantInvoiceFilterStatusLabel(filter, t)}
              </option>
            ))}
          </select>
        </div>

        {invoices.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="file-text" className="w-5 h-5" />}
            title={t('tenantBilling.invoices.list.empty.title')}
            description={
              search || status !== 'all'
                ? t('tenantBilling.invoices.list.empty.filtered')
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[1080px]" data-testid="tenant-invoices-table">
              <thead>
                <tr className="bg-muted/40">
                  {LIST_COLUMN_IDS.map((columnId) => (
                    <th
                      key={columnId}
                      className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground last:text-right"
                    >
                      {columnLabels[columnId]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const machineStatus = resolveTenantInvoiceMachineStatus(invoice);
                  const statusLabel = resolveTenantInvoiceStatusLabel(invoice, t);
                  return (
                    <tr
                      key={invoice.id}
                      className="border-t border-border/50 hover:bg-muted/20 cursor-pointer transition-colors"
                      onClick={() => setSelected(invoice)}
                    >
                      <td className="px-3 py-2.5 text-[12px] font-medium">
                        {invoice.invoiceNumberLabel}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        {formatRentalTenantBillingDate(locale, invoice.invoiceDate)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted-foreground">
                        {formatRentalTenantBillingDate(locale, invoice.periodStart)} –{' '}
                        {formatRentalTenantBillingDate(locale, invoice.periodEnd)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        {invoice.netAmount.formatted}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        {invoice.taxAmount?.formatted ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] font-semibold tabular-nums">
                        {invoice.grossAmount.formatted}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        {formatOpenAmount(invoice)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${resolveTenantInvoiceStatusTone(machineStatus)}`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        {formatRentalTenantBillingDate(locale, invoice.dueDate)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums">
                        {formatRentalTenantBillingDate(locale, invoice.paidAt)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                        {invoice.hasPdf ? 'PDF' : '—'}
                        {invoice.hasHostedInvoice ? ` · ${t('tenantBilling.invoices.list.doc.online')}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {meta && meta.totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || (query?.page ?? 1) <= 1}
              onClick={() =>
                onQueryChange?.({
                  ...(query ?? {}),
                  page: Math.max(1, (query?.page ?? 1) - 1),
                })
              }
            >
              {t('common.back')}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {t('tenantBilling.tariff.pagination.pageOf', {
                page: meta.page,
                totalPages: meta.totalPages,
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || (query?.page ?? 1) >= meta.totalPages}
              onClick={() =>
                onQueryChange?.({
                  ...(query ?? {}),
                  page: (query?.page ?? 1) + 1,
                })
              }
            >
              {t('common.next')}
            </Button>
          </div>
        ) : null}
      </div>

      <TenantInvoiceDetailDrawer
        orgId={orgId}
        invoice={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        canWrite={canWrite}
        onManagePaymentMethod={onManagePaymentMethod}
      />
    </>
  );
}

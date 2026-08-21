import { ArrowDownLeft, ArrowUpRight, Clock, Receipt } from 'lucide-react';

import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatInvoiceListAmount,
  type InvoiceDirectionFilter,
} from '../../lib/invoice-list-i18n';
import type { InvoiceStats } from './invoiceTypes';
import { InvoiceKpiCard } from './InvoiceKpiCard';

interface InvoiceKpiGridProps {
  stats: InvoiceStats | null;
  totalInvoices: number;
  filteredCount: number;
  directionCount: (direction: InvoiceDirectionFilter) => number;
  unpaidCount: number;
  overdueCount: number;
  hasActiveFilters: boolean;
  directionFilter: InvoiceDirectionFilter;
  statusFilter: string;
  onClearFilters: () => void;
  onDirectionFilter: (direction: InvoiceDirectionFilter) => void;
  onStatusFilter: (status: string) => void;
}

export function InvoiceKpiGrid({
  stats,
  totalInvoices,
  filteredCount,
  directionCount,
  unpaidCount,
  overdueCount,
  hasActiveFilters,
  directionFilter,
  statusFilter,
  onClearFilters,
  onDirectionFilter,
  onStatusFilter,
}: InvoiceKpiGridProps) {
  const { locale, t } = useLanguage();

  return (
    <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-4">
      <InvoiceKpiCard
        label={t('invoices.list.kpi.total')}
        value={stats?.total ?? totalInvoices}
        helper={t('invoices.list.kpi.visibleCount', { count: filteredCount })}
        icon={Receipt}
        isActive={!hasActiveFilters}
        onClick={onClearFilters}
      />
      <InvoiceKpiCard
        label={t('invoices.list.kpi.revenue')}
        value={formatInvoiceListAmount(locale, stats?.totalRevenueCents || 0)}
        helper={t('invoices.list.kpi.outgoingCount', { count: directionCount('outgoing') })}
        icon={ArrowUpRight}
        tone="info"
        accent={(stats?.totalRevenueCents || 0) > 0}
        subdued={(stats?.totalRevenueCents || 0) === 0}
        isActive={directionFilter === 'outgoing'}
        onClick={() => onDirectionFilter('outgoing')}
      />
      <InvoiceKpiCard
        label={t('invoices.list.kpi.expenses')}
        value={formatInvoiceListAmount(locale, stats?.totalExpensesCents || 0)}
        helper={t('invoices.list.kpi.incomingCount', { count: directionCount('incoming') })}
        icon={ArrowDownLeft}
        tone="watch"
        accent={(stats?.totalExpensesCents || 0) > 0}
        subdued={(stats?.totalExpensesCents || 0) === 0}
        isActive={directionFilter === 'incoming'}
        onClick={() => onDirectionFilter('incoming')}
      />
      <InvoiceKpiCard
        label={t('invoices.list.kpi.unpaid')}
        value={unpaidCount}
        helper={t('invoices.list.kpi.overdueCount', { count: overdueCount })}
        icon={Clock}
        tone={unpaidCount > 0 ? 'critical' : 'success'}
        subdued={unpaidCount === 0}
        isActive={statusFilter === 'OVERDUE'}
        onClick={() => onStatusFilter(statusFilter === 'OVERDUE' ? 'all' : 'OVERDUE')}
      />
    </div>
  );
}

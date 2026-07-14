import { ArrowDownLeft, ArrowUpRight, Clock, Receipt } from 'lucide-react';

import { formatAmount } from './invoiceFormatters';
import type { InvoiceStats } from './invoiceTypes';
import type { InvoiceDirectionFilter } from './invoiceConstants';
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
  return (
    <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-4">
      <InvoiceKpiCard
        label="Gesamt"
        value={stats?.total ?? totalInvoices}
        helper={`${filteredCount} aktuell sichtbar`}
        icon={Receipt}
        isActive={!hasActiveFilters}
        onClick={onClearFilters}
      />
      <InvoiceKpiCard
        label="Umsatz"
        value={formatAmount(stats?.totalRevenueCents || 0)}
        helper={`${directionCount('outgoing')} Ausgangsrechnungen`}
        icon={ArrowUpRight}
        tone="info"
        accent={(stats?.totalRevenueCents || 0) > 0}
        subdued={(stats?.totalRevenueCents || 0) === 0}
        isActive={directionFilter === 'outgoing'}
        onClick={() => onDirectionFilter('outgoing')}
      />
      <InvoiceKpiCard
        label="Ausgaben"
        value={formatAmount(stats?.totalExpensesCents || 0)}
        helper={`${directionCount('incoming')} Eingangsrechnungen`}
        icon={ArrowDownLeft}
        tone="watch"
        accent={(stats?.totalExpensesCents || 0) > 0}
        subdued={(stats?.totalExpensesCents || 0) === 0}
        isActive={directionFilter === 'incoming'}
        onClick={() => onDirectionFilter('incoming')}
      />
      <InvoiceKpiCard
        label="Unbezahlt"
        value={unpaidCount}
        helper={`${overdueCount} überfällig`}
        icon={Clock}
        tone={unpaidCount > 0 ? 'critical' : 'success'}
        subdued={unpaidCount === 0}
        isActive={statusFilter === 'OVERDUE'}
        onClick={() => onStatusFilter(statusFilter === 'OVERDUE' ? 'all' : 'OVERDUE')}
      />
    </div>
  );
}

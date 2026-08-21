import { Receipt } from 'lucide-react';

import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { InvoiceListItem } from './invoiceTypes';
import { InvoiceListMobileCards } from './InvoiceListMobileCards';
import { InvoiceListPagination } from './InvoiceListPagination';
import { InvoiceListTable } from './InvoiceListTable';

interface InvoiceListProps {
  items: InvoiceListItem[];
  loading: boolean;
  error: string | null;
  hasActiveFilters: boolean;
  searchTerm: string;
  meta: import('./invoiceTypes').InvoiceListMeta | null;
  onSelect: (item: InvoiceListItem) => void;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
}

function InvoiceListSkeleton() {
  return (
    <div className="space-y-3 p-4" aria-hidden>
      <SkeletonCard className="hidden h-52 rounded-xl md:block" />
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} className="h-28 rounded-xl md:hidden" />
      ))}
    </div>
  );
}

export function InvoiceList({
  items,
  loading,
  error,
  hasActiveFilters,
  searchTerm,
  meta,
  onSelect,
  onRetry,
  onPageChange,
  onClearFilters,
}: InvoiceListProps) {
  const { t } = useLanguage();

  return (
    <div className="surface-premium overflow-hidden rounded-2xl shadow-[var(--shadow-1)]" data-testid="invoice-list">
      {error && !loading ? (
        <ErrorState
          title={t('invoices.list.error.loadFailed')}
          description={error}
          onRetry={onRetry}
          retryLabel={t('invoices.list.retry')}
        />
      ) : loading && items.length === 0 ? (
        <InvoiceListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-5 w-5" />}
          title={t('invoices.list.empty.title')}
          description={
            hasActiveFilters || searchTerm.trim()
              ? t('invoices.list.empty.filteredDescription')
              : t('invoices.list.empty.firstHint')
          }
          action={
            hasActiveFilters || searchTerm.trim() ? (
              <Button type="button" variant="neutral" size="sm" onClick={onClearFilters}>
                {t('invoices.list.empty.clearFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <InvoiceListTable items={items} loading={loading} onSelect={onSelect} />
          <div className="p-3 md:hidden">
            <InvoiceListMobileCards items={items} onSelect={onSelect} />
          </div>
          <InvoiceListPagination meta={meta} onPageChange={onPageChange} disabled={loading} />
        </>
      )}
    </div>
  );
}

import { ClipboardList, Search } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { ProcessingActivityRegisterListItem } from '../../../../../lib/api';
import type { PaginatedListResult } from '../../../../lib/useDataProcessingSectionList';
import { labelDataCategory } from '../../data-authorization/data-authorization.constants';
import { LIFECYCLE_STATUS_LABELS } from '../data-processing.constants';
import { DataProcessingListPagination } from '../DataProcessingListPagination';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface Props {
  list: PaginatedListResult<ProcessingActivityRegisterListItem>;
  onRowClick?: (row: ProcessingActivityRegisterListItem) => void;
}

export function ProcessingActivitiesSection({ list, onRowClick }: Props) {
  const { t } = useLanguage();
  const { items, loading, error, reload, loadMore, nextCursor, filters, setFilters } = list;

  const columns: DataTableColumn<ProcessingActivityRegisterListItem>[] = [
    {
      key: 'title',
      header: t('dataProcessing.activities.col.title'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{row.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.activityCode}</p>
        </div>
      ),
    },
    {
      key: 'categories',
      header: t('dataProcessing.activities.col.categories'),
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[220px]">
          {(row.dataCategories ?? []).map((cat) => (
            <StatusChip key={cat} tone="neutral" className="text-[10px]">
              {labelDataCategory(cat)}
            </StatusChip>
          ))}
        </div>
      ),
    },
    {
      key: 'version',
      header: t('dataProcessing.activities.col.version'),
      className: 'hidden md:table-cell w-24',
      cell: (row) => (
        <span className="tabular-nums text-[12px] text-muted-foreground">v{row.versionNumber}</span>
      ),
    },
    {
      key: 'status',
      header: t('dataProcessing.activities.col.status'),
      cell: (row) => (
        <StatusChip tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {LIFECYCLE_STATUS_LABELS[row.status] ?? row.status}
        </StatusChip>
      ),
    },
    {
      key: 'completeness',
      header: t('dataProcessing.activities.col.completeness'),
      cell: (row) => (
        <StatusChip tone={row.hasBlockingGaps ? 'critical' : 'success'}>
          {row.hasBlockingGaps
            ? t('dataProcessing.activities.gaps', { count: row.completeness.blockingGaps.length })
            : t('dataProcessing.activities.complete')}
        </StatusChip>
      ),
    },
    {
      key: 'dpia',
      header: t('dataProcessing.activities.col.dpia'),
      className: 'hidden lg:table-cell',
      cell: (row) => <span className="text-[12px] text-muted-foreground">{row.dpiaStatus}</span>,
    },
  ];

  if (error) {
    return (
      <ErrorState
        title={t('dataProcessing.error.section')}
        description={error}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })}
          placeholder={t('dataProcessing.filters.searchPlaceholder')}
          className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm"
          aria-label={t('dataProcessing.filters.search')}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.activities.hint')}</p>

      {loading && items.length === 0 ? <SkeletonRows rows={5} /> : null}

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          title={t('dataProcessing.activities.empty.title')}
          description={t('dataProcessing.activities.empty.description')}
        />
      ) : null}

      {items.length > 0 ? (
        <>
          <div className="hidden md:block">
            <DataTable columns={columns} rows={items} getRowKey={(r) => r.id} onRowClick={onRowClick} />
          </div>
          <div className="md:hidden space-y-2">
            {items.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onRowClick?.(row)}
                className="w-full text-left surface-premium rounded-xl border border-border/70 p-3 hover:bg-muted/30"
              >
                <p className="font-semibold text-foreground">{row.title}</p>
                <p className="text-[11px] text-muted-foreground">{row.activityCode} · v{row.versionNumber}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {(row.dataCategories ?? []).slice(0, 6).map((cat) => (
                    <StatusChip key={cat} tone="neutral">
                      {labelDataCategory(cat)}
                    </StatusChip>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <DataProcessingListPagination
            loading={loading}
            hasMore={Boolean(nextCursor)}
            onLoadMore={() => void loadMore()}
            itemCount={items.length}
            label={t('dataProcessing.pagination.loadMore')}
          />
        </>
      ) : null}
    </div>
  );
}

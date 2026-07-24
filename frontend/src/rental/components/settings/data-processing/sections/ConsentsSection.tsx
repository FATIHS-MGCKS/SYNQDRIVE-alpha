import { UserCheck, Search } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { DataAuthorizationDto } from '../../../../../lib/api';
import type { PaginatedListResult } from '../../../../lib/useDataProcessingSectionList';
import { AuthRiskChip, AuthStatusChip } from '../../data-authorization/data-authorization.badges';
import { affectedObjectsSummary } from '../../data-authorization/data-authorization.utils';
import { labelDataCategory } from '../../data-authorization/data-authorization.constants';
import { DataProcessingListPagination } from '../DataProcessingListPagination';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface Props {
  list: PaginatedListResult<DataAuthorizationDto>;
  filterFn?: (row: DataAuthorizationDto) => boolean;
  onRowClick?: (row: DataAuthorizationDto) => void;
}

export function ConsentsSection({ list, filterFn, onRowClick }: Props) {
  const { t } = useLanguage();
  const { items: rawItems, loading, error, reload, loadMore, nextCursor, filters, setFilters } = list;
  const items = filterFn ? rawItems.filter(filterFn) : rawItems;

  const columns: DataTableColumn<DataAuthorizationDto>[] = [
    {
      key: 'title',
      header: t('dataProcessing.consents.col.title'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{row.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.moduleOrigin}</p>
        </div>
      ),
    },
    {
      key: 'categories',
      header: t('dataProcessing.consents.col.categories'),
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {row.dataCategories.map((cat) => (
            <StatusChip key={cat} tone="neutral" className="text-[10px]">
              {labelDataCategory(cat)}
            </StatusChip>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: t('dataProcessing.consents.col.status'),
      cell: (row) => <AuthStatusChip statusKey={row.statusKey} />,
    },
    {
      key: 'risk',
      header: t('dataProcessing.consents.col.risk'),
      className: 'hidden md:table-cell',
      cell: (row) => <AuthRiskChip riskKey={row.riskLevelKey} />,
    },
    {
      key: 'scope',
      header: t('dataProcessing.consents.col.scope'),
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <span className="text-[12px] text-muted-foreground">{affectedObjectsSummary(row)}</span>
      ),
    },
  ];

  if (error) {
    return <ErrorState title={t('dataProcessing.error.section')} description={error} onRetry={() => void reload()} />;
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
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.consents.hint')}</p>
      <p className="text-[11px] text-muted-foreground" title={t('dataProcessing.terms.consent.hint')}>
        <span className="font-semibold text-foreground/80">{t('dataProcessing.terms.consent.title')}:</span>{' '}
        {t('dataProcessing.terms.consent.hint')}
      </p>
      {loading && items.length === 0 ? <SkeletonRows rows={4} /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="h-8 w-8" />}
          title={t('dataProcessing.consents.empty.title')}
          description={t('dataProcessing.consents.empty.description')}
        />
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              rows={items}
              getRowKey={(r) => r.id}
              onRowClick={onRowClick}
              ariaLabel={t('dataProcessing.consents.tableLabel')}
              caption={t('dataProcessing.consents.tableLabel')}
            />
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <AuthStatusChip statusKey={row.statusKey} />
                  <AuthRiskChip riskKey={row.riskLevelKey} />
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

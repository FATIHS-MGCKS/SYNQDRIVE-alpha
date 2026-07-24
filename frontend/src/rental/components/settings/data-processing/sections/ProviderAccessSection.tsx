import { Plug } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { DataAuthorizationDto } from '../../../../../lib/api';
import { AuthStatusChip } from '../../data-authorization/data-authorization.badges';
import { labelProcessor, labelScope } from '../../data-authorization/data-authorization.constants';
import { useLanguage } from '../../../../i18n/LanguageContext';

function isProviderAuthorization(auth: DataAuthorizationDto): boolean {
  return Boolean(
    auth.processorType ||
      auth.processorName ||
      auth.sourceType === 'SYSTEM' ||
      auth.isSystemGenerated,
  );
}

interface Props {
  authorizations: DataAuthorizationDto[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: DataAuthorizationDto) => void;
}

export function ProviderAccessSection({ authorizations, loading, error, onRetry, onRowClick }: Props) {
  const { t } = useLanguage();
  const items = authorizations.filter(isProviderAuthorization);

  const columns: DataTableColumn<DataAuthorizationDto>[] = [
    {
      key: 'title',
      header: t('dataProcessing.providers.col.name'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{row.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{labelProcessor(row)}</p>
        </div>
      ),
    },
    {
      key: 'scope',
      header: t('dataProcessing.providers.col.scope'),
      className: 'hidden md:table-cell',
      cell: (row) => <span className="text-[12px] text-muted-foreground">{labelScope(row.scopeKey)}</span>,
    },
    {
      key: 'status',
      header: t('dataProcessing.providers.col.status'),
      cell: (row) => <AuthStatusChip statusKey={row.statusKey} />,
    },
    {
      key: 'vehicles',
      header: t('dataProcessing.providers.col.vehicles'),
      className: 'hidden lg:table-cell w-24',
      cell: (row) => (
        <span className="tabular-nums text-[12px] text-muted-foreground">{row.vehicleCount}</span>
      ),
    },
  ];

  if (error) {
    return <ErrorState title={t('dataProcessing.error.section')} description={error} onRetry={onRetry} />;
  }

  if (loading) return <SkeletonRows rows={4} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Plug className="h-8 w-8" />}
        title={t('dataProcessing.providers.empty.title')}
        description={t('dataProcessing.providers.empty.description')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.providers.hint')}</p>
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
            <p className="text-[11px] text-muted-foreground">{labelProcessor(row)}</p>
            <div className="mt-2">
              <AuthStatusChip statusKey={row.statusKey} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export { isProviderAuthorization };

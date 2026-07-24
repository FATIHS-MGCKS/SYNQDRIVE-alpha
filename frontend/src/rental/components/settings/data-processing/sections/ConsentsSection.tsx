import { UserCheck } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { DataAuthorizationDto } from '../../../../../lib/api';
import { AuthRiskChip, AuthStatusChip } from '../../data-authorization/data-authorization.badges';
import { affectedObjectsSummary } from '../../data-authorization/data-authorization.utils';
import { isProviderAuthorization } from './ProviderAccessSection';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface Props {
  authorizations: DataAuthorizationDto[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: DataAuthorizationDto) => void;
}

export function ConsentsSection({ authorizations, loading, error, onRetry, onRowClick }: Props) {
  const { t } = useLanguage();
  const items = authorizations.filter((a) => !isProviderAuthorization(a));

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
    return <ErrorState title={t('dataProcessing.error.section')} description={error} onRetry={onRetry} />;
  }

  if (loading) return <SkeletonRows rows={4} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<UserCheck className="h-8 w-8" />}
        title={t('dataProcessing.consents.empty.title')}
        description={t('dataProcessing.consents.empty.description')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.consents.hint')}</p>
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              <AuthStatusChip statusKey={row.statusKey} />
              <AuthRiskChip riskKey={row.riskLevelKey} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

import { ClipboardList } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { ProcessingActivityRegisterListItem } from '../../../../../lib/api';
import { LIFECYCLE_STATUS_LABELS } from '../data-processing.constants';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface Props {
  items: ProcessingActivityRegisterListItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: ProcessingActivityRegisterListItem) => void;
}

export function ProcessingActivitiesSection({ items, loading, error, onRetry, onRowClick }: Props) {
  const { t } = useLanguage();

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
        onRetry={onRetry}
      />
    );
  }

  if (loading) return <SkeletonRows rows={5} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-8 w-8" />}
        title={t('dataProcessing.activities.empty.title')}
        description={t('dataProcessing.activities.empty.description')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.activities.hint')}</p>
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
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusChip tone={row.hasBlockingGaps ? 'critical' : 'success'}>
                {row.hasBlockingGaps ? t('dataProcessing.activities.gapsShort') : t('dataProcessing.activities.complete')}
              </StatusChip>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

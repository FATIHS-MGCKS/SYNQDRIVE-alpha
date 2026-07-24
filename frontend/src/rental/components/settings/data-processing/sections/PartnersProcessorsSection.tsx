import { Handshake } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { DataProcessingAgreementListItem } from '../../../../../lib/api';
import { LIFECYCLE_STATUS_LABELS } from '../data-processing.constants';
import { useLanguage } from '../../../../i18n/LanguageContext';

interface Props {
  items: DataProcessingAgreementListItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: DataProcessingAgreementListItem) => void;
}

export function PartnersProcessorsSection({ items, loading, error, onRetry, onRowClick }: Props) {
  const { t } = useLanguage();

  const columns: DataTableColumn<DataProcessingAgreementListItem>[] = [
    {
      key: 'processor',
      header: t('dataProcessing.partners.col.processor'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{row.processorName}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {row.contractReference ?? t('dataProcessing.partners.noContractRef')}
          </p>
        </div>
      ),
    },
    {
      key: 'version',
      header: t('dataProcessing.partners.col.version'),
      className: 'hidden md:table-cell w-20',
      cell: (row) => <span className="tabular-nums text-[12px]">v{row.versionNumber}</span>,
    },
    {
      key: 'status',
      header: t('dataProcessing.partners.col.status'),
      cell: (row) => (
        <StatusChip tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {LIFECYCLE_STATUS_LABELS[row.status] ?? row.status}
        </StatusChip>
      ),
    },
    {
      key: 'transfer',
      header: t('dataProcessing.partners.col.transfer'),
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <StatusChip
          tone={row.transferAssessmentStatus === 'NOT_ASSESSED' ? 'watch' : 'neutral'}
        >
          {row.transferAssessmentStatus ?? row.primaryTransferMechanism ?? '—'}
        </StatusChip>
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
        icon={<Handshake className="h-8 w-8" />}
        title={t('dataProcessing.partners.empty.title')}
        description={t('dataProcessing.partners.empty.description')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.partners.hint')}</p>
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
            <p className="font-semibold text-foreground">{row.processorName}</p>
            <StatusChip tone={row.status === 'ACTIVE' ? 'success' : 'neutral'} className="mt-2">
              {LIFECYCLE_STATUS_LABELS[row.status] ?? row.status}
            </StatusChip>
          </button>
        ))}
      </div>
    </div>
  );
}

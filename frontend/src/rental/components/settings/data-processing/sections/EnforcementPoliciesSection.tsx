import { Radar } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { EnforcementFlowCoverageRowDto } from '../../../../../lib/api';
import { ENFORCEMENT_STATUS_LABELS } from '../data-processing.constants';
import { useLanguage } from '../../../../i18n/LanguageContext';

function statusTone(status: string): 'success' | 'watch' | 'critical' | 'neutral' {
  if (status === 'ENFORCED') return 'success';
  if (status === 'PARTIALLY_ENFORCED') return 'watch';
  if (status === 'NOT_IMPLEMENTED' || status === 'ENFORCEMENT_ERROR') return 'critical';
  return 'neutral';
}

interface Props {
  flows: EnforcementFlowCoverageRowDto[];
  coverageVersion?: string | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  enforcementErrorsOnly?: boolean;
}

export function EnforcementPoliciesSection({
  flows,
  coverageVersion,
  loading,
  error,
  onRetry,
  enforcementErrorsOnly,
}: Props) {
  const { t } = useLanguage();

  const visibleFlows = enforcementErrorsOnly
    ? flows.filter((f) => f.status === 'ENFORCEMENT_ERROR')
    : flows;

  const columns: DataTableColumn<EnforcementFlowCoverageRowDto>[] = [
    {
      key: 'flow',
      header: t('dataProcessing.enforcement.col.flow'),
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.flowName}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{row.sourceSystem}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('dataProcessing.enforcement.col.status'),
      cell: (row) => (
        <StatusChip tone={statusTone(row.status)}>
          {ENFORCEMENT_STATUS_LABELS[row.status] ?? row.status}
        </StatusChip>
      ),
    },
    {
      key: 'health',
      header: t('dataProcessing.enforcement.col.runtime'),
      className: 'hidden md:table-cell',
      cell: (row) => <span className="text-[12px] text-muted-foreground">{row.runtimeHealth}</span>,
    },
    {
      key: 'gaps',
      header: t('dataProcessing.enforcement.col.gaps'),
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <span className="text-[12px] text-muted-foreground">
          {row.missingEnforcementPoints.length > 0
            ? row.missingEnforcementPoints.join(', ')
            : '—'}
        </span>
      ),
    },
  ];

  if (error) {
    return <ErrorState title={t('dataProcessing.error.section')} description={error} onRetry={onRetry} />;
  }

  if (loading) return <SkeletonRows rows={6} />;

  if (visibleFlows.length === 0) {
    return (
      <EmptyState
        icon={<Radar className="h-8 w-8" />}
        title={
          enforcementErrorsOnly
            ? t('dataProcessing.enforcement.empty.errors.title')
            : t('dataProcessing.enforcement.empty.title')
        }
        description={
          enforcementErrorsOnly
            ? t('dataProcessing.enforcement.empty.errors.description')
            : t('dataProcessing.enforcement.empty.description')
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {coverageVersion ? (
        <p className="text-[11px] text-muted-foreground">
          {t('dataProcessing.enforcement.version', { version: coverageVersion })}
        </p>
      ) : null}
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.enforcement.hint')}</p>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={visibleFlows} getRowKey={(r) => r.flowId} />
      </div>
      <div className="md:hidden space-y-2">
        {visibleFlows.map((row) => (
          <div key={row.flowId} className="surface-premium rounded-xl border border-border/70 p-3">
            <p className="font-medium text-foreground">{row.flowName}</p>
            <StatusChip tone={statusTone(row.status)} className="mt-2">
              {ENFORCEMENT_STATUS_LABELS[row.status] ?? row.status}
            </StatusChip>
          </div>
        ))}
      </div>
    </div>
  );
}

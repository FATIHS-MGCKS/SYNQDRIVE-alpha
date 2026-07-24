import { ScrollText } from 'lucide-react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  StatusChip,
  type DataTableColumn,
} from '../../../../../components/patterns';
import type { AuthorizationDecisionAuditItem } from '../../../../../lib/api';
import { useLanguage } from '../../../../i18n/LanguageContext';

function eventTone(eventType: string): 'success' | 'critical' | 'watch' | 'neutral' {
  if (eventType === 'ALLOW') return 'success';
  if (eventType === 'DENY') return 'critical';
  if (eventType === 'SHADOW_WOULD_DENY') return 'watch';
  return 'neutral';
}

interface Props {
  items: AuthorizationDecisionAuditItem[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function AuditDecisionsSection({ items, loading, error, onRetry }: Props) {
  const { t } = useLanguage();

  const columns: DataTableColumn<AuthorizationDecisionAuditItem>[] = [
    {
      key: 'event',
      header: t('dataProcessing.audit.col.event'),
      cell: (row) => (
        <StatusChip tone={eventTone(row.eventType)}>{row.eventType}</StatusChip>
      ),
    },
    {
      key: 'path',
      header: t('dataProcessing.audit.col.path'),
      cell: (row) => (
        <span className="text-[12px] text-muted-foreground">{row.pathId ?? '—'}</span>
      ),
    },
    {
      key: 'category',
      header: t('dataProcessing.audit.col.category'),
      className: 'hidden md:table-cell',
      cell: (row) => (
        <span className="text-[12px] text-muted-foreground">{row.dataCategory ?? '—'}</span>
      ),
    },
    {
      key: 'time',
      header: t('dataProcessing.audit.col.time'),
      className: 'hidden lg:table-cell',
      cell: (row) => (
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {row.evaluatedAt ? new Date(row.evaluatedAt).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  if (error) {
    return <ErrorState title={t('dataProcessing.error.section')} description={error} onRetry={onRetry} />;
  }

  if (loading) return <SkeletonRows rows={6} />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ScrollText className="h-8 w-8" />}
        title={t('dataProcessing.audit.empty.title')}
        description={t('dataProcessing.audit.empty.description')}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.audit.hint')}</p>
      <div className="hidden md:block">
        <DataTable columns={columns} rows={items} getRowKey={(r) => r.id} />
      </div>
      <div className="md:hidden space-y-2">
        {items.map((row) => (
          <div key={row.id} className="surface-premium rounded-xl border border-border/70 p-3">
            <StatusChip tone={eventTone(row.eventType)}>{row.eventType}</StatusChip>
            <p className="mt-2 text-[12px] text-muted-foreground">{row.pathId ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

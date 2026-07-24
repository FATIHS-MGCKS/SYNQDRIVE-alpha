import {
  AlertTriangle,
  ClipboardList,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
  Timer,
} from 'lucide-react';
import { MetricCard } from '../../../../components/patterns';
import type { DataProcessingHubMetricsDto } from '../../../../lib/api';
import type { DataProcessingKpiKey } from '../../../lib/data-processing-list-state';
import { useLanguage } from '../../../i18n/LanguageContext';

interface Props {
  metrics: DataProcessingHubMetricsDto | null;
  loading?: boolean;
  activeKpi?: DataProcessingKpiKey | null;
  onKpiClick?: (kpi: DataProcessingKpiKey) => void;
  section?: 'activities' | 'providers' | 'consents' | 'enforcement';
}

export function DataProcessingKpiStrip({
  metrics,
  loading,
  activeKpi,
  onKpiClick,
  section = 'activities',
}: Props) {
  const { t } = useLanguage();

  const activityKpis: Array<{
    key: DataProcessingKpiKey;
    label: string;
    value: number;
    tone: 'success' | 'watch' | 'critical' | 'neutral';
    icon: React.ReactNode;
  }> = [
    {
      key: 'active_activities',
      label: t('dataProcessing.kpi.active_activities'),
      value: metrics?.activeProcessingActivities ?? 0,
      tone: 'success',
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      key: 'blocking_gaps',
      label: t('dataProcessing.kpi.blocking_gaps'),
      value: metrics?.blockingControlGaps ?? 0,
      tone: (metrics?.blockingControlGaps ?? 0) > 0 ? 'critical' : 'neutral',
      icon: <ShieldAlert className="h-4 w-4" />,
    },
    {
      key: 'reviews_due',
      label: t('dataProcessing.kpi.reviews_due'),
      value: metrics?.reviewsDue ?? 0,
      tone: (metrics?.reviewsDue ?? 0) > 0 ? 'watch' : 'neutral',
      icon: <Timer className="h-4 w-4" />,
    },
    {
      key: 'revocations_in_progress',
      label: t('dataProcessing.kpi.revocations_in_progress'),
      value: metrics?.revocationsInProgress ?? 0,
      tone: (metrics?.revocationsInProgress ?? 0) > 0 ? 'watch' : 'neutral',
      icon: <RefreshCw className="h-4 w-4" />,
    },
    {
      key: 'enforcement_errors',
      label: t('dataProcessing.kpi.enforcement_errors'),
      value: metrics?.enforcementErrors ?? 0,
      tone: (metrics?.enforcementErrors ?? 0) > 0 ? 'critical' : 'neutral',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      key: 'dpia_overdue',
      label: t('dataProcessing.kpi.dpia_overdue'),
      value: metrics?.dpiaOverdue ?? 0,
      tone: (metrics?.dpiaOverdue ?? 0) > 0 ? 'critical' : 'neutral',
      icon: <ShieldOff className="h-4 w-4" />,
    },
  ];

  const legacyKpis: typeof activityKpis = [
    {
      key: 'legacy_active',
      label: t('dataProcessing.kpi.legacy_active'),
      value: metrics?.legacy.active ?? 0,
      tone: 'success',
      icon: <ClipboardList className="h-4 w-4" />,
    },
    {
      key: 'legacy_pending',
      label: t('dataProcessing.kpi.legacy_pending'),
      value: metrics?.legacy.pending ?? 0,
      tone: 'watch',
      icon: <Timer className="h-4 w-4" />,
    },
    {
      key: 'legacy_expiring_soon',
      label: t('dataProcessing.kpi.legacy_expiring_soon'),
      value: metrics?.legacy.expiringSoon ?? 0,
      tone: (metrics?.legacy.expiringSoon ?? 0) > 0 ? 'watch' : 'neutral',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      key: 'legacy_revoked_expired',
      label: t('dataProcessing.kpi.legacy_revoked_expired'),
      value: (metrics?.legacy.revoked ?? 0) + (metrics?.legacy.expired ?? 0),
      tone: 'neutral',
      icon: <ShieldOff className="h-4 w-4" />,
    },
    {
      key: 'legacy_high_risk',
      label: t('dataProcessing.kpi.legacy_high_risk'),
      value: metrics?.legacy.highRisk ?? 0,
      tone: (metrics?.legacy.highRisk ?? 0) > 0 ? 'critical' : 'neutral',
      icon: <ShieldAlert className="h-4 w-4" />,
    },
  ];

  const kpis =
    section === 'providers' || section === 'consents'
      ? legacyKpis
      : section === 'enforcement'
        ? activityKpis.filter((k) => k.key === 'enforcement_errors' || k.key === 'blocking_gaps')
        : activityKpis;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3">
      {kpis.map((kpi) => (
        <button
          key={kpi.key}
          type="button"
          onClick={() => onKpiClick?.(kpi.key)}
          className={`text-left rounded-xl transition-shadow ${
            activeKpi === kpi.key ? 'ring-2 ring-[var(--brand)] ring-offset-2 ring-offset-background' : ''
          }`}
          aria-pressed={activeKpi === kpi.key}
        >
          <MetricCard
            label={kpi.label}
            value={kpi.value}
            status={kpi.tone}
            icon={kpi.icon}
            loading={loading}
            variant="summary"
            valueSize="compact"
            className="h-full"
          />
        </button>
      ))}
    </div>
  );
}

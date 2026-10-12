import {
  DataCard,
  DataTable,
  ErrorState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { MasterLoadingState } from '../../shell';
import { usePlatformOpsTabData } from '../usePlatformOps';
import { formatRelativeDe } from '../platform-ops.utils';
import { api } from '../../../lib/api';
import type { PlatformOpsDiS4StatusDto, PlatformOpsDiS4RuleHealthDto } from '../types';

function monitoringTone(health: PlatformOpsDiS4StatusDto['monitoringHealth']): StatusTone {
  switch (health) {
    case 'HEALTHY':
      return 'success';
    case 'WARNING':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'warning';
  }
}

function processingTone(state: PlatformOpsDiS4StatusDto['processingState']): StatusTone {
  if (state === 'ACTIVE') return 'success';
  if (state === 'DISABLED') return 'neutral';
  return 'warning';
}

export function DrivingIntelligenceS4DiagnosticsPanel() {
  const { t } = useLanguage();
  const { data, loading, error, refresh } = usePlatformOpsTabData<PlatformOpsDiS4StatusDto>(
    () => api.admin.platformOps.drivingIntelligenceS4(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) {
    return (
      <ErrorState
        title={t('master.platformOps.diS4.errorTitle')}
        error={error}
        onRetry={() => void refresh()}
      />
    );
  }
  if (!data) return null;

  const ruleColumns: DataTableColumn<PlatformOpsDiS4RuleHealthDto>[] = [
    {
      key: 'severity',
      header: t('master.platformOps.diS4.col.severity'),
      cell: (r) => (
        <StatusChip tone={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</StatusChip>
      ),
    },
    {
      key: 'name',
      header: t('master.platformOps.diS4.col.rule'),
      cell: (r) => <span className="font-mono text-xs">{r.alertname}</span>,
    },
    {
      key: 'state',
      header: t('master.platformOps.diS4.col.evaluation'),
      cell: (r) => (
        <StatusChip tone={r.evaluationState === 'firing' ? 'critical' : 'neutral'}>
          {r.evaluationState}
        </StatusChip>
      ),
    },
    {
      key: 'health',
      header: t('master.platformOps.diS4.col.health'),
      cell: (r) => (
        <StatusChip tone={r.health === 'ok' ? 'success' : r.health === 'err' ? 'critical' : 'warning'}>
          {r.health}
        </StatusChip>
      ),
    },
    {
      key: 'loaded',
      header: t('master.platformOps.diS4.col.prometheus'),
      cell: (r) => (r.loadedInPrometheus ? t('master.platformOps.diS4.col.loaded') : t('master.platformOps.diS4.col.missing')),
    },
  ];

  const alertColumns: DataTableColumn<PlatformOpsDiS4StatusDto['s4ActiveAlerts'][number]>[] = [
    {
      key: 'severity',
      header: t('master.platformOps.diS4.col.severity'),
      cell: (r) => (
        <StatusChip tone={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</StatusChip>
      ),
    },
    { key: 'name', header: t('master.platformOps.diS4.col.alert'), cell: (r) => r.alertname },
    { key: 'state', header: t('master.platformOps.diS4.col.status'), cell: (r) => r.state },
    { key: 'since', header: t('master.platformOps.diS4.col.since'), cell: (r) => formatRelativeDe(r.startsAt) },
    { key: 'summary', header: t('master.platformOps.diS4.col.summary'), cell: (r) => r.summary },
  ];

  const processingLabel =
    data.processingState === 'ACTIVE'
      ? t('master.platformOps.diS4.processing.active')
      : data.processingState === 'DISABLED'
        ? t('master.platformOps.diS4.processing.disabled')
        : t('master.platformOps.diS4.processing.unknown');

  const boolLabel = (value: boolean | null) => {
    if (value == null) return t('master.platformOps.diS4.metrics.na');
    return value ? t('master.platformOps.diS4.yes') : t('master.platformOps.diS4.no');
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('master.platformOps.diS4.title')}
        description={t('master.platformOps.diS4.description')}
      />

      <DataCard bodyClassName="p-4 flex flex-wrap gap-3 items-center">
        <StatusChip tone={processingTone(data.processingState)}>{processingLabel}</StatusChip>
        <StatusChip tone={monitoringTone(data.monitoringHealth)}>
          {t('master.platformOps.diS4.monitoring.label', { health: data.monitoringHealth })}
        </StatusChip>
        <StatusChip
          tone={
            data.globalKill.state === 'UNKNOWN' || data.globalKill.state === 'KILLED'
              ? 'warning'
              : 'success'
          }
        >
          {t('master.platformOps.diS4.globalKill.label', { state: data.globalKill.state })}
        </StatusChip>
        {!data.prometheusAvailable && (
          <StatusChip tone="warning">{t('master.platformOps.diS4.promUnavailable')}</StatusChip>
        )}
      </DataCard>

      {data.monitoringGaps.length > 0 && (
        <DataCard title={t('master.platformOps.diS4.gapsTitle')} bodyClassName="p-4 text-xs font-mono text-muted-foreground">
          {data.monitoringGaps.join(' · ')}
        </DataCard>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <DataCard title={t('master.platformOps.diS4.runtimeFlagsTitle')} bodyClassName="p-4 text-sm space-y-1">
          <div>{t('master.platformOps.diS4.flag.master')}: {data.runtimeFlags.masterEnabled ? t('master.platformOps.diS4.on') : t('master.platformOps.diS4.off')}</div>
          <div>{t('master.platformOps.diS4.flag.discovery')}: {data.runtimeFlags.discoveryEnabled ? t('master.platformOps.diS4.on') : t('master.platformOps.diS4.off')}</div>
          <div>{t('master.platformOps.diS4.flag.worker')}: {data.runtimeFlags.workerEnabled ? t('master.platformOps.diS4.on') : t('master.platformOps.diS4.off')}</div>
          <div>{t('master.platformOps.diS4.flag.position')}: {data.runtimeFlags.positionEnabled ? t('master.platformOps.diS4.on') : t('master.platformOps.diS4.off')}</div>
          <div>{t('master.platformOps.diS4.flag.r1')}: {data.runtimeFlags.r1Enabled ? t('master.platformOps.diS4.on') : t('master.platformOps.diS4.off')}</div>
          <div>{t('master.platformOps.diS4.flag.native')}: {data.runtimeFlags.nativeEnabled ? t('master.platformOps.diS4.on') : t('master.platformOps.diS4.off')}</div>
        </DataCard>

        <DataCard title={t('master.platformOps.diS4.cohortTitle')} bodyClassName="p-4 text-sm space-y-1">
          <div>{t('master.platformOps.diS4.cohort.vehicles', { count: data.cohort.authorizedVehicleCount })}</div>
          <div>{t('master.platformOps.diS4.cohort.orgs', { count: data.cohort.organizationAllowlistCount })}</div>
          {data.cohort.vehicleAllowlistIds.length > 0 && (
            <div className="font-mono text-xs break-all">{data.cohort.vehicleAllowlistIds.join(', ')}</div>
          )}
        </DataCard>

        <DataCard title={t('master.platformOps.diS4.metricsTitle')} bodyClassName="p-4 text-sm space-y-1">
          <div>
            {t('master.platformOps.diS4.metrics.lastSuccess', {
              value: data.metricsRefresh.lastSuccessAt
                ? `${formatRelativeDe(data.metricsRefresh.lastSuccessAt)} (${data.metricsRefresh.ageSeconds ?? '?' }s)`
                : t('master.platformOps.diS4.metrics.na'),
            })}
          </div>
          <div>{t('master.platformOps.diS4.metrics.staleAfter', { seconds: data.metricsRefresh.staleAfterSeconds })}</div>
          <div>
            {t('master.platformOps.diS4.metrics.fresh', {
              value:
                data.metricsRefresh.metricsFresh == null
                  ? t('master.platformOps.diS4.metrics.freshUnknown')
                  : data.metricsRefresh.metricsFresh
                    ? t('master.platformOps.diS4.metrics.freshYes')
                    : t('master.platformOps.diS4.metrics.freshNo'),
            })}
          </div>
          <div>
            {t('master.platformOps.diS4.metrics.refreshError', {
              value: boolLabel(data.metricsRefresh.refreshError),
            })}
          </div>
        </DataCard>

        <DataCard title={t('master.platformOps.diS4.schedulerTitle')} bodyClassName="p-4 text-sm space-y-1">
          <div>{t('master.platformOps.diS4.scheduler.leader', { count: data.schedulerLeader.leaderCount ?? t('master.platformOps.diS4.metrics.na') })}</div>
          <div>{t('master.platformOps.diS4.scheduler.refreshLeader', { count: data.schedulerLeader.operationalRefreshLeaderCount ?? t('master.platformOps.diS4.metrics.na') })}</div>
          {data.schedulerLeader.replicas.map((r) => (
            <div key={r.replica} className="font-mono text-xs">
              {t('master.platformOps.diS4.scheduler.replicaLine', {
                replica: r.replica,
                sched: r.schedulerLeader ? t('master.platformOps.diS4.scheduler.leaderRole') : t('master.platformOps.diS4.scheduler.followerRole'),
                refresh: r.operationalRefreshLeader ? t('master.platformOps.diS4.scheduler.leaderRole') : t('master.platformOps.diS4.scheduler.followerRole'),
              })}
            </div>
          ))}
        </DataCard>
      </div>

      <DataCard title={t('master.platformOps.diS4.dimoTitle')} bodyClassName="p-4">
        {data.dimoBudget.replicas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('master.platformOps.diS4.dimo.noReplicas')}</p>
        ) : (
          <ul className="text-sm space-y-1">
            {data.dimoBudget.replicas.map((r) => (
              <li key={r.replica}>
                <span className="font-mono">{r.replica}</span>: enabled=
                {r.budgetEnabled == null ? '?' : r.budgetEnabled ? '1' : '0'}, cooldown=
                {r.cooldownActive == null ? '?' : r.cooldownActive ? '1' : '0'}, redis_errors=
                {r.redisErrorsTotal ?? '?'}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          {t('master.platformOps.diS4.dimo.allEnabled', {
            value:
              data.dimoBudget.allReplicasBudgetEnabled == null
                ? t('master.platformOps.diS4.unknown')
                : data.dimoBudget.allReplicasBudgetEnabled
                  ? t('master.platformOps.diS4.yes')
                  : t('master.platformOps.diS4.no'),
          })}
        </p>
      </DataCard>

      <DataCard
        title={t('master.platformOps.diS4.rulesTitle', {
          loaded: data.prometheusRules.loadedRuleCount,
          expected: data.prometheusRules.expectedRuleCount,
        })}
      >
        <DataTable
          columns={ruleColumns}
          rows={data.prometheusRules.rules}
          getRowKey={(r) => r.alertname}
          card={false}
        />
      </DataCard>

      <DataCard title={t('master.platformOps.diS4.alertsTitle')}>
        {data.s4ActiveAlerts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('master.platformOps.diS4.alerts.empty')}</p>
        ) : (
          <DataTable
            columns={alertColumns}
            rows={data.s4ActiveAlerts}
            getRowKey={(r) => `${r.alertname}-${r.startsAt}`}
            card={false}
          />
        )}
      </DataCard>

      <DataCard title={t('master.platformOps.diS4.iamTitle')} bodyClassName="p-4 text-sm space-y-2">
        <p className="text-xs text-muted-foreground">{t('master.platformOps.diS4.iam.note')}</p>
        <StatusChip tone={data.iamSeedAdminFinding.representedInPlatformAlerts ? 'critical' : 'success'}>
          {t('master.platformOps.diS4.iam.inAlerts', {
            status: data.iamSeedAdminFinding.representedInPlatformAlerts
              ? t('master.platformOps.diS4.iam.visible')
              : t('master.platformOps.diS4.iam.notActive'),
          })}
        </StatusChip>
        <p><strong>{t('master.platformOps.diS4.iam.causeLabel')}</strong> {data.iamSeedAdminFinding.cause}</p>
        <p><strong>{t('master.platformOps.diS4.iam.impactLabel')}</strong> {data.iamSeedAdminFinding.impact}</p>
        <p><strong>{t('master.platformOps.diS4.iam.remediationLabel')}</strong> {data.iamSeedAdminFinding.remediation}</p>
      </DataCard>
    </div>
  );
}

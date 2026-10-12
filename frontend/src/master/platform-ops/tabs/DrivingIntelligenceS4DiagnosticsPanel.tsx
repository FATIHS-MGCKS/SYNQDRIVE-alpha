import {
  DataCard,
  DataTable,
  ErrorState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterLoadingState } from '../../shell';
import { usePlatformOpsTabData } from '../usePlatformOps';
import { formatRelativeDe } from '../platform-ops.utils';
import { api } from '../../../lib/api';
import type { PlatformOpsDiS4StatusDto, PlatformOpsDiS4RuleHealthDto } from '../types';

function monitoringTone(health: PlatformOpsDiS4StatusDto['monitoringHealth']) {
  switch (health) {
    case 'HEALTHY':
      return 'healthy';
    case 'WARNING':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'warning';
  }
}

function processingTone(state: PlatformOpsDiS4StatusDto['processingState']) {
  if (state === 'ACTIVE') return 'healthy';
  if (state === 'DISABLED') return 'neutral';
  return 'warning';
}

export function DrivingIntelligenceS4DiagnosticsPanel() {
  const { data, loading, error, refresh } = usePlatformOpsTabData<PlatformOpsDiS4StatusDto>(
    () => api.admin.platformOps.drivingIntelligenceS4(),
    [],
  );

  if (loading && !data) return <MasterLoadingState variant="table" />;
  if (error) {
    return (
      <ErrorState title="Driving Intelligence S4" error={error} onRetry={() => void refresh()} />
    );
  }
  if (!data) return null;

  const ruleColumns: DataTableColumn<PlatformOpsDiS4RuleHealthDto>[] = [
    {
      key: 'severity',
      header: 'Schwere',
      cell: (r) => (
        <StatusChip tone={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</StatusChip>
      ),
    },
    { key: 'name', header: 'Regel', cell: (r) => <span className="font-mono text-xs">{r.alertname}</span> },
    {
      key: 'state',
      header: 'Evaluation',
      cell: (r) => (
        <StatusChip tone={r.evaluationState === 'firing' ? 'critical' : 'neutral'}>
          {r.evaluationState}
        </StatusChip>
      ),
    },
    {
      key: 'health',
      header: 'Health',
      cell: (r) => (
        <StatusChip tone={r.health === 'ok' ? 'healthy' : r.health === 'err' ? 'critical' : 'warning'}>
          {r.health}
        </StatusChip>
      ),
    },
    {
      key: 'loaded',
      header: 'Prometheus',
      cell: (r) => (r.loadedInPrometheus ? 'geladen' : 'fehlt'),
    },
  ];

  const alertColumns: DataTableColumn<PlatformOpsDiS4StatusDto['s4ActiveAlerts'][number]>[] = [
    {
      key: 'severity',
      header: 'Schwere',
      cell: (r) => (
        <StatusChip tone={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</StatusChip>
      ),
    },
    { key: 'name', header: 'Alarm', cell: (r) => r.alertname },
    { key: 'state', header: 'Status', cell: (r) => r.state },
    { key: 'since', header: 'Seit', cell: (r) => formatRelativeDe(r.startsAt) },
    { key: 'summary', header: 'Zusammenfassung', cell: (r) => r.summary },
  ];

  const processingLabel =
    data.processingState === 'ACTIVE'
      ? 'S4-Verarbeitung: ACTIVE (Shadow engaged)'
      : data.processingState === 'DISABLED'
        ? 'S4-Verarbeitung: DISABLED (GLOBAL_KILL / inaktiv)'
        : 'S4-Verarbeitung: UNKNOWN';

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Driving Intelligence S4"
        description="Operatives S4-Monitoring (Prometheus, Alertmanager, DB-Kill, DIMO-Budget, Scheduler-Leader)."
      />

      <DataCard bodyClassName="p-4 flex flex-wrap gap-3 items-center">
        <StatusChip tone={processingTone(data.processingState)}>{processingLabel}</StatusChip>
        <StatusChip tone={monitoringTone(data.monitoringHealth)}>
          Monitoring: {data.monitoringHealth}
        </StatusChip>
        <StatusChip
          tone={
            data.globalKill.state === 'UNKNOWN'
              ? 'warning'
              : data.globalKill.state === 'KILLED'
                ? 'warning'
                : 'healthy'
          }
        >
          GLOBAL_KILL: {data.globalKill.state}
        </StatusChip>
        {!data.prometheusAvailable && (
          <StatusChip tone="warning">Prometheus nicht verfügbar — Monitoring nie HEALTHY</StatusChip>
        )}
      </DataCard>

      {data.monitoringGaps.length > 0 && (
        <DataCard title="Monitoring-Lücken" bodyClassName="p-4 text-xs font-mono text-muted-foreground">
          {data.monitoringGaps.join(' · ')}
        </DataCard>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <DataCard title="Laufzeit-Flags" bodyClassName="p-4 text-sm space-y-1">
          <div>Master: {data.runtimeFlags.masterEnabled ? 'an' : 'aus'}</div>
          <div>Discovery: {data.runtimeFlags.discoveryEnabled ? 'an' : 'aus'}</div>
          <div>Worker: {data.runtimeFlags.workerEnabled ? 'an' : 'aus'}</div>
          <div>Position: {data.runtimeFlags.positionEnabled ? 'an' : 'aus'}</div>
          <div>R1: {data.runtimeFlags.r1Enabled ? 'an' : 'aus'}</div>
          <div>Native: {data.runtimeFlags.nativeEnabled ? 'an' : 'aus'}</div>
        </DataCard>

        <DataCard title="Fünf-Fahrzeug-Kohorte" bodyClassName="p-4 text-sm space-y-1">
          <div>Autorisierte Fahrzeuge: {data.cohort.authorizedVehicleCount}</div>
          <div>Org-Allowlist: {data.cohort.organizationAllowlistCount}</div>
          {data.cohort.vehicleAllowlistIds.length > 0 && (
            <div className="font-mono text-xs break-all">{data.cohort.vehicleAllowlistIds.join(', ')}</div>
          )}
        </DataCard>

        <DataCard title="Metriken-Refresh" bodyClassName="p-4 text-sm space-y-1">
          <div>
            Letzter Erfolg:{' '}
            {data.metricsRefresh.lastSuccessAt
              ? `${formatRelativeDe(data.metricsRefresh.lastSuccessAt)} (${data.metricsRefresh.ageSeconds ?? '?'}s)`
              : '—'}
          </div>
          <div>Stale nach: {data.metricsRefresh.staleAfterSeconds}s</div>
          <div>
            Frisch:{' '}
            {data.metricsRefresh.metricsFresh == null
              ? 'unbekannt'
              : data.metricsRefresh.metricsFresh
                ? 'ja'
                : 'nein (stale/fehler)'}
          </div>
          <div>Refresh-Fehler: {data.metricsRefresh.refreshError == null ? '—' : data.metricsRefresh.refreshError ? 'ja' : 'nein'}</div>
        </DataCard>

        <DataCard title="Scheduler / Leader" bodyClassName="p-4 text-sm space-y-1">
          <div>Scheduler-Leader: {data.schedulerLeader.leaderCount ?? '—'} (erwartet 1)</div>
          <div>Operational-Refresh-Leader: {data.schedulerLeader.operationalRefreshLeaderCount ?? '—'}</div>
          {data.schedulerLeader.replicas.map((r) => (
            <div key={r.replica} className="font-mono text-xs">
              {r.replica}: sched={r.schedulerLeader ? 'leader' : 'follower'} / refresh=
              {r.operationalRefreshLeader ? 'leader' : 'follower'}
            </div>
          ))}
        </DataCard>
      </div>

      <DataCard title="DIMO Global Budget (Replikas)" bodyClassName="p-4">
        {data.dimoBudget.replicas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Replika-Metriken von Prometheus.</p>
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
          Alle Replikas enabled:{' '}
          {data.dimoBudget.allReplicasBudgetEnabled == null
            ? 'unbekannt'
            : data.dimoBudget.allReplicasBudgetEnabled
              ? 'ja'
              : 'nein'}
        </p>
      </DataCard>

      <DataCard title={`Prometheus-Regeln (${data.prometheusRules.loadedRuleCount}/${data.prometheusRules.expectedRuleCount})`}>
        <DataTable
          columns={ruleColumns}
          rows={data.prometheusRules.rules}
          getRowKey={(r) => r.alertname}
          card={false}
        />
      </DataCard>

      <DataCard title="Aktive S4-Alarme (Alertmanager)">
        {data.s4ActiveAlerts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Keine aktiven DiV0S4-Alarme.</p>
        ) : (
          <DataTable
            columns={alertColumns}
            rows={data.s4ActiveAlerts}
            getRowKey={(r) => `${r.alertname}-${r.startsAt}`}
            card={false}
          />
        )}
      </DataCard>

      <DataCard title="IAM: IamSeedAdminEnabledInProduction (nicht Teil von S4-Monitoring-Health)" bodyClassName="p-4 text-sm space-y-2">
        <p className="text-xs text-muted-foreground">
          Sichtbar unter Platform Ops → Alarme. Beeinflusst nicht `monitoringHealth` (nur DiV0S4*-Alarme).
        </p>
        <StatusChip tone={data.iamSeedAdminFinding.representedInPlatformAlerts ? 'critical' : 'healthy'}>
          In Platform-Alarmen: {data.iamSeedAdminFinding.representedInPlatformAlerts ? 'sichtbar' : 'nicht aktiv'}
        </StatusChip>
        <p><strong>Ursache:</strong> {data.iamSeedAdminFinding.cause}</p>
        <p><strong>Impact:</strong> {data.iamSeedAdminFinding.impact}</p>
        <p><strong>Remediation:</strong> {data.iamSeedAdminFinding.remediation}</p>
      </DataCard>
    </div>
  );
}

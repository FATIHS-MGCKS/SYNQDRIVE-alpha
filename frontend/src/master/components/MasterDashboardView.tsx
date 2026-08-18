import {
  Activity,
  ArrowUpRight,
  Building2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  RefreshCw,
  Server,
  Shield,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  DataCard,
  EmptyState,
  MetricCard,
  SectionHeader,
  StatusChip,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import {
  MasterPageHeader,
  MasterPageSection,
  MasterStaleDataHint,
  MasterLoadingState,
  MasterErrorState,
} from '../shell';
import {
  DOMAIN_LABELS,
  FRESHNESS_LABELS,
  attentionReasonLabel,
  domainLevelTone,
  formatDurationSince,
  formatGeneratedAt,
  formatRelativeDe,
  overallStatusLabel,
  overallStatusTone,
} from '../dashboard/dashboard.utils';
import { applyMasterDrilldownUrl } from '../navigation/master-drilldown';
import type { MasterView } from '../navigation/master-nav.types';
import { useMasterDashboardOperational } from '../dashboard/useMasterDashboardOperational';
import type {
  DashboardDomainStatusDto,
  DashboardIncidentDto,
  DashboardSupportSnapshotDto,
  MasterDashboardOperationalDto,
} from '../dashboard/types';

interface MasterDashboardViewProps {
  onViewChange?: (view: MasterView, settingsTab?: string) => void;
}

function navigate(
  onViewChange: MasterDashboardViewProps['onViewChange'],
  view: string,
  params?: Record<string, string>,
) {
  if (!onViewChange) return;
  const resolvedView = applyMasterDrilldownUrl(view, params);
  onViewChange(resolvedView);
}

function StatusHero({
  data,
  isStale,
  onRefresh,
  onNavigate,
}: {
  data: MasterDashboardOperationalDto;
  isStale: boolean;
  onRefresh: () => void;
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  const { incidentSummary, domainStatus, overallStatus } = data;
  const hasProblems = incidentSummary.count > 0;

  return (
    <section
      aria-labelledby="dashboard-status-hero"
      className={`rounded-2xl border bg-muted/20 p-4 sm:p-5 ${
        overallStatus === 'critical'
          ? 'border-[color:var(--status-critical)]/40'
          : overallStatus === 'warning'
            ? 'border-[color:var(--status-watch)]/30'
            : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="dashboard-status-hero" className="sr-only">
              Plattformstatus
            </h2>
            <StatusChip tone={overallStatusTone(overallStatus)} dot>
              Plattform: {overallStatusLabel(overallStatus)}
            </StatusChip>
            <span className="text-xs text-muted-foreground">
              Stand: {formatGeneratedAt(data.generatedAt)}
            </span>
            {isStale && (
              <MasterStaleDataHint label="Daten möglicherweise veraltet." onRefresh={onRefresh} />
            )}
          </div>

          {hasProblems ? (
            <p className="text-sm text-foreground">
              <span className="font-semibold">{incidentSummary.count} aktive Probleme</span>
              {incidentSummary.highestSeverity && (
                <>
                  {' '}
                  · Höchste Priorität:{' '}
                  <span className="capitalize">{incidentSummary.highestSeverity}</span>
                </>
              )}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Keine aktiven operativen Vorfälle.</p>
          )}

          {incidentSummary.affectedOrganizationCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {incidentSummary.affectedOrganizationCount} Organisation(en) betroffen
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="sq-btn-secondary flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
          aria-label="Dashboard aktualisieren"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Aktualisieren
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="list" aria-label="Domänenstatus">
        {(Object.keys(domainStatus) as Array<keyof DashboardDomainStatusDto>).map((key) => (
          <button
            key={String(key)}
            type="button"
            role="listitem"
            onClick={() => {
              if (key === 'billing') onNavigate('billing');
              else if (key === 'dimo') onNavigate('vehicles', { cvSection: 'overview' });
              else if (key === 'worker' || key === 'runtime') onNavigate('platform-ops', { platformOps: 'processing' });
              else if (key === 'support') onNavigate('support');
              else if (key === 'backup') onNavigate('platform-ops', { platformOps: 'resilience' });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-muted/60"
          >
            <StatusChip tone={domainLevelTone(domainStatus[key])} className="!px-1 !py-0 !text-[9px]">
              ●
            </StatusChip>
            {DOMAIN_LABELS[key]}
          </button>
        ))}
      </div>
    </section>
  );
}

function IncidentList({
  incidents,
  onNavigate,
}: {
  incidents: DashboardIncidentDto[];
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  if (incidents.length === 0) {
    return (
      <MasterPageSection title="Aktive Vorfälle">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Shield className="h-4 w-4 text-[color:var(--status-positive)]" aria-hidden />
          Keine aktiven Vorfälle — letzte Prüfung {formatRelativeDe(new Date().toISOString())}.
        </p>
      </MasterPageSection>
    );
  }

  return (
    <MasterPageSection title="Aktive Vorfälle">
      <ul className="space-y-2" aria-label="Aktive operative Vorfälle">
        {incidents.slice(0, 5).map((incident) => {
          const tone: StatusTone =
            incident.severity === 'critical' ? 'critical' : incident.severity === 'warning' ? 'warning' : 'info';
          return (
            <li
              key={incident.id}
              className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border bg-muted/20 p-3 ${
                incident.severity === 'critical' ? 'border-l-4 border-l-[color:var(--status-critical)]' : ''
              }`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip tone={tone}>{incident.severity}</StatusChip>
                  <span className="text-xs font-medium text-muted-foreground">{incident.affectedComponent}</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{incident.summary}</p>
                <p className="text-xs text-muted-foreground">
                  Seit {formatDurationSince(incident.firstSeen)} · {incident.impact}
                </p>
              </div>
              <button
                type="button"
                className="sq-btn-secondary shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                onClick={() => onNavigate(incident.drilldownView, incident.drilldownParams)}
              >
                Untersuchen
              </button>
            </li>
          );
        })}
      </ul>
      {incidents.length > 5 && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-[color:var(--brand)] hover:underline"
          onClick={() => onNavigate('platform-ops', { platformOps: 'incidents' })}
        >
          Alle anzeigen ({incidents.length})
        </button>
      )}
    </MasterPageSection>
  );
}

function PlatformStatusCompact({
  data,
  onNavigate,
}: {
  data: MasterDashboardOperationalDto;
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const readiness = data.platformHealth?.readiness as
    | { status?: string; checks?: Record<string, { status: string }> }
    | undefined;
  const checks = readiness?.checks ?? {};
  const monitoring = data.platformHealth?.monitoring as { errorRatePercent?: number; unhealthyWorkers?: number } | undefined;
  const queues = (data.platformHealth?.queues as Array<{ status: string; failed: number }>) ?? [];
  const failedJobs = queues.reduce((s, q) => s + (q.failed ?? 0), 0);
  const queueCritical = queues.filter((q) => q.status === 'critical').length;

  const groups = [
    {
      id: 'core',
      label: 'Core Platform',
      summary:
        readiness?.status === 'ok'
          ? 'Bereit'
          : readiness?.status === 'degraded'
            ? 'Degradiert'
            : 'Unbekannt',
      tone: readiness?.status === 'ok' ? 'success' : 'critical',
      details: Object.entries(checks).map(([name, check]) => (
        <div key={name} className="flex justify-between py-1 text-xs">
          <span className="capitalize">{name}</span>
          <StatusChip tone={check.status === 'ok' ? 'success' : 'critical'}>{check.status}</StatusChip>
        </div>
      )),
    },
    {
      id: 'processing',
      label: 'Processing',
      summary: queueCritical > 0 ? `${queueCritical} Queue(s) kritisch` : `${failedJobs} fehlgeschlagen`,
      tone: queueCritical > 0 || (monitoring?.unhealthyWorkers ?? 0) > 0 ? 'warning' : 'success',
      details: (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Fehlerrate Polls: {monitoring?.errorRatePercent ?? '—'}%</p>
          <p>Unhealthy Worker: {monitoring?.unhealthyWorkers ?? 0}</p>
          <p>Fehlgeschlagene Jobs: {failedJobs}</p>
        </div>
      ),
    },
    {
      id: 'external',
      label: 'External Services',
      summary: `DIMO · Stripe · Notifications`,
      tone: data.domainStatus.dimo === 'critical' || data.domainStatus.billing === 'critical' ? 'warning' : 'success',
      details: (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            DIMO: {data.connectivity?.platform.dimoConnected ?? '—'} /{' '}
            {data.connectivity?.platform.dimoTotal ?? '—'} verbunden
          </p>
          <p>Stripe Webhook-Fehler: {data.billing?.stripeSyncErrors ?? 0}</p>
          <p>Notification DLQ: {data.billing?.failedEmailDeliveries ?? 0}</p>
        </div>
      ),
    },
    {
      id: 'resilience',
      label: 'Resilience',
      summary:
        data.resilience.overall === 'unknown'
          ? 'Backup nicht gemeldet'
          : data.resilience.overall === 'healthy'
            ? 'Backups OK'
            : data.resilience.overall,
      tone:
        data.resilience.overall === 'critical'
          ? 'critical'
          : data.resilience.overall === 'warning'
            ? 'warning'
            : data.resilience.overall === 'healthy'
              ? 'success'
              : 'neutral',
      details: (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>PostgreSQL: {data.resilience.postgres.status}</p>
          <p>Offsite: {data.resilience.offsite.status}</p>
          <p>Quelle: {data.resilience.source}</p>
        </div>
      ),
    },
  ] as const;

  return (
    <MasterPageSection
      title="Plattformstatus"
      actions={
        <button
          type="button"
          className="text-xs font-semibold text-[color:var(--brand)] hover:underline"
          onClick={() => onNavigate('platform-ops', { platformOps: 'overview' })}
        >
          Details <ArrowUpRight className="inline h-3 w-3" />
        </button>
      }
    >
      <DataCard bodyClassName="divide-y divide-border/50 p-0">
        {groups.map((group) => (
          <div key={group.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30"
              onClick={() => setExpanded(expanded === group.id ? null : group.id)}
              aria-expanded={expanded === group.id}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {expanded === group.id ? (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                )}
                {group.label}
              </span>
              <StatusChip tone={group.tone as StatusTone}>{group.summary}</StatusChip>
            </button>
            {expanded === group.id && <div className="px-4 pb-3">{group.details}</div>}
          </div>
        ))}
      </DataCard>
      {data.moduleErrors.platformHealth && (
        <p className="mt-2 text-xs text-[color:var(--status-critical)]" role="alert">
          Plattformstatus teilweise nicht verfügbar: {data.moduleErrors.platformHealth}
        </p>
      )}
    </MasterPageSection>
  );
}

function OrgAttentionList({
  items,
  onNavigate,
}: {
  items: MasterDashboardOperationalDto['organizationsAttention'];
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  if (items.length === 0) return null;

  return (
    <MasterPageSection title="Organisationen mit Handlungsbedarf">
      <ul className="space-y-2">
        {items.map((org: MasterDashboardOperationalDto['organizationsAttention'][number]) => (
          <li key={org.organizationId}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3 text-left hover:bg-muted/40"
              onClick={() => onNavigate(org.drilldownView, org.drilldownParams)}
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{org.organizationName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {org.reasons.map(attentionReasonLabel).join(' · ')}
                </p>
              </div>
              <StatusChip tone={org.severity === 'critical' ? 'critical' : 'warning'}>
                {org.severity}
              </StatusChip>
            </button>
          </li>
        ))}
      </ul>
    </MasterPageSection>
  );
}

function DomainSummaries({
  data,
  onNavigate,
}: {
  data: MasterDashboardOperationalDto;
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  const billing = data.billing;
  const connectivity = data.connectivity;
  const queues = (data.platformHealth?.queues as Array<{ failed: number; waiting: number; status: string }>) ?? [];
  const failedJobs = queues.reduce((s, q) => s + q.failed, 0);
  const waitingJobs = queues.reduce((s, q) => s + q.waiting, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <DataCard
        title="Abrechnung"
        description="Kanonische Billing-Signale"
        actions={
          <button type="button" className="text-xs text-[color:var(--brand)] hover:underline" onClick={() => onNavigate('billing')}>
            Öffnen
          </button>
        }
      >
        {billing ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div><dt className="text-muted-foreground">Aktiv</dt><dd className="font-semibold tabular-nums">{billing.activeSubscriptions}</dd></div>
            <div><dt className="text-muted-foreground">Trial</dt><dd className="font-semibold tabular-nums">{billing.trialingSubscriptions}</dd></div>
            <div><dt className="text-muted-foreground">Past Due</dt><dd className={`font-semibold tabular-nums ${billing.pastDueSubscriptions > 0 ? 'text-[color:var(--status-watch)]' : ''}`}>{billing.pastDueSubscriptions}</dd></div>
            <div><dt className="text-muted-foreground">Abgleich</dt><dd className={`font-semibold tabular-nums ${(billing.reconciliationDrifts ?? 0) > 0 ? 'text-[color:var(--status-critical)]' : ''}`}>{billing.reconciliationDrifts ?? 0}</dd></div>
            <div><dt className="text-muted-foreground">Webhooks</dt><dd className="font-semibold tabular-nums">{billing.stripeSyncErrors}</dd></div>
            <div><dt className="text-muted-foreground">Fehlzahlungen</dt><dd className="font-semibold tabular-nums">{billing.failedPayments ?? 0}</dd></div>
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">Billing-Daten nicht verfügbar.</p>
        )}
      </DataCard>

      <DataCard
        title="Fahrzeug-Konnektivität"
        description="Telemetrie vs. Plattform"
        actions={
          <button type="button" className="text-xs text-[color:var(--brand)] hover:underline" onClick={() => onNavigate('vehicles', { cvSection: 'overview' })}>
            Öffnen
          </button>
        }
      >
        {connectivity ? (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">
              Plattform: Token {connectivity.platform.tokenHealthStatus} · Poll-Fehler{' '}
              {connectivity.platform.pollErrorRatePercent ?? '—'}%
            </p>
            <p className="font-medium">
              {Object.entries(connectivity.freshness)
                .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
                .map(([k, v]) => `${FRESHNESS_LABELS[k] ?? k} ${v}`)
                .join(' · ') || 'Keine DIMO-Fahrzeuge'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Konnektivitätsdaten nicht verfügbar.</p>
        )}
      </DataCard>

      <DataCard
        title="Worker & Queues"
        description="Abweichungen priorisiert"
        actions={
          <button type="button" className="text-xs text-[color:var(--brand)] hover:underline" onClick={() => onNavigate('platform-ops', { platformOps: 'processing', platformOpsTab: 'workers' })}>
            Öffnen
          </button>
        }
      >
        {failedJobs > 0 || waitingJobs > 100 ? (
          <p className="text-sm font-semibold text-[color:var(--status-critical)]">
            {failedJobs} fehlgeschlagen · {waitingJobs} wartend
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Worker betriebsbereit · geringe Backlogs</p>
        )}
      </DataCard>

      <DataCard title="Backup & Recovery" description="Resilience">
        <div className="text-xs space-y-1">
          <p>
            Gesamt:{' '}
            <StatusChip tone={data.resilience.overall === 'healthy' ? 'success' : data.resilience.overall === 'unknown' ? 'neutral' : 'warning'}>
              {data.resilience.overall}
            </StatusChip>
          </p>
          <p className="text-muted-foreground">PostgreSQL: {data.resilience.postgres.status}</p>
          {data.resilience.postgres.lastSuccessAt && (
            <p className="text-muted-foreground">Letztes OK: {formatRelativeDe(data.resilience.postgres.lastSuccessAt)}</p>
          )}
          {data.resilience.source === 'none' && (
            <p className="text-muted-foreground">Status nicht gemeldet — kein Backup-Observer konfiguriert.</p>
          )}
        </div>
      </DataCard>
    </div>
  );
}

function SupportSection({
  support,
  onNavigate,
}: {
  support: NonNullable<MasterDashboardOperationalDto['support']>;
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  return (
    <MasterPageSection
      title="Offener Support"
      actions={
        <button type="button" className="text-xs font-semibold text-[color:var(--brand)]" onClick={() => onNavigate('support')}>
          Inbox öffnen
        </button>
      }
    >
      <p className="text-sm text-muted-foreground mb-3">
        {support.openTickets} offene Tickets
        {support.criticalOpen > 0 ? ` · ${support.criticalOpen} kritisch` : ''}
      </p>
      <ul className="space-y-2">
        {support.newest.map((t: DashboardSupportSnapshotDto['newest'][number]) => (
          <li key={t.id}>
            <button
              type="button"
              className="w-full rounded-xl border border-border bg-muted/20 p-3 text-left hover:bg-muted/40"
              onClick={() => onNavigate('support')}
            >
              <p className="text-xs font-semibold">#{t.ticketNumber} {t.subject}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelativeDe(t.lastActivityAt ?? t.createdAt)}</p>
            </button>
          </li>
        ))}
      </ul>
    </MasterPageSection>
  );
}

function ActivitySection({
  activity,
  onNavigate,
}: {
  activity: MasterDashboardOperationalDto['activity'];
  onNavigate: (view: string, params?: Record<string, string>) => void;
}) {
  return (
    <MasterPageSection
      title="Plattform-Aktivität"
      actions={
        <button type="button" className="text-xs font-semibold text-[color:var(--brand)]" onClick={() => onNavigate('security-access', { securityAccess: 'audit' })}>
          Alle anzeigen
        </button>
      }
    >
      {activity.length === 0 ? (
        <EmptyState compact title="Keine relevanten Ereignisse" />
      ) : (
        <ul className="space-y-2">
          {activity.map((item: MasterDashboardOperationalDto['activity'][number]) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full flex gap-3 rounded-xl border border-border bg-muted/20 p-3 text-left hover:bg-muted/40"
                onClick={() => item.drilldownView && onNavigate(item.drilldownView, item.drilldownParams)}
              >
                <Activity className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug">{item.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatRelativeDe(item.createdAt)}
                    {item.organizationName ? ` · ${item.organizationName}` : ''}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </MasterPageSection>
  );
}

function BusinessContextSection({ data }: { data: MasterDashboardOperationalDto['businessContext'] }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  return (
    <MasterPageSection>
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <SectionHeader title="Geschäftskontext" className="mb-0" />
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Aktive Organisationen" value={String(data.activeOrganizations)} icon={<Building2 className="h-4 w-4" />} valueSize="compact" />
          <MetricCard label="Nutzer" value={String(data.totalUsers)} icon={<Users className="h-4 w-4" />} valueSize="compact" />
          <MetricCard label="Interessenten" value={String(data.totalProspects)} icon={<Users className="h-4 w-4" />} valueSize="compact" />
          <MetricCard
            label="MRR"
            value={data.mrrIncomplete ? '—' : data.mrr != null ? `€${Math.round(data.mrr)}` : '—'}
            hint={data.mrrIncomplete ? 'Unvollständig' : undefined}
            icon={<CreditCard className="h-4 w-4" />}
            valueSize="compact"
          />
        </div>
      )}
    </MasterPageSection>
  );
}

export function MasterDashboardView({ onViewChange }: MasterDashboardViewProps) {
  const { data, loading, error, isStale, refresh } = useMasterDashboardOperational();

  const go = (view: string, params?: Record<string, string>) => navigate(onViewChange, view, params);

  if (loading && !data) {
    return (
      <>
        <MasterPageHeader title="Plattform-Übersicht" description="Operativer Überblick" />
        <MasterLoadingState variant="card" count={4} />
      </>
    );
  }

  if (error && !data) {
    return (
      <MasterErrorState title="Plattform-Übersicht" error={error} onRetry={() => void refresh()} />
    );
  }

  if (!data) return null;

  return (
    <>
      <MasterPageHeader
        title="Plattform-Übersicht"
        description="Operativer Überblick — Was ist wichtig und wohin als Nächstes?"
        meta={
          <span className="text-xs text-muted-foreground">
            Stand: {formatGeneratedAt(data.generatedAt)}
            {isStale ? ' · möglicherweise veraltet' : ''}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="sq-btn-secondary rounded-xl px-4 py-2 text-sm"
              onClick={() => go('platform-ops')}
            >
              <Server className="inline h-4 w-4 mr-1.5" aria-hidden />
              Plattformstatus
            </button>
          </div>
        }
      />

      <StatusHero data={data} isStale={isStale} onRefresh={() => void refresh()} onNavigate={go} />
      <IncidentList incidents={data.incidents} onNavigate={go} />
      <PlatformStatusCompact data={data} onNavigate={go} />
      <OrgAttentionList items={data.organizationsAttention} onNavigate={go} />
      <DomainSummaries data={data} onNavigate={go} />
      {data.support && data.support.openTickets > 0 && (
        <SupportSection support={data.support} onNavigate={go} />
      )}
      <ActivitySection activity={data.activity} onNavigate={go} />
      <BusinessContextSection data={data.businessContext} />
    </>
  );
}

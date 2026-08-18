import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingAdminService } from '../billing/billing-admin.service';
import { PlatformAdminService } from './platform-admin.service';
import {
  buildDashboardIncidents,
  computeDomainStatus,
  PlatformConnectivitySummaryService,
  PlatformResilienceStatusService,
} from './platform-dashboard.service';
import type { DashboardIncidentDto } from './platform-dashboard.types';
import { PlatformOpsAlertmanagerService } from './platform-ops-alertmanager.service';
import { PlatformOpsInfrastructureService } from './platform-ops-infrastructure.service';
import type {
  PlatformOpsAlertGroupDto,
  PlatformOpsAlertsDto,
  PlatformOpsIncidentDto,
  PlatformOpsIncidentListDto,
  PlatformOpsOverviewDto,
  PlatformOpsProviderLayerDto,
  PlatformOpsQueuesDto,
  PlatformOpsResilienceDto,
  PlatformOpsSchedulerDto,
  PlatformOpsSchedulersDto,
  PlatformOpsServiceDetailDto,
  PlatformOpsServiceGroup,
  PlatformOpsServicesDto,
  PlatformOpsServiceSummaryDto,
  PlatformOpsSignalDto,
  PlatformOpsState,
  PlatformOpsToolsDto,
  PlatformOpsWorkerDto,
  PlatformOpsWorkersDto,
} from './platform-ops.types';

const STALE_MS = 5 * 60 * 1000;

const RUNBOOK_URLS: Record<string, string> = {
  postgresql: 'docs/remediation/alertmanager.md',
  redis: 'docs/remediation/alertmanager.md',
  clickhouse: 'docs/remediation/clickhouse-remediation.md',
  bullmq: 'docs/remediation/alertmanager.md',
  backup: 'docs/remediation/disaster-recovery-production-readiness.md',
  dimo: 'docs/ui/master-admin-canonical-connected-vehicles-dimo-blueprint.md',
  stripe: 'docs/ui/master-admin-canonical-billing-blueprint.md',
};

@Injectable()
export class PlatformOpsService {
  constructor(
    private readonly platformAdmin: PlatformAdminService,
    private readonly billingAdmin: BillingAdminService,
    private readonly resilienceStatus: PlatformResilienceStatusService,
    private readonly connectivitySummary: PlatformConnectivitySummaryService,
    private readonly alertmanager: PlatformOpsAlertmanagerService,
    private readonly infrastructure: PlatformOpsInfrastructureService,
    private readonly config: ConfigService,
  ) {}

  async getOverview(): Promise<PlatformOpsOverviewDto> {
    const ctx = await this.loadContext();
    const incidents = this.enrichIncidents(ctx.incidents);
    const services = this.buildServices(ctx);
    const degradedServices = services.filter((s) => s.state !== 'healthy');
    const domains = this.buildDomains(ctx);
    const globalPlatformState = this.computeGlobalState(ctx, incidents, domains);
    const criticalSignals = this.buildCriticalSignals(ctx, incidents);

    return {
      generatedAt: ctx.generatedAt,
      globalPlatformState,
      isStale: false,
      incidentSummary: {
        count: incidents.filter((i) => i.severity !== 'info').length,
        highestSeverity:
          incidents.length > 0
            ? incidents.reduce<'critical' | 'warning' | 'info'>(
                (best, cur) =>
                  cur.severity === 'critical' || best === 'critical'
                    ? 'critical'
                    : cur.severity === 'warning' || best === 'warning'
                      ? 'warning'
                      : 'info',
                'info',
              )
            : null,
        affectedOrganizationCount: new Set(
          incidents.flatMap((i) => i.organizationIds),
        ).size,
      },
      domains,
      activeIncidents: incidents.slice(0, 5),
      degradedServices: degradedServices.slice(0, 8),
      criticalSignals: criticalSignals.slice(0, 6),
      moduleErrors: ctx.moduleErrors,
    };
  }

  async getIncidents(page = 1, limit = 25): Promise<PlatformOpsIncidentListDto> {
    const ctx = await this.loadContext();
    const all = this.enrichIncidents(ctx.incidents);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const start = (safePage - 1) * safeLimit;
    const slice = all.slice(start, start + safeLimit);

    return {
      generatedAt: ctx.generatedAt,
      isStale: false,
      incidents: slice,
      meta: {
        total: all.length,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.max(1, Math.ceil(all.length / safeLimit)),
      },
    };
  }

  async getIncidentById(id: string): Promise<PlatformOpsIncidentDto | null> {
    const ctx = await this.loadContext();
    const incident = this.enrichIncidents(ctx.incidents).find((i) => i.id === id);
    return incident ?? null;
  }

  async getServices(): Promise<PlatformOpsServicesDto> {
    const ctx = await this.loadContext();
    const all = this.buildServices(ctx);
    const groups: Record<PlatformOpsServiceGroup, PlatformOpsServiceSummaryDto[]> = {
      core: [],
      processing: [],
      edge: [],
      external: [],
    };
    for (const svc of all) {
      groups[svc.group].push(svc);
    }

    return {
      generatedAt: ctx.generatedAt,
      isStale: false,
      groups,
      moduleErrors: ctx.moduleErrors,
    };
  }

  async getServiceDetail(serviceId: string): Promise<PlatformOpsServiceDetailDto | null> {
    const ctx = await this.loadContext();
    const services = this.buildServices(ctx);
    const base = services.find((s) => s.id === serviceId);
    if (!base) return null;

    const detail: PlatformOpsServiceDetailDto = {
      ...base,
      signals: [],
      activeAlerts: this.buildAlertGroups(ctx).filter(
        (a) => a.component === serviceId || a.component.includes(serviceId),
      ),
      recentIncidents: this.enrichIncidents(ctx.incidents)
        .filter((i) => i.affectedServiceIds.includes(serviceId))
        .slice(0, 3),
      grafanaPanelPath: `SynqDrive Ops`,
      hubDrilldown: this.serviceHubDrilldown(serviceId),
      providerHealth: null,
      integrationHealth: null,
      tenantImpact: null,
    };

    return this.enrichServiceDetail(detail, ctx);
  }

  async getQueues(): Promise<PlatformOpsQueuesDto> {
    const ctx = await this.loadContext();
    const queues = (ctx.platformHealth?.queues ?? []).map((q) => {
      const abnormal =
        q.status === 'critical' ||
        q.status === 'warning' ||
        (q.failed ?? 0) > 0 ||
        (q.delayed ?? 0) > 50;
      return {
        queue: q.queue,
        waiting: q.waiting,
        active: q.active,
        delayed: q.delayed,
        failed: q.failed,
        completed: q.completed ?? 0,
        paused: q.paused ?? 0,
        stalled: 0,
        status: q.status,
        abnormal,
      };
    });

    return {
      generatedAt: ctx.generatedAt,
      isStale: false,
      queues,
      summary: {
        failedTotal: queues.reduce((s, q) => s + q.failed, 0),
        abnormalCount: queues.filter((q) => q.abnormal).length,
        healthyCount: queues.filter((q) => !q.abnormal).length,
      },
    };
  }

  async getWorkers(): Promise<PlatformOpsWorkersDto> {
    const ctx = await this.loadContext();
    const workers = await this.platformAdmin.getMonitoringWorkers();
    const mapped: PlatformOpsWorkerDto[] = workers.map((w) => {
      const failureRatio = w.failureRatio ?? 0;
      const workerStatus = String(w.status);
      let state: PlatformOpsState = 'healthy';
      if (failureRatio >= 50 || workerStatus === 'degraded' || workerStatus === 'failed') state = 'critical';
      else if (failureRatio > 0 || workerStatus === 'warning') state = 'degraded';
      else if (workerStatus === 'idle' && failureRatio === 0) state = 'healthy';

      return {
        id: w.queueKey ?? w.name,
        name: w.name,
        purpose: w.description ?? '',
        state,
        lastSuccessAt: w.lastSuccessAt ?? null,
        failureRatio,
        throughputPerHour: w.total > 0 ? w.total : null,
        lastFailureAt: w.lastFailedAt ?? null,
        lastError: null,
      };
    });

    return {
      generatedAt: ctx.generatedAt,
      isStale: false,
      workers: mapped.sort((a, b) => {
        const rank = (s: PlatformOpsState) =>
          s === 'critical' ? 0 : s === 'degraded' ? 1 : s === 'unknown' ? 2 : 3;
        return rank(a.state) - rank(b.state) || b.failureRatio - a.failureRatio;
      }),
    };
  }

  async getSchedulers(): Promise<PlatformOpsSchedulersDto> {
    const ctx = await this.loadContext();
    const schedulers = await this.buildSchedulers(ctx);
    return {
      generatedAt: ctx.generatedAt,
      isStale: false,
      schedulers,
    };
  }

  async getInfrastructure() {
    const infra = await this.infrastructure.getSummary();
    return infra;
  }

  async getAlerts(): Promise<PlatformOpsAlertsDto> {
    const ctx = await this.loadContext();
    const amSummary = await this.alertmanager.getSummary();
    const amGroups = (await this.alertmanager.getAlertGroups()).map((g, idx) => ({
      id: `am-${idx}`,
      alertname: g.alertname,
      severity: g.severity as 'critical' | 'warning' | 'info',
      component: g.component,
      count: g.count,
      affectedResources: `${g.count} Alarm(e)`,
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      summary: g.summary,
      source: 'alertmanager' as const,
      silenced: g.silenced,
      pending: g.pending,
      deliveryStatus: null,
    }));

    const derived = this.buildAlertGroups(ctx);
    const groups = [...amGroups, ...derived.filter((d) => !amGroups.some((a) => a.alertname === d.alertname))];

    return {
      generatedAt: ctx.generatedAt,
      isStale: false,
      alertmanager: amSummary,
      groups: groups.slice(0, 50),
    };
  }

  async getResilience(): Promise<PlatformOpsResilienceDto> {
    const resilience = this.resilienceStatus.getResilienceStatus();
    const now = Date.now();

    const tierState = (status: string): PlatformOpsState => {
      if (status === 'failed') return 'critical';
      if (status === 'stale' || status === 'overdue') return 'degraded';
      if (status === 'ok' || status === 'passed') return 'healthy';
      return 'unknown';
    };

    const ageHours = (iso: string | null) => {
      if (!iso) return null;
      return Math.round((now - new Date(iso).getTime()) / (60 * 60 * 1000));
    };

    let overall: PlatformOpsState = 'unknown';
    if (resilience.overall === 'critical') overall = 'critical';
    else if (resilience.overall === 'warning') overall = 'degraded';
    else if (resilience.overall === 'healthy') overall = 'healthy';

    return {
      generatedAt: resilience.generatedAt,
      isStale: now - new Date(resilience.generatedAt).getTime() > STALE_MS,
      overall,
      source: resilience.source,
      rpoRtoDocUrl: 'docs/remediation/disaster-recovery-production-readiness.md',
      tiers: [
        {
          id: 'postgres',
          label: 'PostgreSQL',
          lastSuccessAt: resilience.postgres.lastSuccessAt,
          ageHours: ageHours(resilience.postgres.lastSuccessAt),
          offsiteStatus: resilience.offsite.status,
          restoreValidation: resilience.restoreValidation.status,
          status: tierState(resilience.postgres.status),
          failureMessage: resilience.postgres.status === 'failed' ? 'Backup veraltet oder fehlgeschlagen' : null,
        },
        {
          id: 'clickhouse',
          label: 'ClickHouse',
          lastSuccessAt: resilience.clickhouse.lastSuccessAt,
          ageHours: ageHours(resilience.clickhouse.lastSuccessAt),
          offsiteStatus: resilience.offsite.status,
          restoreValidation: resilience.restoreValidation.status,
          status: tierState(resilience.clickhouse.status),
          failureMessage: null,
        },
        {
          id: 'redis',
          label: 'Redis',
          lastSuccessAt: null,
          ageHours: null,
          offsiteStatus: null,
          restoreValidation: null,
          status: 'unknown',
          failureMessage: null,
        },
        {
          id: 'offsite',
          label: 'Offsite-Kopie',
          lastSuccessAt: resilience.offsite.lastSyncAt,
          ageHours: ageHours(resilience.offsite.lastSyncAt),
          offsiteStatus: resilience.offsite.status,
          restoreValidation: null,
          status: tierState(resilience.offsite.status),
          failureMessage: null,
        },
      ],
    };
  }

  getTools(): PlatformOpsToolsDto {
    const grafanaUrl = this.config.get<string>('GRAFANA_INTERNAL_URL') ?? 'http://127.0.0.1:3000';
    const prometheusUrl = this.config.get<string>('PROMETHEUS_INTERNAL_URL') ?? 'http://127.0.0.1:9090';
    const alertmanagerUrl = this.alertmanager.getAlertmanagerUrl();
    return {
      grafanaUrl,
      prometheusUrl,
      alertmanagerUrl,
      metricsConfigured: !!this.config.get<string>('METRICS_BEARER_TOKEN'),
      grafanaAccessHint:
        'Grafana, Prometheus und Alertmanager sind auf dem VPS nur via localhost erreichbar.',
      sshTunnelExample:
        'ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 -L 9093:127.0.0.1:9093 root@srv1374778.hstgr.cloud',
    };
  }

  private async loadContext() {
    const generatedAt = new Date().toISOString();
    const moduleErrors: Partial<Record<string, string>> = {};
    const resilience = this.resilienceStatus.getResilienceStatus();

    const [platformHealthResult, billingResult, connectivityResult] = await Promise.allSettled([
      this.platformAdmin.getPlatformHealth(),
      this.billingAdmin.getOverview(),
      this.connectivitySummary.getPlatformSummary(),
    ]);

    const platformHealth =
      platformHealthResult.status === 'fulfilled' ? platformHealthResult.value : null;
    if (platformHealthResult.status === 'rejected') {
      moduleErrors.platformHealth = String(platformHealthResult.reason?.message ?? platformHealthResult.reason);
    }

    const billing = billingResult.status === 'fulfilled' ? billingResult.value : null;
    if (billingResult.status === 'rejected') {
      moduleErrors.billing = String(billingResult.reason?.message ?? billingResult.reason);
    }

    const connectivity =
      connectivityResult.status === 'fulfilled' ? connectivityResult.value : null;
    if (connectivityResult.status === 'rejected') {
      moduleErrors.connectivity = String(connectivityResult.reason?.message ?? connectivityResult.reason);
    }

    const incidents = buildDashboardIncidents({
      platformHealth,
      billing,
      resilience,
      supportCriticalOpen: 0,
    });

    return {
      generatedAt,
      platformHealth,
      billing,
      connectivity,
      resilience,
      incidents,
      moduleErrors,
    };
  }

  private enrichIncidents(incidents: DashboardIncidentDto[]): PlatformOpsIncidentDto[] {
    return incidents.map((inc) => {
      const componentKey = inc.affectedComponent.toLowerCase();
      const serviceIds = this.componentToServiceIds(inc.affectedComponent);
      const drilldownView =
        inc.drilldownView === 'platform-health' || inc.drilldownView === 'architektur'
          ? 'platform-ops'
          : inc.drilldownView;
      const drilldownParams = { ...inc.drilldownParams };
      if (inc.drilldownView === 'platform-health') {
        drilldownParams.platformOps = 'processing';
        if (inc.drilldownParams?.opsTab === 'workers') {
          drilldownParams.platformOpsTab = 'workers';
        }
        delete drilldownParams.opsTab;
      }
      if (inc.drilldownView === 'architektur') {
        drilldownParams.platformOps = 'resilience';
      }

      return {
        id: inc.id,
        severity: inc.severity,
        summary: inc.summary,
        affectedComponent: inc.affectedComponent,
        impact: inc.impact,
        firstSeen: inc.firstSeen,
        lastSeen: inc.lastSeen,
        state: 'open' as const,
        owner: null,
        organizationIds: inc.organizationIds,
        organizationNames: inc.organizationNames,
        drilldownView,
        drilldownParams,
        affectedServiceIds: serviceIds,
        timeline: [
          { at: inc.firstSeen, kind: 'detected', summary: inc.summary },
          { at: inc.lastSeen, kind: 'updated', summary: 'Zuletzt aktualisiert' },
        ],
        relatedAlerts: [],
        runbookUrl: RUNBOOK_URLS[componentKey] ?? null,
        diagnostics: {
          serviceId: serviceIds[0] ?? null,
          timestamp: inc.lastSeen,
        },
      };
    });
  }

  private buildDomains(ctx: Awaited<ReturnType<typeof this.loadContext>>) {
    const { domainStatus } = computeDomainStatus({
      platformHealth: ctx.platformHealth,
      billing: ctx.billing,
      resilience: ctx.resilience,
      supportOpenTickets: null,
      moduleErrors: ctx.moduleErrors,
    });

    const mapLevel = (level: string): PlatformOpsState => {
      if (level === 'critical') return 'critical';
      if (level === 'warning') return 'degraded';
      if (level === 'ok') return 'healthy';
      return 'unknown';
    };

    return {
      core: mapLevel(domainStatus.runtime),
      processing: mapLevel(domainStatus.worker),
      edge: 'unknown' as PlatformOpsState,
      external: mapLevel(domainStatus.dimo),
      resilience: mapLevel(domainStatus.backup),
    };
  }

  private computeGlobalState(
    ctx: Awaited<ReturnType<typeof this.loadContext>>,
    incidents: PlatformOpsIncidentDto[],
    domains: PlatformOpsOverviewDto['domains'],
  ): PlatformOpsState {
    if (ctx.moduleErrors.platformHealth && !ctx.platformHealth) return 'unknown';
    const domainStates = Object.values(domains);
    if (domainStates.includes('critical') || incidents.some((i) => i.severity === 'critical')) {
      return 'critical';
    }
    if (domainStates.includes('degraded') || incidents.some((i) => i.severity === 'warning')) {
      return 'degraded';
    }
    if (ctx.platformHealth?.overallStatus === 'healthy') return 'healthy';
    if (ctx.platformHealth?.overallStatus === 'warning') return 'degraded';
    if (ctx.platformHealth?.overallStatus === 'critical') return 'critical';
    return 'unknown';
  }

  private buildCriticalSignals(
    ctx: Awaited<ReturnType<typeof this.loadContext>>,
    incidents: PlatformOpsIncidentDto[],
  ): PlatformOpsSignalDto[] {
    const signals: PlatformOpsSignalDto[] = [];
    for (const inc of incidents.filter((i) => i.severity !== 'info').slice(0, 6)) {
      signals.push({
        id: inc.id,
        severity: inc.severity,
        summary: inc.summary,
        component: inc.affectedComponent,
        drilldown: {
          platformOps: 'incidents',
        },
      });
    }
    if (ctx.platformHealth?.monitoring?.errorRatePercent != null && ctx.platformHealth.monitoring.errorRatePercent > 5) {
      signals.push({
        id: 'poll-error-rate',
        severity: ctx.platformHealth.monitoring.errorRatePercent > 20 ? 'critical' : 'warning',
        summary: `DIMO Poll-Fehlerrate ${ctx.platformHealth.monitoring.errorRatePercent}%`,
        component: 'DIMO',
        drilldown: { platformOps: 'diagnostics', platformOpsTab: 'poll-logs' },
      });
    }
    return signals;
  }

  private buildServices(ctx: Awaited<ReturnType<typeof this.loadContext>>): PlatformOpsServiceSummaryDto[] {
    const now = ctx.generatedAt;
    const services: PlatformOpsServiceSummaryDto[] = [];
    const checks = ctx.platformHealth?.readiness?.checks ?? {};

    const add = (
      id: string,
      name: string,
      group: PlatformOpsServiceGroup,
      state: PlatformOpsState,
      keySignal: string,
      stateSummary: string,
    ) => {
      services.push({
        id,
        name,
        group,
        state,
        lastCheckAt: now,
        keySignal,
        stateSummary,
      });
    };

    const depState = (check?: { status?: string }): PlatformOpsState => {
      if (!check) return 'unknown';
      return check.status === 'ok' ? 'healthy' : 'critical';
    };

    add(
      'api',
      'Backend API',
      'core',
      depState(checks.workers),
      checks.workers?.responseMs != null ? `${checks.workers.responseMs} ms` : '—',
      checks.workers?.status === 'ok' ? 'API-Prozess erreichbar' : 'Worker-Runtime nicht bereit',
    );
    add(
      'postgres',
      'PostgreSQL',
      'core',
      depState(checks.postgres),
      checks.postgres?.responseMs != null ? `${checks.postgres.responseMs} ms` : '—',
      checks.postgres?.status === 'ok' ? 'Datenbank erreichbar' : checks.postgres?.error ?? 'Nicht erreichbar',
    );
    add(
      'redis',
      'Redis',
      'core',
      depState(checks.redis),
      checks.redis?.responseMs != null ? `${checks.redis.responseMs} ms` : '—',
      checks.redis?.status === 'ok' ? 'Redis erreichbar' : checks.redis?.error ?? 'Nicht erreichbar',
    );

    const ch = checks.clickhouse;
    let chState: PlatformOpsState = 'unknown';
    if (ch?.details?.status === 'disabled') chState = 'healthy';
    else if (ch?.status === 'ok') chState = 'healthy';
    else if (ch?.status === 'error') chState = 'degraded';
    add(
      'clickhouse',
      'ClickHouse',
      'core',
      chState,
      String(ch?.details?.status ?? '—'),
      ch?.details?.status === 'disabled' ? 'Optional deaktiviert' : String(ch?.error ?? 'Verfügbarkeit prüfen'),
    );

    const failedQueues = ctx.platformHealth?.queues?.filter((q) => q.status === 'critical' || q.failed > 0) ?? [];
    add(
      'bullmq',
      'BullMQ',
      'processing',
      failedQueues.length > 0 ? 'critical' : 'healthy',
      `${failedQueues.reduce((s, q) => s + q.failed, 0)} fehlgeschlagen`,
      failedQueues.length > 0 ? `${failedQueues.length} Queue(s) mit Problemen` : 'Queues betriebsbereit',
    );

    const unhealthyWorkers = ctx.platformHealth?.monitoring?.unhealthyWorkers ?? 0;
    add(
      'workers',
      'Worker',
      'processing',
      unhealthyWorkers > 0 ? 'degraded' : 'healthy',
      `${unhealthyWorkers} unhealthy`,
      unhealthyWorkers > 0 ? 'Erhöhte Worker-Fehlerrate' : 'Worker-Verarbeitung stabil',
    );

    add('nginx', 'Nginx / TLS', 'edge', 'unknown', '—', 'Host-Metriken via Prometheus');

    const dimo = ctx.platformHealth?.integrations?.dimo;
    const token = dimo?.tokenHealth as { status?: string } | undefined;
    let dimoState: PlatformOpsState = 'healthy';
    if (token?.status === 'critical' || token?.status === 'error') dimoState = 'critical';
    else if ((dimo?.disconnected ?? 0) > 0) dimoState = 'degraded';
    add(
      'dimo',
      'DIMO',
      'external',
      dimoState,
      `${dimo?.connected ?? 0}/${dimo?.total ?? 0} verbunden`,
      dimoState === 'healthy' ? 'Integration betriebsbereit' : 'DIMO-Integration eingeschränkt',
    );

    if (ctx.billing) {
      const stripeState: PlatformOpsState =
        (ctx.billing.stripeSyncErrors ?? 0) > 0 ? 'degraded' : 'healthy';
      add(
        'stripe',
        'Stripe',
        'external',
        stripeState,
        `${ctx.billing.stripeSyncErrors ?? 0} Webhook-Fehler`,
        stripeState === 'healthy' ? 'Webhooks synchron' : 'Stripe-Integration prüfen',
      );
    }

    add('notifications', 'Benachrichtigungen', 'external', 'unknown', '—', 'Kein dedizierter Ops-Kanal');
    add('voice', 'Voice Assistant', 'external', 'unknown', '—', 'Voice Control Plane');
    add('high-mobility', 'High Mobility', 'external', 'unknown', '—', 'HM Streaming');

    return services;
  }

  private enrichServiceDetail(
    detail: PlatformOpsServiceDetailDto,
    ctx: Awaited<ReturnType<typeof this.loadContext>>,
  ): PlatformOpsServiceDetailDto {
    const checks = ctx.platformHealth?.readiness?.checks ?? {};

    if (detail.id === 'postgres') {
      detail.signals = [
        { label: 'Verfügbarkeit', value: checks.postgres?.status === 'ok' ? 'OK' : 'Fehler', tone: detail.state },
        { label: 'Latenz', value: checks.postgres?.responseMs != null ? `${checks.postgres.responseMs} ms` : '—' },
        {
          label: 'Backup',
          value: ctx.resilience.postgres.status,
          tone:
            ctx.resilience.postgres.status === 'failed'
              ? 'critical'
              : ctx.resilience.postgres.status === 'stale'
                ? 'degraded'
                : 'healthy',
        },
        {
          label: 'Restore-Validation',
          value: ctx.resilience.restoreValidation.status,
          tone:
            ctx.resilience.restoreValidation.status === 'failed' ||
            ctx.resilience.restoreValidation.status === 'overdue'
              ? 'degraded'
              : 'healthy',
        },
      ];
    }

    if (detail.id === 'clickhouse') {
      const ch = checks.clickhouse;
      detail.signals = [
        { label: 'Status', value: String(ch?.details?.status ?? '—'), tone: detail.state },
        {
          label: 'Schema ausstehend',
          value: String(ch?.details?.pendingMigrationCount ?? '—'),
        },
        { label: 'Backup', value: ctx.resilience.clickhouse.status },
        { label: 'Ingestion', value: String(ch?.details?.lastIngestionAt ?? '—') },
      ];
    }

    if (detail.id === 'redis') {
      detail.signals = [
        { label: 'Verfügbarkeit', value: checks.redis?.status === 'ok' ? 'OK' : 'Fehler', tone: detail.state },
        { label: 'Latenz', value: checks.redis?.responseMs != null ? `${checks.redis.responseMs} ms` : '—' },
      ];
    }

    if (detail.id === 'dimo') {
      const dimo = ctx.platformHealth?.integrations?.dimo;
      const token = dimo?.tokenHealth as { status?: string; ttlRemainingSeconds?: number } | undefined;
      detail.providerHealth = {
        state: 'unknown',
        summary: 'Provider-Status nur via externen Monitoring-Stack',
      };
      detail.integrationHealth = {
        state: detail.state,
        summary:
          token?.status === 'VALID'
            ? `Token gültig (${token.ttlRemainingSeconds ?? '?'}s TTL)`
            : `Token-Status: ${token?.status ?? 'unbekannt'}`,
      };
      detail.tenantImpact = ctx.connectivity
        ? {
            count: ctx.connectivity.dimoLinkedVehicles,
            label: 'verbundene Fahrzeuge',
            drilldownView: 'vehicles',
          }
        : null;
      detail.signals = [
        { label: 'Verbunden', value: `${dimo?.connected ?? 0} / ${dimo?.total ?? 0}` },
        {
          label: 'Poll-Fehlerrate',
          value: `${ctx.platformHealth?.monitoring?.errorRatePercent ?? 0}%`,
        },
        { label: 'Token', value: String(token?.status ?? '—'), tone: detail.state },
      ];
    }

    if (detail.id === 'stripe' && ctx.billing) {
      detail.integrationHealth = {
        state: detail.state,
        summary: `${ctx.billing.stripeSyncErrors ?? 0} Webhook-Fehler`,
      };
      detail.signals = [
        { label: 'Webhook-Fehler', value: String(ctx.billing.stripeSyncErrors ?? 0) },
        { label: 'Past Due', value: String(ctx.billing.pastDueSubscriptions ?? 0) },
        { label: 'Abweichungen', value: String(ctx.billing.reconciliationDrifts ?? 0) },
      ];
    }

    if (detail.id === 'bullmq') {
      const queues = ctx.platformHealth?.queues ?? [];
      detail.signals = [
        { label: 'Fehlgeschlagen', value: String(queues.reduce((s, q) => s + q.failed, 0)) },
        { label: 'Kritische Queues', value: String(queues.filter((q) => q.status === 'critical').length) },
        { label: 'Wartend', value: String(queues.reduce((s, q) => s + q.waiting, 0)) },
      ];
    }

    return detail;
  }

  private buildAlertGroups(ctx: Awaited<ReturnType<typeof this.loadContext>>): PlatformOpsAlertGroupDto[] {
    const alerts = ctx.platformHealth?.alerts ?? [];
    const groups = new Map<string, PlatformOpsAlertGroupDto>();

    for (const alert of alerts) {
      const alertname = alert.title ?? alert.summary ?? 'Alert';
      const component = alert.affectedComponent ?? 'platform';
      const severity = (alert.severity ?? 'warning') as 'critical' | 'warning' | 'info';
      const key = `${alertname}|${component}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        if (alert.firstSeen && alert.firstSeen < existing.firstSeen) existing.firstSeen = alert.firstSeen;
        if (alert.lastSeen && alert.lastSeen > existing.lastSeen) existing.lastSeen = alert.lastSeen;
      } else {
        groups.set(key, {
          id: `derived-${groups.size}`,
          alertname,
          severity,
          component: component.toLowerCase(),
          count: 1,
          affectedResources: '1 Signal',
          firstSeen: alert.firstSeen ?? ctx.generatedAt,
          lastSeen: alert.lastSeen ?? ctx.generatedAt,
          summary: alert.summary ?? alertname,
          source: 'derived',
        });
      }
    }

    return Array.from(groups.values());
  }

  private async buildSchedulers(
    ctx: Awaited<ReturnType<typeof this.loadContext>>,
  ): Promise<PlatformOpsSchedulerDto[]> {
    const pollSummary = ctx.platformHealth?.monitoring;
    const snapshotLastRun = await this.platformAdmin
      .getMonitoringWorkers({ from: new Date(Date.now() - 3600_000).toISOString() })
      .then((workers) => workers.find((w) => w.name === 'DIMO Snapshot')?.lastSuccessAt ?? null)
      .catch(() => null);

    const defs: Array<Omit<PlatformOpsSchedulerDto, 'lastRunAt' | 'lastSuccessAt' | 'nextExpectedAt' | 'status' | 'lastError'>> = [
      { id: 'dimo-snapshot', name: 'DIMO Snapshot', expectedCadence: 'alle 30 Sekunden', cronExpression: '*/30 * * * * *' },
      { id: 'trip-reconciliation', name: 'Trip Reconciliation', expectedCadence: 'täglich 03:00', cronExpression: '0 3 * * *' },
      { id: 'data-retention', name: 'Data Retention', expectedCadence: 'täglich 03:30', cronExpression: '30 3 * * *' },
      { id: 'document-retention', name: 'Document Retention', expectedCadence: 'täglich 04:30', cronExpression: '30 4 * * *' },
      { id: 'battery-retention', name: 'Battery Retention', expectedCadence: 'täglich 04:00', cronExpression: '0 4 * * *' },
    ];

    return defs.map((def) => {
      let lastSuccessAt: string | null = null;
      let status: PlatformOpsSchedulerDto['status'] = 'unknown';

      if (def.id === 'dimo-snapshot') {
        lastSuccessAt = snapshotLastRun;
        if (lastSuccessAt) {
          const ageMs = Date.now() - new Date(lastSuccessAt).getTime();
          status = ageMs > 120_000 ? 'missed' : 'ok';
        }
      }

      return {
        ...def,
        lastRunAt: lastSuccessAt,
        lastSuccessAt,
        nextExpectedAt: null,
        status,
        lastError: null,
      };
    });
  }

  private componentToServiceIds(component: string): string[] {
    const c = component.toLowerCase();
    if (c.includes('worker') || c.includes('bullmq')) return ['bullmq', 'workers'];
    if (c.includes('backup')) return ['postgres', 'clickhouse'];
    if (c.includes('stripe') || c.includes('billing')) return ['stripe'];
    if (c.includes('dimo')) return ['dimo'];
    if (c.includes('postgres')) return ['postgres'];
    if (c.includes('redis')) return ['redis'];
    if (c.includes('clickhouse')) return ['clickhouse'];
    return [];
  }

  private serviceHubDrilldown(
    serviceId: string,
  ): PlatformOpsServiceDetailDto['hubDrilldown'] {
    if (serviceId === 'dimo') return { view: 'vehicles', params: { cvSection: 'overview' } };
    if (serviceId === 'stripe') return { view: 'billing', params: { masterBilling: 'reconciliation' } };
    if (serviceId === 'voice') return { view: 'voice-assistant' };
    if (serviceId === 'high-mobility') return { view: 'high-mobility' };
    return null;
  }
}

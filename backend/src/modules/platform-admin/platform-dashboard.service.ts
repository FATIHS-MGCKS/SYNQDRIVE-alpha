import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingStatus, OrganizationStatus } from '@prisma/client';
import * as fs from 'fs';
import { PrismaService } from '@shared/database/prisma.service';
import { BillingAdminService } from '../billing/billing-admin.service';
import { SupportService } from '../support/support.service';
import { PlatformAdminService } from './platform-admin.service';
import type {
  DashboardDomainStatusLevel,
  DashboardIncidentDto,
  DashboardIncidentSeverity,
  ResilienceStatusDto,
} from './platform-dashboard.types';

const BACKUP_OK_MAX_AGE_MS = 26 * 60 * 60 * 1000;
const BACKUP_STALE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const BACKUP_CRITICAL_MAX_AGE_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class PlatformResilienceStatusService {
  private readonly logger = new Logger(PlatformResilienceStatusService.name);

  constructor(private readonly config: ConfigService) {}

  getResilienceStatus(): ResilienceStatusDto {
    const now = new Date();
    const jsonPath = this.config.get<string>('SYNQDRIVE_RESILIENCE_STATUS_JSON');
    if (jsonPath) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<ResilienceStatusDto>;
        return this.normalizeResilience(parsed, now, 'json');
      } catch (err: unknown) {
        this.logger.warn(
          `Resilience JSON unreadable at ${jsonPath}: ${(err as Error).message}`,
        );
      }
    }

    const promPath =
      this.config.get<string>('SYNQDRIVE_BACKUP_PROM_TEXTFILE') ??
      '/opt/synqdrive/shared/node-exporter-textfile/synqdrive_backup.prom';

    const pgTs = this.readPrometheusGauge(promPath, 'synqdrive_backup_last_success_timestamp');
    if (pgTs != null) {
      const lastSuccessAt = new Date(pgTs * 1000).toISOString();
      const ageMs = now.getTime() - pgTs * 1000;
      const pgStatus = this.backupAgeStatus(ageMs);
      return {
        generatedAt: now.toISOString(),
        overall: pgStatus === 'ok' ? 'healthy' : pgStatus === 'stale' ? 'warning' : 'critical',
        postgres: { lastSuccessAt, status: pgStatus },
        clickhouse: { lastSuccessAt: null, status: 'unknown' },
        offsite: { lastSyncAt: null, status: 'unknown' },
        restoreValidation: { lastRunAt: null, status: 'unknown' },
        source: 'prometheus_textfile',
      };
    }

    return {
      generatedAt: now.toISOString(),
      overall: 'unknown',
      postgres: { lastSuccessAt: null, status: 'unknown' },
      clickhouse: { lastSuccessAt: null, status: 'unknown' },
      offsite: { lastSyncAt: null, status: 'unknown' },
      restoreValidation: { lastRunAt: null, status: 'unknown' },
      source: 'none',
    };
  }

  private normalizeResilience(
    parsed: Partial<ResilienceStatusDto>,
    now: Date,
    source: ResilienceStatusDto['source'],
  ): ResilienceStatusDto {
    const overall = parsed.overall ?? 'unknown';
    return {
      generatedAt: parsed.generatedAt ?? now.toISOString(),
      overall,
      postgres: parsed.postgres ?? { lastSuccessAt: null, status: 'unknown' },
      clickhouse: parsed.clickhouse ?? { lastSuccessAt: null, status: 'unknown' },
      offsite: parsed.offsite ?? { lastSyncAt: null, status: 'unknown' },
      restoreValidation: parsed.restoreValidation ?? { lastRunAt: null, status: 'unknown' },
      source,
    };
  }

  private readPrometheusGauge(filePath: string, metricName: string): number | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf8');
      const line = content
        .split('\n')
        .find((l) => l.startsWith(metricName) && !l.startsWith('#'));
      if (!line) return null;
      const value = Number.parseFloat(line.split(/\s+/).pop() ?? '');
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  private backupAgeStatus(ageMs: number): 'ok' | 'stale' | 'failed' {
    if (ageMs <= BACKUP_OK_MAX_AGE_MS) return 'ok';
    if (ageMs <= BACKUP_CRITICAL_MAX_AGE_MS) return 'stale';
    return 'failed';
  }
}

export function computeDomainStatus(input: {
  platformHealth: Awaited<ReturnType<PlatformAdminService['getPlatformHealth']>> | null;
  billing: Awaited<ReturnType<BillingAdminService['getOverview']>> | null;
  resilience: ResilienceStatusDto;
  supportOpenTickets: number | null;
  moduleErrors: Partial<Record<string, string>>;
}): {
  domainStatus: {
    runtime: DashboardDomainStatusLevel;
    worker: DashboardDomainStatusLevel;
    dimo: DashboardDomainStatusLevel;
    billing: DashboardDomainStatusLevel;
    backup: DashboardDomainStatusLevel;
    support: DashboardDomainStatusLevel;
  };
} {
  const { platformHealth, billing, resilience, supportOpenTickets, moduleErrors } = input;

  let runtime: DashboardDomainStatusLevel = 'unknown';
  if (moduleErrors.platformHealth) {
    runtime = 'unknown';
  } else if (platformHealth) {
    const checks = platformHealth.readiness?.checks ?? {};
    const hard = ['postgres', 'redis', 'workers', 'documentExtraction'] as const;
    const hasError = hard.some((k) => checks[k]?.status === 'error');
    if (platformHealth.readiness?.status === 'degraded' || hasError) runtime = 'critical';
    else runtime = 'ok';
  }

  let worker: DashboardDomainStatusLevel = 'unknown';
  if (platformHealth && !moduleErrors.platformHealth) {
    const queueCritical =
      platformHealth.queues?.filter((q) => q.status === 'critical').length ?? 0;
    const queueWarning =
      platformHealth.queues?.filter((q) => q.status === 'warning').length ?? 0;
    if (
      platformHealth.monitoring?.systemHealth === 'critical' ||
      queueCritical > 0
    ) {
      worker = 'critical';
    } else if (
      (platformHealth.monitoring?.unhealthyWorkers ?? 0) > 0 ||
      queueWarning > 0
    ) {
      worker = 'warning';
    } else {
      worker = 'ok';
    }
  }

  let dimo: DashboardDomainStatusLevel = 'unknown';
  if (platformHealth && !moduleErrors.platformHealth) {
    const dimoIntegration = platformHealth.integrations?.dimo;
    const total = dimoIntegration?.total ?? 0;
    const token = dimoIntegration?.tokenHealth as { status?: string } | undefined;
    const tokenCritical =
      token?.status === 'critical' || token?.status === 'error' || token?.status === 'failed';
    const disconnected = dimoIntegration?.disconnected ?? 0;
    const errorRate = platformHealth.monitoring?.errorRatePercent ?? 0;
    if (tokenCritical) dimo = 'critical';
    else if (total > 0 && (disconnected > 0 || errorRate > 5)) dimo = 'warning';
    else if (total === 0) dimo = 'ok';
    else dimo = 'ok';
  }

  let billingStatus: DashboardDomainStatusLevel = 'unknown';
  if (moduleErrors.billing) {
    billingStatus = 'unknown';
  } else if (billing) {
    if ((billing.failedPayments ?? 0) > 0 || (billing.reconciliationDrifts ?? 0) > 0) {
      billingStatus = 'critical';
    } else if (
      billing.pastDueSubscriptions > 0 ||
      billing.stripeSyncErrors > 0 ||
      billing.missingPaymentMethods > 0
    ) {
      billingStatus = 'warning';
    } else {
      billingStatus = 'ok';
    }
  }

  let backup: DashboardDomainStatusLevel = 'unknown';
  if (resilience.overall === 'critical') backup = 'critical';
  else if (resilience.overall === 'warning') backup = 'warning';
  else if (resilience.overall === 'healthy') backup = 'ok';
  else backup = 'unknown';

  let support: DashboardDomainStatusLevel = 'unknown';
  if (moduleErrors.support) {
    support = 'unknown';
  } else if (supportOpenTickets != null) {
    if (supportOpenTickets > 5) support = 'warning';
    else support = 'ok';
  }

  return {
    domainStatus: {
      runtime,
      worker,
      dimo,
      billing: billingStatus,
      backup,
      support,
    },
  };
}

export function buildDashboardIncidents(input: {
  platformHealth: Awaited<ReturnType<PlatformAdminService['getPlatformHealth']>> | null;
  billing: Awaited<ReturnType<BillingAdminService['getOverview']>> | null;
  resilience: ResilienceStatusDto;
  supportCriticalOpen: number;
}): DashboardIncidentDto[] {
  const incidents: DashboardIncidentDto[] = [];
  let idx = 0;

  const push = (incident: Omit<DashboardIncidentDto, 'id'>) => {
    incidents.push({ ...incident, id: `inc-${idx++}` });
  };

  for (const alert of input.platformHealth?.alerts ?? []) {
    if (alert.severity === 'info') continue;
    push({
      severity: alert.severity as DashboardIncidentSeverity,
      summary: alert.summary ?? alert.title ?? 'Alert',
      affectedComponent: alert.affectedComponent ?? 'Platform',
      impact: alert.summary ?? '',
      firstSeen: alert.firstSeen,
      lastSeen: alert.lastSeen,
      organizationIds: [],
      organizationNames: [],
      drilldownView: 'platform-ops',
      drilldownParams: { platformOps: 'diagnostics', platformOpsTab: 'alerts' },
    });
  }

  if (input.billing) {
    if ((input.billing.failedPayments ?? 0) > 0) {
      push({
        severity: 'critical',
        summary: `${input.billing.failedPayments} fehlgeschlagene Zahlung(en)`,
        affectedComponent: 'Billing',
        impact: 'Zahlungsabwicklung',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        organizationIds: [],
        organizationNames: [],
        drilldownView: 'billing',
        drilldownParams: { masterBilling: 'invoices' },
      });
    }
    if ((input.billing.reconciliationDrifts ?? 0) > 0) {
      push({
        severity: 'critical',
        summary: `${input.billing.reconciliationDrifts} offene Abgleichsabweichung(en)`,
        affectedComponent: 'Billing',
        impact: 'Stripe-Abgleich',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        organizationIds: [],
        organizationNames: [],
        drilldownView: 'billing',
        drilldownParams: { masterBilling: 'system-sync' },
      });
    }
    if (input.billing.pastDueSubscriptions > 0) {
      push({
        severity: 'warning',
        summary: `${input.billing.pastDueSubscriptions} überfällige Verträge`,
        affectedComponent: 'Billing',
        impact: 'Subscriptions Past Due',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        organizationIds: [],
        organizationNames: [],
        drilldownView: 'billing',
      });
    }
    if (input.billing.stripeSyncErrors > 0) {
      push({
        severity: 'warning',
        summary: `${input.billing.stripeSyncErrors} fehlgeschlagene Stripe-Webhooks`,
        affectedComponent: 'Stripe',
        impact: 'Webhook Sync',
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        organizationIds: [],
        organizationNames: [],
        drilldownView: 'billing',
        drilldownParams: { masterBilling: 'system-sync' },
      });
    }
  }

  const queueCritical =
    input.platformHealth?.queues?.filter((q) => q.status === 'critical') ?? [];
  if (queueCritical.length > 0) {
    const failedSum = queueCritical.reduce((s, q) => s + (q.failed ?? 0), 0);
    push({
      severity: 'critical',
      summary: `${queueCritical.length} Queue(s) kritisch · ${failedSum} fehlgeschlagene Jobs`,
      affectedComponent: 'Workers',
      impact: 'BullMQ',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      organizationIds: [],
      organizationNames: [],
      drilldownView: 'platform-ops',
      drilldownParams: { platformOps: 'processing', platformOpsTab: 'queues' },
    });
  }

  if (input.resilience.overall === 'critical') {
    push({
      severity: 'critical',
      summary: 'Backup- oder Recovery-Status kritisch',
      affectedComponent: 'Backup',
      impact: 'Disaster Recovery',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      organizationIds: [],
      organizationNames: [],
      drilldownView: 'platform-ops',
      drilldownParams: { platformOps: 'resilience' },
    });
  } else if (input.resilience.overall === 'warning') {
    push({
      severity: 'warning',
      summary: 'Backup- oder Offsite-Status veraltet',
      affectedComponent: 'Backup',
      impact: 'Resilience',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      organizationIds: [],
      organizationNames: [],
      drilldownView: 'platform-ops',
      drilldownParams: { platformOps: 'resilience' },
    });
  }

  if (input.supportCriticalOpen > 0) {
    push({
      severity: 'warning',
      summary: `${input.supportCriticalOpen} kritische Support-Tickets offen`,
      affectedComponent: 'Support',
      impact: 'Kunden-Support',
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      organizationIds: [],
      organizationNames: [],
      drilldownView: 'support',
    });
  }

  const severityRank: Record<DashboardIncidentSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  return incidents.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

@Injectable()
export class PlatformConnectivitySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
  ) {}

  async getPlatformSummary(): Promise<import('./platform-dashboard.types').ConnectivityPlatformSummaryDto> {
    const now = Date.now();
    const { resolveTelemetryFreshness } = await import(
      '../vehicles/telemetry-freshness.resolver'
    );

    const [vehicles, platformHealth] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: { dimoVehicle: { isNot: null } },
        select: {
          latestState: { select: { lastSeenAt: true, updatedAt: true } },
          dimoVehicle: { select: { lastSignal: true } },
        },
      }),
      this.platformAdmin.getPlatformHealth(),
    ]);

    const freshness = {
      live: 0,
      standby: 0,
      signal_delayed: 0,
      offline: 0,
      no_signal: 0,
    };

    for (const v of vehicles) {
      const resolved = resolveTelemetryFreshness(
        {
          lastSignal: v.dimoVehicle?.lastSignal ?? null,
          latestStateUpdatedAt: v.latestState?.lastSeenAt ?? v.latestState?.updatedAt ?? null,
        },
        now,
      );
      freshness[resolved.freshness] += 1;
    }

    const dimo = platformHealth.integrations?.dimo;
    const tokenHealth = dimo?.tokenHealth as { status?: string } | undefined;

    return {
      generatedAt: new Date(now).toISOString(),
      dimoLinkedVehicles: vehicles.length,
      freshness,
      platform: {
        dimoTotal: dimo?.total ?? 0,
        dimoConnected: dimo?.connected ?? 0,
        dimoDisconnected: dimo?.disconnected ?? 0,
        pollErrorRatePercent: platformHealth.monitoring?.errorRatePercent ?? null,
        tokenHealthStatus: tokenHealth?.status ?? 'unknown',
      },
    };
  }
}

@Injectable()
export class PlatformDashboardService {
  private readonly logger = new Logger(PlatformDashboardService.name);

  private static readonly HIGH_VALUE_ENTITIES = new Set([
    'ORGANIZATION',
    'SUBSCRIPTION',
    'INTEGRATION',
    'DIMO_VEHICLE',
    'ADMIN_OPERATION',
    'ROLE',
    'SETTINGS',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAdmin: PlatformAdminService,
    private readonly billingAdmin: BillingAdminService,
    private readonly supportService: SupportService,
    private readonly resilienceStatus: PlatformResilienceStatusService,
    private readonly connectivitySummary: PlatformConnectivitySummaryService,
  ) {}

  async getOperationalDashboard(): Promise<import('./platform-dashboard.types').DashboardOperationalDto> {
    const generatedAt = new Date().toISOString();
    const moduleErrors: Partial<Record<string, string>> = {};

    const resilience = this.resilienceStatus.getResilienceStatus();

    const [
      platformHealthResult,
      billingResult,
      connectivityResult,
      supportResult,
      activityResult,
      businessResult,
      orgAttentionResult,
    ] = await Promise.allSettled([
      this.platformAdmin.getPlatformHealth(),
      this.billingAdmin.getOverview(),
      this.connectivitySummary.getPlatformSummary(),
      this.loadSupportSnapshot(),
      this.loadActivityHighlights(),
      this.loadBusinessContext(),
      this.loadOrganizationsAttention(),
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

    const connectivity = connectivityResult.status === 'fulfilled' ? connectivityResult.value : null;
    if (connectivityResult.status === 'rejected') {
      moduleErrors.connectivity = String(connectivityResult.reason?.message ?? connectivityResult.reason);
    }

    const support = supportResult.status === 'fulfilled' ? supportResult.value : null;
    if (supportResult.status === 'rejected') {
      moduleErrors.support = String(supportResult.reason?.message ?? supportResult.reason);
    }

    const activity = activityResult.status === 'fulfilled' ? activityResult.value : [];
    if (activityResult.status === 'rejected') {
      moduleErrors.activity = String(activityResult.reason?.message ?? activityResult.reason);
    }

    const businessContext =
      businessResult.status === 'fulfilled' ? businessResult.value : null;
    if (businessResult.status === 'rejected') {
      moduleErrors.businessContext = String(businessResult.reason?.message ?? businessResult.reason);
    }

    const organizationsAttention =
      orgAttentionResult.status === 'fulfilled' ? orgAttentionResult.value : [];
    if (orgAttentionResult.status === 'rejected') {
      moduleErrors.organizationsAttention = String(
        orgAttentionResult.reason?.message ?? orgAttentionResult.reason,
      );
    }

    const { domainStatus } = computeDomainStatus({
      platformHealth,
      billing,
      resilience,
      supportOpenTickets: support?.openTickets ?? null,
      moduleErrors,
    });

    const incidents = buildDashboardIncidents({
      platformHealth,
      billing,
      resilience,
      supportCriticalOpen: support?.criticalOpen ?? 0,
    });

    const affectedOrgIds = new Set<string>();
    for (const org of organizationsAttention) {
      affectedOrgIds.add(org.organizationId);
    }

    const severityRank: Record<DashboardIncidentSeverity, number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };
    const highestSeverity =
      incidents.length > 0
        ? incidents.reduce<DashboardIncidentSeverity | null>((best, cur) => {
            if (!best) return cur.severity;
            return severityRank[cur.severity] < severityRank[best] ? cur.severity : best;
          }, null)
        : null;

    let overallStatus: import('./platform-dashboard.types').DashboardOverallStatus = 'unknown';
    if (platformHealth) {
      overallStatus = platformHealth.overallStatus;
      if (resilience.overall === 'critical' || (billing && (billing.failedPayments ?? 0) > 0)) {
        overallStatus = 'critical';
      } else if (
        overallStatus === 'healthy' &&
        (resilience.overall === 'warning' ||
          incidents.some((i) => i.severity === 'warning'))
      ) {
        overallStatus = 'warning';
      }
    } else if (incidents.some((i) => i.severity === 'critical')) {
      overallStatus = 'critical';
    } else if (incidents.length > 0) {
      overallStatus = 'warning';
    }

    return {
      generatedAt,
      overallStatus,
      incidentSummary: {
        count: incidents.filter((i) => i.severity !== 'info').length,
        highestSeverity,
        affectedOrganizationCount: affectedOrgIds.size,
      },
      domainStatus,
      incidents: incidents.slice(0, 20),
      platformHealth,
      billing,
      connectivity,
      resilience,
      organizationsAttention,
      support,
      activity,
      businessContext,
      moduleErrors,
    };
  }

  private async loadSupportSnapshot(): Promise<
    import('./platform-dashboard.types').DashboardSupportSnapshotDto
  > {
    const [stats, newest] = await Promise.all([
      this.supportService.getStats(),
      this.supportService.getNewest(3),
    ]);
    const openTickets = stats.totalOpen ?? stats.unresolved ?? 0;
    return {
      openTickets,
      criticalOpen: stats.criticalOpen ?? 0,
      newest: newest.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        reporterName: t.reporterName ?? null,
        reporterEmail: t.reporterEmail ?? null,
        organizationName: null,
        lastActivityAt: t.lastActivityAt ?? null,
        createdAt: String(t.createdAt),
      })),
    };
  }

  private async loadActivityHighlights(): Promise<
    import('./platform-dashboard.types').DashboardActivityHighlightDto[]
  > {
    const logs = await this.prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 40,
      include: {
        organization: { select: { id: true, companyName: true } },
      },
    });

    return logs
      .filter(
        (log) =>
          PlatformDashboardService.HIGH_VALUE_ENTITIES.has(log.entity) ||
          log.action === 'DELETE' ||
          log.action === 'PRUNE',
      )
      .slice(0, 8)
      .map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        description: log.description,
        organizationId: log.organizationId,
        organizationName: log.organization?.companyName ?? null,
        createdAt: log.createdAt.toISOString(),
        drilldownView:
          log.entity === 'ORGANIZATION'
            ? 'organizations'
            : log.entity === 'SUBSCRIPTION'
              ? 'billing'
              : 'activity-log',
      }));
  }

  private async loadBusinessContext(): Promise<
    import('./platform-dashboard.types').DashboardBusinessContextDto
  > {
    const [activeOrganizations, totalUsers, totalProspects, billing] = await Promise.all([
      this.prisma.organization.count({ where: { status: OrganizationStatus.ACTIVE } }),
      this.prisma.user.count(),
      this.prisma.prospect.count(),
      this.billingAdmin.getOverview(),
    ]);
    return {
      activeOrganizations,
      totalUsers,
      totalProspects,
      mrr: billing.mrrIncomplete ? null : billing.mrr,
      mrrIncomplete: billing.mrrIncomplete ?? false,
      mrrIncompleteReason: billing.mrrIncompleteReason ?? null,
    };
  }

  private async loadOrganizationsAttention(): Promise<
    import('./platform-dashboard.types').OrganizationAttentionDto[]
  > {
    const pastDue = await this.prisma.billingSubscription.findMany({
      where: { status: BillingStatus.PAST_DUE },
      select: {
        organization: { select: { id: true, companyName: true } },
      },
      take: 20,
    });

    const openDrifts = await this.prisma.billingReconciliationDrift.findMany({
      where: { resolvedAt: null },
      select: {
        organization: { select: { id: true, companyName: true } },
      },
      take: 20,
    });

    const map = new Map<string, import('./platform-dashboard.types').OrganizationAttentionDto>();

    const upsert = (
      org: { id: string; companyName: string },
      reason: string,
      severity: 'critical' | 'warning',
    ) => {
      const existing = map.get(org.id);
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
        if (severity === 'critical') existing.severity = 'critical';
        return;
      }
      map.set(org.id, {
        organizationId: org.id,
        organizationName: org.companyName,
        reasons: [reason],
        severity,
        drilldownView: 'billing',
        drilldownParams: { masterBilling: 'organizations', orgId: org.id },
      });
    };

    for (const row of pastDue) {
      if (row.organization) upsert(row.organization, 'PAST_DUE', 'warning');
    }
    for (const row of openDrifts) {
      if (row.organization) upsert(row.organization, 'RECONCILIATION_DRIFT', 'critical');
    }

    const missingPmOrgs = await this.prisma.organization.findMany({
      where: {
        status: OrganizationStatus.ACTIVE,
        subscriptions: {
          some: { status: { in: [BillingStatus.ACTIVE, BillingStatus.TRIALING] } },
        },
        billingPaymentMethods: { none: { isDefault: true } },
      },
      select: { id: true, companyName: true },
      take: 20,
    });
    for (const org of missingPmOrgs) {
      upsert(org, 'PAYMENT_METHOD_MISSING', 'warning');
    }

    return Array.from(map.values())
      .sort((a, b) => (a.severity === 'critical' ? -1 : 1))
      .slice(0, 8);
  }
}

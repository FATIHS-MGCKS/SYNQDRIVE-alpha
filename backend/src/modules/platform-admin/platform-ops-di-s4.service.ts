import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { DI_V0_S4P2_PROMETHEUS_ALERT_RULES } from '../../../scripts/ops/di-v0-s4-gate6-open-rekill-production/di-v0-s4p2-alert-rules.contract';
import { DI_V0_S4_OPERATIONAL_STALE_AFTER_SECONDS } from '../vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-operational-prometheus.metrics';
import {
  parseDiV0S4ControlPlaneConfig,
  DI_V0_S4_ENV_FLAGS,
  DI_V0_S4_ENV_ALLOWLISTS,
} from '../vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { PlatformOpsAlertmanagerService } from './platform-ops-alertmanager.service';
import {
  PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS,
  computeS4MonitoringHealth,
  computeS4ProcessingState,
  isMetricsFresh,
  listS4MonitoringGaps,
} from './platform-ops-di-s4.status';
import type {
  PlatformOpsDiS4ActiveAlertDto,
  PlatformOpsDiS4DimoReplicaDto,
  PlatformOpsDiS4RuleHealthDto,
  PlatformOpsDiS4SchedulerReplicaDto,
  PlatformOpsDiS4StatusDto,
} from './platform-ops-di-s4.types';

const S4_RULE_GROUP = 'synqdrive_di_v0_s4_shadow';
const IAM_SEED_ALERT = 'IamSeedAdminEnabledInProduction';
const S4_ALERT_PREFIX = 'DiV0S4';

interface PromQueryResult {
  metric: Record<string, string>;
  value: [number, string];
}

interface PromRuleRow {
  name?: string;
  type?: string;
  state?: string;
  health?: string;
  labels?: Record<string, string>;
}

@Injectable()
export class PlatformOpsDiS4Service {
  private readonly logger = new Logger(PlatformOpsDiS4Service.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly alertmanager: PlatformOpsAlertmanagerService,
  ) {}

  async getStatus(): Promise<PlatformOpsDiS4StatusDto> {
    const generatedAt = new Date().toISOString();
    const nowUnix = Math.floor(Date.now() / 1000);
    const prometheusUrl =
      this.config.get<string>('PROMETHEUS_INTERNAL_URL') ?? 'http://127.0.0.1:9090';
    const envSnapshot = this.buildEnvSnapshot();
    const runtimeConfig = parseDiV0S4ControlPlaneConfig(envSnapshot);

    const [globalKill, workItemsByStatus, promBundle, amAlerts, amSummary] = await Promise.all([
      this.loadGlobalKill(),
      this.loadWorkItemCounts(),
      this.loadPrometheusBundle(prometheusUrl),
      this.loadAlertmanagerAlerts(),
      this.alertmanager.getSummary(),
    ]);

    const vehicleAllowlistIds = [...runtimeConfig.vehicleAllowlist];
    const metricsFresh = isMetricsFresh(
      promBundle.lastSuccessUnixtime,
      promBundle.refreshError,
      DI_V0_S4_OPERATIONAL_STALE_AFTER_SECONDS,
      nowUnix,
    );

    const ruleHealth = this.buildRuleHealth(promBundle.ruleStates);
    const ruleHealthErrCount = ruleHealth.filter((r) => r.health === 'err').length;

    const s4Alerts = amAlerts.filter((a) => a.alertname.startsWith(S4_ALERT_PREFIX));
    const s4FiringCritical = s4Alerts.filter(
      (a) => a.severity === 'critical' && a.state !== 'pending',
    ).length;
    const s4FiringWarning = s4Alerts.filter(
      (a) => a.severity === 'warning' && a.state !== 'pending',
    ).length;

    const schedulerReplicas = this.mergeSchedulerReplicas(
      promBundle.schedulerLeaderByReplica,
      promBundle.operationalRefreshLeaderByReplica,
    );
    const leaderCount = promBundle.schedulerLeaderByReplica
      ? Object.values(promBundle.schedulerLeaderByReplica).filter((v) => v === 1).length
      : null;
    const operationalRefreshLeaderCount = promBundle.operationalRefreshLeaderByReplica
      ? Object.values(promBundle.operationalRefreshLeaderByReplica).filter((v) => v === 1).length
      : null;

    const dimoReplicas = this.buildDimoReplicas(
      promBundle.dimoBudgetEnabledByReplica,
      promBundle.dimoCooldownByReplica,
      promBundle.dimoRedisErrorsByReplica,
    );
    const allReplicasBudgetEnabled =
      dimoReplicas.length > 0
        ? dimoReplicas.every((r) => r.budgetEnabled === true)
        : null;

    const iamInPlatformAlerts = amAlerts.some((a) => a.alertname === IAM_SEED_ALERT);

    const schedulerReplicasObserved = promBundle.schedulerLeaderByReplica
      ? Object.keys(promBundle.schedulerLeaderByReplica)
      : [];
    const dimoBudgetReplicasObserved = promBundle.dimoBudgetEnabledByReplica
      ? Object.keys(promBundle.dimoBudgetEnabledByReplica)
      : [];
    const dimoBudgetDisabledOnReplica = dimoReplicas.some(
      (r) =>
        (PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS as readonly string[]).includes(r.replica) &&
        r.budgetEnabled === false,
    );

    const monitoringEvidence = {
      prometheusAvailable: promBundle.available,
      alertmanagerAvailable: amSummary.available,
      globalKillReadable: globalKill.readable,
      metricsFresh,
      refreshError: promBundle.refreshError,
      rulesLoadedCount: ruleHealth.filter((r) => r.loadedInPrometheus).length,
      expectedRuleCount: DI_V0_S4P2_PROMETHEUS_ALERT_RULES.length,
      ruleHealthErrCount,
      schedulerLeaderCount: leaderCount,
      expectedReplicas: PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS,
      schedulerReplicasObserved,
      dimoBudgetReplicasObserved,
      dimoBudgetDisabledOnReplica,
      controlPlaneReadable: promBundle.controlPlaneReadable,
      s4FiringCriticalCount: s4FiringCritical,
      s4FiringWarningCount: s4FiringWarning,
    };

    const monitoringHealth = computeS4MonitoringHealth(monitoringEvidence);
    const monitoringGaps = listS4MonitoringGaps(monitoringEvidence);
    const processingState = computeS4ProcessingState({
      masterEnabled: runtimeConfig.masterEnabled,
      globalKillState: globalKill.state,
      shadowPlaneEngaged: promBundle.shadowPlaneEngaged,
    });

    const lastSuccessAt =
      promBundle.lastSuccessUnixtime != null && promBundle.lastSuccessUnixtime > 0
        ? new Date(promBundle.lastSuccessUnixtime * 1000).toISOString()
        : null;

    const ageSeconds =
      promBundle.lastSuccessUnixtime != null && promBundle.lastSuccessUnixtime > 0
        ? nowUnix - promBundle.lastSuccessUnixtime
        : null;

    return {
      generatedAt,
      processingState,
      monitoringHealth,
      monitoringGaps,
      prometheusAvailable: promBundle.available,
      alertmanagerAvailable: amSummary.available,
      globalKill,
      runtimeFlags: {
        masterEnabled: runtimeConfig.masterEnabled,
        discoveryEnabled: runtimeConfig.discoveryEnabled,
        workerEnabled: runtimeConfig.workerEnabled,
        positionEnabled: runtimeConfig.positionEnabled,
        r1Enabled: runtimeConfig.r1Enabled,
        nativeEnabled: runtimeConfig.nativeEnabled,
      },
      cohort: {
        authorizedVehicleCount: vehicleAllowlistIds.length,
        organizationAllowlistCount: runtimeConfig.organizationAllowlist.size,
        vehicleAllowlistIds,
      },
      metricsRefresh: {
        lastSuccessAt,
        lastSuccessUnixtime: promBundle.lastSuccessUnixtime,
        ageSeconds,
        staleAfterSeconds: DI_V0_S4_OPERATIONAL_STALE_AFTER_SECONDS,
        refreshError: promBundle.refreshError,
        metricsFresh,
      },
      schedulerLeader: {
        leaderCount,
        operationalRefreshLeaderCount,
        expectedReplicaCount: PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS.length,
        replicas: schedulerReplicas,
      },
      dimoBudget: {
        replicas: dimoReplicas,
        allReplicasBudgetEnabled,
      },
      shadowProcessing: {
        shadowPlaneEngaged: promBundle.shadowPlaneEngaged,
        activitySignal: promBundle.activitySignal,
        workItemsByStatus,
      },
      prometheusRules: {
        groupName: S4_RULE_GROUP,
        expectedRuleCount: DI_V0_S4P2_PROMETHEUS_ALERT_RULES.length,
        loadedRuleCount: ruleHealth.filter((r) => r.loadedInPrometheus).length,
        evaluationInterval: promBundle.ruleEvaluationInterval,
        rules: ruleHealth,
      },
      s4ActiveAlerts: s4Alerts,
      iamSeedAdminFinding: {
        alertname: IAM_SEED_ALERT,
        representedInPlatformAlerts: iamInPlatformAlerts,
        representedInS4Panel: false,
        cause:
          'Production process exports iam_seed_admin_enabled=1 when ENABLE_SEED_ADMIN (or equivalent seed-admin bootstrap) remains enabled after initial IAM setup.',
        impact:
          'A long-lived seed/master bootstrap account bypasses normal tenant-scoped IAM controls and expands blast radius if credentials leak.',
        remediation:
          'After bootstrap: set ENABLE_SEED_ADMIN=false in production env, revoke or rotate seed credentials, verify Prometheus iam_seed_admin_enabled==0 for 5m (alert clears per alerts.yml).',
      },
      dataFreshness: {
        controlPlaneReadable: promBundle.controlPlaneReadable,
        source: promBundle.available ? 'mixed' : globalKill.readable ? 'database' : 'none',
      },
    };
  }

  private buildEnvSnapshot(): Record<string, string | undefined> {
    const keys = [
      ...Object.values(DI_V0_S4_ENV_FLAGS),
      ...Object.values(DI_V0_S4_ENV_ALLOWLISTS),
    ];
    const snap: Record<string, string | undefined> = {};
    for (const key of keys) {
      snap[key] = this.config.get<string>(key) ?? process.env[key];
    }
    return snap;
  }

  private async loadGlobalKill(): Promise<PlatformOpsDiS4StatusDto['globalKill']> {
    try {
      const row = await this.prisma.diV0S4Control.findUnique({
        where: { id: 'GLOBAL' },
        select: { killState: true, updatedAt: true },
      });
      if (!row) {
        return { state: 'UNKNOWN', updatedAt: null, readable: false };
      }
      let state: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN';
      if (row.killState === 'NOT_KILLED') state = 'NOT_KILLED';
      else if (row.killState === 'KILLED') state = 'KILLED';
      else state = 'UNKNOWN';
      return {
        state,
        updatedAt: row.updatedAt.toISOString(),
        readable: true,
      };
    } catch (err: unknown) {
      this.logger.debug(`GLOBAL kill row unreadable: ${(err as Error).message}`);
      return { state: 'UNKNOWN', updatedAt: null, readable: false };
    }
  }

  private async loadWorkItemCounts(): Promise<Record<string, number>> {
    try {
      const rows = await this.prisma.diV0S4WorkItem.groupBy({
        by: ['status'],
        _count: { _all: true },
      });
      const out: Record<string, number> = {};
      for (const row of rows) {
        out[row.status] = row._count._all;
      }
      return out;
    } catch (err: unknown) {
      this.logger.debug(`S4 work item counts unavailable: ${(err as Error).message}`);
      return {};
    }
  }

  private async loadAlertmanagerAlerts(): Promise<PlatformOpsDiS4ActiveAlertDto[]> {
    const baseUrl = this.alertmanager.getAlertmanagerUrl();
    const enabled = this.config.get<string>('PLATFORM_OPS_ALERTMANAGER_ENABLED') !== 'false';
    if (!enabled) return [];

    try {
      const res = await fetch(`${baseUrl}/api/v2/alerts`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const alerts = (await res.json()) as Array<{
        status?: { state?: string };
        labels?: Record<string, string>;
        annotations?: Record<string, string>;
        startsAt?: string;
      }>;
      return alerts
        .filter((a) => (a.status?.state ?? 'active') !== 'suppressed')
        .map((a) => ({
          alertname: a.labels?.alertname ?? 'UnknownAlert',
          severity: (a.labels?.severity ?? 'warning').toLowerCase(),
          state: a.status?.state ?? 'active',
          summary: a.annotations?.summary ?? a.labels?.alertname ?? 'Alert',
          startsAt: a.startsAt ?? generatedAtFallback(),
          component: a.labels?.component ?? 'platform',
        }));
    } catch (err: unknown) {
      this.logger.debug(`Alertmanager alerts unavailable: ${(err as Error).message}`);
      return [];
    }
  }

  private async loadPrometheusBundle(baseUrl: string) {
    const empty = {
      available: false,
      lastSuccessUnixtime: null as number | null,
      refreshError: null as boolean | null,
      shadowPlaneEngaged: null as boolean | null,
      activitySignal: null as boolean | null,
      controlPlaneReadable: null as boolean | null,
      schedulerLeaderByReplica: null as Record<string, number> | null,
      operationalRefreshLeaderByReplica: null as Record<string, number> | null,
      dimoBudgetEnabledByReplica: null as Record<string, number> | null,
      dimoCooldownByReplica: null as Record<string, number> | null,
      dimoRedisErrorsByReplica: null as Record<string, number> | null,
      ruleStates: new Map<string, { state: string; health: string; severity: string }>(),
      ruleEvaluationInterval: null as string | null,
    };

    try {
      const [
        lastSuccess,
        refreshError,
        shadowEngaged,
        activitySignal,
        controlReadable,
        schedLeader,
        refreshLeader,
        dimoEnabled,
        dimoCooldown,
        dimoRedisErrors,
        rulesGroup,
      ] = await Promise.all([
        this.promInstantScalar(baseUrl, 'max(synqdrive_di_v0_s4_operational_last_success_unixtime)'),
        this.promInstantScalar(baseUrl, 'max(synqdrive_di_v0_s4_operational_refresh_error)'),
        this.promInstantScalar(baseUrl, 'max(synqdrive_di_v0_s4_shadow_plane_engaged)'),
        this.promInstantScalar(baseUrl, 'max(synqdrive_di_v0_s4_activity_signal)'),
        this.promInstantScalar(baseUrl, 'max(synqdrive_di_v0_s4_control_plane_readable)'),
        this.promInstantByReplica(baseUrl, 'synqdrive_scheduler_leader_status'),
        this.promInstantByReplica(baseUrl, 'synqdrive_di_v0_s4_operational_refresh_leader'),
        this.promInstantByReplica(baseUrl, 'synqdrive_dimo_global_budget_enabled'),
        this.promInstantByReplica(baseUrl, 'synqdrive_dimo_global_budget_cooldown_active'),
        this.promInstantByReplica(baseUrl, 'synqdrive_dimo_provider_limiter_redis_errors_total'),
        this.promRulesGroup(baseUrl, S4_RULE_GROUP),
      ]);

      return {
        available: true,
        lastSuccessUnixtime: lastSuccess,
        refreshError: refreshError == null ? null : refreshError >= 1,
        shadowPlaneEngaged: shadowEngaged == null ? null : shadowEngaged >= 1,
        activitySignal: activitySignal == null ? null : activitySignal >= 1,
        controlPlaneReadable: controlReadable == null ? null : controlReadable >= 1,
        schedulerLeaderByReplica: schedLeader,
        operationalRefreshLeaderByReplica: refreshLeader,
        dimoBudgetEnabledByReplica: dimoEnabled,
        dimoCooldownByReplica: dimoCooldown,
        dimoRedisErrorsByReplica: dimoRedisErrors,
        ruleStates: rulesGroup.ruleStates,
        ruleEvaluationInterval: rulesGroup.evaluationInterval,
      };
    } catch (err: unknown) {
      this.logger.debug(`Prometheus S4 bundle unavailable: ${(err as Error).message}`);
      return empty;
    }
  }

  private buildRuleHealth(
    ruleStates: Map<string, { state: string; health: string; severity: string }>,
  ): PlatformOpsDiS4RuleHealthDto[] {
    return DI_V0_S4P2_PROMETHEUS_ALERT_RULES.map((def) => {
      const loaded = ruleStates.get(def.alert);
      const evaluationState = loaded?.state ?? 'missing';
      return {
        alertname: def.alert,
        severity: def.severity,
        evaluationState: normalizeRuleState(evaluationState),
        health: loaded?.health === 'ok' ? 'ok' : loaded?.health === 'err' ? 'err' : 'unknown',
        loadedInPrometheus: loaded != null,
      };
    });
  }

  private mergeSchedulerReplicas(
    schedulerLeader: Record<string, number> | null,
    refreshLeader: Record<string, number> | null,
  ): PlatformOpsDiS4SchedulerReplicaDto[] {
    const keys = new Set<string>([
      ...Object.keys(schedulerLeader ?? {}),
      ...Object.keys(refreshLeader ?? {}),
    ]);
    if (keys.size === 0) return [];
    return [...keys].sort().map((replica) => ({
      replica,
      schedulerLeader: schedulerLeader?.[replica] == null ? null : schedulerLeader[replica] >= 1,
      operationalRefreshLeader: refreshLeader?.[replica] == null ? null : refreshLeader[replica] >= 1,
    }));
  }

  private buildDimoReplicas(
    enabled: Record<string, number> | null,
    cooldown: Record<string, number> | null,
    redisErrors: Record<string, number> | null,
  ): PlatformOpsDiS4DimoReplicaDto[] {
    const keys = new Set<string>([
      ...Object.keys(enabled ?? {}),
      ...Object.keys(cooldown ?? {}),
      ...Object.keys(redisErrors ?? {}),
    ]);
    if (keys.size === 0) return [];
    return [...keys].sort().map((replica) => ({
      replica,
      budgetEnabled: enabled?.[replica] == null ? null : enabled[replica] >= 1,
      cooldownActive: cooldown?.[replica] == null ? null : cooldown[replica] >= 1,
      redisErrorsTotal: redisErrors?.[replica] ?? null,
    }));
  }

  private async promInstantScalar(baseUrl: string, query: string): Promise<number | null> {
    const results = await this.promInstantQuery(baseUrl, query);
    if (results.length === 0) return null;
    const num = Number.parseFloat(results[0].value[1]);
    return Number.isFinite(num) ? num : null;
  }

  private async promInstantByReplica(
    baseUrl: string,
    metric: string,
  ): Promise<Record<string, number> | null> {
    const results = await this.promInstantQuery(baseUrl, metric);
    if (results.length === 0) return null;
    const out: Record<string, number> = {};
    for (const row of results) {
      const replica = row.metric.replica ?? row.metric.instance ?? 'unknown';
      const num = Number.parseFloat(row.value[1]);
      if (Number.isFinite(num)) out[replica] = num;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  private async promInstantQuery(baseUrl: string, query: string): Promise<PromQueryResult[]> {
    const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Prometheus query HTTP ${res.status}`);
    const body = (await res.json()) as {
      status?: string;
      data?: { result?: PromQueryResult[] };
    };
    if (body.status !== 'success') throw new Error('Prometheus query failed');
    return body.data?.result ?? [];
  }

  private async promRulesGroup(baseUrl: string, groupName: string) {
    const url = `${baseUrl}/api/v1/rules?type=alert`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Prometheus rules HTTP ${res.status}`);
    const body = (await res.json()) as {
      status?: string;
      data?: {
        groups?: Array<{
          name?: string;
          interval?: number;
          rules?: PromRuleRow[];
        }>;
      };
    };
    if (body.status !== 'success') throw new Error('Prometheus rules failed');
    const group = body.data?.groups?.find((g) => g.name === groupName);
    const ruleStates = new Map<string, { state: string; health: string; severity: string }>();
    if (group?.rules) {
      for (const rule of group.rules) {
        if (!rule.name) continue;
        ruleStates.set(rule.name, {
          state: rule.state ?? 'unknown',
          health: rule.health ?? 'unknown',
          severity: (rule.labels?.severity ?? 'warning').toLowerCase(),
        });
      }
    }
    const evaluationInterval =
      group?.interval != null ? `${group.interval}s` : null;
    return { ruleStates, evaluationInterval };
  }
}

function normalizeRuleState(state: string): PlatformOpsDiS4RuleHealthDto['evaluationState'] {
  if (state === 'inactive' || state === 'pending' || state === 'firing') return state;
  if (state === 'missing') return 'missing';
  return 'unknown';
}

function generatedAtFallback(): string {
  return new Date().toISOString();
}

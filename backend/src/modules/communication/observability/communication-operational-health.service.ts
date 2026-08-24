import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import communicationOperationalHealthConfig from '@config/communication-operational-health.config';
import communicationRetentionConfig from '@config/communication-retention.config';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE } from '../retention/communication-retention.constants';
import { CommunicationRetentionMetrics } from '../retention/communication-retention.metrics';
import {
  COMMUNICATION_HEALTH_COMPONENT,
  COMMUNICATION_HEALTH_DIAGNOSTIC,
  COMMUNICATION_HEALTH_STATE,
  type CommunicationHealthComponent,
  type CommunicationHealthDiagnostic,
  type CommunicationHealthState,
} from './communication-operational-health.constants';
import { CommunicationOperationalHealthRepository } from './communication-operational-health.repository';
import type {
  CommunicationHealthComponentSnapshot,
  CommunicationOperationalHealthQueryOptions,
  CommunicationOperationalHealthSnapshot,
} from './communication-operational-health.types';
import {
  setCommunicationRetentionLastSuccessTimestamp,
  setCommunicationSendUnknownCurrent,
  setCommunicationSendUnknownOldestSeconds,
} from './communication-prometheus.metrics';

@Injectable()
export class CommunicationOperationalHealthService {
  private readonly logger = new Logger(CommunicationOperationalHealthService.name);
  private readonly startedAt = Date.now();
  private cache:
    | { key: string; expiresAt: number; snapshot: CommunicationOperationalHealthSnapshot }
    | null = null;

  constructor(
    private readonly repository: CommunicationOperationalHealthRepository,
    @Inject(communicationOperationalHealthConfig.KEY)
    private readonly healthConfig: ConfigType<typeof communicationOperationalHealthConfig>,
    @Inject(communicationRetentionConfig.KEY)
    private readonly retentionConfig: ConfigType<typeof communicationRetentionConfig>,
    @Optional() private readonly retentionMetrics?: CommunicationRetentionMetrics,
    @Optional() private readonly tripMetrics?: TripMetricsService,
  ) {}

  async evaluate(
    options: CommunicationOperationalHealthQueryOptions = {},
  ): Promise<CommunicationOperationalHealthSnapshot> {
    const now = options.now ?? new Date();
    const cacheKey = options.organizationId ?? '__global__';
    if (this.cache && this.cache.key === cacheKey && this.cache.expiresAt > now.getTime()) {
      return this.cache.snapshot;
    }

    const checkedAt = now.toISOString();
    const inStartupGrace = now.getTime() - this.startedAt < this.healthConfig.startupGraceMs;

    const componentResults = await Promise.allSettled([
      this.evaluateProjection(options.organizationId, now, inStartupGrace),
      this.evaluateOutbound(options.organizationId, now, inStartupGrace),
      this.evaluateReconciliation(options.organizationId, now, inStartupGrace),
      this.evaluateHandoff(options.organizationId, now, inStartupGrace),
      this.evaluateMedia(inStartupGrace),
      this.evaluateAi(inStartupGrace),
      this.evaluateRetention(options.organizationId, now, inStartupGrace),
      this.evaluateChannelReadiness(inStartupGrace),
    ]);

    const components = {
      [COMMUNICATION_HEALTH_COMPONENT.PROJECTION]: this.unwrapComponent(
        componentResults[0],
        COMMUNICATION_HEALTH_COMPONENT.PROJECTION,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.OUTBOUND]: this.unwrapComponent(
        componentResults[1],
        COMMUNICATION_HEALTH_COMPONENT.OUTBOUND,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.RECONCILIATION]: this.unwrapComponent(
        componentResults[2],
        COMMUNICATION_HEALTH_COMPONENT.RECONCILIATION,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.HANDOFF]: this.unwrapComponent(
        componentResults[3],
        COMMUNICATION_HEALTH_COMPONENT.HANDOFF,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.MEDIA]: this.unwrapComponent(
        componentResults[4],
        COMMUNICATION_HEALTH_COMPONENT.MEDIA,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.AI]: this.unwrapComponent(
        componentResults[5],
        COMMUNICATION_HEALTH_COMPONENT.AI,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.RETENTION]: this.unwrapComponent(
        componentResults[6],
        COMMUNICATION_HEALTH_COMPONENT.RETENTION,
        checkedAt,
      ),
      [COMMUNICATION_HEALTH_COMPONENT.CHANNEL_READINESS]: this.unwrapComponent(
        componentResults[7],
        COMMUNICATION_HEALTH_COMPONENT.CHANNEL_READINESS,
        checkedAt,
      ),
    };

    const snapshot: CommunicationOperationalHealthSnapshot = {
      overall: this.aggregateOverall(components),
      checkedAt,
      cacheExpiresAt: new Date(now.getTime() + this.healthConfig.cacheTtlMs).toISOString(),
      components,
    };

    this.cache = {
      key: cacheKey,
      expiresAt: now.getTime() + this.healthConfig.cacheTtlMs,
      snapshot,
    };

    return snapshot;
  }

  private unwrapComponent(
    result: PromiseSettledResult<CommunicationHealthComponentSnapshot>,
    component: CommunicationHealthComponent,
    checkedAt: string,
  ): CommunicationHealthComponentSnapshot {
    if (result.status === 'fulfilled') return result.value;
    this.logger.warn(
      `Communication health component ${component} evaluation failed: ${(result.reason as Error)?.message ?? 'unknown'}`,
    );
    return {
      state: COMMUNICATION_HEALTH_STATE.UNKNOWN,
      diagnostics: [COMMUNICATION_HEALTH_DIAGNOSTIC.QUERY_UNAVAILABLE],
      checkedAt,
      signals: {},
    };
  }

  private async evaluateProjection(
    organizationId: string | undefined,
    now: Date,
    inStartupGrace: boolean,
  ): Promise<CommunicationHealthComponentSnapshot> {
    const [whatsapp, voice] = await Promise.all([
      this.repository.getWhatsAppWebhookBacklog(organizationId, now),
      this.repository.getVoiceWebhookBacklog(now),
    ]);

    const diagnostics: CommunicationHealthDiagnostic[] = [];
    let state: CommunicationHealthState = COMMUNICATION_HEALTH_STATE.HEALTHY;

    if (whatsapp.oldestAgeSeconds != null) {
      if (whatsapp.oldestAgeSeconds >= this.healthConfig.whatsappWebhookOldestSecondsUnhealthy) {
        state = COMMUNICATION_HEALTH_STATE.UNHEALTHY;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.WHATSAPP_WEBHOOK_BACKLOG);
      } else if (whatsapp.oldestAgeSeconds >= this.healthConfig.whatsappWebhookOldestSecondsDegraded) {
        state = this.maxSeverity(state, COMMUNICATION_HEALTH_STATE.DEGRADED);
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.WHATSAPP_WEBHOOK_BACKLOG);
      }
    }

    if (voice.oldestAgeSeconds != null) {
      if (voice.oldestAgeSeconds >= this.healthConfig.voiceWebhookOldestSecondsUnhealthy) {
        state = COMMUNICATION_HEALTH_STATE.UNHEALTHY;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.VOICE_WEBHOOK_BACKLOG);
      } else if (voice.oldestAgeSeconds >= this.healthConfig.voiceWebhookOldestSecondsDegraded) {
        state = this.maxSeverity(state, COMMUNICATION_HEALTH_STATE.DEGRADED);
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.VOICE_WEBHOOK_BACKLOG);
      }
    }

    if (inStartupGrace && state === COMMUNICATION_HEALTH_STATE.HEALTHY) {
      state = COMMUNICATION_HEALTH_STATE.UNKNOWN;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.INSUFFICIENT_EVIDENCE);
    }

    return {
      state,
      diagnostics,
      checkedAt: now.toISOString(),
      signals: {
        whatsappWebhookBacklogBounded: whatsapp.unprocessedCountBounded,
        whatsappWebhookOldestAgeSeconds: whatsapp.oldestAgeSeconds,
        voiceWebhookBacklogBounded: voice.unprocessedCountBounded,
        voiceWebhookOldestAgeSeconds: voice.oldestAgeSeconds,
        canonicalProjectionLagMeasurable: false,
      },
    };
  }

  private async evaluateOutbound(
    organizationId: string | undefined,
    now: Date,
    inStartupGrace: boolean,
  ): Promise<CommunicationHealthComponentSnapshot> {
    const unknown = await this.repository.getUnknownSendSignals(organizationId, now);
    const diagnostics: CommunicationHealthDiagnostic[] = [];
    let state: CommunicationHealthState = COMMUNICATION_HEALTH_STATE.HEALTHY;

    if (unknown.count > 0) {
      if (
        unknown.count >= this.healthConfig.unknownCountUnhealthy ||
        (unknown.oldestAgeSeconds != null &&
          unknown.oldestAgeSeconds >= this.healthConfig.unknownOldestSecondsUnhealthy)
      ) {
        state = COMMUNICATION_HEALTH_STATE.UNHEALTHY;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.SEND_UNKNOWN_BACKLOG);
      } else if (
        unknown.count >= this.healthConfig.unknownCountDegraded ||
        (unknown.oldestAgeSeconds != null &&
          unknown.oldestAgeSeconds >= this.healthConfig.unknownOldestSecondsDegraded)
      ) {
        state = COMMUNICATION_HEALTH_STATE.DEGRADED;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.SEND_UNKNOWN_BACKLOG);
      }
    }

    if (this.tripMetrics) {
      setCommunicationSendUnknownCurrent(this.tripMetrics, 'whatsapp', unknown.count);
      setCommunicationSendUnknownOldestSeconds(this.tripMetrics, 'whatsapp', unknown.oldestAgeSeconds);
    }

    if (inStartupGrace && unknown.count === 0) {
      state = COMMUNICATION_HEALTH_STATE.UNKNOWN;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.INSUFFICIENT_EVIDENCE);
    }

    return {
      state,
      diagnostics,
      checkedAt: now.toISOString(),
      signals: {
        unknownSendCountBounded: unknown.count,
        unknownSendOldestAgeSeconds: unknown.oldestAgeSeconds,
      },
    };
  }

  private async evaluateReconciliation(
    organizationId: string | undefined,
    now: Date,
    inStartupGrace: boolean,
  ): Promise<CommunicationHealthComponentSnapshot> {
    const unknown = await this.repository.getUnknownSendSignals(organizationId, now);
    const diagnostics: CommunicationHealthDiagnostic[] = [];
    let state: CommunicationHealthState = COMMUNICATION_HEALTH_STATE.HEALTHY;

    if (unknown.count > 0) {
      state = COMMUNICATION_HEALTH_STATE.DEGRADED;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.SEND_UNKNOWN_BACKLOG);
    }

    if (inStartupGrace) {
      state = COMMUNICATION_HEALTH_STATE.UNKNOWN;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.INSUFFICIENT_EVIDENCE);
    }

    return {
      state,
      diagnostics,
      checkedAt: now.toISOString(),
      signals: {
        unresolvedUnknownCountBounded: unknown.count,
        automaticVoiceReconciliationAuthority: 'voice_webhook_processing',
        dedicatedReconciliationEngine: false,
      },
    };
  }

  private async evaluateHandoff(
    organizationId: string | undefined,
    now: Date,
    _inStartupGrace: boolean,
  ): Promise<CommunicationHealthComponentSnapshot> {
    const handoff = await this.repository.getHandoffSignals(organizationId, now);
    const diagnostics: CommunicationHealthDiagnostic[] = [];
    let state: CommunicationHealthState = COMMUNICATION_HEALTH_STATE.HEALTHY;

    if (handoff.humanRequiredCount > 0 && handoff.oldestAgeSeconds != null) {
      if (handoff.oldestAgeSeconds >= this.healthConfig.handoffOldestSecondsUnhealthy) {
        state = COMMUNICATION_HEALTH_STATE.UNHEALTHY;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.HANDOFF_BACKLOG);
      } else if (handoff.oldestAgeSeconds >= this.healthConfig.handoffOldestSecondsDegraded) {
        state = COMMUNICATION_HEALTH_STATE.DEGRADED;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.HANDOFF_BACKLOG);
      }
    }

    return {
      state,
      diagnostics,
      checkedAt: now.toISOString(),
      signals: {
        humanRequiredCountBounded: handoff.humanRequiredCount,
        oldestHumanRequiredAgeSeconds: handoff.oldestAgeSeconds,
      },
    };
  }

  private async evaluateMedia(inStartupGrace: boolean): Promise<CommunicationHealthComponentSnapshot> {
    return {
      state: inStartupGrace ? COMMUNICATION_HEALTH_STATE.UNKNOWN : COMMUNICATION_HEALTH_STATE.HEALTHY,
      diagnostics: inStartupGrace ? [COMMUNICATION_HEALTH_DIAGNOSTIC.INSUFFICIENT_EVIDENCE] : [],
      checkedAt: new Date().toISOString(),
      signals: {
        mediaMetricsInstrumented: false,
      },
    };
  }

  private async evaluateAi(inStartupGrace: boolean): Promise<CommunicationHealthComponentSnapshot> {
    return {
      state: inStartupGrace ? COMMUNICATION_HEALTH_STATE.UNKNOWN : COMMUNICATION_HEALTH_STATE.HEALTHY,
      diagnostics: inStartupGrace ? [COMMUNICATION_HEALTH_DIAGNOSTIC.INSUFFICIENT_EVIDENCE] : [],
      checkedAt: new Date().toISOString(),
      signals: {
        aiFailureRateMeasurable: false,
      },
    };
  }

  private async evaluateRetention(
    organizationId: string | undefined,
    now: Date,
    inStartupGrace: boolean,
  ): Promise<CommunicationHealthComponentSnapshot> {
    const retention = await this.repository.getRetentionSignals(
      this.retentionConfig.enabled,
      this.retentionConfig.dryRun,
      now,
      organizationId,
    );
    const metricsSnapshot = this.retentionMetrics?.getSnapshot();

    if (!retention.enabled) {
      return {
        state: COMMUNICATION_HEALTH_STATE.DISABLED,
        diagnostics: [],
        checkedAt: now.toISOString(),
        signals: {
          enabled: false,
          dryRun: retention.dryRun,
          policyDaysConfigured: false,
        },
      };
    }

    const diagnostics: CommunicationHealthDiagnostic[] = [];
    let state: CommunicationHealthState = COMMUNICATION_HEALTH_STATE.HEALTHY;

    if (retention.lastRunErrorCode === COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST) {
      state = COMMUNICATION_HEALTH_STATE.UNHEALTHY;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.RETENTION_LOCK_LOST);
    } else if (retention.lastRunStatus === 'FAILED') {
      state = COMMUNICATION_HEALTH_STATE.UNHEALTHY;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.RETENTION_RUN_FAILED);
    } else if (retention.lastSuccessAt) {
      const staleSeconds = Math.floor(
        (now.getTime() - new Date(retention.lastSuccessAt).getTime()) / 1000,
      );
      if (staleSeconds >= this.healthConfig.retentionStaleSecondsDegraded) {
        state = COMMUNICATION_HEALTH_STATE.DEGRADED;
        diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.RETENTION_STALE);
      }
      if (this.tripMetrics) {
        setCommunicationRetentionLastSuccessTimestamp(
          this.tripMetrics,
          Math.floor(new Date(retention.lastSuccessAt).getTime() / 1000),
        );
      }
    } else if (!inStartupGrace && !retention.dryRun) {
      state = COMMUNICATION_HEALTH_STATE.DEGRADED;
      diagnostics.push(COMMUNICATION_HEALTH_DIAGNOSTIC.RETENTION_STALE);
    }

    return {
      state,
      diagnostics,
      checkedAt: now.toISOString(),
      signals: {
        enabled: retention.enabled,
        dryRun: retention.dryRun,
        lastRunStatus: retention.lastRunStatus,
        lastRunErrorCode: retention.lastRunErrorCode,
        lastSuccessAt: retention.lastSuccessAt,
        lockContentionSkipsRecent: retention.lockContentionSkipsRecent,
        lastRunDurationMs: metricsSnapshot?.lastRunDurationMs ?? null,
        lastRunAffected: metricsSnapshot?.lastRunAffected ?? null,
        lastRunFailed: metricsSnapshot?.lastRunFailed ?? null,
      },
    };
  }

  private async evaluateChannelReadiness(
    inStartupGrace: boolean,
  ): Promise<CommunicationHealthComponentSnapshot> {
    return {
      state: inStartupGrace ? COMMUNICATION_HEALTH_STATE.UNKNOWN : COMMUNICATION_HEALTH_STATE.NOT_APPLICABLE,
      diagnostics: inStartupGrace ? [COMMUNICATION_HEALTH_DIAGNOSTIC.INSUFFICIENT_EVIDENCE] : [],
      checkedAt: new Date().toISOString(),
      signals: {
        authority: 'platform_integrations_and_org_channel_config',
        emailConversationBoundary: 'transactional_outside_conversation_v1',
      },
    };
  }

  private aggregateOverall(
    components: Record<CommunicationHealthComponent, CommunicationHealthComponentSnapshot>,
  ): CommunicationHealthState {
    const states = Object.values(components).map((component) => component.state);
    if (states.some((state) => state === COMMUNICATION_HEALTH_STATE.UNHEALTHY)) {
      return COMMUNICATION_HEALTH_STATE.UNHEALTHY;
    }
    if (states.some((state) => state === COMMUNICATION_HEALTH_STATE.DEGRADED)) {
      return COMMUNICATION_HEALTH_STATE.DEGRADED;
    }
    if (states.every((state) => state === COMMUNICATION_HEALTH_STATE.DISABLED || state === COMMUNICATION_HEALTH_STATE.NOT_APPLICABLE)) {
      return COMMUNICATION_HEALTH_STATE.HEALTHY;
    }
    if (states.some((state) => state === COMMUNICATION_HEALTH_STATE.UNKNOWN)) {
      return COMMUNICATION_HEALTH_STATE.UNKNOWN;
    }
    return COMMUNICATION_HEALTH_STATE.HEALTHY;
  }

  private maxSeverity(current: CommunicationHealthState, next: CommunicationHealthState): CommunicationHealthState {
    const rank: Record<CommunicationHealthState, number> = {
      [COMMUNICATION_HEALTH_STATE.HEALTHY]: 0,
      [COMMUNICATION_HEALTH_STATE.NOT_APPLICABLE]: 0,
      [COMMUNICATION_HEALTH_STATE.NOT_CONFIGURED]: 1,
      [COMMUNICATION_HEALTH_STATE.DISABLED]: 1,
      [COMMUNICATION_HEALTH_STATE.UNKNOWN]: 2,
      [COMMUNICATION_HEALTH_STATE.DEGRADED]: 3,
      [COMMUNICATION_HEALTH_STATE.UNHEALTHY]: 4,
    };
    return rank[next] > rank[current] ? next : current;
  }
}

import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { DataAuthorizationAuditEventKind } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import { DataAuthorizationAuditOutboxRepository } from '../privacy-domain/audit-log/data-authorization-audit-outbox.repository';
import { buildAuditIdempotencyKey } from '../privacy-domain/audit-log/data-authorization-audit.constants';
import {
  DENY_SWITCH,
  DENY_SWITCH_REASON,
  DENY_SWITCH_SCOPE,
  buildDenySwitchScopeKey,
} from './deny-switch.constants';
import {
  evaluateDenySwitchLocal,
  isQueueEnqueueDeniedLocal,
  rowToLocalEntry,
} from './deny-switch.evaluator';
import { DenySwitchLocalStore } from './deny-switch.local-store';
import { DenySwitchMetricsService } from './deny-switch.metrics';
import { DenySwitchPropagationService } from './deny-switch.propagation.service';
import { DenySwitchRepository } from './deny-switch.repository';
import type {
  DenySwitchActivateInput,
  DenySwitchActivateResult,
  DenySwitchEvaluationContext,
  DenySwitchEvaluationResult,
} from './deny-switch.types';

@Injectable()
export class DenySwitchService {
  private readonly logger = new Logger(DenySwitchService.name);
  private readonly startedAt = Date.now();
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DenySwitchRepository,
    private readonly localStore: DenySwitchLocalStore,
    private readonly propagation: DenySwitchPropagationService,
    private readonly metrics: DenySwitchMetricsService,
    private readonly auditOutbox: DataAuthorizationAuditOutboxRepository,
    @Inject(forwardRef(() => AuthorizationDecisionService))
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly redis: RedisService,
  ) {}

  startReconciliationLoop(): void {
    if (this.reconciliationTimer) return;
    if (process.env.DATA_AUTH_DENY_SWITCH_RECONCILE_ENABLED === 'false') return;
    this.reconciliationTimer = setInterval(() => {
      void this.reconcileFromDatabase().catch((err) => {
        this.logger.error(
          `Deny-switch reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }, DENY_SWITCH.reconciliationIntervalMs);
    this.reconciliationTimer.unref?.();
  }

  stopReconciliationLoop(): void {
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = null;
    }
  }

  async hydrateFromDatabase(): Promise<number> {
    const rows = await this.repo.findAllActive();
    this.localStore.clear();
    for (const row of rows) {
      this.localStore.apply(rowToLocalEntry(row));
    }
    this.localStore.markReady();
    this.logger.log(`Deny-switch hydrated ${rows.length} active entries from database`);
    return rows.length;
  }

  async reconcileFromDatabase(): Promise<number> {
    const rows = await this.repo.findAllActive();
    let applied = 0;
    for (const row of rows) {
      if (this.localStore.apply(rowToLocalEntry(row))) applied++;
    }
    this.localStore.markReady();
    this.metrics.increment({ outcome: 'reconciliation' });
    return applied;
  }

  /**
   * Synchronous fail-closed activation — DB first, local immediately, then cache + pub/sub.
   */
  async activateSync(input: DenySwitchActivateInput): Promise<DenySwitchActivateResult> {
    const idempotencyKey = this.repo.buildIdempotencyKey(input);
    const localAppliedAt = new Date();

    const { row, idempotentReplay } = await this.prisma.$transaction(async (tx) => {
      const result = await this.repo.activateInTransaction(tx, { ...input, idempotencyKey });
      await this.auditOutbox.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: buildAuditIdempotencyKey({
          eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
          organizationId: input.organizationId,
          correlationId: `${input.correlationId}:deny-switch`,
        }),
        eventKind: DataAuthorizationAuditEventKind.LIFECYCLE_CHANGE,
        correlationId: input.correlationId,
        payload: {
          entityType: 'DENY_SWITCH',
          entityId: buildDenySwitchScopeKey(input),
          eventType: 'DENY_SWITCH_ACTIVATED',
          newStatus: 'ACTIVE',
          scopeType: input.scopeType,
          scopeEntityId: input.scopeEntityId ?? null,
          trigger: input.trigger,
          sequence: result.row.sequence.toString(),
          actorUserId: input.actorUserId ?? null,
        },
      });
      return result;
    });

    const entry = rowToLocalEntry(row);
    this.localStore.apply(entry);
    this.localStore.markReady();
    this.metrics.increment({ outcome: 'local_apply', scopeType: input.scopeType });

    this.authorizationDecision.invalidateOrganizationCache(input.organizationId);

    void this.propagation.publish(this.redis, {
      organizationId: entry.organizationId,
      scopeType: entry.scopeType,
      scopeEntityId: entry.scopeEntityId,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      sequence: entry.sequence.toString(),
      active: true,
      blocksIngest: entry.blocksIngest,
      blocksRead: entry.blocksRead,
      blocksQueueEnqueue: entry.blocksQueueEnqueue,
      trigger: entry.trigger,
      activatedAt: entry.activatedAt,
    });

    return {
      id: row.id,
      sequence: row.sequence,
      scopeKey: buildDenySwitchScopeKey(input),
      idempotentReplay,
      localAppliedAt: localAppliedAt.toISOString(),
    };
  }

  async activateForRevocation(input: {
    organizationId: string;
    correlationId: string;
    actorUserId?: string | null;
    reason?: string | null;
    processingActivityId?: string | null;
    enforcementPolicyId?: string | null;
    consentId?: string | null;
    providerGrantId?: string | null;
    legacyOrgAuthId?: string | null;
    vehicleIds?: string[] | null;
  }): Promise<DenySwitchActivateResult[]> {
    const results: DenySwitchActivateResult[] = [];
    const base = {
      organizationId: input.organizationId,
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      trigger: 'REVOKED' as const,
    };

    results.push(
      await this.activateSync({
        ...base,
        scopeType: DENY_SWITCH_SCOPE.ORGANIZATION,
        scopeEntityId: input.organizationId,
      }),
    );

    if (input.processingActivityId) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY,
          scopeEntityId: input.processingActivityId,
        }),
      );
    }
    if (input.enforcementPolicyId) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.ENFORCEMENT_POLICY,
          scopeEntityId: input.enforcementPolicyId,
        }),
      );
    }
    if (input.consentId) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.CONSENT,
          scopeEntityId: input.consentId,
        }),
      );
    }
    if (input.providerGrantId) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.PROVIDER_GRANT,
          scopeEntityId: input.providerGrantId,
        }),
      );
    }
    for (const vehicleId of input.vehicleIds ?? []) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.RESOURCE,
          resourceType: 'VEHICLE',
          resourceId: vehicleId,
        }),
      );
    }

    return results;
  }

  async activateForSuspension(input: {
    organizationId: string;
    correlationId: string;
    actorUserId?: string | null;
    reason?: string | null;
    processingActivityId?: string | null;
    enforcementPolicyId?: string | null;
  }): Promise<DenySwitchActivateResult[]> {
    const base = {
      organizationId: input.organizationId,
      correlationId: input.correlationId,
      actorUserId: input.actorUserId,
      reason: input.reason,
      trigger: 'SUSPENDED' as const,
      blocksRead: true,
      blocksIngest: true,
      blocksQueueEnqueue: true,
    };
    const results: DenySwitchActivateResult[] = [];
    if (input.processingActivityId) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.PROCESSING_ACTIVITY,
          scopeEntityId: input.processingActivityId,
        }),
      );
    }
    if (input.enforcementPolicyId) {
      results.push(
        await this.activateSync({
          ...base,
          scopeType: DENY_SWITCH_SCOPE.ENFORCEMENT_POLICY,
          scopeEntityId: input.enforcementPolicyId,
        }),
      );
    }
    return results;
  }

  evaluate(ctx: DenySwitchEvaluationContext): DenySwitchEvaluationResult | null {
    return evaluateDenySwitchLocal(
      ctx,
      this.localStore.allActive(),
      this.localStore.isReady(),
      this.startupGraceExpired(),
    );
  }

  isQueueEnqueueDenied(
    organizationId: string,
    scope?: { processingActivityId?: string | null; vehicleId?: string | null },
  ): boolean {
    return isQueueEnqueueDeniedLocal(
      organizationId,
      this.localStore.allActive(),
      this.localStore.isReady(),
      this.startupGraceExpired(),
      scope,
    );
  }

  async evaluateWithDatabaseFallback(
    ctx: DenySwitchEvaluationContext,
  ): Promise<DenySwitchEvaluationResult | null> {
    const local = this.evaluate(ctx);
    if (local?.denied) return local;
    if (this.localStore.isReady()) return null;

    const rows = await this.repo.findActiveForOrganization(ctx.organizationId);
    for (const row of rows) {
      this.localStore.apply(rowToLocalEntry(row));
    }
    this.localStore.markReady();
    return this.evaluate(ctx);
  }

  listForOrganization(organizationId: string) {
    return this.repo.findByOrganization(organizationId);
  }

  getMetricsSnapshot() {
    return this.metrics.snapshot();
  }

  private startupGraceExpired(): boolean {
    return Date.now() - this.startedAt > DENY_SWITCH.startupFailClosedGraceMs;
  }
}

import { Prisma } from '@prisma/client';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import aiConfig from '@config/ai.config';
import appConfig from '@config/app.config';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { AiDomainToolRegistryAuditPayload } from '../registry/ai-domain-tool-registry.types';
import type { FleetChatOrchestrateResult } from '../chat/fleet-chat-orchestrator.types';
import type { AiExecutionContext } from '../execution/ai-execution-context.types';
import {
  buildFleetRequestAuditCreateInput,
  buildToolAuditCreateInput,
} from './ai-request-audit.builder';
import { sanitizeAuditScalar } from './ai-request-audit.serialization';

function toAuditLogCreateInput(
  data: ReturnType<typeof buildFleetRequestAuditCreateInput> | ReturnType<typeof buildToolAuditCreateInput>,
): Prisma.AiRequestAuditLogUncheckedCreateInput {
  return {
    ...data,
    membershipRole: String(data.membershipRole),
    resolvedVehicleRef: data.resolvedVehicleRef ?? Prisma.JsonNull,
    performance: (data.performance ?? undefined) as Prisma.InputJsonValue | undefined,
    tokenUsage: (data.tokenUsage ?? undefined) as Prisma.InputJsonValue | undefined,
    detectedIntents: data.detectedIntents as Prisma.InputJsonValue,
    toolsUsed: data.toolsUsed as Prisma.InputJsonValue,
    dataSources: data.dataSources as Prisma.InputJsonValue,
    toolDurations: data.toolDurations as Prisma.InputJsonValue,
    errorCodes: data.errorCodes as Prisma.InputJsonValue,
    securityFlags: data.securityFlags as Prisma.InputJsonValue,
  };
}

@Injectable()
export class AiRequestAuditService {
  private readonly logger = new Logger(AiRequestAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
    @Inject(appConfig.KEY)
    private readonly applicationConfiguration: ConfigType<typeof appConfig>,
  ) {}

  /**
   * Record a fleet chat request audit row. Fire-and-forget — never throws to callers.
   */
  recordFleetRequest(
    context: AiExecutionContext,
    result: FleetChatOrchestrateResult,
  ): void {
    if (!this.aiConfiguration.auditLoggingEnabled) {
      return;
    }

    void this.persistFleetRequest(context, result).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `AiRequestAudit fleet persist failed corr=${sanitizeAuditScalar(context.correlationId, 64)}: ${sanitizeAuditScalar(message, 120)}`,
      );
    });
  }

  recordToolEvent(
    payload: AiDomainToolRegistryAuditPayload,
    membershipRole?: string,
  ): void {
    if (!this.aiConfiguration.auditLoggingEnabled) {
      return;
    }

    void this.persistToolEvent(payload, membershipRole).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `AiRequestAudit tool persist failed corr=${sanitizeAuditScalar(payload.correlationId, 64)}: ${sanitizeAuditScalar(message, 120)}`,
      );
    });
  }

  private auditOptions() {
    return {
      storePlainUserId: this.aiConfiguration.auditStorePlainUserId,
      userIdRefPepper:
        this.aiConfiguration.auditUserRefPepper ||
        this.applicationConfiguration.jwtSecret ||
        '',
      jwtSecretFallback: this.applicationConfiguration.jwtSecret || '',
    };
  }

  private async persistFleetRequest(
    context: AiExecutionContext,
    result: FleetChatOrchestrateResult,
  ): Promise<void> {
    const data = buildFleetRequestAuditCreateInput(context, result, this.auditOptions());

    const log = await this.prisma.aiRequestAuditLog.create({
      data: toAuditLogCreateInput(data),
    });

    this.emitStructuredLog('REQUEST', {
      organizationId: data.organizationId,
      correlationId: data.correlationId,
      primaryIntent: data.primaryIntent,
      responseType: data.responseType,
      partial: data.partial,
      totalMs: result.performance.totalMs,
      auditLogId: log.id,
    });

    void this.auditService.record({
      actorUserId: this.aiConfiguration.auditStorePlainUserId ? context.userId : undefined,
      actorOrganizationId: context.organizationId,
      action: ActivityAction.EXECUTE,
      entity: ActivityEntity.AI_ASSISTANT,
      entityId: log.id,
      description: `AI assistant request intent=${data.primaryIntent ?? 'unknown'}`,
      route: `fleet-chat ${data.channel}`,
      metaJson: {
        correlationId: data.correlationId,
        primaryIntent: data.primaryIntent,
        responseType: data.responseType,
        partial: data.partial,
        toolsUsed: data.toolsUsed,
        dataClassification: data.dataClassification,
      },
    });
  }

  private async persistToolEvent(
    payload: AiDomainToolRegistryAuditPayload,
    membershipRole?: string,
  ): Promise<void> {
    const data = buildToolAuditCreateInput(payload, {
      ...this.auditOptions(),
      membershipRole,
    });

    const log = await this.prisma.aiRequestAuditLog.create({
      data: toAuditLogCreateInput(data),
    });

    if (this.aiConfiguration.auditDebugLogging) {
      this.logger.debug(
        `AI tool audit event=${payload.event} tool=${payload.toolName} decision=${payload.decision}`,
      );
    }

    this.emitStructuredLog('TOOL', {
      organizationId: data.organizationId,
      correlationId: data.correlationId,
      toolName: payload.toolName,
      decision: payload.decision,
      auditLogId: log.id,
    });
  }

  private emitStructuredLog(
    kind: 'REQUEST' | 'TOOL',
    fields: Record<string, unknown>,
  ): void {
    const line = JSON.stringify({
      auditDomain: 'ai_assistant',
      kind,
      timestamp: new Date().toISOString(),
      ...fields,
    });
    this.logger.log(line);
  }
}

@Injectable()
export class AiAuditRetentionService {
  private readonly logger = new Logger(AiAuditRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(aiConfig.KEY)
    private readonly aiConfiguration: ConfigType<typeof aiConfig>,
  ) {}

  async purgeExpired(batchSize = 500): Promise<number> {
    const days = this.aiConfiguration.auditRetentionDays;
    if (days <= 0) {
      return 0;
    }
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.aiRequestAuditLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: batchSize,
    });
    if (rows.length === 0) {
      return 0;
    }
    const result = await this.prisma.aiRequestAuditLog.deleteMany({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    if (result.count > 0) {
      this.logger.log(
        `AI audit retention purged ${result.count} row(s) older than ${days}d`,
      );
    }
    return result.count;
  }
}

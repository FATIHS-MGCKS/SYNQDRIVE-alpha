import { Injectable, Logger, Optional } from '@nestjs/common';
import { MasterAdminAuditScope } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import {
  MasterAdminAuditAction,
  type MasterAdminAuditRecordInput,
} from './master-admin-audit.contract';
import {
  type MasterAdminAuditDeliveryOptions,
} from './master-admin-audit-delivery.contract';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import {
  classifyMasterAdminAuditDeliveryError,
  sanitizeMasterAdminAuditRecordInput,
} from './master-admin-audit-privacy.util';
import { persistMasterAdminAuditActivityLog } from './master-admin-audit-persistence.util';

export type MasterAdminAuditDeliveryOutcome =
  | 'DELIVERED'
  | 'INTENT_PERSISTED'
  | 'FAILURE_RECORDED'
  | 'FAILED';

@Injectable()
export class MasterAdminAuditDeliveryService {
  private readonly logger = new Logger(MasterAdminAuditDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: MasterAdminAuditOutboxRepository,
    private readonly outboxProcessor: MasterAdminAuditOutboxProcessorService,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  /**
   * Persists durable platform-scoped audit intent, then attempts immediate delivery.
   * Never throws — security mutations must not depend on audit success.
   */
  async commitAuditIntent(
    input: MasterAdminAuditRecordInput,
    options: MasterAdminAuditDeliveryOptions,
  ): Promise<MasterAdminAuditDeliveryOutcome> {
    const occurredAt = options.occurredAt ?? new Date();
    let envelope: MasterAdminAuditRecordInput;
    try {
      envelope = sanitizeMasterAdminAuditRecordInput(input);
    } catch (err) {
      const code = classifyMasterAdminAuditDeliveryError(err);
      this.logger.error(
        `master_admin_audit_rejected idempotencyKey=${options.idempotencyKey} code=${code}`,
      );
      this.iamMetrics?.recordAuditOutboxFailed('MASTER_ADMIN_AUDIT_DELIVERY');
      return 'FAILED';
    }

    const organizationContextId = options.organizationContextId?.trim() || null;
    const auditScope = organizationContextId
      ? MasterAdminAuditScope.ORGANIZATION_CONTEXT
      : MasterAdminAuditScope.PLATFORM;

    let outboxId: string;
    try {
      const row = await this.prisma.$transaction((tx) =>
        this.outboxRepo.enqueueInTransaction(tx, {
          idempotencyKey: options.idempotencyKey,
          envelope,
          occurredAt,
          auditScope,
          organizationContextId,
        }),
      );
      outboxId = row.id;
    } catch (enqueueErr) {
      const code = classifyMasterAdminAuditDeliveryError(enqueueErr);
      this.logger.error(
        `master_admin_audit_intent_failed idempotencyKey=${options.idempotencyKey} code=${code}`,
      );
      this.iamMetrics?.recordAuditOutboxFailed('MASTER_ADMIN_AUDIT_DELIVERY');
      try {
        await this.recordDeliveryFailureDiagnostic(
          envelope,
          options.idempotencyKey,
          code,
          occurredAt,
        );
        return 'FAILURE_RECORDED';
      } catch {
        return 'FAILED';
      }
    }

    try {
      const result = await this.outboxProcessor.deliverAtomic(
        envelope,
        options.idempotencyKey,
        occurredAt,
        outboxId,
      );
      return result === 'delivered' ? 'DELIVERED' : 'INTENT_PERSISTED';
    } catch (deliveryErr) {
      const code = classifyMasterAdminAuditDeliveryError(deliveryErr);
      this.logger.warn(
        `master_admin_audit_delivery_deferred idempotencyKey=${options.idempotencyKey} code=${code}`,
      );
      this.iamMetrics?.recordAuditOutboxFailed('MASTER_ADMIN_AUDIT_DELIVERY');
      return 'INTENT_PERSISTED';
    }
  }

  private async recordDeliveryFailureDiagnostic(
    envelope: MasterAdminAuditRecordInput,
    idempotencyKey: string,
    errorCode: string,
    occurredAt: Date,
  ): Promise<void> {
    const failureInput: MasterAdminAuditRecordInput = {
      auditAction: MasterAdminAuditAction.MASTER_PRIVILEGED_AUDIT_DELIVERY_FAILED,
      actorUserId: envelope.actorUserId,
      actorPlatformRole: envelope.actorPlatformRole,
      actorPermissions: envelope.actorPermissions,
      targetOrganizationId: envelope.targetOrganizationId ?? null,
      entityId: envelope.entityId,
      description: `Master admin audit delivery failed for ${envelope.auditAction}`,
      correlationId: envelope.correlationId,
      route: envelope.route,
      httpMethod: envelope.httpMethod,
      httpStatus: envelope.httpStatus,
      ipAddress: envelope.ipAddress,
      userAgent: envelope.userAgent,
      level: 'WARN',
      permissionGranted: envelope.permissionGranted,
      metadata: {
        intendedAuditAction: envelope.auditAction,
        idempotencyKey,
        deliveryErrorCode: errorCode,
        targetUserId: envelope.metadata?.targetUserId ?? null,
        sessionId: envelope.metadata?.sessionId ?? null,
        operation: envelope.metadata?.operation ?? null,
        outcome: envelope.metadata?.outcome ?? null,
      },
    };

    await this.prisma.$transaction((tx) =>
      persistMasterAdminAuditActivityLog(tx, failureInput, {
        idempotencyKey: `${idempotencyKey}:delivery-failure`,
        occurredAt,
      }),
    );
  }
}
import { Injectable, Logger, Optional } from '@nestjs/common';
import { IamAuditOutboxStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { IamAuditOutboxRepository } from '@modules/users/iam-audit-outbox.repository';
import { IAM_AUDIT_OUTBOX } from '@modules/users/iam-audit.constants';
import { scanIamAuditPayloadForSecrets } from '@modules/users/iam-audit-sanitize.util';
import { IamMetricsService } from '@modules/iam-observability/iam-metrics.service';
import {
  MasterAdminAuditAction,
  type MasterAdminAuditRecordInput,
} from './master-admin-audit.contract';
import { persistMasterAdminAuditActivityLog } from './master-admin-audit-persistence.util';
import {
  MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE,
  type MasterAdminAuditDeliveryOptions,
  sanitizeMasterAdminAuditEnvelopeForStorage,
} from './master-admin-audit-delivery.contract';

export type MasterAdminAuditDeliveryOutcome =
  | 'DELIVERED'
  | 'ENQUEUED_FOR_RECOVERY'
  | 'FAILURE_RECORDED'
  | 'FAILED';

@Injectable()
export class MasterAdminAuditDeliveryService {
  private readonly logger = new Logger(MasterAdminAuditDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly iamAuditOutbox: IamAuditOutboxRepository,
    @Optional() private readonly iamMetrics?: IamMetricsService,
  ) {}

  /**
   * Delivers semantic master-admin audit without throwing (security mutations must not depend on audit).
   */
  scheduleDelivery(
    input: MasterAdminAuditRecordInput,
    options: MasterAdminAuditDeliveryOptions,
  ): void {
    void this.deliver(input, options).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `master_admin_audit_delivery_unhandled auditAction=${input.auditAction} idempotencyKey=${options.idempotencyKey} error=${message}`,
      );
      this.iamMetrics?.recordAuditOutboxFailed(MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE);
    });
  }

  async deliver(
    input: MasterAdminAuditRecordInput,
    options: MasterAdminAuditDeliveryOptions,
  ): Promise<MasterAdminAuditDeliveryOutcome> {
    const envelope = sanitizeMasterAdminAuditEnvelopeForStorage(input);
    const secretViolations = scanIamAuditPayloadForSecrets(envelope);
    if (secretViolations.length > 0) {
      this.logger.error(
        `master_admin_audit_delivery_rejected_sensitive idempotencyKey=${options.idempotencyKey} fields=${secretViolations.join(',')}`,
      );
      return 'FAILED';
    }

    try {
      await this.prisma.$transaction((tx) => persistMasterAdminAuditActivityLog(tx, envelope));
      return 'DELIVERED';
    } catch (primaryErr) {
      const primaryMessage = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      this.logger.warn(
        `master_admin_audit_primary_failed idempotencyKey=${options.idempotencyKey} auditAction=${envelope.auditAction} error=${primaryMessage}`,
      );
      this.iamMetrics?.recordAuditOutboxFailed(MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE);

      const recoveryOrgId = options.recoveryOrganizationId?.trim();
      if (recoveryOrgId) {
        try {
          await this.enqueueIamOutboxRecovery(envelope, options.idempotencyKey, recoveryOrgId);
          return 'ENQUEUED_FOR_RECOVERY';
        } catch (enqueueErr) {
          const enqueueMessage =
            enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr);
          this.logger.error(
            `master_admin_audit_outbox_enqueue_failed idempotencyKey=${options.idempotencyKey} organizationId=${recoveryOrgId} error=${enqueueMessage}`,
          );
        }
      }

      try {
        await this.recordDeliveryFailureDiagnostic(envelope, options.idempotencyKey, primaryMessage);
        return 'FAILURE_RECORDED';
      } catch (diagErr) {
        const diagMessage = diagErr instanceof Error ? diagErr.message : String(diagErr);
        this.logger.error(
          `master_admin_audit_failure_record_failed idempotencyKey=${options.idempotencyKey} error=${diagMessage}`,
        );
        return 'FAILED';
      }
    }
  }

  async deliverFromOutboxPayload(payload: Record<string, unknown>): Promise<void> {
    const raw = payload.masterAdminAuditEnvelope;
    if (!raw || typeof raw !== 'object') {
      throw new Error('Missing masterAdminAuditEnvelope in outbox payload');
    }
    const envelope = raw as MasterAdminAuditRecordInput;
    const secretViolations = scanIamAuditPayloadForSecrets(envelope);
    if (secretViolations.length > 0) {
      throw new Error(`Audit envelope contains sensitive fields: ${secretViolations.join(', ')}`);
    }
    await this.prisma.$transaction((tx) => persistMasterAdminAuditActivityLog(tx, envelope));
  }

  private async enqueueIamOutboxRecovery(
    envelope: MasterAdminAuditRecordInput,
    idempotencyKey: string,
    organizationId: string,
  ): Promise<void> {
    const existing = await this.iamAuditOutbox.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return;
    }

    await this.prisma.$transaction((tx) =>
      tx.iamAuditOutbox.create({
        data: {
          organizationId,
          idempotencyKey,
          eventType: MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE,
          actorUserId: envelope.actorUserId ?? null,
          subjectUserId:
            typeof envelope.metadata?.targetUserId === 'string'
              ? envelope.metadata.targetUserId
              : null,
          occurredAt: new Date(),
          payloadVersion: IAM_AUDIT_OUTBOX.payloadVersion,
          reason: null,
          payload: {
            description: envelope.description,
            route: envelope.route ?? null,
            ipAddress: envelope.ipAddress ?? null,
            userAgent: envelope.userAgent ?? null,
            level: envelope.level ?? null,
            masterAdminAuditEnvelope: envelope,
            metadata: {
              auditAction: envelope.auditAction,
              correlationId: envelope.correlationId,
            },
          } as unknown as Prisma.InputJsonValue,
          status: IamAuditOutboxStatus.PENDING,
          nextRetryAt: new Date(),
        },
      }),
    );
  }

  private async recordDeliveryFailureDiagnostic(
    envelope: MasterAdminAuditRecordInput,
    idempotencyKey: string,
    errorMessage: string,
  ): Promise<void> {
    const diagnosticIdempotencyKey = `${idempotencyKey}:delivery-failure`;
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
        deliveryError: errorMessage.slice(0, 500),
        targetUserId: envelope.metadata?.targetUserId ?? null,
        sessionId: envelope.metadata?.sessionId ?? null,
        operation: envelope.metadata?.operation ?? null,
        outcome: envelope.metadata?.outcome ?? null,
      },
    };

    await this.prisma.$transaction((tx) =>
      persistMasterAdminAuditActivityLog(tx, failureInput),
    );
  }
}
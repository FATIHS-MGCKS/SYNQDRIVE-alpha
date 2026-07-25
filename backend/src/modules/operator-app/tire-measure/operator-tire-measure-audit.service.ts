import { Injectable } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';

export type OperatorTireMeasureAuditEvent =
  | 'OPERATOR_TIRE_MEASUREMENT_CAPTURED'
  | 'OPERATOR_TIRE_MEASUREMENT_CAPTURE_IDEMPOTENT'
  | 'OPERATOR_TIRE_MEASUREMENT_VALIDATION_FAILED';

@Injectable()
export class OperatorTireMeasureAuditService {
  constructor(private readonly activityLog: ActivityLogService) {}

  async log(input: {
    organizationId: string;
    userId: string;
    event: OperatorTireMeasureAuditEvent;
    measurementId?: string | null;
    vehicleId?: string | null;
    bookingId?: string | null;
    handoverSessionId?: string | null;
    captureKey?: string | null;
    source?: string | null;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId,
      action: ActivityAction.EXECUTE,
      entity: ActivityEntity.VEHICLE,
      entityId: input.measurementId ?? input.vehicleId ?? input.bookingId ?? 'tire-measurement',
      description: `Operator tire measurement audit: ${input.event}`,
      metaJson: {
        auditType: input.event,
        measurementId: input.measurementId ?? null,
        vehicleId: input.vehicleId ?? null,
        bookingId: input.bookingId ?? null,
        handoverSessionId: input.handoverSessionId ?? null,
        captureKey: input.captureKey ?? null,
        source: input.source ?? null,
        ...(input.meta ?? {}),
      },
    });
  }
}

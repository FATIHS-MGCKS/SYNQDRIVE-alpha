import { Injectable } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import type { OperatorDamageCaptureSource } from './operator-damage.types';

export type OperatorDamageAuditEvent =
  | 'OPERATOR_DAMAGE_CAPTURED'
  | 'OPERATOR_DAMAGE_DEDUPLICATED'
  | 'OPERATOR_DAMAGE_CAPTURE_IDEMPOTENT'
  | 'OPERATOR_DAMAGE_UPDATE_BLOCKED'
  | 'OPERATOR_DAMAGE_AI_SUGGESTION_REJECTED';

@Injectable()
export class OperatorDamageAuditService {
  constructor(private readonly activityLog: ActivityLogService) {}

  async log(input: {
    organizationId: string;
    userId: string;
    event: OperatorDamageAuditEvent;
    damageId?: string | null;
    vehicleId?: string | null;
    bookingId?: string | null;
    stationId?: string | null;
    source?: OperatorDamageCaptureSource | null;
    captureKey?: string | null;
    duplicateOfDamageId?: string | null;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId,
      action: ActivityAction.EXECUTE,
      entity: ActivityEntity.VEHICLE,
      entityId: input.damageId ?? input.vehicleId ?? input.bookingId ?? 'operator-damage',
      description: `Operator damage audit: ${input.event}`,
      metaJson: {
        auditType: input.event,
        damageId: input.damageId ?? null,
        vehicleId: input.vehicleId ?? null,
        bookingId: input.bookingId ?? null,
        stationId: input.stationId ?? null,
        source: input.source ?? null,
        captureKey: input.captureKey ?? null,
        duplicateOfDamageId: input.duplicateOfDamageId ?? null,
        ...(input.meta ?? {}),
      },
    });
  }
}

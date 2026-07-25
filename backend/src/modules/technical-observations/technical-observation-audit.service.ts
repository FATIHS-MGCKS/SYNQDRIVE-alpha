import { Injectable } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';

export type TechnicalObservationAuditEvent =
  | 'TECHNICAL_OBSERVATION_CREATED'
  | 'TECHNICAL_OBSERVATION_RESOLVED'
  | 'TECHNICAL_OBSERVATION_DISMISSED'
  | 'TECHNICAL_OBSERVATION_CONVERTED'
  | 'TECHNICAL_OBSERVATION_HANDOVER_PERSISTED';

@Injectable()
export class TechnicalObservationAuditService {
  constructor(private readonly activityLog: ActivityLogService) {}

  async log(input: {
    organizationId: string;
    userId: string;
    event: TechnicalObservationAuditEvent;
    observationId?: string | null;
    vehicleId?: string | null;
    bookingId?: string | null;
    handoverProtocolId?: string | null;
    source?: string | null;
    severity?: string | null;
    blocksRental?: boolean;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.userId,
      action: ActivityAction.EXECUTE,
      entity: ActivityEntity.VEHICLE,
      entityId: input.observationId ?? input.vehicleId ?? input.bookingId ?? 'technical-observation',
      description: `Technical observation audit: ${input.event}`,
      metaJson: {
        auditType: input.event,
        observationId: input.observationId ?? null,
        vehicleId: input.vehicleId ?? null,
        bookingId: input.bookingId ?? null,
        handoverProtocolId: input.handoverProtocolId ?? null,
        source: input.source ?? null,
        severity: input.severity ?? null,
        blocksRental: input.blocksRental ?? null,
        ...(input.meta ?? {}),
      },
    });
  }
}

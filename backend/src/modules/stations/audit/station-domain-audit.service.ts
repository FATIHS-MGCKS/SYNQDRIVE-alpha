import { Injectable } from '@nestjs/common';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { StationsV2ConfigService } from '../stations-v2-config.service';

export type StationAuditEvent =
  | 'STATION_ARCHIVED'
  | 'STATION_RESTORED'
  | 'VEHICLE_HOME_ASSIGNED'
  | 'VEHICLE_HOME_DETACHED'
  | 'VEHICLE_PRESENCE_CONFIRMED'
  | 'VEHICLE_EXPECTED_SET'
  | 'TRANSFER_PLANNED'
  | 'TRANSFER_ARRIVED'
  | 'TRANSFER_CANCELLED'
  | 'BOOKING_STATION_RULE_OVERRIDE';

@Injectable()
export class StationDomainAuditService {
  constructor(
    private readonly audit: AuditService,
    private readonly stationsV2Config: StationsV2ConfigService,
  ) {}

  record(
    organizationId: string,
    actorUserId: string | undefined,
    event: StationAuditEvent,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): void {
    const flags = this.stationsV2Config.resolve(organizationId);
    if (!flags.stationAuditTrailEnabled) return;

    void this.audit.record({
      actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.STATION,
      entityId,
      description: event,
      metaJson: { stationEvent: event, ...metadata },
    });
  }
}

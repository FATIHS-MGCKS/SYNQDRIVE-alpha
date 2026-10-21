import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RestSessionFeatureShadowInspectionService } from '../vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/rest-session-feature-shadow-inspection.service';
import type { RestSessionFeatureShadowInspectionV1 } from '../vehicle-intelligence/battery-health/generalized-evidence/rest-session-features/rest-session-feature-shadow-inspection.types';

export type BatteryV2RestSessionListItemV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  sessionStatus: string;
  anchorType: string;
  anchorAt: string;
  openedAt: string;
  endedAt: string | null;
  endReason: string | null;
  restObservationCount: number;
  validRestObservationCount: number;
};

@Injectable()
export class BatteryV2RestSessionFeatureInspectionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inspection: RestSessionFeatureShadowInspectionService,
  ) {}

  async assertVehicleInOrganization(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }

  async listRestSessions(input: {
    organizationId: string;
    vehicleId: string;
    limit?: number;
  }): Promise<{ sessions: BatteryV2RestSessionListItemV1[] }> {
    await this.assertVehicleInOrganization(input.organizationId, input.vehicleId);
    const take = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const rows = await this.prisma.batteryRestSession.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: { openedAt: 'desc' },
      take,
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        sessionStatus: true,
        anchorType: true,
        anchorAt: true,
        openedAt: true,
        endedAt: true,
        endReason: true,
        restObservationCount: true,
        validRestObservationCount: true,
      },
    });
    return {
      sessions: rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        sessionStatus: row.sessionStatus,
        anchorType: row.anchorType,
        anchorAt: row.anchorAt.toISOString(),
        openedAt: row.openedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        endReason: row.endReason,
        restObservationCount: row.restObservationCount,
        validRestObservationCount: row.validRestObservationCount,
      })),
    };
  }

  async inspectRestSession(input: {
    organizationId: string;
    vehicleId: string;
    restSessionId: string;
  }): Promise<RestSessionFeatureShadowInspectionV1> {
    await this.assertVehicleInOrganization(input.organizationId, input.vehicleId);
    const outcome = await this.inspection.inspectSession({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
      includeRaw: true,
    });
    if (outcome.status === 'SESSION_NOT_FOUND') {
      throw new NotFoundException('Rest session not found for vehicle and organization');
    }
    return outcome.inspection;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DI_V0_SPEED_QC_POLICY_V2 } from '../speed-qc/di-v0-speed-qc-policy.version';
import type { DiV0P2AutoProjectionOutboxStatus } from './di-v0-p2-auto-projection-outbox.repository';
import { resolveGpsSpeedEvaluationAvailabilityWithoutProjection } from './di-v0-trip-speed-quality-product-read.availability';
import {
  buildDiV0TripGpsSpeedEvaluationUnavailable,
  toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow,
} from './di-v0-trip-speed-quality-product-read.mapper';
import type { DiV0TripGpsSpeedEvaluationProductV1 } from './di-v0-trip-speed-quality-product-read.types';
import { DiV0TripSpeedQualityProjectionService } from './di-v0-trip-speed-quality-projection.service';
import { evaluateTripDiProductReadBoundaryGate } from '../../trips/di-boundary-admission/trip-di-boundary-admission-product-read.guard';

@Injectable()
export class DiV0TripSpeedQualityProductReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionService: DiV0TripSpeedQualityProjectionService,
  ) {}

  /**
   * Read-only product projection for trip detail UI. Never computes, enqueues, or calls providers.
   */
  async readForTrip(
    organizationId: string,
    vehicleId: string,
    tripId: string,
  ): Promise<DiV0TripGpsSpeedEvaluationProductV1> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: tripId,
        vehicleId,
        vehicle: { id: vehicleId, organizationId },
      },
      select: { id: true },
    });
    if (!trip) {
      return buildDiV0TripGpsSpeedEvaluationUnavailable('UNAVAILABLE');
    }

    const current = await this.projectionService.readCurrentOpsProjection(
      organizationId,
      tripId,
      DI_V0_SPEED_QC_POLICY_V2,
    );
    if (current) {
      const gate = await evaluateTripDiProductReadBoundaryGate(
        this.prisma,
        tripId,
        current.boundaryFingerprint,
      );
      if (!gate.ok) {
        const activeWorkItem = await this.resolveActivePrimaryWorkItem(organizationId, tripId);
        const outboxStatus = activeWorkItem ? await this.readOutboxStatus(activeWorkItem.id) : null;
        const availability = resolveGpsSpeedEvaluationAvailabilityWithoutProjection(
          activeWorkItem?.status ?? null,
          outboxStatus,
        );
        return buildDiV0TripGpsSpeedEvaluationUnavailable(availability);
      }
      return toDiV0TripGpsSpeedEvaluationProductV1FromPersistedRow(current);
    }

    const activeWorkItem = await this.resolveActivePrimaryWorkItem(organizationId, tripId);
    const outboxStatus = activeWorkItem
      ? await this.readOutboxStatus(activeWorkItem.id)
      : null;
    const availability = resolveGpsSpeedEvaluationAvailabilityWithoutProjection(
      activeWorkItem?.status ?? null,
      outboxStatus,
    );
    return buildDiV0TripGpsSpeedEvaluationUnavailable(availability);
  }

  private async resolveActivePrimaryWorkItem(
    organizationId: string,
    tripId: string,
  ): Promise<{ id: string; status: string } | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status::text AS status
      FROM di_v0_s4_work_items
      WHERE organization_id = ${organizationId}
        AND trip_id = ${tripId}
        AND run_purpose = 'PRIMARY'
        AND purpose_discriminator = 'PRIMARY'
        AND status <> 'SUPERSEDED'
      ORDER BY boundary_occurrence DESC, created_at DESC
      LIMIT 1`;
    return rows[0] ?? null;
  }

  private async readOutboxStatus(workItemId: string): Promise<DiV0P2AutoProjectionOutboxStatus | null> {
    const rows = await this.prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status
      FROM di_v0_trip_speed_quality_auto_projection_outbox_v1
      WHERE work_item_id = ${workItemId}
        AND qc_policy_version = ${DI_V0_SPEED_QC_POLICY_V2}
      LIMIT 1`;
    const status = rows[0]?.status;
    if (!status) return null;
    return status as DiV0P2AutoProjectionOutboxStatus;
  }
}

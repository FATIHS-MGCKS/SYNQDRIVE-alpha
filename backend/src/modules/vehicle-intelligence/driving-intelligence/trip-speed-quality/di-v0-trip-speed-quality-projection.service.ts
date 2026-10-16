import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
  resolveDiV0SpeedQcPolicyVersion,
} from '../speed-qc/di-v0-speed-qc-policy.version';
import { computeDiV0TripSpeedQualityProjectionV1ForWorkItem } from './di-v0-trip-speed-quality-projection.engine';
import {
  DiV0TripSpeedQualityProjectionError,
  mapPersistAuthorityError,
  DiV0TripSpeedQualityProjectionPersistenceError,
} from './di-v0-trip-speed-quality-projection.errors';
import {
  DiV0TripSpeedQualityProjectionRepository,
  type DiV0TripSpeedQualityPersistedRow,
} from './di-v0-trip-speed-quality-projection.repository';
import { attachDiV0P2AutoProjectionFailureStep } from './di-v0-p2-auto-projection-failure-log';
import { DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1 } from './di-v0-trip-speed-quality-projection.version';
import { evaluateTripDiProductReadBoundaryGate } from '../../trips/di-boundary-admission/trip-di-boundary-admission-product-read.guard';

export interface DiV0TripSpeedQualityProjectForWorkItemOptions {
  /** Defaults to DI_V0_SPEED_QC_POLICY_V1 when omitted. */
  qcPolicyVersion?: string;
}

@Injectable()
export class DiV0TripSpeedQualityProjectionService {
  private readonly repository: DiV0TripSpeedQualityProjectionRepository;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {
    this.repository = new DiV0TripSpeedQualityProjectionRepository(prisma);
  }

  /**
   * Projects speed quality for a COMPLETED PRIMARY work item. Isolated from S4 T06 completion —
   * callers must invoke explicitly (no scheduler wiring in P2).
   */
  async projectForWorkItem(
    organizationId: string,
    workItemId: string,
    options?: DiV0TripSpeedQualityProjectForWorkItemOptions,
  ): Promise<DiV0TripSpeedQualityPersistedRow> {
    const qcPolicyVersion = resolveDiV0SpeedQcPolicyVersion(
      options?.qcPolicyVersion ?? DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
    );
    const wi = await this.prisma.$queryRaw<Array<{ trip_id: string }>>`
      SELECT trip_id FROM di_v0_s4_work_items WHERE id = ${workItemId}`;
    const tripId = wi[0]?.trip_id;
    if (!tripId) {
      throw new DiV0TripSpeedQualityProjectionError('WORK_ITEM_NOT_FOUND', workItemId);
    }

    let projection;
    try {
      projection = await computeDiV0TripSpeedQualityProjectionV1ForWorkItem(this.prisma, {
        organizationId,
        tripId,
        workItemId,
        qcPolicyVersion,
      });
    } catch (error) {
      throw attachDiV0P2AutoProjectionFailureStep(error, 'compute');
    }

    try {
      return await this.repository.persistCurrentProjection(projection, {
        organizationId: projection.identity.organizationId,
        tripId: projection.identity.tripId,
        workItemId: projection.identity.workItemId,
        boundaryFingerprint: projection.identity.boundaryFingerprint,
        pinnedSnapshotHash: projection.identity.pinnedSnapshotHash,
        shadowRunId: projection.identity.shadowRunId,
      });
    } catch (error) {
      if (error instanceof DiV0TripSpeedQualityProjectionPersistenceError) {
        if (error.code === 'IDEMPOTENCY_CONTENT_MISMATCH') {
          throw attachDiV0P2AutoProjectionFailureStep(
            new DiV0TripSpeedQualityProjectionError('IDEMPOTENCY_CONTENT_MISMATCH', error.message),
            'persist',
          );
        }
        throw attachDiV0P2AutoProjectionFailureStep(mapPersistAuthorityError(error), 'persist');
      }
      throw attachDiV0P2AutoProjectionFailureStep(error, 'persist');
    }
  }

  async readCurrentOpsProjection(
    organizationId: string,
    tripId: string,
    qcPolicyVersion?: string,
  ): Promise<DiV0TripSpeedQualityPersistedRow | null> {
    const policy = resolveDiV0SpeedQcPolicyVersion(
      qcPolicyVersion ?? DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
    );
    const row = await this.repository.readCurrentForTrip(
      organizationId,
      tripId,
      policy,
      DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1,
    );
    if (!row) return null;
    const activeRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM di_v0_s4_work_items
      WHERE organization_id = ${organizationId}
        AND trip_id = ${tripId}
        AND run_purpose = 'PRIMARY'
        AND purpose_discriminator = 'PRIMARY'
        AND status <> 'SUPERSEDED'
      ORDER BY boundary_occurrence DESC, created_at DESC
      LIMIT 1`;
    const activeId = activeRows[0]?.id ?? null;
    if (activeId !== row.workItemId) {
      return null;
    }
    const wi = await this.prisma.$queryRaw<
      Array<{ organization_id: string; trip_id: string; status: string; run_purpose: string; purpose_discriminator: string }>
    >`
      SELECT organization_id, trip_id, status, run_purpose::text AS run_purpose, purpose_discriminator
      FROM di_v0_s4_work_items WHERE id = ${row.workItemId}`;
    const workItem = wi[0];
    if (!workItem || workItem.organization_id !== organizationId || workItem.trip_id !== tripId) {
      return null;
    }
    if (workItem.status !== 'COMPLETED' || workItem.run_purpose !== 'PRIMARY' || workItem.purpose_discriminator !== 'PRIMARY') {
      return null;
    }
    const gate = await evaluateTripDiProductReadBoundaryGate(this.prisma, tripId, row.boundaryFingerprint);
    if (!gate.ok) return null;
    return row;
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  GROUND_TRUTH_ADMISSION_REASON,
  type GroundTruthSourceIdentityV1,
} from './ground-truth-admission.types';

export type GroundTruthSourcePointers = {
  sourceServiceEventId?: string | null;
  sourceDocumentExtractionId?: string | null;
  sourceBatteryEvidenceId?: string | null;
  sourceMeasurementId?: string | null;
};

export class GroundTruthSourceResolutionError extends Error {
  constructor(
    readonly reason:
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING,
    message: string,
  ) {
    super(message);
    this.name = 'GroundTruthSourceResolutionError';
  }
}

@Injectable()
export class BatteryGroundTruthSourceResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveVehicleOrganization(
    organizationId: string,
    vehicleId: string,
  ): Promise<string> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found for organization`);
    }
    return vehicle.organizationId;
  }

  async resolveSourceIdentity(
    organizationId: string,
    vehicleId: string,
    pointers: GroundTruthSourcePointers,
  ): Promise<GroundTruthSourceIdentityV1> {
    const identity: GroundTruthSourceIdentityV1 = {};

    if (pointers.sourceServiceEventId) {
      const row = await this.prisma.vehicleServiceEvent.findUnique({
        where: { id: pointers.sourceServiceEventId },
      });
      if (!row) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING,
          'Service event not found',
        );
      }
      if (row.vehicleId !== vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
          'Service event vehicle mismatch',
        );
      }
      if (row.organizationId && row.organizationId !== organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH,
          'Service event organization mismatch',
        );
      }
      identity.serviceEvent = {
        id: row.id,
        eventType: row.eventType,
        eventDateIso: row.eventDate.toISOString(),
        origin: row.origin,
      };
    }

    if (pointers.sourceDocumentExtractionId) {
      const row = await this.prisma.vehicleDocumentExtraction.findUnique({
        where: { id: pointers.sourceDocumentExtractionId },
      });
      if (!row) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING,
          'Document extraction not found',
        );
      }
      if (row.vehicleId && row.vehicleId !== vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
          'Document extraction vehicle mismatch',
        );
      }
      if (row.organizationId && row.organizationId !== organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH,
          'Document extraction organization mismatch',
        );
      }
      identity.documentExtraction = {
        id: row.id,
        effectiveDocumentType: row.effectiveDocumentType,
        status: row.status,
      };
    }

    if (pointers.sourceBatteryEvidenceId) {
      const row = await this.prisma.batteryEvidence.findUnique({
        where: { id: pointers.sourceBatteryEvidenceId },
      });
      if (!row) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING,
          'Battery evidence not found',
        );
      }
      if (row.vehicleId && row.vehicleId !== vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
          'Battery evidence vehicle mismatch',
        );
      }
      identity.batteryEvidence = {
        id: row.id,
        scope: row.scope,
        sourceType: row.sourceType,
        valueType: row.valueType,
        observedAtIso: row.observedAt.toISOString(),
      };
    }

    if (pointers.sourceMeasurementId) {
      const row = await this.prisma.batteryMeasurement.findUnique({
        where: { id: pointers.sourceMeasurementId },
      });
      if (!row) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING,
          'Battery measurement not found',
        );
      }
      if (row.vehicleId !== vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
          'Battery measurement vehicle mismatch',
        );
      }
      if (row.organizationId !== organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH,
          'Battery measurement organization mismatch',
        );
      }
      identity.measurement = {
        id: row.id,
        scope: row.scope,
        type: row.type,
        observedAtIso: row.observedAt.toISOString(),
      };
    }

    return identity;
  }
}

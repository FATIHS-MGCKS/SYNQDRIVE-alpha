import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

const SERVICE_EVENT_GROUND_TRUTH_SELECT = {
  id: true,
  vehicleId: true,
  organizationId: true,
  eventType: true,
  eventDate: true,
  origin: true,
  documentExtractionId: true,
} as const;

type LoadedServiceEventForGroundTruth = Prisma.VehicleServiceEventGetPayload<{
  select: typeof SERVICE_EVENT_GROUND_TRUTH_SELECT;
}>;

export class GroundTruthSourceResolutionError extends Error {
  constructor(
    readonly reason:
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_MISSING
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_UNBOUND
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_UNBOUND
      | typeof GROUND_TRUTH_ADMISSION_REASON.SOURCE_PROVENANCE_MISMATCH,
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
    let loadedEvidence: Awaited<ReturnType<typeof this.prisma.batteryEvidence.findUnique>> = null;
    let loadedDocument: Awaited<
      ReturnType<typeof this.prisma.vehicleDocumentExtraction.findUnique>
    > = null;
    let loadedServiceEvent: LoadedServiceEventForGroundTruth | null = null;

    if (pointers.sourceServiceEventId) {
      const row = await this.prisma.vehicleServiceEvent.findUnique({
        where: { id: pointers.sourceServiceEventId },
        select: SERVICE_EVENT_GROUND_TRUTH_SELECT,
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
      if (!row.organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_UNBOUND,
          'Service event organization unbound',
        );
      }
      if (row.organizationId !== organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH,
          'Service event organization mismatch',
        );
      }
      loadedServiceEvent = row;
      identity.serviceEvent = {
        id: row.id,
        eventType: row.eventType,
        eventDateIso: row.eventDate.toISOString(),
        origin: row.origin,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
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
      if (!row.vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_UNBOUND,
          'Document extraction vehicle unbound',
        );
      }
      if (row.vehicleId !== vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
          'Document extraction vehicle mismatch',
        );
      }
      if (!row.organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_UNBOUND,
          'Document extraction organization unbound',
        );
      }
      if (row.organizationId !== organizationId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_TENANT_MISMATCH,
          'Document extraction organization mismatch',
        );
      }
      loadedDocument = row;
      identity.documentExtraction = {
        id: row.id,
        effectiveDocumentType: row.effectiveDocumentType,
        status: row.status,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
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
      if (!row.vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_UNBOUND,
          'Battery evidence vehicle unbound',
        );
      }
      if (row.vehicleId !== vehicleId) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_VEHICLE_MISMATCH,
          'Battery evidence vehicle mismatch',
        );
      }
      loadedEvidence = row;
      identity.batteryEvidence = {
        id: row.id,
        scope: row.scope,
        sourceType: row.sourceType,
        valueType: row.valueType,
        observedAtIso: row.observedAt.toISOString(),
        numericValue: row.numericValue,
        unit: row.unit,
        confidence: row.confidence,
        quality: row.quality,
        measurementId: row.measurementId,
        serviceEventId: row.serviceEventId,
        documentExtractionId: row.documentExtractionId,
        vehicleId: row.vehicleId,
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
        numericValue: row.numericValue,
        textValue: row.textValue,
        unit: row.unit,
        quality: row.quality,
        providerTimestampIso: row.providerTimestamp?.toISOString() ?? null,
        idempotencyKey: row.idempotencyKey,
        supersededById: row.supersededById,
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
      };
    }

    this.assertCrossPointerProvenance(pointers, loadedEvidence, loadedDocument, loadedServiceEvent);

    return identity;
  }

  private assertCrossPointerProvenance(
    pointers: GroundTruthSourcePointers,
    evidence: Awaited<ReturnType<typeof this.prisma.batteryEvidence.findUnique>>,
    document: Awaited<ReturnType<typeof this.prisma.vehicleDocumentExtraction.findUnique>>,
    serviceEvent: LoadedServiceEventForGroundTruth | null,
  ): void {
    if (evidence) {
      if (
        pointers.sourceServiceEventId &&
        evidence.serviceEventId &&
        evidence.serviceEventId !== pointers.sourceServiceEventId
      ) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_PROVENANCE_MISMATCH,
          'Battery evidence serviceEventId mismatch',
        );
      }
      if (
        pointers.sourceDocumentExtractionId &&
        evidence.documentExtractionId &&
        evidence.documentExtractionId !== pointers.sourceDocumentExtractionId
      ) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_PROVENANCE_MISMATCH,
          'Battery evidence documentExtractionId mismatch',
        );
      }
      if (
        pointers.sourceMeasurementId &&
        evidence.measurementId &&
        evidence.measurementId !== pointers.sourceMeasurementId
      ) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_PROVENANCE_MISMATCH,
          'Battery evidence measurementId mismatch',
        );
      }
    }
    if (document && serviceEvent) {
      if (
        serviceEvent.documentExtractionId &&
        serviceEvent.documentExtractionId !== document.id
      ) {
        throw new GroundTruthSourceResolutionError(
          GROUND_TRUTH_ADMISSION_REASON.SOURCE_PROVENANCE_MISMATCH,
          'Service event documentExtractionId mismatch',
        );
      }
    }
  }
}

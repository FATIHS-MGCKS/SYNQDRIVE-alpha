import { Injectable } from '@nestjs/common';
import {
  BatteryGroundTruthRevocationReasonCode,
  BatteryGroundTruthVerificationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

export type CreateGroundTruthEventInput = {
  organizationId: string;
  vehicleId: string;
  groundTruthType: Prisma.BatteryGroundTruthEventCreateInput['groundTruthType'];
  batteryScope: Prisma.BatteryGroundTruthEventCreateInput['batteryScope'];
  effectiveAt: Date;
  sourceAuthority: Prisma.BatteryGroundTruthEventCreateInput['sourceAuthority'];
  sourceServiceEventId?: string | null;
  sourceDocumentExtractionId?: string | null;
  sourceBatteryEvidenceId?: string | null;
  sourceMeasurementId?: string | null;
  sourceContentFingerprint: string;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  supersedesGroundTruthEventId?: string | null;
};

@Injectable()
export class BatteryGroundTruthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findConfirmedByFingerprint(organizationId: string, fingerprint: string) {
    return this.prisma.batteryGroundTruthEvent.findFirst({
      where: {
        organizationId,
        sourceContentFingerprint: fingerprint,
        verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
      },
    });
  }

  async createConfirmedEvent(input: CreateGroundTruthEventInput) {
    return this.prisma.batteryGroundTruthEvent.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        groundTruthType: input.groundTruthType,
        batteryScope: input.batteryScope,
        effectiveAt: input.effectiveAt,
        sourceAuthority: input.sourceAuthority,
        verificationStatus: BatteryGroundTruthVerificationStatus.CONFIRMED,
        sourceServiceEventId: input.sourceServiceEventId ?? null,
        sourceDocumentExtractionId: input.sourceDocumentExtractionId ?? null,
        sourceBatteryEvidenceId: input.sourceBatteryEvidenceId ?? null,
        sourceMeasurementId: input.sourceMeasurementId ?? null,
        sourceContentFingerprint: input.sourceContentFingerprint,
        confirmedByUserId: input.confirmedByUserId ?? null,
        confirmedAt: input.confirmedAt ?? null,
        supersedesGroundTruthEventId: input.supersedesGroundTruthEventId ?? null,
      },
    });
  }

  async markSuperseded(eventId: string) {
    return this.prisma.batteryGroundTruthEvent.update({
      where: { id: eventId },
      data: { verificationStatus: BatteryGroundTruthVerificationStatus.SUPERSEDED },
    });
  }

  async markRevoked(eventId: string) {
    return this.prisma.batteryGroundTruthEvent.update({
      where: { id: eventId },
      data: { verificationStatus: BatteryGroundTruthVerificationStatus.REVOKED },
    });
  }

  async appendRevocation(input: {
    organizationId: string;
    groundTruthEventId: string;
    reasonCode: BatteryGroundTruthRevocationReasonCode;
    revokedByUserId?: string | null;
    revokedAt: Date;
  }) {
    return this.prisma.batteryGroundTruthRevocation.create({
      data: {
        organizationId: input.organizationId,
        groundTruthEventId: input.groundTruthEventId,
        reasonCode: input.reasonCode,
        revokedByUserId: input.revokedByUserId ?? null,
        revokedAt: input.revokedAt,
      },
    });
  }

  async findById(organizationId: string, id: string) {
    return this.prisma.batteryGroundTruthEvent.findFirst({
      where: { id, organizationId },
      include: { revocations: true },
    });
  }

  async listForVehicle(organizationId: string, vehicleId: string, limit = 100) {
    return this.prisma.batteryGroundTruthEvent.findMany({
      where: { organizationId, vehicleId },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { revocations: true },
    });
  }

  async findActiveForVehicle(organizationId: string, vehicleId: string) {
    const rows = await this.listForVehicle(organizationId, vehicleId, 500);
    return rows.filter((row) => this.isActiveRow(row));
  }

  isActiveRow(row: {
    verificationStatus: BatteryGroundTruthVerificationStatus;
    revocations: { id: string }[];
    id: string;
  }): boolean {
    if (row.verificationStatus !== BatteryGroundTruthVerificationStatus.CONFIRMED) {
      return false;
    }
    if (row.revocations.length > 0) {
      return false;
    }
    return true;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizeDrivingEvidenceCreate, validateDrivingEvidenceContract } from './driving-evidence.contract';
import type { CreateDrivingEvidenceInput } from './driving-evidence.types';

@Injectable()
export class DrivingEvidenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertVehicleInOrg(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
  }

  async assertTripInOrg(
    organizationId: string,
    tripId: string,
  ): Promise<{ vehicleId: string }> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: { id: tripId, vehicle: { organizationId } },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }
    return { vehicleId: trip.vehicleId };
  }

  findByIdempotencyKey(organizationId: string, idempotencyKey: string) {
    return this.prisma.drivingEvidence.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId,
          idempotencyKey,
        },
      },
    });
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.prisma.drivingEvidence.findMany({
      where: { organizationId, tripId },
      orderBy: { observedAt: 'asc' },
    });
  }

  findByVehicle(
    organizationId: string,
    vehicleId: string,
    options?: { from?: Date; to?: Date },
  ) {
    return this.prisma.drivingEvidence.findMany({
      where: {
        organizationId,
        vehicleId,
        ...(options?.from || options?.to
          ? {
              observedAt: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { observedAt: 'asc' },
    });
  }

  /**
   * Idempotent, append-only create. Existing idempotency key returns the persisted row unchanged.
   */
  async createImmutable(input: CreateDrivingEvidenceInput) {
    const validation = validateDrivingEvidenceContract(input);
    if (!validation.ok) {
      throw new BadRequestException(validation.issues);
    }

    const normalized = normalizeDrivingEvidenceCreate(input);

    await this.assertVehicleInOrg(normalized.organizationId, normalized.vehicleId);
    if (normalized.tripId) {
      const trip = await this.assertTripInOrg(normalized.organizationId, normalized.tripId);
      if (trip.vehicleId !== normalized.vehicleId) {
        throw new NotFoundException('Trip vehicle mismatch for organization');
      }
    }

    const existing = await this.findByIdempotencyKey(
      normalized.organizationId,
      normalized.idempotencyKey,
    );
    if (existing) {
      return { row: existing, created: false };
    }

    const row = await this.prisma.drivingEvidence.create({
      data: {
        organizationId: normalized.organizationId,
        vehicleId: normalized.vehicleId,
        tripId: normalized.tripId ?? null,
        bookingId: normalized.bookingId ?? null,
        customerId: normalized.customerId ?? null,
        dimension: normalized.dimension ?? null,
        analysisRunId: normalized.analysisRunId ?? null,
        sourceType: normalized.sourceType,
        strength: normalized.strength,
        observedAt: normalized.observedAt,
        providerSource: normalized.providerSource,
        capabilityVersion: normalized.capabilityVersion,
        modelVersion: normalized.modelVersion,
        coverage: normalized.coverage ?? null,
        effectiveCadenceMs: normalized.effectiveCadenceMs ?? null,
        p95CadenceMs: normalized.p95CadenceMs ?? null,
        confidence: normalized.confidence ?? null,
        sourceEntityJson: normalized.sourceEntity as Prisma.InputJsonValue,
        contextJson:
          normalized.context != null
            ? (normalized.context as Prisma.InputJsonValue)
            : undefined,
        idempotencyKey: normalized.idempotencyKey,
        misuseCaseEligible: normalized.misuseCaseEligible,
        contractVersion: normalized.contractVersion,
      },
    });

    return { row, created: true };
  }
}

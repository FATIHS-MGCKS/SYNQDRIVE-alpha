import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  TripAssessabilityPolicyResult,
  UpsertTripAssessabilityDimensionInput,
} from './trip-assessability.types';

@Injectable()
export class TripAssessabilityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertTripInOrg(organizationId: string, tripId: string): Promise<{ vehicleId: string }> {
    const trip = await this.prisma.vehicleTrip.findFirst({
      where: {
        id: tripId,
        vehicle: { organizationId },
      },
      select: { id: true, vehicleId: true },
    });
    if (!trip) {
      throw new NotFoundException('Trip not found for organization');
    }
    return { vehicleId: trip.vehicleId };
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.prisma.tripAssessability.findMany({
      where: { organizationId, tripId },
      orderBy: { dimension: 'asc' },
    });
  }

  async upsertDimensionAssessment(input: UpsertTripAssessabilityDimensionInput) {
    const { vehicleId } = await this.assertTripInOrg(input.organizationId, input.tripId);
    if (vehicleId !== input.vehicleId) {
      throw new NotFoundException('Trip vehicle mismatch for organization');
    }

    const reasonsJson = input.reasons as unknown as Prisma.InputJsonValue;

    return this.prisma.tripAssessability.upsert({
      where: {
        organizationId_tripId_dimension: {
          organizationId: input.organizationId,
          tripId: input.tripId,
          dimension: input.dimension,
        },
      },
      create: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.tripId,
        dimension: input.dimension,
        status: input.status,
        reasonsJson,
        coverage: input.coverage ?? null,
        effectiveCadenceMs: input.effectiveCadenceMs ?? null,
        p95CadenceMs: input.p95CadenceMs ?? null,
        capabilityVersion: input.capabilityVersion,
        inputWindowStart: input.inputWindowStart,
        inputWindowEnd: input.inputWindowEnd ?? null,
        calculatedAt: input.calculatedAt,
        policyVersion: input.policyVersion,
        analysisRunId: input.analysisRunId ?? null,
      },
      update: {
        status: input.status,
        reasonsJson,
        coverage: input.coverage ?? null,
        effectiveCadenceMs: input.effectiveCadenceMs ?? null,
        p95CadenceMs: input.p95CadenceMs ?? null,
        capabilityVersion: input.capabilityVersion,
        inputWindowStart: input.inputWindowStart,
        inputWindowEnd: input.inputWindowEnd ?? null,
        calculatedAt: input.calculatedAt,
        policyVersion: input.policyVersion,
        analysisRunId: input.analysisRunId ?? null,
      },
    });
  }

  async upsertPolicyResult(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    result: TripAssessabilityPolicyResult,
    analysisRunId?: string | null,
  ) {
    const rows = [];
    for (const dimension of result.dimensions) {
      rows.push(
        await this.upsertDimensionAssessment({
          organizationId,
          vehicleId,
          tripId,
          dimension: dimension.dimension,
          status: dimension.status,
          reasons: dimension.reasons,
          coverage: dimension.coverage,
          effectiveCadenceMs: dimension.effectiveCadenceMs,
          p95CadenceMs: dimension.p95CadenceMs,
          capabilityVersion: dimension.capabilityVersion,
          inputWindowStart: dimension.inputWindowStart,
          inputWindowEnd: dimension.inputWindowEnd,
          calculatedAt: dimension.calculatedAt,
          policyVersion: dimension.policyVersion,
          analysisRunId,
        }),
      );
    }
    return rows;
  }
}

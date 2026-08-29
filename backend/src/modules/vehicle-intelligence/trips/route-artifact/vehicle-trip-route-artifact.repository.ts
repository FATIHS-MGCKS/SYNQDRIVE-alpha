import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type VehicleTripRouteArtifact } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { serializeTripRouteGeometry } from './trip-route-geometry';
import {
  validateTripRouteArtifactWrite,
  TripRouteArtifactValidationError,
} from './trip-route-artifact.validation';
import type {
  TripRouteArtifactTenantContext,
  TripRouteArtifactUpsertResult,
  TripRouteArtifactWriteInput,
} from './trip-route.types';

export class TripRouteArtifactTenantMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TripRouteArtifactTenantMismatchError';
  }
}

export function assertTripRouteArtifactTenantContext(ctx: TripRouteArtifactTenantContext): void {
  if (ctx.vehicleOrganizationId !== ctx.organizationId) {
    throw new TripRouteArtifactTenantMismatchError(
      `Vehicle ${ctx.vehicleId} does not belong to organization ${ctx.organizationId}.`,
    );
  }
  if (ctx.tripVehicleId !== ctx.vehicleId) {
    throw new TripRouteArtifactTenantMismatchError(
      `Trip ${ctx.tripId} does not belong to vehicle ${ctx.vehicleId}.`,
    );
  }
}

function buildArtifactWriteData(
  input: TripRouteArtifactWriteInput,
): Prisma.VehicleTripRouteArtifactUncheckedCreateInput {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    tripId: input.tripId,
    routeQuality: input.routeQuality,
    matchedGeometryJson: input.matchedGeometry
      ? (serializeTripRouteGeometry(input.matchedGeometry) as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    filteredGeometryJson: input.filteredGeometry
      ? (serializeTripRouteGeometry(input.filteredGeometry) as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    matchConfidence: input.matchConfidence ?? null,
    matchCoverage: input.matchCoverage ?? null,
    provider: input.provider ?? null,
    algorithmVersion: input.algorithmVersion,
    inputFingerprint: input.inputFingerprint,
    sourcePointCount: input.sourcePointCount,
    filteredPointCount: input.filteredPointCount ?? 0,
    matchedPointCount: input.matchedPointCount ?? null,
    chunkCount: input.chunkCount ?? null,
    failedChunkCount: input.failedChunkCount ?? null,
    processedAt: input.processedAt ?? null,
    failureReason: input.failureReason ?? null,
    diagnosticsJson:
      input.diagnostics != null
        ? (input.diagnostics as Prisma.InputJsonValue)
        : Prisma.JsonNull,
  };
}

@Injectable()
export class VehicleTripRouteArtifactRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async getRouteArtifact(
    organizationId: string,
    tripId: string,
  ): Promise<VehicleTripRouteArtifact | null> {
    return this.prisma.vehicleTripRouteArtifact.findFirst({
      where: {
        tripId,
        organizationId,
      },
    });
  }

  async findByInputFingerprint(
    organizationId: string,
    tripId: string,
    algorithmVersion: string,
    inputFingerprint: string,
  ): Promise<VehicleTripRouteArtifact | null> {
    return this.prisma.vehicleTripRouteArtifact.findFirst({
      where: {
        organizationId,
        tripId,
        algorithmVersion,
        inputFingerprint,
      },
    });
  }

  /**
   * Idempotent upsert keyed by tripId (1:1).
   * Returns UNCHANGED when fingerprint + algorithm version are identical.
   */
  async upsertRouteArtifact(
    input: TripRouteArtifactWriteInput,
    tenant: TripRouteArtifactTenantContext,
  ): Promise<TripRouteArtifactUpsertResult> {
    assertTripRouteArtifactTenantContext(tenant);
    if (
      input.organizationId !== tenant.organizationId ||
      input.vehicleId !== tenant.vehicleId ||
      input.tripId !== tenant.tripId
    ) {
      throw new TripRouteArtifactTenantMismatchError(
        'Artifact input identifiers do not match tenant context.',
      );
    }

    validateTripRouteArtifactWrite(input);

    const existing = await this.prisma.vehicleTripRouteArtifact.findUnique({
      where: { tripId: input.tripId },
    });

    if (
      existing &&
      existing.inputFingerprint === input.inputFingerprint &&
      existing.algorithmVersion === input.algorithmVersion
    ) {
      return {
        action: 'UNCHANGED',
        artifact: existing,
        previousFingerprint: existing.inputFingerprint,
      };
    }

    const data = buildArtifactWriteData(input);

    if (!existing) {
      const artifact = await this.prisma.vehicleTripRouteArtifact.create({ data });
      return {
        action: 'CREATED',
        artifact,
        previousFingerprint: null,
      };
    }

    const artifact = await this.prisma.vehicleTripRouteArtifact.update({
      where: { tripId: input.tripId },
      data,
    });

    return {
      action: 'UPDATED',
      artifact,
      previousFingerprint: existing.inputFingerprint,
    };
  }
}

export { TripRouteArtifactValidationError };

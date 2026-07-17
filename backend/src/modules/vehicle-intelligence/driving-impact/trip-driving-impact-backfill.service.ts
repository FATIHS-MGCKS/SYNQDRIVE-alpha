import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  auditTripDrivingImpactCoverage,
  computeTripDrivingImpactCoverageReportHash,
  TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION,
  type TripDrivingImpactAuditInput,
  type TripDrivingImpactCoverageAuditResult,
} from './trip-driving-impact-coverage.domain';

export interface TripDrivingImpactBackfillPlan {
  dryRun: boolean;
  auditVersion: string;
  reportHash: string;
  autoBackfill: TripDrivingImpactCoverageAuditResult[];
  manualReview: TripDrivingImpactCoverageAuditResult[];
  skipped: TripDrivingImpactCoverageAuditResult[];
}

export interface TripDrivingImpactBackfillRequest {
  dryRun: boolean;
  organizationId?: string;
  vehicleId?: string;
  tripIds?: string[];
  maxBatchSize: number;
}

@Injectable()
export class TripDrivingImpactBackfillService {
  constructor(private readonly prisma: PrismaService) {}

  async auditFromDatabase(options?: {
    organizationId?: string;
    vehicleId?: string;
    tripIds?: string[];
    limit?: number;
  }): Promise<TripDrivingImpactCoverageAuditResult[]> {
    const trips = await this.prisma.vehicleTrip.findMany({
      where: {
        ...(options?.organizationId
          ? { vehicle: { organizationId: options.organizationId } }
          : {}),
        ...(options?.vehicleId ? { vehicleId: options.vehicleId } : {}),
        ...(options?.tripIds?.length ? { id: { in: options.tripIds } } : {}),
        tripStatus: 'COMPLETED',
        endTime: { not: null },
      },
      select: {
        id: true,
        vehicleId: true,
        vehicle: { select: { organizationId: true } },
        tripStatus: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        behaviorEnrichmentStatus: true,
        drivingImpactStatus: true,
        drivingImpactComputedAt: true,
        tripAnalysisStatus: true,
        createdAt: true,
      },
      orderBy: { startTime: 'desc' },
      ...(options?.limit ? { take: options.limit } : {}),
    });

    const tdiRows = await this.prisma.tripDrivingImpact.findMany({
      where: { tripId: { in: trips.map((t) => t.id) } },
      select: {
        tripId: true,
        authoritativeDistanceKm: true,
        distanceKm: true,
        sourceFingerprint: true,
        analysisStatus: true,
        calculatedAt: true,
        tripDistanceKmAtSource: true,
      },
    });
    const tdiByTrip = new Map(tdiRows.map((r) => [r.tripId, r]));

    return trips.map((trip) =>
      auditTripDrivingImpactCoverage(this.toAuditInput(trip, tdiByTrip.get(trip.id) ?? null)),
    );
  }

  planBackfill(
    auditRows: TripDrivingImpactCoverageAuditResult[],
    request: TripDrivingImpactBackfillRequest,
  ): TripDrivingImpactBackfillPlan {
    const scoped = auditRows.filter((row) => {
      if (request.organizationId && row.organizationId !== request.organizationId) return false;
      if (request.vehicleId && row.vehicleId !== request.vehicleId) return false;
      if (request.tripIds?.length && !request.tripIds.includes(row.tripId)) return false;
      return true;
    });

    const autoBackfill: TripDrivingImpactCoverageAuditResult[] = [];
    const manualReview: TripDrivingImpactCoverageAuditResult[] = [];
    const skipped: TripDrivingImpactCoverageAuditResult[] = [];

    for (const row of scoped) {
      if (row.coverageClass === 'ALREADY_COMPLETE' && !row.distanceOutlier) {
        skipped.push(row);
        continue;
      }
      if (row.autoBackfillEligible) {
        autoBackfill.push(row);
        continue;
      }
      manualReview.push(row);
    }

    const limited = autoBackfill.slice(0, request.maxBatchSize);
    const overflow = autoBackfill.slice(request.maxBatchSize).map((row) => ({
      ...row,
      autoBackfillEligible: false,
      recommendedAction: 'exceeds_max_batch_size',
      notes: [...row.notes, 'exceeds_max_batch_size'],
    }));

    return {
      dryRun: request.dryRun,
      auditVersion: TRIP_DRIVING_IMPACT_COVERAGE_AUDIT_VERSION,
      reportHash: computeTripDrivingImpactCoverageReportHash(limited),
      autoBackfill: limited,
      manualReview: [...manualReview, ...overflow],
      skipped,
    };
  }

  private toAuditInput(
    trip: {
      id: string;
      vehicleId: string;
      vehicle: { organizationId: string | null };
      tripStatus: string;
      startTime: Date;
      endTime: Date | null;
      distanceKm: number | null;
      behaviorEnrichmentStatus: string | null;
      drivingImpactStatus: string | null;
      drivingImpactComputedAt: Date | null;
      tripAnalysisStatus: string | null;
      createdAt: Date;
    },
    existingTdi: {
      tripId: string;
      authoritativeDistanceKm: number | null;
      distanceKm: number;
      sourceFingerprint: string | null;
      analysisStatus: string;
      calculatedAt: Date | null;
      tripDistanceKmAtSource: number | null;
    } | null,
  ): TripDrivingImpactAuditInput {
    return {
      tripId: trip.id,
      vehicleId: trip.vehicleId,
      organizationId: trip.vehicle.organizationId,
      tripStatus: trip.tripStatus,
      startTime: trip.startTime.toISOString(),
      endTime: trip.endTime?.toISOString() ?? null,
      distanceKm: trip.distanceKm,
      behaviorEnrichmentStatus: trip.behaviorEnrichmentStatus,
      drivingImpactStatus: trip.drivingImpactStatus,
      drivingImpactComputedAt: trip.drivingImpactComputedAt?.toISOString() ?? null,
      tripAnalysisStatus: trip.tripAnalysisStatus,
      updatedAt: trip.endTime?.toISOString() ?? trip.createdAt.toISOString(),
      existingTdi: existingTdi
        ? {
            tripId: existingTdi.tripId,
            authoritativeDistanceKm: existingTdi.authoritativeDistanceKm,
            distanceKm: existingTdi.distanceKm,
            sourceFingerprint: existingTdi.sourceFingerprint,
            analysisStatus: existingTdi.analysisStatus,
            calculatedAt: existingTdi.calculatedAt?.toISOString() ?? null,
            tripDistanceKmAtSource: existingTdi.tripDistanceKmAtSource,
          }
        : null,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { parseAnalysisStagesJson } from '../trips/trip-analysis-status';
import { expectedStageStateForTripStatus } from './driving-impact-outcome.util';
import type { DrivingImpactTripStatus } from './driving-impact-outcome.types';

export type DrivingImpactReconciliationIssueType =
  | 'impact_row_with_pending_status'
  | 'impact_row_with_skipped_status'
  | 'ready_without_impact_row'
  | 'partial_without_impact_row'
  | 'stage_state_mismatch'
  | 'computed_at_missing_with_ready_status';

export interface DrivingImpactReconciliationIssue {
  tripId: string;
  vehicleId: string;
  issueType: DrivingImpactReconciliationIssueType;
  drivingImpactStatus: string | null;
  stageState: string | null;
  hasImpactRow: boolean;
  drivingImpactComputedAt: string | null;
  impactModelVersion: string | null;
  impactCalculatedAt: string | null;
}

export interface DrivingImpactReconciliationReport {
  scannedTrips: number;
  issueCount: number;
  issues: DrivingImpactReconciliationIssue[];
}

/**
 * Read-only reconciliation between TripDrivingImpact rows and VehicleTrip readiness flags.
 * Does not mutate data — use for diagnostics/ops before a manual backfill.
 */
@Injectable()
export class DrivingImpactReconciliationService {
  private readonly logger = new Logger(DrivingImpactReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async scanInconsistencies(limit = 200): Promise<DrivingImpactReconciliationReport> {
    const impacts = await this.prisma.tripDrivingImpact.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        tripId: true,
        vehicleId: true,
        modelVersion: true,
        updatedAt: true,
        sourceSummaryJson: true,
      },
    });

    const tripIds = impacts.map((row) => row.tripId);
    const trips =
      tripIds.length === 0
        ? []
        : await this.prisma.vehicleTrip.findMany({
            where: { id: { in: tripIds } },
            select: {
              id: true,
              vehicleId: true,
              drivingImpactStatus: true,
              drivingImpactComputedAt: true,
              analysisStagesJson: true,
            },
          });

    const tripById = new Map(trips.map((trip) => [trip.id, trip]));
    const issues: DrivingImpactReconciliationIssue[] = [];

    for (const impact of impacts) {
      const trip = tripById.get(impact.tripId);
      if (!trip) continue;

      const status = (trip.drivingImpactStatus ?? 'PENDING') as DrivingImpactTripStatus;
      const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
      const stageState = stages.drivingImpact ?? 'pending';
      const expectedStage = expectedStageStateForTripStatus(status);
      const summary = impact.sourceSummaryJson as Record<string, unknown> | null;
      const impactCalculatedAt =
        typeof summary?.calculatedAt === 'string'
          ? summary.calculatedAt
          : impact.updatedAt.toISOString();

      const base: DrivingImpactReconciliationIssue = {
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        drivingImpactStatus: trip.drivingImpactStatus,
        stageState,
        hasImpactRow: true,
        drivingImpactComputedAt: trip.drivingImpactComputedAt?.toISOString() ?? null,
        impactModelVersion: impact.modelVersion,
        impactCalculatedAt,
        issueType: 'impact_row_with_pending_status',
      };

      if (status === 'PENDING') {
        issues.push({ ...base, issueType: 'impact_row_with_pending_status' });
        continue;
      }

      if (status === 'SKIPPED') {
        issues.push({ ...base, issueType: 'impact_row_with_skipped_status' });
        continue;
      }

      if (expectedStage && stageState !== expectedStage) {
        issues.push({ ...base, issueType: 'stage_state_mismatch' });
        continue;
      }

      if ((status === 'READY' || status === 'PARTIAL') && !trip.drivingImpactComputedAt) {
        issues.push({ ...base, issueType: 'computed_at_missing_with_ready_status' });
      }
    }

    const readyTrips = await this.prisma.vehicleTrip.findMany({
      where: {
        drivingImpactStatus: { in: ['READY', 'PARTIAL'] },
        tripStatus: 'COMPLETED',
      },
      select: {
        id: true,
        vehicleId: true,
        drivingImpactStatus: true,
        drivingImpactComputedAt: true,
        analysisStagesJson: true,
      },
      orderBy: { endTime: 'desc' },
      take: limit,
    });

    for (const trip of readyTrips) {
      const impact = await this.prisma.tripDrivingImpact.findUnique({
        where: { tripId: trip.id },
        select: { id: true },
      });
      if (impact) continue;

      const stages = parseAnalysisStagesJson(trip.analysisStagesJson);
      issues.push({
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        issueType:
          trip.drivingImpactStatus === 'READY'
            ? 'ready_without_impact_row'
            : 'partial_without_impact_row',
        drivingImpactStatus: trip.drivingImpactStatus,
        stageState: stages.drivingImpact ?? 'pending',
        hasImpactRow: false,
        drivingImpactComputedAt: trip.drivingImpactComputedAt?.toISOString() ?? null,
        impactModelVersion: null,
        impactCalculatedAt: null,
      });
    }

    if (issues.length > 0) {
      this.logger.warn(
        `DrivingImpact reconciliation: ${issues.length} issue(s) across ${impacts.length + readyTrips.length} scanned trip(s)`,
      );
    }

    return {
      scannedTrips: impacts.length + readyTrips.length,
      issueCount: issues.length,
      issues,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';

export interface TripOverlapContext extends DetectorContext {
  candidateStart: Date;
  candidateEnd: Date;
  excludeTripId?: string;
}

const OVERLAP_TOLERANCE_MS = 5 * 60_000; // 5 minutes

/**
 * TripOverlapDetector
 *
 * Checks whether a proposed trip window overlaps with an existing trip in the DB.
 * Used by the reconciliation layer to avoid creating duplicate trips.
 *
 * TRIGGERED = overlap found → do not create duplicate
 * NOT_TRIGGERED = no overlap → safe to create trip
 *
 * Used in: duplicate_or_overlap_check phase
 */
@Injectable()
export class TripOverlapDetector implements TripDetector {
  readonly name = 'TripOverlapDetector';

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: TripOverlapContext): Promise<DetectorFinding> {
    const { vehicleId, candidateStart, candidateEnd, excludeTripId } = ctx;

    const windowStart = new Date(candidateStart.getTime() - OVERLAP_TOLERANCE_MS);
    const windowEnd = new Date(candidateEnd.getTime() + OVERLAP_TOLERANCE_MS);

    const overlap = await this.prisma.vehicleTrip.findFirst({
      where: {
        vehicleId,
        startTime: { lte: windowEnd },
        OR: [{ endTime: { gte: windowStart } }, { endTime: null }],
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
      },
      select: { id: true, startTime: true, endTime: true, tripStatus: true },
    });

    if (overlap) {
      return {
        detectorName: this.name,
        verdict: 'TRIGGERED',
        confidence: 'HIGH',
        evidence: {
          overlapTripId: overlap.id,
          overlapStart: overlap.startTime.toISOString(),
          overlapEnd: overlap.endTime?.toISOString() ?? null,
          overlapStatus: overlap.tripStatus,
        },
        timestamp: new Date(),
      };
    }

    return {
      detectorName: this.name,
      verdict: 'NOT_TRIGGERED',
      confidence: 'HIGH',
      evidence: { overlapFound: false },
      timestamp: new Date(),
    };
  }
}

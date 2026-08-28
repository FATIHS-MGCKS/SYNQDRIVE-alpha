import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { TripDetector, DetectorContext, DetectorFinding } from './detector.interfaces';
import {
  assessCoverage,
  isSuppressingVerdict,
  MAX_CANONICAL_INTERVALS,
  type CanonicalTripInterval,
  type CoverageAssessment,
} from './trip-coverage.util';

export interface TripOverlapContext extends DetectorContext {
  candidateStart: Date;
  candidateEnd: Date;
  excludeTripId?: string;
  /**
   * legacy  — the binary overlap result decides (historic behaviour).
   * shadow  — the binary overlap result decides; coverage is measured anyway.
   * enforce — the coverage verdict decides.
   */
  coverageMode?: 'legacy' | 'shadow' | 'enforce';
}

const OVERLAP_TOLERANCE_MS = 5 * 60_000; // 5 minutes

export interface TripOverlapEvidence extends Record<string, unknown> {
  mode: 'legacy' | 'shadow' | 'enforce';
  legacyVerdict: 'TRIGGERED' | 'NOT_TRIGGERED';
  legacyOverlapTripId: string | null;
  coverageVerdict: CoverageAssessment['verdict'];
  ambiguousReason: string | null;
  effectiveDecision: 'SUPPRESS' | 'ACCEPT';
  decisionSource: 'legacy' | 'coverage';
  coverage: {
    proposalDurationSeconds: number;
    coveredSeconds: number;
    coverageRatio: number;
    missingSeconds: number;
    prefixMissingSeconds: number;
    suffixMissingSeconds: number;
    interiorMissingSeconds: number;
    longestUncoveredSpanSeconds: number;
    coveringTripCount: number;
  };
  intersectingTripIds: string[];
  repairableSpans: Array<{ start: string; end: string }>;
  canonicalSetTruncated: boolean;
  agreement: 'AGREE' | 'COVERAGE_WOULD_ACCEPT' | 'COVERAGE_WOULD_SUPPRESS';
}

/**
 * TripOverlapDetector
 *
 * Decides whether a proposed repair window is already represented by canonical
 * trips.
 *
 * Historically this was a binary question — "does any trip touch this window,
 * within a 5 minute tolerance?" — which is not a coverage predicate. A 98-minute
 * drive containing two short canonical trips totalling 29 minutes overlaps, so
 * it was suppressed, and 69 minutes of real driving stayed unrepresented.
 *
 * The detector now measures containment: how much of the proposal canonical
 * trips actually cover, and where the uncovered time sits. The binary result is
 * still computed and reported, so `legacy` and `shadow` modes behave exactly as
 * before and the two decisions can be compared on production traffic.
 *
 * TRIGGERED = suppress, the proposal is already represented
 * NOT_TRIGGERED = the proposal carries unrepresented driving time
 *
 * Used in: duplicate_or_overlap_check phase
 */
@Injectable()
export class TripOverlapDetector implements TripDetector {
  readonly name = 'TripOverlapDetector';

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: TripOverlapContext): Promise<DetectorFinding> {
    const { vehicleId, candidateStart, candidateEnd, excludeTripId } = ctx;
    const mode = ctx.coverageMode ?? 'shadow';

    const windowStart = new Date(candidateStart.getTime() - OVERLAP_TOLERANCE_MS);
    const windowEnd = new Date(candidateEnd.getTime() + OVERLAP_TOLERANCE_MS);

    // An ONGOING trip (endTime=null) should only block a candidate that
    // actually intersects it — i.e. the candidate starts at/after the ongoing
    // trip's start. Historically the `{ endTime: null }` branch matched every
    // open trip regardless of when it started, blocking any repair of older
    // missing trips while an ongoing trip existed ("phantom ONGOING blocks all").
    //
    // The same predicate now returns every match rather than the first one, so
    // coverage can be measured from the identical row set the legacy check saw.
    //
    // Deliberately unordered. Adding `ORDER BY start_time` gives the planner a
    // reason to walk `vehicle_trips_start_time_idx` — which is not selective on
    // vehicle_id — instead of the composite `(vehicle_id, start_time)` index; on
    // production that plan reads 1249 buffers against the composite plan's 405.
    // The result set is bounded by `take`, so ordering it here costs nothing and
    // stays deterministic whichever plan the database chooses.
    const rows = await this.prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        OR: [
          {
            endTime: { not: null, gte: windowStart },
            startTime: { lte: windowEnd },
          },
          {
            endTime: null,
            startTime: { lte: windowEnd, gte: windowStart },
          },
        ],
        ...(excludeTripId ? { id: { not: excludeTripId } } : {}),
      },
      select: { id: true, startTime: true, endTime: true, tripStatus: true },
      take: MAX_CANONICAL_INTERVALS + 1,
    });

    const canonicalSetTruncated = rows.length > MAX_CANONICAL_INTERVALS;
    const trips: CanonicalTripInterval[] = rows
      .slice(0, MAX_CANONICAL_INTERVALS)
      .map((row) => ({
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        tripStatus: String(row.tripStatus),
      }))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const legacyOverlap = trips[0] ?? null;
    const legacyVerdict = legacyOverlap ? 'TRIGGERED' : 'NOT_TRIGGERED';

    const assessment = assessCoverage(candidateStart, candidateEnd, trips, {
      canonicalSetTruncated,
    });
    const coverageSuppresses = isSuppressingVerdict(assessment.verdict);
    const legacySuppresses = legacyVerdict === 'TRIGGERED';
    const suppress = mode === 'enforce' ? coverageSuppresses : legacySuppresses;

    const evidence: TripOverlapEvidence = {
      mode,
      legacyVerdict,
      legacyOverlapTripId: legacyOverlap?.id ?? null,
      coverageVerdict: assessment.verdict,
      ambiguousReason: assessment.ambiguousReason ?? null,
      effectiveDecision: suppress ? 'SUPPRESS' : 'ACCEPT',
      decisionSource: mode === 'enforce' ? 'coverage' : 'legacy',
      coverage: {
        proposalDurationSeconds: assessment.metrics.proposalDurationSeconds,
        coveredSeconds: assessment.metrics.coveredSeconds,
        coverageRatio: Number(assessment.metrics.coverageRatio.toFixed(4)),
        missingSeconds: assessment.metrics.missingSeconds,
        prefixMissingSeconds: assessment.metrics.prefixMissingSeconds,
        suffixMissingSeconds: assessment.metrics.suffixMissingSeconds,
        interiorMissingSeconds: assessment.metrics.interiorMissingSeconds,
        longestUncoveredSpanSeconds: assessment.metrics.longestUncoveredSpanSeconds,
        coveringTripCount: assessment.metrics.coveringTripCount,
      },
      intersectingTripIds: assessment.intersectingTripIds,
      repairableSpans: assessment.repairableSpans.map((span) => ({
        start: span.start.toISOString(),
        end: span.end.toISOString(),
      })),
      canonicalSetTruncated,
      agreement:
        coverageSuppresses === legacySuppresses
          ? 'AGREE'
          : coverageSuppresses
            ? 'COVERAGE_WOULD_SUPPRESS'
            : 'COVERAGE_WOULD_ACCEPT',
    };

    if (legacyOverlap) {
      evidence.overlapTripId = legacyOverlap.id;
      evidence.overlapStart = legacyOverlap.startTime.toISOString();
      evidence.overlapEnd = legacyOverlap.endTime?.toISOString() ?? null;
      evidence.overlapStatus = legacyOverlap.tripStatus;
    } else {
      evidence.overlapFound = false;
    }

    return {
      detectorName: this.name,
      verdict: suppress ? 'TRIGGERED' : 'NOT_TRIGGERED',
      confidence: 'HIGH',
      evidence,
      timestamp: new Date(),
    };
  }
}

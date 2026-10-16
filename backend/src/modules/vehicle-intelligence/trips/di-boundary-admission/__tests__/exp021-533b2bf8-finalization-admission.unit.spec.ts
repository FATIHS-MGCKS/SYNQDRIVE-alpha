/**
 * Regression for EXP021 diagnosis PR #2046 @ 91458403a6: S4 ran on pre-split boundaries
 * while INTRA_TRIP_GAP_SPLIT repair still pending. Admission must bind to released revision.
 */
import {
  buildTripDiBoundaryAdmissionPatch,
  buildTripDiBoundaryRevisionKey,
  evaluateTripDiBoundaryAdmission,
  type TripDiBoundaryAdmissionScope,
} from '../trip-di-boundary-admission';

function boundaryRepairMeta(auditId: string, start: Date, end: Date): Record<string, unknown> {
  return {
    boundaryRepair: {
      auditId,
      providerSegmentId: 'dimo-seg-ref',
      newStartTime: start.toISOString(),
      newEndTime: end.toISOString(),
    },
  };
}

const ORG = '19fedd4b-0000-4000-8000-000000000001';
const VEH = '19fedd4b-0000-4000-8000-000000000002';
const PRE_SPLIT_TRIP = '533b2bf8-0000-4000-8000-000000000003';
const SEG1_TRIP = '533b2bf8-0000-4000-8000-000000000004';
const SEG2_TRIP = '533b2bf8-0000-4000-8000-000000000005';

const PRE_START = new Date('2026-10-14T14:47:05.000Z');
const PRE_END = new Date('2026-10-14T16:05:19.000Z');
const SEG1_END = new Date('2026-10-14T14:47:05.000Z');
const SEG2_START = new Date('2026-10-14T15:10:10.000Z');
const SEG2_END = new Date('2026-10-14T16:05:19.000Z');

function scope(input: {
  tripId: string;
  start: Date;
  end: Date;
  rawDetectionMeta?: unknown;
}): TripDiBoundaryAdmissionScope {
  return {
    organizationId: ORG,
    vehicleId: VEH,
    tripId: input.tripId,
    tripStatus: 'COMPLETED',
    startTime: input.start,
    endTime: input.end,
    dimoSegmentId: 'dimo-seg-ref',
    mergeParentTripId: null,
    rawDetectionMeta: input.rawDetectionMeta ?? {},
    detectionState: 'RESTING',
    activeTripId: null,
    proposedBoundaryRepairCount: 0,
  };
}

describe('EXP021 533b2bf8 — finalization admission regression', () => {
  it('pre-split long trip without admission is not S4-admissible even when COMPLETED and quiet', () => {
    const preSplit = scope({ tripId: PRE_SPLIT_TRIP, start: PRE_START, end: PRE_END });
    expect(evaluateTripDiBoundaryAdmission(preSplit)).toEqual({ ok: false, code: 'ADMISSION_RECORD_MISSING' });
  });

  it('pre-split trip with admission on obsolete revision is rejected after split generation bump', () => {
    const preMeta = { splitGapMs: 1_365_000, ...boundaryRepairMeta('pre-split-audit', PRE_START, PRE_END) };
    const revisionAtS4Time = buildTripDiBoundaryRevisionKey({
      organizationId: ORG,
      vehicleId: VEH,
      tripId: PRE_SPLIT_TRIP,
      tripStatus: 'COMPLETED',
      startTime: PRE_START,
      endTime: PRE_END,
      dimoSegmentId: 'dimo-seg-ref',
      mergeParentTripId: null,
      rawDetectionMeta: preMeta,
    });
    const staleAdmission = scope({
      tripId: PRE_SPLIT_TRIP,
      start: PRE_START,
      end: PRE_END,
      rawDetectionMeta: {
        ...preMeta,
        ...buildTripDiBoundaryAdmissionPatch(revisionAtS4Time, 'RECONCILIATION'),
      },
    });
    expect(evaluateTripDiBoundaryAdmission(staleAdmission).ok).toBe(true);

    const postRepairMeta = {
      splitGapMs: 1_365_000,
      intraTripGapSplitAppliedAt: '2026-10-14T19:47:21.000Z',
      ...boundaryRepairMeta('post-split-audit', PRE_START, SEG2_END),
    };
    const afterRepair = scope({
      tripId: PRE_SPLIT_TRIP,
      start: PRE_START,
      end: PRE_END,
      rawDetectionMeta: {
        ...postRepairMeta,
        ...buildTripDiBoundaryAdmissionPatch(revisionAtS4Time, 'RECONCILIATION'),
      },
    });
    expect(evaluateTripDiBoundaryAdmission(afterRepair)).toEqual({ ok: false, code: 'ADMISSION_REVISION_MISMATCH' });
  });

  it('final segment trips are admissible only with matching released revision (not parent long window)', () => {
    for (const [tripId, start, end] of [
      [SEG1_TRIP, PRE_START, SEG1_END],
      [SEG2_TRIP, SEG2_START, SEG2_END],
    ] as const) {
      const meta = {
        splitFrom: PRE_SPLIT_TRIP,
        ...boundaryRepairMeta(`seg-${tripId}`, start, end),
      };
      const segScope = scope({ tripId, start, end, rawDetectionMeta: meta });
      expect(evaluateTripDiBoundaryAdmission(segScope)).toEqual({ ok: false, code: 'ADMISSION_RECORD_MISSING' });

      const revisionKey = buildTripDiBoundaryRevisionKey({
        organizationId: ORG,
        vehicleId: VEH,
        tripId,
        tripStatus: 'COMPLETED',
        startTime: start,
        endTime: end,
        dimoSegmentId: 'dimo-seg-ref',
        mergeParentTripId: null,
        rawDetectionMeta: meta,
      });
      const admitted = scope({
        tripId,
        start,
        end,
        rawDetectionMeta: { ...meta, ...buildTripDiBoundaryAdmissionPatch(revisionKey, 'RECONCILIATION') },
      });
      expect(evaluateTripDiBoundaryAdmission(admitted).ok).toBe(true);

      const parentRevision = buildTripDiBoundaryRevisionKey({
        organizationId: ORG,
        vehicleId: VEH,
        tripId: PRE_SPLIT_TRIP,
        tripStatus: 'COMPLETED',
        startTime: PRE_START,
        endTime: PRE_END,
        dimoSegmentId: 'dimo-seg-ref',
        mergeParentTripId: null,
        rawDetectionMeta: boundaryRepairMeta('seg-parent', PRE_START, SEG2_END),
      });
      expect(revisionKey).not.toBe(parentRevision);
    }
  });
});

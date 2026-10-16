import { evaluateTripDiProductReadBoundaryGate } from '../trip-di-boundary-admission-product-read.guard';
import { buildTripDiBoundaryAdmissionPatch, buildTripDiBoundaryRevisionKey } from '../trip-di-boundary-admission';

describe('trip-di-boundary-admission-product-read.guard', () => {
  it('returns ADMISSION_NOT_SATISFIED when admission record missing', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          organization_id: 'o1',
          vehicle_id: 'v1',
          trip_id: 't1',
          trip_status: 'COMPLETED',
          start_time: new Date('2026-01-01T10:00:00Z'),
          end_time: new Date('2026-01-01T11:00:00Z'),
          dimo_segment_id: 's1',
          merge_parent_trip_id: null,
          raw_detection_meta: {},
          detection_state: 'RESTING',
          active_trip_id: null,
          proposed_repairs: BigInt(0),
        },
      ]),
    };
    const result = await evaluateTripDiProductReadBoundaryGate(prisma as never, 't1', 'fp');
    expect(result).toEqual({ ok: false, reason: 'ADMISSION_NOT_SATISFIED' });
  });

  it('returns ok when admission and fingerprint align', async () => {
    const start = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T11:00:00Z');
    const revisionKey = buildTripDiBoundaryRevisionKey({
      organizationId: 'o1',
      vehicleId: 'v1',
      tripId: 't1',
      tripStatus: 'COMPLETED',
      startTime: start,
      endTime: end,
      dimoSegmentId: 's1',
      mergeParentTripId: null,
      rawDetectionMeta: {},
    });
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          organization_id: 'o1',
          vehicle_id: 'v1',
          trip_id: 't1',
          trip_status: 'COMPLETED',
          start_time: start,
          end_time: end,
          dimo_segment_id: 's1',
          merge_parent_trip_id: null,
          raw_detection_meta: buildTripDiBoundaryAdmissionPatch(revisionKey, 'RECONCILIATION'),
          detection_state: 'RESTING',
          active_trip_id: null,
          proposed_repairs: BigInt(0),
        },
      ]),
    };
    const result = await evaluateTripDiProductReadBoundaryGate(prisma as never, 't1', revisionKey);
    expect(result.ok).toBe(true);
  });
});

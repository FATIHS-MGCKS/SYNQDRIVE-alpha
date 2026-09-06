import { projectTripEndTimeFields } from './trip-end-time-projection.util';
import { mapTripForVehicleApi } from './trip-api.mapper';

describe('trip-end-time projection R8', () => {
  it('ONGOING exposes provisional semantics without canonical end', () => {
    const projection = projectTripEndTimeFields({
      tripStatus: 'ONGOING',
      endTime: '2026-09-06T12:00:00.000Z',
    });
    expect(projection.canonicalEndTime).toBeNull();
    expect(projection.provisionalLastObservedAt).toBe('2026-09-06T12:00:00.000Z');
    expect(projection.endTimeSemantics).toBe('PROVISIONAL_WORKER_OBSERVATION');
  });

  it('COMPLETED exposes canonical end boundary', () => {
    const projection = projectTripEndTimeFields({
      tripStatus: 'COMPLETED',
      endTime: '2026-09-06T12:30:00.000Z',
    });
    expect(projection.canonicalEndTime).toBe('2026-09-06T12:30:00.000Z');
    expect(projection.provisionalLastObservedAt).toBeNull();
    expect(projection.endTimeSemantics).toBe('CANONICAL_EVENT_BOUNDARY');
  });

  it('mapTripForVehicleApi includes explicit end-time contract fields', () => {
    const mapped = mapTripForVehicleApi({
      id: 'trip-1',
      tripStatus: 'ONGOING',
      startTime: '2026-09-06T10:00:00.000Z',
      endTime: '2026-09-06T12:00:00.000Z',
      behaviorSummaryJson: null,
    } as any);
    expect(mapped.endTimeSemantics).toBe('PROVISIONAL_WORKER_OBSERVATION');
    expect(mapped.canonicalEndTime).toBeNull();
    expect(mapped.provisionalLastObservedAt).toBe('2026-09-06T12:00:00.000Z');
  });
});

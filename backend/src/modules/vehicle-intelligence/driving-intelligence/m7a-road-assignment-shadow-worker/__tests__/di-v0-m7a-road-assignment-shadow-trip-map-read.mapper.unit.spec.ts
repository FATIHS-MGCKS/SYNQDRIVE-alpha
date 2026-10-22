import {
  mapM7aTripMapPoints,
  resolveM7aTripMapGeometry,
  stripM7aTripMapPointGeometry,
} from '../di-v0-m7a-road-assignment-shadow-trip-map-read.mapper';
import { enrichM7aBucketDtosWithPositionAnchors } from '../di-v0-m7a-road-assignment-shadow.types';

describe('M7A trip map read mapper', () => {
  it('resolves position anchors only for finite coordinates', () => {
    const points = mapM7aTripMapPoints([
      {
        bucketLabelUtc: '2026-01-01T10:00:00.000Z',
        availability: 'PRESENT',
        outcome: 'CONFIRMED',
        osmWayId: 1,
        headingDeg: 90,
        candidateWayIds: [1],
        ambiguityReasons: [],
        pathMargin: 1,
        latitude: 51.1,
        longitude: 9.2,
      },
      {
        bucketLabelUtc: '2026-01-01T10:00:01.000Z',
        availability: 'ROW_ABSENT',
        outcome: 'UNKNOWN',
        osmWayId: null,
        headingDeg: null,
        candidateWayIds: [],
        ambiguityReasons: [],
        pathMargin: null,
        latitude: null,
        longitude: null,
      },
    ]);
    expect(points[0].positionResolved).toBe(true);
    expect(points[1].positionResolved).toBe(false);
    const geom = resolveM7aTripMapGeometry(points);
    expect(geom.geometrySource).toBe('POSITION_ANCHOR');
    expect(geom.resolvedPointCount).toBe(1);
  });

  it('strips geometry for legacy runs without anchors', () => {
    const points = stripM7aTripMapPointGeometry(
      mapM7aTripMapPoints([
        {
          bucketLabelUtc: 't',
          availability: 'PRESENT',
          outcome: 'AMBIGUOUS',
          osmWayId: 2,
          headingDeg: null,
          candidateWayIds: [2, 3],
          ambiguityReasons: ['tie'],
          pathMargin: null,
          latitude: 51,
          longitude: 9,
        },
      ]),
    );
    expect(points[0].positionResolved).toBe(false);
    expect(resolveM7aTripMapGeometry(points).geometrySource).toBe('NONE');
  });

  it('enriches bucket DTOs from GPS grid at persist boundary', () => {
    const enriched = enrichM7aBucketDtosWithPositionAnchors(
      [
        {
          bucketLabelUtc: 'a',
          availability: 'PRESENT',
          outcome: 'CONFIRMED',
          osmWayId: 1,
          headingDeg: 0,
          candidateWayIds: [1],
          ambiguityReasons: [],
          pathMargin: null,
          latitude: null,
          longitude: null,
        },
      ],
      [
        {
          bucketLabelUtc: 'a',
          availability: 'PRESENT',
          latitude: 50.5,
          longitude: 8.5,
        },
      ],
    );
    expect(enriched[0].latitude).toBe(50.5);
    expect(enriched[0].longitude).toBe(8.5);
  });
});

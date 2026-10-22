import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../../i18n/LanguageContext';
import { TripMapLayerControls } from './TripMapLayerControls';
import { TripM7aMapStatusBanner } from './TripM7aMapStatusBanner';
import { DEFAULT_TRIP_MAP_LAYERS } from './utils/tripMapLayers';
import type { TripM7aMapPayload } from './m7a-map.types';
import { groupM7aPointsByCoordinate, resolveM7aMotionBinding } from './m7a-map.utils';
import type { TripMotionMapPayload } from './motion-map.types';

vi.mock('./useTripsRouteMap', () => ({
  useTripsRouteMap: () => ({
    mapContainerRef: { current: null },
    mapRef: { current: null },
    mapLoaded: true,
    mapError: null,
    handleCenterRoute: () => undefined,
    focusBehaviorEvent: () => undefined,
    hasMapboxToken: true,
  }),
}));

const activeM7a = (): TripM7aMapPayload => ({
  status: 'SUCCEEDED',
  previewLabel: 'M7A Straßenzuordnung · vorläufig',
  runId: 'r1',
  workItemId: 'w1',
  discoveryIntentKey: null,
  runIntentKey: null,
  summary: null,
  pinnedSnapshotHash: 'snap-a',
  combinedInputIdentity: 'input-a',
  osmSnapshotSha256: 'osm',
  computedAtUtc: '2026-01-01T00:00:00.000Z',
  geometrySource: 'POSITION_ANCHOR',
  geometryNote: null,
  mapPoints: [
    {
      bucketLabelUtc: '2026-01-01T10:00:00.000Z',
      outcome: 'CONFIRMED',
      osmWayId: 1,
      headingDeg: 0,
      candidateWayIds: [1],
      ambiguityReasons: [],
      availability: 'PRESENT',
      latitude: 51.1,
      longitude: 9.2,
      positionResolved: true,
    },
    {
      bucketLabelUtc: '2026-01-01T10:05:00.000Z',
      outcome: 'AMBIGUOUS',
      osmWayId: 2,
      headingDeg: null,
      candidateWayIds: [2, 3],
      ambiguityReasons: ['tie'],
      availability: 'PRESENT',
      latitude: 51.1,
      longitude: 9.2,
      positionResolved: true,
    },
  ],
  outcomeSummary: { bucketCount: 2, confirmedCount: 1, ambiguousCount: 1, unknownCount: 0 },
  limitations: [],
  failureCode: null,
});

function wrap(ui: ReactNode) {
  return renderToStaticMarkup(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('TripsMapCard M7A UI (component markup)', () => {
  it('shows layer chip M7A-Straßenzuordnung when anchors exist', () => {
    const html = wrap(
      <TripMapLayerControls
        layers={{ ...DEFAULT_TRIP_MAP_LAYERS, showM7aRoadAssignment: false }}
        hasRoute
        m7aLayerAvailable
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain('M7A-Straßenzuordnung');
  });

  it('banner explains anchor points are not a reconstructed road line', () => {
    const html = wrap(<TripM7aMapStatusBanner payload={activeM7a()} loading={false} error={false} />);
    expect(html).toContain('GPS positions per second');
    expect(html).toContain('not an M7A-reconstructed road line');
  });

  it('groups multiple passages at the same coordinate for pick list', () => {
    const grouped = groupM7aPointsByCoordinate(activeM7a().mapPoints);
    expect(grouped.size).toBe(1);
    expect(grouped.values().next().value?.length).toBe(2);
  });

  it('blocks combined hover on snapshot mismatch but not on differing combinedInputIdentity alone', () => {
    const m7a = activeM7a();
    const motionMismatch: TripMotionMapPayload = {
      status: 'SUCCEEDED',
      previewLabel: 'S4 Motion · vorläufig',
      runId: 'm1',
      workItemId: 'w1',
      pinnedSnapshotHash: 'snap-b',
      combinedInputIdentity: 'different-input-id',
      algorithmVersions: null,
      computedAtUtc: null,
      geometrySource: 'MOTION_POSITION_GRID',
      geometryNote: null,
      samples: [],
      events: [],
      stopEpisodes: [],
      limitations: [],
      failureCode: null,
      snapshotBindingVerified: true,
      newerFailedRunId: null,
      newerFailedRunStatus: null,
    };
    const snap = resolveM7aMotionBinding(motionMismatch, m7a);
    expect(snap.compatible).toBe(false);
    expect(snap.reasonKey).toBe('trips.m7aMap.bindingSnapshotMismatch');

    const motionSameSnap: TripMotionMapPayload = {
      ...motionMismatch,
      pinnedSnapshotHash: 'snap-a',
    };
    const input = resolveM7aMotionBinding(motionSameSnap, m7a);
    expect(input.compatible).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { TripMotionMapEvent, TripMotionMapPayload } from '../motion-map.types';
import {
  classifyDs4MotionEvidenceState,
  filterDs4DrivingEventsForMap,
  isVerifiedRenderableDs4DrivingEvent,
  resolveTripMapDrivingMarkerSource,
} from './trip-map-driving-marker-source';

function basePayload(overrides: Partial<TripMotionMapPayload> = {}): TripMotionMapPayload {
  return {
    status: 'SUCCEEDED',
    previewLabel: 'S4 Motion · vorläufig',
    runId: 'run-1',
    workItemId: 'wi-1',
    pinnedSnapshotHash: 'hash',
    combinedInputIdentity: 'id',
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
    ...overrides,
  };
}

function verifiedEvent(overrides: Partial<TripMotionMapEvent> = {}): TripMotionMapEvent {
  return {
    id: 'ev-1',
    kind: 'ACCEL',
    displayKind: 'ACCELERATION',
    startLabelUtc: '2026-01-01T10:00:00Z',
    endLabelUtc: '2026-01-01T10:00:01Z',
    startSpeedKmh: 10,
    endSpeedKmh: 20,
    deltaKmh: 10,
    peakAccel1sMps2: 1,
    quality: 'DIRECT',
    artefactSuspect: false,
    latitude: 50,
    longitude: 8,
    positionResolved: true,
    ...overrides,
  };
}

describe('classifyDs4MotionEvidenceState', () => {
  it('marks unavailable, pending, and failed distinctly', () => {
    expect(classifyDs4MotionEvidenceState(null)).toBe('UNAVAILABLE');
    expect(classifyDs4MotionEvidenceState(basePayload({ status: 'NOT_AVAILABLE' }))).toBe('UNAVAILABLE');
    expect(classifyDs4MotionEvidenceState(basePayload({ status: 'PENDING' }))).toBe('PENDING');
    expect(classifyDs4MotionEvidenceState(basePayload({ status: 'FAILED' }))).toBe('FAILED');
  });

  it('does not treat SUCCEEDED_EMPTY as failure', () => {
    expect(
      classifyDs4MotionEvidenceState(
        basePayload({ status: 'SUCCEEDED_EMPTY', events: [] }),
      ),
    ).toBe('SUCCEEDED_EMPTY');
  });

  it('detects unverified snapshot binding', () => {
    expect(
      classifyDs4MotionEvidenceState(
        basePayload({ snapshotBindingVerified: false, events: [verifiedEvent()] }),
      ),
    ).toBe('UNVERIFIED_BINDING');
  });

  it('classifies suspect-only and no-position outcomes', () => {
    expect(
      classifyDs4MotionEvidenceState(
        basePayload({ events: [verifiedEvent({ artefactSuspect: true })] }),
      ),
    ).toBe('SUCCEEDED_EVENTS_REJECTED_OR_SUSPECT_ONLY');
    expect(
      classifyDs4MotionEvidenceState(
        basePayload({
          events: [verifiedEvent({ positionResolved: false, latitude: null, longitude: null })],
        }),
      ),
    ).toBe('SUCCEEDED_EVENTS_NO_POSITION');
  });
});

describe('filterDs4DrivingEventsForMap', () => {
  it('excludes artefact-suspect events from verified render set', () => {
    const events = [verifiedEvent(), verifiedEvent({ id: 'ev-2', artefactSuspect: true })];
    expect(filterDs4DrivingEventsForMap(events)).toHaveLength(1);
    expect(isVerifiedRenderableDs4DrivingEvent(events[1]!)).toBe(false);
  });
});

describe('resolveTripMapDrivingMarkerSource', () => {
  it('disables both sources when driving-events layer is off', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: false,
      motionMapPayload: basePayload({ events: [verifiedEvent()] }),
      replacementGateEnabled: true,
    });
    expect(resolution.provenance).toBe('NONE_LAYER_DISABLED');
    expect(resolution.hideLegacyDrivingMarkers).toBe(false);
    expect(resolution.showDs4DrivingMarkers).toBe(false);
  });

  it('uses legacy markers when DS4 evidence is unavailable', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: true,
      motionMapPayload: null,
      replacementGateEnabled: true,
    });
    expect(resolution.provenance).toBe('LEGACY_BEHAVIOR_EVENTS');
    expect(resolution.ds4EvidenceState).toBe('UNAVAILABLE');
    expect(resolution.hideLegacyDrivingMarkers).toBe(false);
  });

  it('uses legacy markers when DS4 failed', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: true,
      motionMapPayload: basePayload({ status: 'FAILED' }),
      replacementGateEnabled: true,
    });
    expect(resolution.ds4EvidenceState).toBe('FAILED');
    expect(resolution.provenance).toBe('LEGACY_BEHAVIOR_EVENTS');
  });

  it('keeps legacy markers for SUCCEEDED_EMPTY (not equated to failure)', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: true,
      motionMapPayload: basePayload({ status: 'SUCCEEDED_EMPTY', events: [] }),
      replacementGateEnabled: true,
    });
    expect(resolution.ds4EvidenceState).toBe('SUCCEEDED_EMPTY');
    expect(resolution.provenance).toBe('LEGACY_BEHAVIOR_EVENTS');
    expect(resolution.hideLegacyDrivingMarkers).toBe(false);
    expect(resolution.showDs4DrivingMarkers).toBe(false);
  });

  it('replaces with DS4 only when gate on and verified renderable events exist', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: true,
      motionMapPayload: basePayload({ events: [verifiedEvent()] }),
      replacementGateEnabled: true,
    });
    expect(resolution.provenance).toBe('DS4_MOTION_EVENTS');
    expect(resolution.hideLegacyDrivingMarkers).toBe(true);
    expect(resolution.showDs4DrivingMarkers).toBe(true);
    expect(resolution.renderableDs4EventCount).toBe(1);
  });

  it('falls back to legacy when gate is off even with verified DS4 events', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: true,
      motionMapPayload: basePayload({ events: [verifiedEvent()] }),
      replacementGateEnabled: false,
    });
    expect(resolution.provenance).toBe('LEGACY_BEHAVIOR_EVENTS');
    expect(resolution.hideLegacyDrivingMarkers).toBe(false);
    expect(resolution.showDs4DrivingMarkers).toBe(false);
  });

  it('falls back to legacy when only artefact-suspect DS4 events exist', () => {
    const resolution = resolveTripMapDrivingMarkerSource({
      showDrivingEventsLayer: true,
      motionMapPayload: basePayload({ events: [verifiedEvent({ artefactSuspect: true })] }),
      replacementGateEnabled: true,
    });
    expect(resolution.ds4EvidenceState).toBe('SUCCEEDED_EVENTS_REJECTED_OR_SUSPECT_ONLY');
    expect(resolution.provenance).toBe('LEGACY_BEHAVIOR_EVENTS');
    expect(resolution.rejectedOrSuspectDs4EventCount).toBe(1);
  });
});

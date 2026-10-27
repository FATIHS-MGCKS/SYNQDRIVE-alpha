import type { TripMotionMapEvent, TripMotionMapPayload } from '../motion-map.types';
import { isMotionMapGeometryTrusted } from '../motion-map.utils';

/**
 * Product UI gate for replacing legacy behavior-event map markers with DS4 motion markers.
 * Default on (unset) preserves the production replacement path when DS4 supplies verified events.
 * Set `VITE_TRIP_MAP_DS4_DRIVING_MARKER_REPLACEMENT_ENABLED=false` to roll back to legacy-only markers.
 */
export function isTripMapDs4DrivingMarkerReplacementEnabled(): boolean {
  const raw = import.meta.env.VITE_TRIP_MAP_DS4_DRIVING_MARKER_REPLACEMENT_ENABLED;
  if (raw === undefined || raw === '') return true;
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  return raw === 'true' || raw === '1' || raw === 'on';
}

/** DS4 motion-shadow-map evaluation state for driving-event marker selection (not a failure taxonomy). */
export type Ds4MotionEvidenceState =
  | 'UNAVAILABLE'
  | 'PENDING'
  | 'FAILED'
  | 'UNVERIFIED_BINDING'
  | 'SUCCEEDED_EMPTY'
  | 'SUCCEEDED_WITH_VERIFIED_EVENTS'
  | 'SUCCEEDED_EVENTS_REJECTED_OR_SUSPECT_ONLY'
  | 'SUCCEEDED_EVENTS_NO_POSITION';

export type TripMapDrivingMarkerProvenance = 'LEGACY_BEHAVIOR_EVENTS' | 'DS4_MOTION_EVENTS' | 'NONE_LAYER_DISABLED';

export type TripMapDrivingMarkerSourceResolution = {
  provenance: TripMapDrivingMarkerProvenance;
  ds4EvidenceState: Ds4MotionEvidenceState;
  replacementGateEnabled: boolean;
  hideLegacyDrivingMarkers: boolean;
  showDs4DrivingMarkers: boolean;
  renderableDs4EventCount: number;
  rejectedOrSuspectDs4EventCount: number;
  totalDs4EventCount: number;
};

export function isVerifiedRenderableDs4DrivingEvent(event: TripMotionMapEvent): boolean {
  if (event.artefactSuspect) return false;
  if (!event.positionResolved) return false;
  if (event.latitude == null || event.longitude == null) return false;
  return true;
}

export function filterDs4DrivingEventsForMap(events: TripMotionMapEvent[]): TripMotionMapEvent[] {
  return events.filter(isVerifiedRenderableDs4DrivingEvent);
}

export function classifyDs4MotionEvidenceState(
  payload: TripMotionMapPayload | null | undefined,
): Ds4MotionEvidenceState {
  if (!payload) return 'UNAVAILABLE';
  switch (payload.status) {
    case 'NOT_AVAILABLE':
      return 'UNAVAILABLE';
    case 'PENDING':
      return 'PENDING';
    case 'FAILED':
      return 'FAILED';
    case 'SUCCEEDED':
    case 'SUCCEEDED_EMPTY': {
      if (!isMotionMapGeometryTrusted(payload)) return 'UNVERIFIED_BINDING';
      if (payload.status === 'SUCCEEDED_EMPTY') return 'SUCCEEDED_EMPTY';
      const events = payload.events;
      if (events.length === 0) return 'SUCCEEDED_EMPTY';
      const renderable = filterDs4DrivingEventsForMap(events);
      if (renderable.length > 0) return 'SUCCEEDED_WITH_VERIFIED_EVENTS';
      if (events.every((e) => e.artefactSuspect)) return 'SUCCEEDED_EVENTS_REJECTED_OR_SUSPECT_ONLY';
      return 'SUCCEEDED_EVENTS_NO_POSITION';
    }
    default:
      return 'UNAVAILABLE';
  }
}

export function resolveTripMapDrivingMarkerSource(input: {
  showDrivingEventsLayer: boolean;
  motionMapPayload: TripMotionMapPayload | null | undefined;
  replacementGateEnabled?: boolean;
}): TripMapDrivingMarkerSourceResolution {
  const replacementGateEnabled =
    input.replacementGateEnabled ?? isTripMapDs4DrivingMarkerReplacementEnabled();
  const ds4EvidenceState = classifyDs4MotionEvidenceState(input.motionMapPayload);
  const events = input.motionMapPayload?.events ?? [];
  const renderableDs4EventCount = filterDs4DrivingEventsForMap(events).length;
  const totalDs4EventCount = events.length;
  const rejectedOrSuspectDs4EventCount = Math.max(0, totalDs4EventCount - renderableDs4EventCount);

  if (!input.showDrivingEventsLayer) {
    return {
      provenance: 'NONE_LAYER_DISABLED',
      ds4EvidenceState,
      replacementGateEnabled,
      hideLegacyDrivingMarkers: false,
      showDs4DrivingMarkers: false,
      renderableDs4EventCount,
      rejectedOrSuspectDs4EventCount,
      totalDs4EventCount,
    };
  }

  const useDs4 =
    replacementGateEnabled &&
    ds4EvidenceState === 'SUCCEEDED_WITH_VERIFIED_EVENTS' &&
    renderableDs4EventCount > 0;

  if (useDs4) {
    return {
      provenance: 'DS4_MOTION_EVENTS',
      ds4EvidenceState,
      replacementGateEnabled,
      hideLegacyDrivingMarkers: true,
      showDs4DrivingMarkers: true,
      renderableDs4EventCount,
      rejectedOrSuspectDs4EventCount,
      totalDs4EventCount,
    };
  }

  return {
    provenance: 'LEGACY_BEHAVIOR_EVENTS',
    ds4EvidenceState,
    replacementGateEnabled,
    hideLegacyDrivingMarkers: false,
    showDs4DrivingMarkers: false,
    renderableDs4EventCount,
    rejectedOrSuspectDs4EventCount,
    totalDs4EventCount,
  };
}

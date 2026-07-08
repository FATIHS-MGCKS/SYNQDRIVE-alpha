import {
  BEHAVIOR_STATUS_LABEL,
  deriveBehaviorOverallStatus,
  type BehaviorOverallStatus,
} from '../behavior-ui.utils';
import { hasAbuseSuspicion } from '../utils/tripStatus';
import type { TripAssessmentStatus } from '../../../../lib/api';
import type { TripBehaviorEvent, TripTimelineTrip } from '../trips.types';

export type TripOverallRating = 'auffaellig' | 'beobachten' | 'unauffaellig' | 'aktiv' | 'nicht_bewertbar';

export function tripAssessmentToOverallRating(status: TripAssessmentStatus): TripOverallRating {
  switch (status) {
    case 'AUFFAELLIG':
    case 'KRITISCH':
    case 'PRUEFHINWEIS':
      return 'auffaellig';
    case 'BEOBACHTEN':
      return 'beobachten';
    case 'NICHT_BEWERTBAR':
      return 'nicht_bewertbar';
    case 'UNAUFFAELLIG':
    default:
      return 'unauffaellig';
  }
}


export const TRIP_OVERALL_RATING_LABEL: Record<TripOverallRating, string> = {
  auffaellig: 'Auffällig',
  beobachten: 'Beobachten',
  unauffaellig: 'Unauffällig',
  aktiv: 'Aktiv',
  nicht_bewertbar: 'Nicht bewertbar',
};

export type TripOverallBadgeTone = 'neutral' | 'info' | 'watch' | 'critical' | 'private' | 'success';

/** UI-only mapping of existing trip/behavior signals to one header rating. */
export function deriveTripOverallRating(
  trip: TripTimelineTrip,
  events: TripBehaviorEvent[] = [],
): TripOverallRating {
  if (trip.tripStatus === 'ONGOING') return 'aktiv';

  const behavior = deriveBehaviorOverallStatus(trip, events);

  if (
    hasAbuseSuspicion(trip) ||
    behavior === 'abuse_suspect' ||
    behavior === 'critical' ||
    behavior === 'notable'
  ) {
    return 'auffaellig';
  }

  if (behavior === 'watch') return 'beobachten';
  if (behavior === 'not_assessable') return 'nicht_bewertbar';

  return 'unauffaellig';
}

export function tripOverallRatingTone(rating: TripOverallRating): TripOverallBadgeTone {
  switch (rating) {
    case 'auffaellig':
      return 'critical';
    case 'beobachten':
    case 'aktiv':
      return 'watch';
    default:
      return 'neutral';
  }
}

export function behaviorStatusShortLabel(status: BehaviorOverallStatus): string {
  if (status === 'notable') return 'Auffälliges Fahrverhalten';
  if (status === 'abuse_suspect') return 'Prüfhinweis';
  return BEHAVIOR_STATUS_LABEL[status];
}

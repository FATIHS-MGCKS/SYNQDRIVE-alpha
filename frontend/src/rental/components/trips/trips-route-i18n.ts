import type { TranslationKey } from '../../i18n/translations/en';
import type {
  CanonicalRouteQuality,
  RouteContinuityStatus,
  RouteProcessingState,
} from '../../../lib/api';

export type TripsRouteTranslate = (key: TranslationKey) => string;

const ROUTE_QUALITY_KEYS: Record<CanonicalRouteQuality, TranslationKey> = {
  MATCHED: 'trips.route.quality.matched',
  FILTERED: 'trips.route.quality.filtered',
  RAW: 'trips.route.quality.raw',
};

const CONTINUITY_KEYS: Record<RouteContinuityStatus, TranslationKey> = {
  COMPLETE: 'trips.route.continuity.complete',
  GAPS_PRESENT: 'trips.route.continuity.gaps',
  INSUFFICIENT_DATA: 'trips.route.continuity.insufficient',
};

const PROCESSING_KEYS: Record<RouteProcessingState, TranslationKey> = {
  READY: 'trips.route.ready',
  PROCESSING: 'trips.route.processing',
  RETRYING: 'trips.route.retrying',
  FAILED: 'trips.route.failed',
  UNAVAILABLE: 'trips.route.failed',
};

/** Visible R4 route overlay strings — must exist in every supported locale. */
export const TRIPS_ROUTE_I18N_KEYS = [
  ...Object.values(ROUTE_QUALITY_KEYS),
  ...Object.values(CONTINUITY_KEYS),
  ...Object.values(PROCESSING_KEYS),
  'trips.route.available',
  'trips.route.incomplete',
  'trips.route.gpsGap',
  'trips.route.telemetry.available',
  'trips.route.telemetry.limited',
  'trips.route.telemetry.unavailable',
  'trips.route.telemetry.analyzing',
  'trips.route.updatedAt',
] as const satisfies readonly TranslationKey[];

export function routeQualityLabel(
  t: TripsRouteTranslate,
  routeQuality: CanonicalRouteQuality | null,
): string | null {
  if (!routeQuality) return null;
  return t(ROUTE_QUALITY_KEYS[routeQuality]);
}

export function continuityStatusLabel(
  t: TripsRouteTranslate,
  status: RouteContinuityStatus,
): string | null {
  return t(CONTINUITY_KEYS[status]);
}

export function processingStateLabel(
  t: TripsRouteTranslate,
  state: RouteProcessingState,
): string | null {
  return t(PROCESSING_KEYS[state]);
}

import {
  isAcceptableMapboxForwardGeocodeRelevance,
  MAPBOX_FORWARD_GEOCODE_RELEVANCE_MIN,
} from './station-location-masterdata.util';

export { MAPBOX_FORWARD_GEOCODE_RELEVANCE_MIN };

/**
 * Resolve Mapbox geocoding `country` query param from free-text country input.
 * Prefer no filter over a wrong filter for unknown countries.
 */
export function resolveGeocodeCountryFilter(country: string | null | undefined): string | null {
  const raw = (country ?? '').trim();
  if (!raw) return 'de';

  const c = raw.toLowerCase();
  if (c === 'de' || c === 'germany' || c === 'deutschland') return 'de';
  if (c === 'at' || c === 'austria' || c === 'österreich' || c === 'osterreich') return 'at';
  if (c === 'ch' || c === 'switzerland' || c === 'schweiz') return 'ch';
  if (/^[a-z]{2}$/.test(c)) return c;
  return null;
}

export function mapboxAccessToken(): string {
  return (
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.MAPBOX_TOKEN ??
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
    ''
  );
}

export interface MapboxForwardGeocodeFeature {
  center?: [number, number];
  relevance?: number;
}

export function parseMapboxForwardGeocodeFeature(
  feature: MapboxForwardGeocodeFeature | undefined,
): { latitude: number; longitude: number } | null {
  if (!feature?.center || feature.center.length !== 2) return null;
  if (!isAcceptableMapboxForwardGeocodeRelevance(feature.relevance)) return null;

  const [lng, lat] = feature.center;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

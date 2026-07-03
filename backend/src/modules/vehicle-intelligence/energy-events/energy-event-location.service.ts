import { Injectable, Logger } from '@nestjs/common';
import { EnergyEventKind } from '@prisma/client';
import { mapboxAccessToken } from '@modules/stations/station-geocode.util';

export type EnergyLocationSource = 'poi' | 'address' | 'locality';
export type EnergyLocationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ResolvedEnergyEventLocation {
  locationDisplayName: string | null;
  locationSource: EnergyLocationSource | null;
  locationConfidence: EnergyLocationConfidence | null;
}

interface MapboxFeature {
  id?: string;
  text?: string;
  place_name?: string;
  place_type?: string[];
  address?: string;
  properties?: {
    category?: string;
    maki?: string;
  };
  context?: Array<{ id?: string; text?: string }>;
}

const REFUEL_CATEGORY_HINTS = [
  'fuel',
  'gas',
  'gas station',
  'petrol',
  'tankstelle',
];

const RECHARGE_CATEGORY_HINTS = [
  'charging station',
  'electric vehicle charging station',
  'ev charger',
  'charger',
  'ladestation',
];

const REFUEL_BRAND_HINTS =
  /\b(aral|shell|esso|total|jet|bp|avia|orlen|agip|star|hem|omv|q8|hoyer|classic|avia|bft|tank)\b/i;

const RECHARGE_BRAND_HINTS =
  /\b(tesla|ionity|enbw|fastned|allego|chargepoint|ewe|swm|adac|mobilize|has.to.be|plugsurfing|maingau|e\.on|eon|ev|ladepunkt|supercharger)\b/i;

function featureBlob(feature: MapboxFeature): string {
  const category = feature.properties?.category ?? '';
  const maki = feature.properties?.maki ?? '';
  return `${feature.text ?? ''} ${feature.place_name ?? ''} ${category} ${maki}`.toLowerCase();
}

export function scoreEnergyEventPoi(
  feature: MapboxFeature,
  kind: EnergyEventKind,
): number {
  const blob = featureBlob(feature);
  const category = (feature.properties?.category ?? '').toLowerCase();

  if (kind === EnergyEventKind.REFUEL) {
    if (REFUEL_CATEGORY_HINTS.some((hint) => category.includes(hint) || blob.includes(hint))) {
      return 10;
    }
    if (REFUEL_BRAND_HINTS.test(blob)) return 8;
    return 0;
  }

  if (RECHARGE_CATEGORY_HINTS.some((hint) => category.includes(hint) || blob.includes(hint))) {
    return 10;
  }
  if (RECHARGE_BRAND_HINTS.test(blob)) return 8;
  return 0;
}

export function pickBestPoiFeature(
  features: MapboxFeature[],
  kind: EnergyEventKind,
): { feature: MapboxFeature; score: number } | null {
  let best: { feature: MapboxFeature; score: number } | null = null;
  for (const feature of features) {
    if (!feature.place_type?.includes('poi')) continue;
    const score = scoreEnergyEventPoi(feature, kind);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { feature, score };
    }
  }
  return best;
}

function formatAddressFeature(feature: MapboxFeature): string | null {
  const street = feature.text?.trim() || null;
  const houseNumber = feature.address?.trim() || null;
  let city: string | null = null;
  for (const ctx of feature.context ?? []) {
    const id = ctx.id ?? '';
    if (id.startsWith('place') || id.startsWith('locality')) {
      city = ctx.text?.trim() || city;
    }
  }
  const streetLine = street
    ? houseNumber
      ? `${street} ${houseNumber}`
      : street
    : null;
  const parts = [streetLine, city].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : feature.place_name?.trim() || null;
}

function formatLocalityFeature(feature: MapboxFeature): string | null {
  return feature.text?.trim() || feature.place_name?.trim() || null;
}

export function resolveEnergyEventLocationFromFeatures(
  poiFeatures: MapboxFeature[],
  addressFeatures: MapboxFeature[],
  localityFeatures: MapboxFeature[],
  kind: EnergyEventKind,
): ResolvedEnergyEventLocation {
  const poi = pickBestPoiFeature(poiFeatures, kind);
  if (poi) {
    const name = poi.feature.text?.trim() || poi.feature.place_name?.trim() || null;
    if (name) {
      return {
        locationDisplayName: name,
        locationSource: 'poi',
        locationConfidence: poi.score >= 10 ? 'HIGH' : 'MEDIUM',
      };
    }
  }

  const address = addressFeatures[0];
  if (address) {
    const label = formatAddressFeature(address);
    if (label) {
      return {
        locationDisplayName: label,
        locationSource: 'address',
        locationConfidence: 'MEDIUM',
      };
    }
  }

  const locality = localityFeatures[0];
  if (locality) {
    const label = formatLocalityFeature(locality);
    if (label) {
      return {
        locationDisplayName: label,
        locationSource: 'locality',
        locationConfidence: 'LOW',
      };
    }
  }

  return {
    locationDisplayName: null,
    locationSource: null,
    locationConfidence: null,
  };
}

function isValidCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function coordCacheKey(lat: number, lng: number, kind: EnergyEventKind): string {
  return `${kind}:${lat.toFixed(5)},${lng.toFixed(5)}`;
}

@Injectable()
export class EnergyEventLocationService {
  private readonly logger = new Logger(EnergyEventLocationService.name);
  private readonly cache = new Map<string, ResolvedEnergyEventLocation>();
  private readonly inFlight = new Map<string, Promise<ResolvedEnergyEventLocation>>();

  async resolve(
    lat: number | null | undefined,
    lng: number | null | undefined,
    kind: EnergyEventKind,
  ): Promise<ResolvedEnergyEventLocation> {
    if (lat == null || lng == null || !isValidCoordinate(lat, lng)) {
      return {
        locationDisplayName: null,
        locationSource: null,
        locationConfidence: null,
      };
    }

    const key = coordCacheKey(lat, lng, kind);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.fetchResolvedLocation(lat, lng, kind)
      .then((resolved) => {
        this.cache.set(key, resolved);
        this.inFlight.delete(key);
        return resolved;
      })
      .catch((err: Error) => {
        this.inFlight.delete(key);
        this.logger.warn(
          `Energy event location lookup failed for ${lat},${lng} (${kind}): ${err.message}`,
        );
        const empty: ResolvedEnergyEventLocation = {
          locationDisplayName: null,
          locationSource: null,
          locationConfidence: null,
        };
        this.cache.set(key, empty);
        return empty;
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  private async fetchResolvedLocation(
    lat: number,
    lng: number,
    kind: EnergyEventKind,
  ): Promise<ResolvedEnergyEventLocation> {
    const token = mapboxAccessToken();
    if (!token) {
      this.logger.debug('Mapbox token missing — skipping energy event location enrichment');
      return {
        locationDisplayName: null,
        locationSource: null,
        locationConfidence: null,
      };
    }

    const [poiFeatures, addressFeatures, localityFeatures] = await Promise.all([
      this.reverseGeocode(lng, lat, token, 'poi', 10),
      this.reverseGeocode(lng, lat, token, 'address', 1),
      this.reverseGeocode(lng, lat, token, 'place,locality', 1),
    ]);

    return resolveEnergyEventLocationFromFeatures(
      poiFeatures,
      addressFeatures,
      localityFeatures,
      kind,
    );
  }

  private async reverseGeocode(
    lng: number,
    lat: number,
    token: string,
    types: string,
    limit: number,
  ): Promise<MapboxFeature[]> {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
      `?types=${encodeURIComponent(types)}` +
      `&limit=${limit}` +
      `&language=de` +
      `&access_token=${encodeURIComponent(token)}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Mapbox reverse geocode HTTP ${res.status} (${types})`);
    }

    const json = (await res.json()) as { features?: MapboxFeature[] };
    return json.features ?? [];
  }
}

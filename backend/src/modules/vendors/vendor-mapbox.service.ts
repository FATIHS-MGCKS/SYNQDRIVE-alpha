import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { VendorCategory } from '@prisma/client';

/** Normalized suggestion returned to the client (suggest step). */
export interface VendorSearchSuggestion {
  mapboxId: string;
  name: string;
  category: VendorCategory;
  fullAddress: string | null;
  placeFormatted: string | null;
}

export interface VendorSearchResult {
  sessionToken: string;
  suggestions: VendorSearchSuggestion[];
}

/** Prefill payload returned to the client (retrieve step). */
export interface VendorPrefill {
  name: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  category: VendorCategory;
  externalPlaceId: string | null;
  source: 'MAPBOX';
}

const SEARCHBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

/**
 * VendorMapboxService — server-side proxy for the Mapbox Search Box API.
 *
 * The Mapbox access token never leaves the backend. Suggest + retrieve are
 * grouped by a server-generated `session_token` (Mapbox billing session).
 *
 * Mapbox NEVER creates a vendor — it only prefills the create form. The user
 * always reviews/edits before saving. Phone/website are populated only when
 * Mapbox actually returns them (no fabricated data).
 */
@Injectable()
export class VendorMapboxService {
  private readonly logger = new Logger(VendorMapboxService.name);

  private get token(): string {
    // Reuse the platform-wide Mapbox token already used for stations geocoding
    // and trip map-matching (kept strictly server-side).
    return process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';
  }

  /** Suggest step: typeahead POI/address suggestions. */
  async search(
    query: string,
    opts: { country?: string; limit?: number } = {},
  ): Promise<VendorSearchResult> {
    const token = this.token;
    if (!token) {
      throw new ServiceUnavailableException(
        'Vendor search is not configured (missing Mapbox token).',
      );
    }

    const sessionToken = randomUUID();
    const country = (opts.country ?? 'de').toLowerCase();
    const limit = Math.min(Math.max(opts.limit ?? 7, 1), 10);

    const url =
      `${SEARCHBOX_BASE}/suggest` +
      `?q=${encodeURIComponent(query.trim())}` +
      `&access_token=${token}` +
      `&session_token=${sessionToken}` +
      `&language=de` +
      `&country=${country}` +
      `&limit=${limit}` +
      `&types=poi,address,street`;

    let json: { suggestions?: MapboxSuggestion[] };
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Mapbox suggest HTTP ${res.status} for "${query}"`);
        throw new BadGatewayException('Vendor search provider error');
      }
      json = (await res.json()) as { suggestions?: MapboxSuggestion[] };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.warn(
        `Mapbox suggest failed for "${query}": ${(err as Error).message}`,
      );
      throw new BadGatewayException('Vendor search provider unavailable');
    }

    const suggestions: VendorSearchSuggestion[] = (json.suggestions ?? []).map(
      (s) => ({
        mapboxId: s.mapbox_id,
        name: s.name ?? s.place_formatted ?? '',
        category: mapMapboxCategory(s.poi_category),
        fullAddress: s.full_address ?? s.address ?? null,
        placeFormatted: s.place_formatted ?? null,
      }),
    );

    return { sessionToken, suggestions };
  }

  /** Retrieve step: resolve a selected suggestion to prefill fields. */
  async retrieve(
    mapboxId: string,
    sessionToken: string,
  ): Promise<VendorPrefill | null> {
    const token = this.token;
    if (!token) {
      throw new ServiceUnavailableException(
        'Vendor search is not configured (missing Mapbox token).',
      );
    }

    const url =
      `${SEARCHBOX_BASE}/retrieve/${encodeURIComponent(mapboxId)}` +
      `?access_token=${token}` +
      `&session_token=${encodeURIComponent(sessionToken)}`;

    let feature: MapboxFeature | undefined;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Mapbox retrieve HTTP ${res.status} for ${mapboxId}`);
        throw new BadGatewayException('Vendor search provider error');
      }
      const json = (await res.json()) as { features?: MapboxFeature[] };
      feature = json.features?.[0];
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.warn(
        `Mapbox retrieve failed for ${mapboxId}: ${(err as Error).message}`,
      );
      throw new BadGatewayException('Vendor search provider unavailable');
    }

    if (!feature) return null;

    const p = feature.properties ?? {};
    const ctx = p.context ?? {};
    const coords = feature.geometry?.coordinates;
    const latitude =
      p.coordinates?.latitude ??
      (Array.isArray(coords) ? coords[1] : null) ??
      null;
    const longitude =
      p.coordinates?.longitude ??
      (Array.isArray(coords) ? coords[0] : null) ??
      null;

    return {
      name: p.name ?? null,
      street: p.address ?? null,
      postalCode: ctx.postcode?.name ?? null,
      city: ctx.place?.name ?? ctx.locality?.name ?? null,
      country: ctx.country?.name ?? null,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
      phone: p.metadata?.phone ?? null,
      website: p.metadata?.website ?? null,
      category: mapMapboxCategory(p.poi_category),
      externalPlaceId: p.mapbox_id ?? mapboxId,
      source: 'MAPBOX',
    };
  }
}

/** Best-effort mapping of Mapbox POI categories to our VendorCategory enum. */
export function mapMapboxCategory(poiCategories?: string[]): VendorCategory {
  const cats = (poiCategories ?? []).map((c) => c.toLowerCase());
  const has = (...keys: string[]) =>
    cats.some((c) => keys.some((k) => c.includes(k)));

  if (has('tire', 'tyre', 'reifen')) return VendorCategory.TIRE_DEALER;
  if (has('car wash', 'wash', 'detailing', 'cleaning', 'reinigung'))
    return VendorCategory.DETAILING;
  if (has('glass', 'glas', 'windshield', 'windscreen'))
    return VendorCategory.AUTO_GLASS;
  if (has('body shop', 'bodyshop', 'karosserie', 'paint', 'lackier', 'dent'))
    return VendorCategory.BODY_REPAIR;
  if (has('gutachter', 'appraiser', 'assessor', 'sachverständ'))
    return VendorCategory.APPRAISER;
  if (has('tüv', 'tuv', 'dekra', 'inspection', 'prüf'))
    return VendorCategory.TUV_STATION;
  if (has('insurance', 'versicher')) return VendorCategory.INSURANCE;
  if (has('towing', 'tow ', 'abschlepp', 'breakdown', 'recovery'))
    return VendorCategory.TOWING;
  if (has('auto parts', 'spare parts', 'parts', 'teile', 'zubehör'))
    return VendorCategory.PARTS_DEALER;
  if (has('car dealer', 'dealership', 'autohaus', 'dealer'))
    return VendorCategory.DEALERSHIP;
  if (
    has('car repair', 'repair', 'garage', 'mechanic', 'werkstatt', 'service')
  )
    return VendorCategory.WORKSHOP;
  return VendorCategory.OTHER;
}

// ── Mapbox response shapes (partial) ─────────────────────────────────────────

interface MapboxSuggestion {
  mapbox_id: string;
  name?: string;
  address?: string;
  full_address?: string;
  place_formatted?: string;
  poi_category?: string[];
}

interface MapboxContextEntry {
  name?: string;
}

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    mapbox_id?: string;
    address?: string;
    full_address?: string;
    place_formatted?: string;
    poi_category?: string[];
    coordinates?: { latitude?: number; longitude?: number };
    metadata?: { phone?: string; website?: string };
    context?: {
      postcode?: MapboxContextEntry;
      place?: MapboxContextEntry;
      locality?: MapboxContextEntry;
      region?: MapboxContextEntry;
      country?: MapboxContextEntry;
    };
  };
}

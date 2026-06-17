import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

/** Normalized suggestion returned to the client (suggest step). */
export interface StationMapboxSuggestion {
  mapboxId: string;
  name: string;
  fullAddress: string | null;
  placeFormatted: string | null;
}

export interface StationMapboxSearchResult {
  sessionToken: string;
  suggestions: StationMapboxSuggestion[];
}

/** Prefill payload returned to the client (retrieve step). */
export interface StationMapboxPrefill {
  name: string | null;
  formattedAddress: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  externalPlaceId: string | null;
  source: 'MAPBOX';
}

const SEARCHBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

@Injectable()
export class StationMapboxService {
  private readonly logger = new Logger(StationMapboxService.name);

  private get token(): string {
    return (
      process.env.MAPBOX_ACCESS_TOKEN ??
      process.env.MAPBOX_TOKEN ??
      process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ??
      ''
    );
  }

  async search(
    query: string,
    opts: { country?: string; limit?: number } = {},
  ): Promise<StationMapboxSearchResult> {
    const token = this.token;
    if (!token) {
      throw new ServiceUnavailableException(
        'Station search is not configured (set MAPBOX_ACCESS_TOKEN or MAPBOX_TOKEN).',
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
      `&types=poi,address,street,place`;

    let json: { suggestions?: MapboxSuggestion[] };
    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Mapbox suggest HTTP ${res.status} for "${query}"`);
        throw new BadGatewayException('Station search provider error');
      }
      json = (await res.json()) as { suggestions?: MapboxSuggestion[] };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.warn(`Mapbox suggest failed for "${query}": ${(err as Error).message}`);
      throw new BadGatewayException('Station search provider unavailable');
    }

    const suggestions: StationMapboxSuggestion[] = (json.suggestions ?? []).map((s) => ({
      mapboxId: s.mapbox_id,
      name: s.name ?? s.place_formatted ?? '',
      fullAddress: s.full_address ?? s.address ?? null,
      placeFormatted: s.place_formatted ?? null,
    }));

    return { sessionToken, suggestions };
  }

  async retrieve(mapboxId: string, sessionToken: string): Promise<StationMapboxPrefill | null> {
    const token = this.token;
    if (!token) {
      throw new ServiceUnavailableException(
        'Station search is not configured (set MAPBOX_ACCESS_TOKEN or MAPBOX_TOKEN).',
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
        throw new BadGatewayException('Station search provider error');
      }
      const json = (await res.json()) as { features?: MapboxFeature[] };
      feature = json.features?.[0];
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      this.logger.warn(`Mapbox retrieve failed for ${mapboxId}: ${(err as Error).message}`);
      throw new BadGatewayException('Station search provider unavailable');
    }

    if (!feature) return null;

    const p = feature.properties ?? {};
    const ctx = p.context ?? {};
    const coords = feature.geometry?.coordinates;
    const latitude =
      p.coordinates?.latitude ?? (Array.isArray(coords) ? coords[1] : null) ?? null;
    const longitude =
      p.coordinates?.longitude ?? (Array.isArray(coords) ? coords[0] : null) ?? null;
    const street = p.address ?? null;
    const formattedAddress = p.full_address ?? p.place_formatted ?? street;

    return {
      name: p.name ?? null,
      formattedAddress: formattedAddress ?? null,
      street,
      postalCode: ctx.postcode?.name ?? null,
      city: ctx.place?.name ?? ctx.locality?.name ?? null,
      country: ctx.country?.name ?? null,
      latitude: typeof latitude === 'number' ? latitude : null,
      longitude: typeof longitude === 'number' ? longitude : null,
      phone: p.metadata?.phone ?? null,
      externalPlaceId: p.mapbox_id ?? mapboxId,
      source: 'MAPBOX',
    };
  }
}

interface MapboxSuggestion {
  mapbox_id: string;
  name?: string;
  address?: string;
  full_address?: string;
  place_formatted?: string;
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
    coordinates?: { latitude?: number; longitude?: number };
    metadata?: { phone?: string };
    context?: {
      postcode?: MapboxContextEntry;
      place?: MapboxContextEntry;
      locality?: MapboxContextEntry;
      country?: MapboxContextEntry;
    };
  };
}

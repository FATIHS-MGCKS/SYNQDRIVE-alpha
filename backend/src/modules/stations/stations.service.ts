import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma, StationStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const STATION_STATUS_LABELS: Record<StationStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
};

const STATION_STATUS_VALUES: StationStatus[] = ['ACTIVE', 'INACTIVE'];

// ---------- Input payload contracts (accepted by controller) ----------

export interface StationUpsertPayload {
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /**
   * Geofence radius in meters. When set together with `latitude` + `longitude`,
   * a vehicle is considered "home / at this station" if its current GPS fix
   * is within this many meters of the station's coordinates. Range: 25–5000m.
   * `null` disables the geofence even if coordinates are present.
   */
  radiusMeters?: number | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  openingHours?: string | null;
  notes?: string | null;
  googlePlaceId?: string | null;
  status?: StationStatus | 'ACTIVE' | 'INACTIVE';
}

export interface StationPatchPayload extends Partial<StationUpsertPayload> {}

// ---------- Output DTO returned to the frontend ----------

export interface StationDto {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  openingHours: string | null;
  notes: string | null;
  googlePlaceId: string | null;
  status: StationStatus;
  statusLabel: string;
  vehicleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StationsStatsDto {
  totalStations: number;
  activeStations: number;
  inactiveStations: number;
  totalVehicles: number;
  unassignedVehicles: number;
  stations: Array<{
    id: string;
    name: string;
    city: string | null;
    status: StationStatus;
    statusLabel: string;
    vehicleCount: number;
  }>;
}

export interface StationPlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export interface StationPlaceDetails {
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  googleMapsUrl: string | null;
}

// Result of the one-shot coordinate backfill (admin-side recovery flow for
// stations that were created before the auto-geocoder was wired in, or where
// the address lookup happened to return no result the first time).
export interface StationGeocodingBackfillResult {
  totalChecked: number;
  totalGeocoded: number;
  totalFailed: number;
  totalSkipped: number;
  results: Array<{
    stationId: string;
    stationName: string;
    status: 'geocoded' | 'failed' | 'skipped';
    latitude: number | null;
    longitude: number | null;
    reason?: string;
  }>;
}

// Result returned after a bulk vehicle-assignment write. The operation has
// SET semantics: after it returns the station's vehicle list is exactly
// the set of `vehicleIds` that was supplied.
export interface StationVehicleAssignmentResult {
  stationId: string;
  totalAssigned: number;
  newlyAttached: number;
  detached: number;
  movedFromOtherStations: number;
}

@Injectable()
export class StationsService {
  private readonly logger = new Logger(StationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────

  async findAll(organizationId: string): Promise<StationDto[]> {
    const stations = await this.prisma.station.findMany({
      where: { organizationId },
      include: { _count: { select: { vehicles: true } } },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return stations.map((s) => this.toDto(s, s._count.vehicles));
  }

  async findOne(organizationId: string, id: string): Promise<StationDto> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { vehicles: true } } },
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);
    return this.toDto(station, station._count.vehicles);
  }

  async create(organizationId: string, payload: StationUpsertPayload): Promise<StationDto> {
    const name = payload.name?.trim();
    if (!name) throw new BadRequestException('Station name is required');

    const writable = this.buildWriteData(payload);

    // V4.7.07 — Auto-geocoding on create. When the caller provided an address
    // but no coordinates, resolve them via Mapbox so the geofence works
    // immediately. We never block the save on geocoding: any failure is
    // logged and the station is persisted without coords (matching the
    // pre-V4.7.07 behaviour). The HOME/AWAY badge falls back to UNKNOWN in
    // that case, the user can recover via the backfill endpoint or by
    // entering Lat/Lng manually in the form.
    const explicitLat = payload.latitude !== undefined && payload.latitude !== null;
    const explicitLng = payload.longitude !== undefined && payload.longitude !== null;
    if (!(explicitLat && explicitLng)) {
      const coords = await this.geocodeAddress({
        address: payload.address ?? null,
        city: payload.city ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? null,
      });
      if (coords) {
        if (!explicitLat) writable.latitude = coords.latitude;
        if (!explicitLng) writable.longitude = coords.longitude;
      }
    }

    const station = await this.prisma.station.create({
      data: {
        ...writable,
        name,
        organization: { connect: { id: organizationId } },
      } as Prisma.StationCreateInput,
      include: { _count: { select: { vehicles: true } } },
    });
    return this.toDto(station, station._count.vehicles);
  }

  async update(
    organizationId: string,
    id: string,
    payload: StationPatchPayload,
  ): Promise<StationDto> {
    const existing = await this.prisma.station.findFirstOrThrow({
      where: { id, organizationId },
    });

    const writable = this.buildWriteData(payload);
    if (payload.name !== undefined) {
      const trimmed = payload.name?.trim();
      if (!trimmed) throw new BadRequestException('Station name cannot be empty');
      writable.name = trimmed;
    }

    // V4.7.07 — Re-geocode on update when:
    //   1) the caller did not explicitly set latitude/longitude in the
    //      payload (undefined → leave alone, an explicit `null` is treated
    //      as "user wants to clear coords" and is respected), AND
    //   2) at least one address component is being changed by this PATCH.
    // We resolve against the merged address (payload values shadow the
    // existing record) so partial updates still work — e.g. only changing
    // the postal code re-geocodes against the (existing street + new PLZ).
    const wantsLatChange = payload.latitude !== undefined;
    const wantsLngChange = payload.longitude !== undefined;
    const addressFieldsTouched =
      payload.address !== undefined ||
      payload.city !== undefined ||
      payload.postalCode !== undefined ||
      payload.country !== undefined;
    if (!wantsLatChange && !wantsLngChange && addressFieldsTouched) {
      const coords = await this.geocodeAddress({
        address: payload.address !== undefined ? payload.address : existing.address,
        city: payload.city !== undefined ? payload.city : existing.city,
        postalCode:
          payload.postalCode !== undefined ? payload.postalCode : existing.postalCode,
        country: payload.country !== undefined ? payload.country : existing.country,
      });
      if (coords) {
        writable.latitude = coords.latitude;
        writable.longitude = coords.longitude;
      }
    }

    const station = await this.prisma.station.update({
      where: { id },
      data: writable,
      include: { _count: { select: { vehicles: true } } },
    });
    return this.toDto(station, station._count.vehicles);
  }

  async delete(organizationId: string, id: string): Promise<{ id: string; unassignedVehicles: number }> {
    const station = await this.prisma.station.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { vehicles: true } } },
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    // Unassign vehicles before deletion — the vehicle.stationId is optional,
    // so we keep vehicles but unlink them from the removed station.
    const [, removed] = await this.prisma.$transaction([
      this.prisma.vehicle.updateMany({
        where: { stationId: id, organizationId },
        data: { stationId: null },
      }),
      this.prisma.station.delete({ where: { id } }),
    ]);

    return { id: removed.id, unassignedVehicles: station._count.vehicles };
  }

  // ─────────────────────────────────────────────────────────────
  // Stats for dashboard header / sidebar
  // ─────────────────────────────────────────────────────────────

  async getStationStats(organizationId: string): Promise<StationsStatsDto> {
    const [stations, unassignedVehicles] = await Promise.all([
      this.prisma.station.findMany({
        where: { organizationId },
        include: { _count: { select: { vehicles: true } } },
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.vehicle.count({
        where: { organizationId, stationId: null },
      }),
    ]);

    const totalVehicles = stations.reduce((sum, s) => sum + s._count.vehicles, 0);
    const activeStations = stations.filter((s) => s.status === 'ACTIVE').length;

    return {
      totalStations: stations.length,
      activeStations,
      inactiveStations: stations.length - activeStations,
      totalVehicles,
      unassignedVehicles,
      stations: stations.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city ?? null,
        status: s.status,
        statusLabel: STATION_STATUS_LABELS[s.status],
        vehicleCount: s._count.vehicles,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Vehicle ↔ station assignment
  // ─────────────────────────────────────────────────────────────

  /**
   * SET semantics: after this call returns, the station's vehicle list is
   * exactly `vehicleIds`. Vehicles that were previously at this station and
   * are NOT in the list get detached (stationId → null). Vehicles in the
   * list that were elsewhere — including vehicles currently assigned to a
   * different station — are moved to this station.
   *
   * All vehicleIds must belong to the same organization as the station;
   * unknown / cross-tenant ids are rejected with 400 to keep the response
   * deterministic for the UI.
   */
  async setStationVehicles(
    organizationId: string,
    stationId: string,
    vehicleIds: string[],
  ): Promise<StationVehicleAssignmentResult> {
    const station = await this.prisma.station.findFirst({
      where: { id: stationId, organizationId },
      select: { id: true },
    });
    if (!station) throw new NotFoundException(`Station ${stationId} not found`);

    const requested = Array.from(new Set((vehicleIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)));

    // Validate that every requested vehicle belongs to this org. Doing the
    // lookup once also tells us how many are already on this station (so
    // we can return accurate "newlyAttached" / "movedFromOtherStations"
    // counters) without an extra round-trip.
    const requestedVehicles = requested.length
      ? await this.prisma.vehicle.findMany({
          where: { id: { in: requested }, organizationId },
          select: { id: true, stationId: true },
        })
      : [];

    if (requestedVehicles.length !== requested.length) {
      throw new BadRequestException(
        'One or more vehicles do not belong to this organization',
      );
    }

    const previouslyHere = await this.prisma.vehicle.findMany({
      where: { organizationId, stationId },
      select: { id: true },
    });
    const previousIds = new Set(previouslyHere.map((v) => v.id));
    const requestedSet = new Set(requested);

    const idsToDetach = previouslyHere
      .filter((v) => !requestedSet.has(v.id))
      .map((v) => v.id);
    const idsToAttach = requestedVehicles
      .filter((v) => v.stationId !== stationId)
      .map((v) => v.id);
    const movedFromOtherStations = requestedVehicles.filter(
      (v) => v.stationId !== null && v.stationId !== stationId,
    ).length;
    const newlyAttached = requestedVehicles.filter(
      (v) => v.stationId === null,
    ).length;

    if (idsToDetach.length === 0 && idsToAttach.length === 0) {
      return {
        stationId,
        totalAssigned: previousIds.size,
        newlyAttached: 0,
        detached: 0,
        movedFromOtherStations: 0,
      };
    }

    await this.prisma.$transaction([
      ...(idsToDetach.length
        ? [
            this.prisma.vehicle.updateMany({
              where: { id: { in: idsToDetach }, organizationId },
              data: { stationId: null },
            }),
          ]
        : []),
      ...(idsToAttach.length
        ? [
            this.prisma.vehicle.updateMany({
              where: { id: { in: idsToAttach }, organizationId },
              data: { stationId },
            }),
          ]
        : []),
    ]);

    return {
      stationId,
      totalAssigned: requested.length,
      newlyAttached,
      detached: idsToDetach.length,
      movedFromOtherStations,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Google Places autocomplete (address lookup for create/edit form)
  // ─────────────────────────────────────────────────────────────

  async searchPlaces(query: string): Promise<StationPlaceSuggestion[]> {
    if (!query || query.trim().length < 2) return [];

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return [];

    try {
      // Stations are physical locations that may be either plain addresses or
      // named establishments (branch offices) — allow both.
      const url =
        `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
        `?input=${encodeURIComponent(query.trim())}` +
        `&types=geocode|establishment` +
        `&language=de` +
        `&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK') return [];

      return (data.predictions ?? []).map((p: any) => ({
        placeId: p.place_id,
        mainText: p.structured_formatting?.main_text ?? p.description ?? '',
        secondaryText: p.structured_formatting?.secondary_text ?? '',
        description: p.description ?? '',
      }));
    } catch (err) {
      this.logger.warn(`searchPlaces failed: ${(err as Error).message}`);
      return [];
    }
  }

  async getPlaceDetails(placeId: string): Promise<StationPlaceDetails | null> {
    if (!placeId) return null;

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return null;

    try {
      const fields = [
        'name',
        'formatted_address',
        'formatted_phone_number',
        'geometry',
        'address_components',
        'url',
      ].join(',');
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json` +
        `?place_id=${placeId}` +
        `&language=de` +
        `&fields=${fields}` +
        `&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status !== 'OK' || !data.result) return null;

      const r = data.result;
      const components: Array<{ types: string[]; long_name: string }> = r.address_components ?? [];
      const get = (type: string) =>
        components.find((c) => c.types.includes(type))?.long_name ?? null;

      const street = [get('route'), get('street_number')].filter(Boolean).join(' ').trim() || null;

      return {
        name: r.name ?? null,
        address: street ?? r.formatted_address ?? null,
        city: get('locality') ?? get('sublocality') ?? get('postal_town') ?? null,
        postalCode: get('postal_code'),
        country: get('country'),
        latitude: r.geometry?.location?.lat ?? null,
        longitude: r.geometry?.location?.lng ?? null,
        phone: r.formatted_phone_number ?? null,
        googleMapsUrl: r.url ?? null,
      };
    } catch (err) {
      this.logger.warn(`getPlaceDetails failed: ${(err as Error).message}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Mapbox forward-geocoding (address → lat/lng)
  // ─────────────────────────────────────────────────────────────
  // Used both by create/update (auto-fill) and by the one-shot backfill
  // endpoint. Public Mapbox token is sufficient for forward geocoding;
  // we reuse `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (same env that powers the
  // existing `MapboxService` and frontend reverse-geocoding).
  //
  // Cost profile: Mapbox grants 100k forward-geocoding requests / month
  // on the free tier. Since stations are long-lived and addresses change
  // rarely, this is effectively a one-time cost per station. For a much
  // deeper write-up see the planning doc / chat thread.

  /**
   * Resolve a station address to `{latitude, longitude}` via Mapbox forward
   * geocoding. Returns `null` on any failure mode (missing token, missing
   * address parts, no result, network error). Never throws.
   */
  private async geocodeAddress(input: {
    address: string | null | undefined;
    city: string | null | undefined;
    postalCode: string | null | undefined;
    country: string | null | undefined;
  }): Promise<{ latitude: number; longitude: number } | null> {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return null;

    // We need at least the street (`address`) plus one of city/postal to
    // get a meaningful match. Anything thinner returns very low-confidence
    // results that would actually hurt the geofence (think: a centroid of
    // the entire country). Fail closed.
    const streetPart = (input.address ?? '').trim();
    const cityPart = (input.city ?? '').trim();
    const postalPart = (input.postalCode ?? '').trim();
    const countryPart = (input.country ?? '').trim();
    if (!streetPart) return null;
    if (!cityPart && !postalPart) return null;

    const queryParts = [streetPart, postalPart, cityPart, countryPart].filter(
      (s) => s.length > 0,
    );
    const query = queryParts.join(', ');

    // Restrict to DE/AT/CH by default (same market as the rest of the
    // platform). The free tier permits the `country` filter without extra
    // cost. If the country field is set we honour it; otherwise we still
    // allow worldwide so a tenant operating outside DACH isn't blocked.
    const countryFilter =
      countryPart.toLowerCase().includes('österreich') || countryPart.toLowerCase() === 'at'
        ? 'at'
        : countryPart.toLowerCase().includes('schweiz') || countryPart.toLowerCase() === 'ch'
          ? 'ch'
          : 'de';

    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
      `${encodeURIComponent(query)}.json` +
      `?country=${countryFilter}` +
      `&types=address,postcode,place` +
      `&limit=1` +
      `&language=de` +
      `&access_token=${token}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        this.logger.warn(`Mapbox geocoding HTTP ${res.status} for "${query}"`);
        return null;
      }
      const json = (await res.json()) as {
        features?: Array<{ center?: [number, number]; relevance?: number }>;
      };
      const feature = json.features?.[0];
      if (!feature?.center || feature.center.length !== 2) {
        this.logger.warn(`Mapbox geocoding: no result for "${query}"`);
        return null;
      }
      // Mapbox confidence floor — anything below 0.5 means the geocoder
      // had to guess heavily (e.g. fell back to the city centroid). That's
      // actively harmful for a 100m geofence so we reject it.
      if (typeof feature.relevance === 'number' && feature.relevance < 0.5) {
        this.logger.warn(
          `Mapbox geocoding: low-confidence result (${feature.relevance}) for "${query}"`,
        );
        return null;
      }
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
    } catch (err) {
      this.logger.warn(
        `Mapbox geocoding failed for "${query}": ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * One-shot recovery flow: geocode every station in the org that is
   * missing coordinates but has an address. Throttled to 300 ms between
   * lookups (Mapbox free tier permits 600/min; we stay polite). Returns
   * a per-station summary so the UI can show what changed.
   */
  async backfillCoordinates(organizationId: string): Promise<StationGeocodingBackfillResult> {
    const candidates = await this.prisma.station.findMany({
      where: {
        organizationId,
        OR: [{ latitude: null }, { longitude: null }],
      },
      orderBy: { name: 'asc' },
    });

    const result: StationGeocodingBackfillResult = {
      totalChecked: candidates.length,
      totalGeocoded: 0,
      totalFailed: 0,
      totalSkipped: 0,
      results: [],
    };

    for (let i = 0; i < candidates.length; i++) {
      const s = candidates[i];

      // Skip stations that don't even have a usable address — geocoding
      // those would either return nothing or produce a wildly wrong
      // centroid (see the relevance check in `geocodeAddress`).
      const hasMinimalAddress =
        (s.address ?? '').trim().length > 0 &&
        ((s.city ?? '').trim().length > 0 || (s.postalCode ?? '').trim().length > 0);
      if (!hasMinimalAddress) {
        result.totalSkipped++;
        result.results.push({
          stationId: s.id,
          stationName: s.name,
          status: 'skipped',
          latitude: null,
          longitude: null,
          reason: 'Adresse unvollständig',
        });
        continue;
      }

      // 300ms throttle between Mapbox requests so a tenant with hundreds
      // of stations doesn't trip the rate limiter or look like a bot. We
      // skip the wait before the first request to keep small backfills
      // (1–2 stations) snappy.
      if (i > 0) await this.delay(300);

      const coords = await this.geocodeAddress({
        address: s.address,
        city: s.city,
        postalCode: s.postalCode,
        country: s.country,
      });

      if (!coords) {
        result.totalFailed++;
        result.results.push({
          stationId: s.id,
          stationName: s.name,
          status: 'failed',
          latitude: null,
          longitude: null,
          reason: 'Mapbox lieferte kein Ergebnis',
        });
        continue;
      }

      await this.prisma.station.update({
        where: { id: s.id },
        data: { latitude: coords.latitude, longitude: coords.longitude },
      });
      result.totalGeocoded++;
      result.results.push({
        stationId: s.id,
        stationName: s.name,
        status: 'geocoded',
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    }

    this.logger.log(
      `Backfill for org ${organizationId}: checked=${result.totalChecked}, ` +
        `geocoded=${result.totalGeocoded}, failed=${result.totalFailed}, ` +
        `skipped=${result.totalSkipped}`,
    );
    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private toDto(
    row: {
      id: string;
      name: string;
      address: string | null;
      city: string | null;
      postalCode: string | null;
      country: string | null;
      latitude: number | null;
      longitude: number | null;
      radiusMeters: number | null;
      phone: string | null;
      email: string | null;
      managerName: string | null;
      openingHours: string | null;
      notes: string | null;
      googlePlaceId: string | null;
      status: StationStatus;
      createdAt: Date;
      updatedAt: Date;
    },
    vehicleCount: number,
  ): StationDto {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      postalCode: row.postalCode,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: row.radiusMeters,
      phone: row.phone,
      email: row.email,
      managerName: row.managerName,
      openingHours: row.openingHours,
      notes: row.notes,
      googlePlaceId: row.googlePlaceId,
      status: row.status,
      statusLabel: STATION_STATUS_LABELS[row.status],
      vehicleCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Geofence radius is bounded so we can't accidentally store a negative
  // value (would invert the haversine check) or an absurd value (e.g.
  // city-wide 50km — that defeats the "is this car parked at the depot?"
  // intent and would always evaluate to true).
  private readonly RADIUS_MIN_M = 25;
  private readonly RADIUS_MAX_M = 5000;

  private buildWriteData(payload: StationPatchPayload): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const passthrough: Array<keyof StationPatchPayload> = [
      'address',
      'city',
      'postalCode',
      'country',
      'latitude',
      'longitude',
      'phone',
      'email',
      'managerName',
      'openingHours',
      'notes',
      'googlePlaceId',
    ];
    for (const key of passthrough) {
      const v = payload[key];
      if (v !== undefined) data[key] = v === '' ? null : v;
    }

    if (payload.radiusMeters !== undefined) {
      const r = payload.radiusMeters;
      if (r === null) {
        data.radiusMeters = null;
      } else if (typeof r !== 'number' || !Number.isFinite(r)) {
        throw new BadRequestException('radiusMeters must be a finite number or null');
      } else {
        const rounded = Math.round(r);
        if (rounded < this.RADIUS_MIN_M || rounded > this.RADIUS_MAX_M) {
          throw new BadRequestException(
            `radiusMeters must be between ${this.RADIUS_MIN_M} and ${this.RADIUS_MAX_M} meters`,
          );
        }
        data.radiusMeters = rounded;
      }
    }

    if (payload.status !== undefined) {
      if (!STATION_STATUS_VALUES.includes(payload.status as StationStatus)) {
        throw new BadRequestException(`Invalid station status: ${payload.status}`);
      }
      data.status = payload.status;
    }

    return data;
  }
}

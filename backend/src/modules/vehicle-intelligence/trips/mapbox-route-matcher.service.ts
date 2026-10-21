import { Injectable } from '@nestjs/common';
import { MapMatchResult, MapboxService } from './mapbox.service';
import { RouteCoordinatePoint, RouteMapMatcher } from './route-map-matcher.port';

/**
 * @deprecated Legacy global ≤100 stride matcher. Canonical DRIVING_ROUTE_ENRICH uses
 * TripRouteChunkedMatcherService (R3). Retained for ROUTE_MAP_MATCHER port compatibility only.
 */
@Injectable()
export class MapboxRouteMatcherService implements RouteMapMatcher {
  constructor(private readonly mapbox: MapboxService) {}

  async matchRoute(points: RouteCoordinatePoint[]): Promise<MapMatchResult | null> {
    return this.mapbox.mapMatchRoute(points);
  }
}


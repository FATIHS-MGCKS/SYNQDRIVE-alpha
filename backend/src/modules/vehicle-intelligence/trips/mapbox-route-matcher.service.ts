import { Injectable } from '@nestjs/common';
import { MapMatchResult, MapboxService } from './mapbox.service';
import { RouteCoordinatePoint, RouteMapMatcher } from './route-map-matcher.port';

@Injectable()
export class MapboxRouteMatcherService implements RouteMapMatcher {
  constructor(private readonly mapbox: MapboxService) {}

  async matchRoute(points: RouteCoordinatePoint[]): Promise<MapMatchResult | null> {
    return this.mapbox.mapMatchRoute(points);
  }
}


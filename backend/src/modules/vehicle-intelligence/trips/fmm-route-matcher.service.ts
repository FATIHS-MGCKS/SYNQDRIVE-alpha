import { Injectable, Logger } from '@nestjs/common';
import { MapMatchResult } from './mapbox.service';
import { RouteCoordinatePoint, RouteMapMatcher } from './route-map-matcher.port';

/**
 * Architecture scaffold for future cyang-kth/fmm integration.
 * The runtime path still uses MapboxRouteMatcherService by default.
 */
@Injectable()
export class FmmRouteMatcherService implements RouteMapMatcher {
  private readonly logger = new Logger(FmmRouteMatcherService.name);

  async matchRoute(_points: RouteCoordinatePoint[]): Promise<MapMatchResult | null> {
    this.logger.debug('FMM matcher scaffold invoked but not configured; returning null.');
    return null;
  }
}


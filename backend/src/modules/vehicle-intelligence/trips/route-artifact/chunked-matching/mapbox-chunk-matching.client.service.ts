import { Injectable } from '@nestjs/common';
import { MapboxService } from '../../mapbox.service';
import {
  TRIP_ROUTE_MAPBOX_RADIUS_METERS,
  TRIP_ROUTE_MAPBOX_REQUEST_TIMEOUT_MS,
} from './trip-route-chunked-matching.constants';
import type {
  MapboxChunkCoordinate,
  MapboxChunkMatchingClient,
  MapboxChunkMatchResponse,
} from './mapbox-chunk-matching.client';

@Injectable()
export class MapboxChunkMatchingClientService implements MapboxChunkMatchingClient {
  constructor(private readonly mapbox: MapboxService) {}

  async matchChunk(coordinates: MapboxChunkCoordinate[]): Promise<MapboxChunkMatchResponse> {
    const detailed = await this.mapbox.matchMapboxChunkDetailed(coordinates, {
      radiusMeters: TRIP_ROUTE_MAPBOX_RADIUS_METERS,
      timeoutMs: TRIP_ROUTE_MAPBOX_REQUEST_TIMEOUT_MS,
    });

    if (!detailed.ok) {
      return {
        ok: false,
        failureReason: detailed.failureReason,
        failureClass: detailed.failureClass,
        httpStatus: detailed.httpStatus,
      };
    }

    return {
      ok: true,
      matchedGeometry: detailed.result.matchedGeometry,
      legs: detailed.result.legs,
      confidence: detailed.result.confidence,
      matchedDistanceMeters: detailed.result.totalDistance,
      tracepointCoverage: detailed.result.tracepointCoverage ?? 0,
    };
  }
}

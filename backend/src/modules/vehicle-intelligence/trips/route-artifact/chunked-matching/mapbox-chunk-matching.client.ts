import type { MapMatchedLeg } from '../../mapbox.service';
import type { TripRouteLngLat } from '../trip-route-geometry';
import type { MapboxFailureClass } from './trip-route-chunked-matching.types';

export interface MapboxChunkMatchSuccess {
  ok: true;
  matchedGeometry: TripRouteLngLat[];
  legs: MapMatchedLeg[];
  confidence: number;
  matchedDistanceMeters: number;
  tracepointCoverage: number;
}

export interface MapboxChunkMatchFailure {
  ok: false;
  failureReason: string;
  failureClass: MapboxFailureClass;
  httpStatus?: number;
}

export type MapboxChunkMatchResponse = MapboxChunkMatchSuccess | MapboxChunkMatchFailure;

export interface MapboxChunkCoordinate {
  longitude: number;
  latitude: number;
  timestamp?: string;
}

export interface MapboxChunkMatchingClient {
  matchChunk(coordinates: MapboxChunkCoordinate[]): Promise<MapboxChunkMatchResponse>;
}

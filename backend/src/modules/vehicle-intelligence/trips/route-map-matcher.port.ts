import { MapMatchResult } from './mapbox.service';

export const ROUTE_MAP_MATCHER = Symbol('ROUTE_MAP_MATCHER');

export interface RouteCoordinatePoint {
  longitude: number;
  latitude: number;
  timestamp?: string;
}

export interface RouteMapMatcher {
  matchRoute(points: RouteCoordinatePoint[]): Promise<MapMatchResult | null>;
}


import type { RoutePoint } from './dimo-segments.service';

export type RouteEnrichmentFetchStatus = 'SUCCESS' | 'UNAVAILABLE' | 'FAILED';

export interface RouteEnrichmentFetchOutcome {
  status: RouteEnrichmentFetchStatus;
  points: RoutePoint[];
  reason?: string;
}

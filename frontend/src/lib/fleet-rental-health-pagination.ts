import type {
  FleetRentalHealthPage,
  FleetRentalHealthQuery,
  FleetRentalHealthSummary,
  VehicleHealthResponse,
} from './api';

export const FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE = 50;

/** Scoped fleet URL stays short — no vehicleIds in query string (P49). */
export const FLEET_RENTAL_HEALTH_SCOPED_URL_MAX_BYTES = 2_048;

/** Legacy `?vehicleIds=` URLs above this length are considered unsafe (audit P1-8). */
export const FLEET_RENTAL_HEALTH_LEGACY_URL_WARN_BYTES = 8_192;

export function buildFleetRentalHealthQueryString(filters?: FleetRentalHealthQuery): string {
  const merged: FleetRentalHealthQuery = { limit: 25, ...filters };
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  return q.toString();
}

export function buildScopedFleetRentalHealthPath(
  orgId: string,
  filters?: FleetRentalHealthQuery,
): string {
  const qs = buildFleetRentalHealthQueryString(filters);
  return `/organizations/${orgId}/rental-health/fleet${qs ? `?${qs}` : ''}`;
}

export function buildLegacyFleetRentalHealthPath(
  orgId: string,
  vehicleIds: string[],
): string {
  const suffix =
    vehicleIds.length > 0
      ? `?vehicleIds=${encodeURIComponent(vehicleIds.join(','))}`
      : '';
  return `/organizations/${orgId}/rental-health${suffix}`;
}

export function countFleetRentalHealthPages(
  vehicleCount: number,
  pageSize = FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE,
): number {
  if (vehicleCount <= 0) return 0;
  return Math.ceil(vehicleCount / pageSize);
}

export function estimateLegacyVehicleIdsUrlBytes(vehicleCount: number): number {
  const sampleId = '00000000-0000-4000-8000-000000000001';
  return buildLegacyFleetRentalHealthPath('org-sample', Array.from({ length: vehicleCount }, () => sampleId))
    .length;
}

export interface FleetRentalHealthScaleMetrics {
  vehicleCount: number;
  scopedPageRequests: number;
  scopedMaxPathBytes: number;
  legacyVehicleIdsPathBytes: number;
  legacyUrlExceedsWarnThreshold: boolean;
}

export function computeFleetRentalHealthScaleMetrics(
  vehicleCount: number,
  orgId = 'org-scale-sample',
): FleetRentalHealthScaleMetrics {
  const scopedMaxPathBytes = buildScopedFleetRentalHealthPath(orgId, {
    limit: FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE,
    stationId: 'station-sample',
    search: 'bmw',
    vehicleStatus: 'AVAILABLE',
    cursor: 'eyJ2IjoiREVGQVVMVCIsImlkIjoidmVoLTAwMSIsImxpY2Vuc2VQbGF0ZSI6IkFCLTEyMyJ9',
  }).length;
  const legacyVehicleIdsPathBytes = estimateLegacyVehicleIdsUrlBytes(vehicleCount);

  return {
    vehicleCount,
    scopedPageRequests: countFleetRentalHealthPages(vehicleCount),
    scopedMaxPathBytes,
    legacyVehicleIdsPathBytes,
    legacyUrlExceedsWarnThreshold:
      legacyVehicleIdsPathBytes > FLEET_RENTAL_HEALTH_LEGACY_URL_WARN_BYTES,
  };
}

export type FetchFleetRentalHealthPage = (
  orgId: string,
  filters?: FleetRentalHealthQuery,
) => Promise<FleetRentalHealthPage>;

export async function fetchAllFleetRentalHealth(
  orgId: string,
  fetchPage: FetchFleetRentalHealthPage,
  filters?: FleetRentalHealthQuery,
): Promise<{ vehicles: VehicleHealthResponse[]; summary: FleetRentalHealthSummary | null }> {
  const vehicles: VehicleHealthResponse[] = [];
  let cursor: string | undefined;
  let summary: FleetRentalHealthSummary | null = null;

  for (;;) {
    const page = await fetchPage(orgId, {
      ...filters,
      limit: FLEET_RENTAL_HEALTH_CLIENT_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    if (!summary) summary = page.summary;
    vehicles.push(...page.data);
    if (!page.meta.nextCursor) break;
    cursor = page.meta.nextCursor;
  }

  return { vehicles, summary };
}

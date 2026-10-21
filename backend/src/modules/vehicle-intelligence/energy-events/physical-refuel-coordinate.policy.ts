export const PHYSICAL_REFUEL_COORDINATE_SELECTED = 'SELECTED_FORECOURT_DWELL';

export function isV2CoordinateEligibleForEnrichment(params: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  source: string | null | undefined;
}): boolean {
  return (
    params.latitude != null &&
    params.longitude != null &&
    Number.isFinite(params.latitude) &&
    Number.isFinite(params.longitude) &&
    params.source != null &&
    params.source.length > 0
  );
}

export function describeCoordinateHoldReason(status: string | null | undefined): string {
  return status ?? 'MISSING_V2_COORDINATE';
}

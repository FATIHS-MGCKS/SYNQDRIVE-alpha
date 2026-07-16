import type { TripDrivingImpact } from '@prisma/client';
import {
  DRIVING_IMPACT_LOAD_COMPONENTS_VERSION,
  type DrivingImpactLoadComponents,
} from './driving-impact-load-components';

function isLoadComponents(value: unknown): value is DrivingImpactLoadComponents {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === DRIVING_IMPACT_LOAD_COMPONENTS_VERSION &&
    typeof record.longitudinalLoad === 'object' &&
    typeof record.vehicleLoad === 'object'
  );
}

function parseLegacyFromSourceSummary(json: unknown): DrivingImpactLoadComponents | null {
  if (!json || typeof json !== 'object') return null;
  const summary = json as Record<string, unknown>;
  const embedded = summary.loadComponents;
  return isLoadComponents(embedded) ? embedded : null;
}

/** Read structured load components from a trip impact row. */
export function readTripDrivingImpactLoadComponents(
  row: Pick<TripDrivingImpact, 'loadComponentsJson' | 'sourceSummaryJson'>,
): DrivingImpactLoadComponents | null {
  if (isLoadComponents(row.loadComponentsJson)) {
    return row.loadComponentsJson;
  }
  return parseLegacyFromSourceSummary(row.sourceSummaryJson);
}

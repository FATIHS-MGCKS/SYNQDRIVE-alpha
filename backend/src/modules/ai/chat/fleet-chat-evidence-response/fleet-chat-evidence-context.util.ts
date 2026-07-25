import type { AiGetVehicleHealthSummaryData } from '../../tools/get-vehicle-health-summary/ai-get-vehicle-health-summary.types';
import type { AiGetVehicleLocationData } from '../../tools/get-vehicle-location/ai-get-vehicle-location.types';
import type { AiExplainOverdueReturnData } from '../../tools/explain-overdue-return/ai-explain-overdue-return.types';
import type { FleetChatToolExecutionRecord } from '../fleet-chat-orchestrator.types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function getToolData<T>(
  records: readonly FleetChatToolExecutionRecord[],
  toolName: string,
): T | null {
  const record = records.find((entry) => entry.toolName === toolName);
  if (!record?.outcome.data) {
    return null;
  }
  return record.outcome.data as T;
}

export function getLocationData(
  records: readonly FleetChatToolExecutionRecord[],
): AiGetVehicleLocationData | null {
  return getToolData<AiGetVehicleLocationData>(records, 'get_vehicle_location');
}

export function getHealthData(
  records: readonly FleetChatToolExecutionRecord[],
): AiGetVehicleHealthSummaryData | null {
  return getToolData<AiGetVehicleHealthSummaryData>(records, 'get_vehicle_health_summary');
}

export function getOverdueData(
  records: readonly FleetChatToolExecutionRecord[],
): AiExplainOverdueReturnData | null {
  return getToolData<AiExplainOverdueReturnData>(records, 'explain_overdue_return');
}

export function hasPermissionDenied(
  records: readonly FleetChatToolExecutionRecord[],
): boolean {
  return records.some((record) =>
    record.outcome.errors.some((error) => error.code === 'permission_denied'),
  );
}

export function collectInconsistencyFlags(
  records: readonly FleetChatToolExecutionRecord[],
): readonly string[] {
  const flags = new Set<string>();
  for (const record of records) {
    const data = asRecord(record.outcome.data);
    const inconsistency = data?.inconsistencyFlags;
    if (Array.isArray(inconsistency)) {
      for (const flag of inconsistency) {
        if (typeof flag === 'string') {
          flags.add(flag);
        }
      }
    }
  }
  return [...flags];
}

export function collectWarnings(records: readonly FleetChatToolExecutionRecord[]): string[] {
  const warnings = new Set<string>();
  for (const record of records) {
    for (const warning of record.outcome.warnings) {
      warnings.add(warning);
    }
    const data = asRecord(record.outcome.data);
    const dataWarnings = data?.warnings;
    if (Array.isArray(dataWarnings)) {
      for (const warning of dataWarnings) {
        if (typeof warning === 'string') {
          warnings.add(warning);
        }
      }
    }
  }
  return [...warnings];
}

export function resolveVehicleRef(
  records: readonly FleetChatToolExecutionRecord[],
): { displayName: string | null; licensePlate: string | null } {
  const location = getLocationData(records);
  const health = getHealthData(records);
  const overdue = getOverdueData(records);
  return {
    displayName:
      location?.displayName ?? health?.displayName ?? overdue?.displayName ?? null,
    licensePlate:
      location?.licensePlate ?? health?.licensePlate ?? overdue?.licensePlate ?? null,
  };
}

export function resolveDataFreshness(
  records: readonly FleetChatToolExecutionRecord[],
): {
  freshness: string;
  observedAt: string | null;
  isLastKnown: boolean;
  label: string | null;
} {
  const location = getLocationData(records);
  if (location) {
    return {
      freshness: location.freshness,
      observedAt: location.observedAt,
      isLastKnown: location.isLastKnownLocation,
      label: location.isLastKnownLocation ? 'last_known_position' : 'live_position',
    };
  }
  const health = getHealthData(records);
  if (health) {
    return {
      freshness: health.limitedData ? 'signal_delayed' : 'live',
      observedAt: health.lastUpdatedAt,
      isLastKnown: health.limitedData,
      label: health.limitedData ? 'limited_data' : 'health_pipeline',
    };
  }
  const overdue = getOverdueData(records);
  if (overdue?.latestKnownLocation) {
    return {
      freshness: overdue.latestKnownLocation.freshness,
      observedAt: overdue.latestKnownLocation.observedAt,
      isLastKnown: overdue.latestKnownLocation.isLastKnownLocation,
      label: 'booking_context',
    };
  }
  return {
    freshness: 'not_applicable',
    observedAt: null,
    isLastKnown: false,
    label: null,
  };
}

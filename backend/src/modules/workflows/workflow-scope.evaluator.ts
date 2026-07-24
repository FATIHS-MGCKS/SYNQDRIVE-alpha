import type { WorkflowDomainEvent } from './workflow-engine.service';
import type { WorkflowScopeDef } from './workflow-definition.validator';
import type { WorkflowScopePlanResult } from './workflow-execution-plan.types';

/**
 * Fail-closed scope evaluation — unknown scope types do not match.
 */
export function evaluateWorkflowScope(
  scope: WorkflowScopeDef | undefined,
  event: WorkflowDomainEvent,
): WorkflowScopePlanResult {
  const scopeType = scope?.type ?? 'organization';

  if (scopeType === 'organization') {
    return { passed: true, scopeType, reason: 'Organization-wide scope' };
  }

  const vehicleId =
    event.entityType === 'vehicle'
      ? event.entityId
      : (event.payload.vehicleId as string | undefined);

  if (scopeType === 'vehicle') {
    const vehicleIds = scope?.vehicleIds ?? [];
    if (!vehicleIds.length) {
      return {
        passed: false,
        scopeType,
        reason: 'Vehicle scope configured without vehicleIds',
        details: { vehicleId },
      };
    }
    const passed = !!vehicleId && vehicleIds.includes(vehicleId);
    return {
      passed,
      scopeType,
      reason: passed
        ? 'Vehicle matches scope'
        : 'Vehicle not in configured scope (fail-closed)',
      details: { vehicleId, allowedVehicleIds: vehicleIds },
    };
  }

  if (scopeType === 'station') {
    const stationIds = scope?.stationIds ?? [];
    if (!stationIds.length) {
      return {
        passed: false,
        scopeType,
        reason: 'Station scope configured without stationIds',
      };
    }
    const stationId = event.payload.stationId as string | undefined;
    const passed = !!stationId && stationIds.includes(stationId);
    return {
      passed,
      scopeType,
      reason: passed
        ? 'Station matches scope'
        : 'Station not in configured scope (fail-closed)',
      details: { stationId, allowedStationIds: stationIds },
    };
  }

  return {
    passed: false,
    scopeType,
    reason: `Unsupported scope type "${scopeType}" — fail-closed until implemented`,
  };
}

import type { WorkflowScopeBindingType, WorkflowScopeType } from '@prisma/client';
import type { WorkflowMatcherEventContext } from './workflow-matcher-context.util';
import type { WorkflowMatcherSkipReason } from './workflow-matcher-skip-reasons';

export interface WorkflowMatcherScopeBinding {
  bindingType: WorkflowScopeBindingType;
  bindingId: string;
}

export interface WorkflowMatcherScopeInput {
  scopeType: WorkflowScopeType | null;
  bindings: WorkflowMatcherScopeBinding[];
}

export type WorkflowMatcherScopeResult =
  | { matched: true }
  | { matched: false; reason: WorkflowMatcherSkipReason; detail?: string };

/**
 * Fail-closed scope resolution.
 * - ORGANIZATION: matches tenant-wide (no bindings required).
 * - STATION / VEHICLE: requires at least one binding and a matching event context id.
 * - Missing scope row or empty bindings on scoped types → no match.
 */
export function evaluateWorkflowMatcherScope(
  scope: WorkflowMatcherScopeInput,
  ctx: WorkflowMatcherEventContext,
): WorkflowMatcherScopeResult {
  if (!scope.scopeType) {
    return {
      matched: false,
      reason: 'SCOPE_NOT_CONFIGURED',
      detail: 'Workflow version has no scope configuration',
    };
  }

  switch (scope.scopeType) {
    case 'ORGANIZATION':
      return { matched: true };

    case 'STATION': {
      if (scope.bindings.length === 0) {
        return {
          matched: false,
          reason: 'SCOPE_EMPTY_BINDINGS',
          detail: 'Station scope requires at least one station binding',
        };
      }
      if (!ctx.stationId) {
        return {
          matched: false,
          reason: 'SCOPE_STATION_MISMATCH',
          detail: 'Event has no stationId in scope context',
        };
      }
      const stationHit = scope.bindings.some(
        (b) => b.bindingType === 'STATION' && b.bindingId === ctx.stationId,
      );
      return stationHit
        ? { matched: true }
        : {
            matched: false,
            reason: 'SCOPE_STATION_MISMATCH',
            detail: `stationId ${ctx.stationId} not in workflow scope bindings`,
          };
    }

    case 'VEHICLE': {
      if (scope.bindings.length === 0) {
        return {
          matched: false,
          reason: 'SCOPE_EMPTY_BINDINGS',
          detail: 'Vehicle scope requires at least one vehicle binding',
        };
      }
      if (!ctx.vehicleId) {
        return {
          matched: false,
          reason: 'SCOPE_VEHICLE_MISMATCH',
          detail: 'Event has no vehicleId in scope context',
        };
      }
      const vehicleHit = scope.bindings.some(
        (b) => b.bindingType === 'VEHICLE' && b.bindingId === ctx.vehicleId,
      );
      return vehicleHit
        ? { matched: true }
        : {
            matched: false,
            reason: 'SCOPE_VEHICLE_MISMATCH',
            detail: `vehicleId ${ctx.vehicleId} not in workflow scope bindings`,
          };
    }

    default:
      return {
        matched: false,
        reason: 'SCOPE_NOT_CONFIGURED',
        detail: `Unsupported scope type: ${scope.scopeType}`,
      };
  }
}

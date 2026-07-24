import type { WorkflowDomainEvent } from './workflow-engine.service';
import type { WorkflowScopeDef } from './workflow-definition.validator';
import type { WorkflowScopePlanResult } from './workflow-execution-plan.types';
import { extractWorkflowEntityRefs } from './workflow-entity-refs.util';
import {
  IMPLEMENTED_WORKFLOW_SCOPE_TYPES,
  SCOPE_ID_FIELD_BY_TYPE,
} from './workflow.constants';

function matchesScopedId(
  scopeIds: string[],
  actualId: string | undefined,
): boolean {
  return !!actualId && scopeIds.includes(actualId);
}

/**
 * Fail-closed scope evaluation — unknown scope types and empty ID lists never match.
 * Error details intentionally omit foreign entity IDs.
 */
export function evaluateWorkflowScope(
  scope: WorkflowScopeDef | undefined,
  event: WorkflowDomainEvent,
): WorkflowScopePlanResult {
  const scopeType = scope?.type?.trim() ?? 'organization';

  if (!(IMPLEMENTED_WORKFLOW_SCOPE_TYPES as readonly string[]).includes(scopeType)) {
    return {
      passed: false,
      scopeType,
      reason: 'Unsupported workflow scope type (fail-closed)',
    };
  }

  if (scopeType === 'organization') {
    return { passed: true, scopeType, reason: 'Organization-wide scope' };
  }

  const idField = SCOPE_ID_FIELD_BY_TYPE[scopeType as keyof typeof SCOPE_ID_FIELD_BY_TYPE];
  const scopeIds = (scope?.[idField] as string[] | undefined) ?? [];
  if (!scopeIds.length) {
    return {
      passed: false,
      scopeType,
      reason: `${scopeType} scope is configured without entities (fail-closed)`,
    };
  }

  const refs = extractWorkflowEntityRefs(event);

  if (scopeType === 'vehicle') {
    const passed = matchesScopedId(scopeIds, refs.vehicleId);
    return {
      passed,
      scopeType,
      reason: passed
        ? 'Vehicle matches scope'
        : 'Vehicle not in configured scope (fail-closed)',
    };
  }

  if (scopeType === 'station') {
    const passed = matchesScopedId(scopeIds, refs.stationId);
    return {
      passed,
      scopeType,
      reason: passed
        ? 'Station matches scope'
        : 'Station not in configured scope (fail-closed)',
    };
  }

  if (scopeType === 'booking') {
    const passed = matchesScopedId(scopeIds, refs.bookingId);
    return {
      passed,
      scopeType,
      reason: passed
        ? 'Booking matches scope'
        : 'Booking not in configured scope (fail-closed)',
    };
  }

  if (scopeType === 'customer') {
    const passed = matchesScopedId(scopeIds, refs.customerId);
    return {
      passed,
      scopeType,
      reason: passed
        ? 'Customer matches scope'
        : 'Customer not in configured scope (fail-closed)',
    };
  }

  return {
    passed: false,
    scopeType,
    reason: 'Unsupported workflow scope type (fail-closed)',
  };
}

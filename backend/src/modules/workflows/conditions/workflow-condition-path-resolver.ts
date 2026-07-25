import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type { WorkflowConditionFieldDefinition } from './workflow-condition.types';

export function getValueByAllowlistedPath(
  root: Record<string, unknown>,
  field: WorkflowConditionFieldDefinition,
): unknown {
  const parts = field.resolvePath.split('.').filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function assertTenantScopedPayload(
  organizationId: string,
  payload: Record<string, unknown>,
): void {
  const payloadOrg =
    (payload.organizationId as string | undefined) ??
    (payload.orgId as string | undefined) ??
    ((payload.booking as Record<string, unknown> | undefined)?.organizationId as
      | string
      | undefined);
  if (payloadOrg && payloadOrg !== organizationId) {
    throw Object.assign(new Error('Cross-tenant condition payload denied'), {
      code: WORKFLOW_CONDITION_ERROR_CODES.TENANT_VIOLATION,
    });
  }
}

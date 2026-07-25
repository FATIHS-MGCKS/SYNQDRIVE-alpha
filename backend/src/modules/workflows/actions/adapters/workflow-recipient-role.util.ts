import { MembershipRole } from '@prisma/client';
import type { WorkflowRecipientRole } from './workflow-action-adapter.types';

/** Maps workflow audience roles to org membership roles for notification delivery. */
const WORKFLOW_TO_MEMBERSHIP_ROLES: Record<WorkflowRecipientRole, readonly MembershipRole[]> = {
  ORG_ADMIN: [MembershipRole.ORG_ADMIN],
  SUB_ADMIN: [MembershipRole.SUB_ADMIN],
  FLEET_MANAGER: [MembershipRole.SUB_ADMIN, MembershipRole.WORKER],
  OPERATIONS: [MembershipRole.WORKER, MembershipRole.SUB_ADMIN],
};

export function resolveWorkflowRecipientRoles(
  roles: WorkflowRecipientRole[],
): MembershipRole[] {
  const resolved = new Set<MembershipRole>();
  for (const role of roles) {
    for (const membershipRole of WORKFLOW_TO_MEMBERSHIP_ROLES[role] ?? []) {
      resolved.add(membershipRole);
    }
  }
  return [...resolved];
}

export function validateRecipientRolesForTemplate(
  roles: WorkflowRecipientRole[],
  supported: readonly WorkflowRecipientRole[],
): string | null {
  if (!roles.length) return 'At least one recipient role is required';
  for (const role of roles) {
    if (!supported.includes(role)) {
      return `Recipient role "${role}" is not supported for this template`;
    }
  }
  return null;
}

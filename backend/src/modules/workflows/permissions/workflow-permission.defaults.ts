import type { MembershipPermissionsMap } from '@shared/auth/permission.util';

const all = (read: boolean, write: boolean, manage = false) => ({ read, write, manage });

/** Full workflow automation administration for org admins. */
export function workflowAutomationFullPermissions(): MembershipPermissionsMap {
  return {
    'workflow-automation': all(true, true, true),
    'workflow-automation-publish': all(true, true, true),
    'workflow-automation-test': all(true, true, true),
    'workflow-automation-test-external': all(true, true, true),
    'workflow-automation-approval': all(true, true, true),
    'workflow-automation-runs': all(true, true, true),
    'workflow-automation-audit': all(true, true, true),
    'workflow-automation-dead-letter': all(true, true, true),
    'workflow-automation-secrets': all(true, true, true),
    'workflow-automation-policy': all(true, true, true),
    'workflow-automation-templates': all(true, true, true),
  };
}

/**
 * Conservative sub-admin workflow access: draft editing + read-only operational views.
 * No publish, external test, secrets, policy, template manage, approval write, or replay.
 */
export function workflowAutomationOperatorPermissions(): MembershipPermissionsMap {
  return {
    'workflow-automation': all(true, true, false),
    'workflow-automation-publish': all(true, false, false),
    'workflow-automation-test': all(true, false, false),
    'workflow-automation-test-external': all(false, false, false),
    'workflow-automation-approval': all(true, false, false),
    'workflow-automation-runs': all(true, false, false),
    'workflow-automation-audit': all(true, false, false),
    'workflow-automation-dead-letter': all(true, false, false),
    'workflow-automation-secrets': all(false, false, false),
    'workflow-automation-policy': all(false, false, false),
    'workflow-automation-templates': all(false, false, false),
  };
}

/** Read-only workflow visibility for reviewers / auditors. */
export function workflowAutomationReadOnlyPermissions(): MembershipPermissionsMap {
  return {
    'workflow-automation': all(true, false, false),
    'workflow-automation-publish': all(true, false, false),
    'workflow-automation-test': all(true, false, false),
    'workflow-automation-approval': all(true, false, false),
    'workflow-automation-runs': all(true, false, false),
    'workflow-automation-audit': all(true, false, false),
    'workflow-automation-dead-letter': all(true, false, false),
  };
}

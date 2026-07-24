import type { PermissionLevel } from '@shared/decorators/require-permission.decorator';
import type { PermissionModuleKey } from '@shared/auth/permission.constants';

/**
 * Granular data-processing permission actions (Prompt 14).
 * Mapped to `data-authorization` module levels for migration-safe role templates.
 */
export const DATA_PROCESSING_PERMISSION_ACTIONS = [
  'data_processing.view',
  'data_processing.create',
  'data_processing.review_privacy',
  'data_processing.review_security',
  'data_processing.approve',
  'data_processing.activate',
  'data_processing.suspend',
  'data_processing.resume',
  'data_processing.revoke',
  'data_processing.audit_view',
  'data_processing.coverage_view',
  'data_processing.revocation_view',
  'data_processing.revocation_resume',
  'data_processing.deny_switch_view',
  'data_processing.deny_switch_manage',
  'data_processing.register_view',
  'data_processing.register_edit',
  'data_processing.register_export',
  'data_processing.dpia_view',
  'data_processing.dpia_assess',
  'data_processing.dpia_edit',
  'data_processing.dpia_review_privacy',
  'data_processing.dpia_review_security',
  'data_processing.dpia_approve',
  'data_processing.dpa_view',
  'data_processing.dpa_edit',
  'data_processing.dpa_review',
  'data_processing.dpa_approve',
  'data_processing.retention_view',
  'data_processing.retention_edit',
  'data_processing.retention_delete',
  'data_processing.retention_legal_hold',
  'data_processing.evidence_view',
  'data_processing.evidence_export',
] as const;

export type DataProcessingPermissionAction =
  (typeof DATA_PROCESSING_PERMISSION_ACTIONS)[number];

export interface DataProcessingPermissionRequirement {
  module: PermissionModuleKey;
  level: PermissionLevel;
}

export const DATA_PROCESSING_PERMISSION_REQUIREMENTS: Readonly<
  Record<DataProcessingPermissionAction, DataProcessingPermissionRequirement>
> = {
  'data_processing.view': { module: 'data-authorization', level: 'read' },
  'data_processing.create': { module: 'data-authorization', level: 'write' },
  'data_processing.review_privacy': { module: 'data-authorization', level: 'manage' },
  'data_processing.review_security': { module: 'data-authorization', level: 'manage' },
  'data_processing.approve': { module: 'data-authorization', level: 'manage' },
  'data_processing.activate': { module: 'data-authorization', level: 'manage' },
  'data_processing.suspend': { module: 'data-authorization', level: 'manage' },
  'data_processing.resume': { module: 'data-authorization', level: 'manage' },
  'data_processing.revoke': { module: 'data-authorization', level: 'manage' },
  'data_processing.audit_view': { module: 'data-authorization', level: 'read' },
  'data_processing.coverage_view': { module: 'data-authorization', level: 'read' },
  'data_processing.revocation_view': { module: 'data-authorization', level: 'read' },
  'data_processing.revocation_resume': { module: 'data-authorization', level: 'manage' },
  'data_processing.deny_switch_view': { module: 'data-authorization', level: 'read' },
  'data_processing.deny_switch_manage': { module: 'data-authorization', level: 'manage' },
  'data_processing.register_view': { module: 'data-authorization', level: 'read' },
  'data_processing.register_edit': { module: 'data-authorization', level: 'write' },
  'data_processing.register_export': { module: 'data-authorization', level: 'manage' },
  'data_processing.dpia_view': { module: 'data-authorization', level: 'read' },
  'data_processing.dpia_assess': { module: 'data-authorization', level: 'write' },
  'data_processing.dpia_edit': { module: 'data-authorization', level: 'write' },
  'data_processing.dpia_review_privacy': { module: 'data-authorization', level: 'manage' },
  'data_processing.dpia_review_security': { module: 'data-authorization', level: 'manage' },
  'data_processing.dpia_approve': { module: 'data-authorization', level: 'manage' },
  'data_processing.dpa_view': { module: 'data-authorization', level: 'read' },
  'data_processing.dpa_edit': { module: 'data-authorization', level: 'write' },
  'data_processing.dpa_review': { module: 'data-authorization', level: 'manage' },
  'data_processing.dpa_approve': { module: 'data-authorization', level: 'manage' },
  'data_processing.retention_view': { module: 'data-authorization', level: 'read' },
  'data_processing.retention_edit': { module: 'data-authorization', level: 'write' },
  'data_processing.retention_delete': { module: 'data-authorization', level: 'manage' },
  'data_processing.retention_legal_hold': { module: 'data-authorization', level: 'manage' },
  'data_processing.evidence_view': { module: 'data-authorization', level: 'read' },
  'data_processing.evidence_export': { module: 'data-authorization', level: 'manage' },
};

export const DATA_PROCESSING_REVIEW_STEP_PERMISSION: Readonly<
  Record<string, DataProcessingPermissionAction>
> = {
  BUSINESS_OWNER: 'data_processing.approve',
  PRIVACY_REVIEW: 'data_processing.review_privacy',
  SECURITY_REVIEW: 'data_processing.review_security',
  FINAL_APPROVAL: 'data_processing.approve',
};

export function isDataProcessingPermissionAction(
  value: string,
): value is DataProcessingPermissionAction {
  return (DATA_PROCESSING_PERMISSION_ACTIONS as readonly string[]).includes(value);
}

import { DataAuthorizationRevocationWorkflowStatus } from '@prisma/client';

/** Workflow statuses counted as "revocation in progress" for hub KPIs and list filters. */
export const REVOCATION_IN_PROGRESS_STATUSES: DataAuthorizationRevocationWorkflowStatus[] = [
  'REVOCATION_REQUESTED',
  'DENY_SWITCH_ACTIVE',
  'INGESTION_STOPPED',
  'PROVIDER_ACCESS_REVOKE_PENDING',
  'PROVIDER_ACCESS_REVOKED',
  'QUEUES_CANCELLED',
  'DOWNSTREAM_NOTIFICATION_PENDING',
  'DOWNSTREAM_NOTIFIED',
  'RETENTION_DECISION_PENDING',
  'RETENTION_DECIDED',
];

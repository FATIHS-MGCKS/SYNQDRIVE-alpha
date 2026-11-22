import type { OrganizationOffboardingJobStatus } from '@prisma/client';
import type { ProviderFinalizationState } from './organization-offboarding-execution.progress';

export type DimoPrivilegeProviderCheckStatus =
  | 'NOT_VERIFIED'
  | 'CONFIRMED_ABSENT'
  | 'PRIVILEGE_STILL_ACTIVE'
  | 'NOT_AVAILABLE'
  | 'REVIEW_REQUIRED'
  | 'NO_DIMO_DEPENDENCY';

export type DimoPrivilegeVehicleVerificationStatus =
  | 'VERIFIED_ABSENT'
  | 'VERIFIED_STILL_PRIVILEGED'
  | 'UNVERIFIED'
  | 'REVIEW_REQUIRED';

export type OrganizationDimoPrivilegeVehicleRow = {
  vehicleId: string;
  tokenId: number | null;
  localConnectionStatus: string | null;
  consentStatus: string | null;
  stillPrivileged: boolean | null;
  verificationStatus: DimoPrivilegeVehicleVerificationStatus;
};

export type OrganizationDimoPrivilegeStatusDto = {
  organizationId: string;
  jobId: string | null;
  jobStatus: OrganizationOffboardingJobStatus | null;
  phase: string | null;
  lastVerifiedAt: string | null;
  providerCheckStatus: DimoPrivilegeProviderCheckStatus;
  finalizationState: ProviderFinalizationState | null;
  detailCode: string | null;
  vehicles: OrganizationDimoPrivilegeVehicleRow[];
};

export type OrganizationDimoPrivilegeRecheckResult = {
  organizationId: string;
  jobId: string;
  providerCheckStatus: DimoPrivilegeProviderCheckStatus;
  detailCode: string | null;
  lastVerifiedAt: string;
  verificationSnapshotReference: string;
  vehicles: OrganizationDimoPrivilegeVehicleRow[];
  evidencePreserved: boolean;
};

export type DimoOwnerHandoffStatus = 'RECORDED';

export type DimoOwnerHandoffRecord = {
  handoffId: string;
  requestedAt: string;
  requestedByUserId: string;
  organizationId: string;
  jobId: string;
  idempotencyKey: string;
  affectedVehicleIds: string[];
  verificationSnapshotReference: string | null;
  status: DimoOwnerHandoffStatus;
};

export type OrganizationDimoOwnerHandoffRequest = {
  idempotencyKey: string;
  vehicleIds?: string[];
};

export type OrganizationDimoOwnerHandoffResult = {
  handoff: DimoOwnerHandoffRecord;
  idempotentReplay: boolean;
  handoffsRecorded: number;
};
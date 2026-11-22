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
  jobStatus: string | null;
  phase: string | null;
  lastVerifiedAt: string | null;
  providerCheckStatus: DimoPrivilegeProviderCheckStatus;
  finalizationState: string | null;
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

export type OrganizationDimoOwnerHandoffRequest = {
  idempotencyKey: string;
  vehicleIds?: string[];
};

export type OrganizationDimoOwnerHandoffResult = {
  handoff: {
    handoffId: string;
    requestedAt: string;
    status: 'RECORDED';
    idempotencyKey: string;
  };
  idempotentReplay: boolean;
  handoffsRecorded: number;
};
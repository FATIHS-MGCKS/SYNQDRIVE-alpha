import {
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
} from '@prisma/client';

/**
 * Maps Didit session/decision status strings to canonical check status.
 * Didit statuses are case-sensitive — do not normalize casing before lookup.
 */
const DIDIT_STATUS_MAP: Record<string, CustomerVerificationCheckStatus> = {
  Approved: 'VERIFIED',
  Declined: 'REJECTED',
  'In Review': 'REQUIRES_REVIEW',
  'In Progress': 'IN_PROGRESS',
  'Awaiting User': 'AWAITING_USER',
  'Not Started': 'PENDING',
  Abandoned: 'ABANDONED',
  Resubmitted: 'IN_PROGRESS',
  Expired: 'EXPIRED',
  'Kyc Expired': 'KYC_EXPIRED',
};

export type DiditStatusMappingResult = {
  status: CustomerVerificationCheckStatus;
  warning?: string;
};

export function mapDiditStatusToCheckStatus(
  diditStatus: string | null | undefined,
): DiditStatusMappingResult {
  if (!diditStatus) {
    return { status: 'PENDING' };
  }

  const mapped = DIDIT_STATUS_MAP[diditStatus];
  if (mapped) {
    return { status: mapped };
  }

  return {
    status: 'REQUIRES_REVIEW',
    warning: `Unknown Didit status "${diditStatus}" — mapped to REQUIRES_REVIEW`,
  };
}

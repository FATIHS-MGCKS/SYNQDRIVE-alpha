import type { OrganizationOffboardingJobStatus, OrganizationStatus } from '@prisma/client';
import type {
  OrganizationOffboardHardBlockCode,
  OrganizationOffboardReviewCode,
  OrganizationOffboardWarningCode,
} from './organization-offboard-preflight.reason-codes';

export type OrganizationOffboardPreflightSnapshot = {
  assessedAt: string;
  organizationId: string;
  organizationStatus: OrganizationStatus;
  activeRegistryVehicleCount: number;
  hardBlockers: OrganizationOffboardHardBlockCode[];
  reviewRequired: OrganizationOffboardReviewCode[];
  warnings: OrganizationOffboardWarningCode[];
  /** Counts only — no PII or provider secrets. */
  signals: {
    ongoingTripCount: number;
    activeBookingCount: number;
    futureCommittedBookingCount: number;
    vehiclesWithVehiclePreflightBlockCount: number;
    activeProviderConsentCount: number;
    connectedDimoVehicleCount: number;
    activeBillingSubscriptionCount: number;
    activeOffboardingJobId: string | null;
    organizationLegalHoldActive: boolean;
  };
};

export type OrganizationOffboardPrepareRequest = {
  idempotencyKey: string;
  note?: string;
};

export type OrganizationOffboardingJobView = {
  jobId: string;
  organizationId: string;
  idempotencyKey: string;
  status: OrganizationOffboardingJobStatus;
  phase: string;
  correlationId: string;
  requestedByUserId: string | null;
  requestedAt: string;
  completedAt: string | null;
  lastErrorCode: string | null;
  preflight: OrganizationOffboardPreflightSnapshot | null;
  idempotentReplay: boolean;
};

export const ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT_CODE =
  'ORGANIZATION_OFFBOARDING_IDEMPOTENCY_CONFLICT';

export const ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED_CODE =
  'ORGANIZATION_OFFBOARDING_PREFLIGHT_BLOCKED';

export const ORGANIZATION_OFFBOARDING_ACTIVE_JOB_CONFLICT_CODE =
  'ORGANIZATION_OFFBOARDING_ACTIVE_JOB_CONFLICT';
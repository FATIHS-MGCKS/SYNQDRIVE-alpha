import { createHash } from 'node:crypto';
import type { ProviderDisconnectChannelResult } from './organization-offboarding-provider-disconnect.service';
import type {
  DimoPrivilegeProviderCheckStatus,
  DimoPrivilegeVehicleVerificationStatus,
  OrganizationDimoPrivilegeVehicleRow,
} from './organization-offboarding-dimo-privilege.types';
import type { OrganizationOffboardingExecutionProgress } from './organization-offboarding-execution.progress';
import type { OrganizationProviderLiveChannelResult } from './organization-offboarding-provider-live.types';

export type OrgDimoVehicleInventoryRow = {
  vehicleId: string;
  tokenId: number | null;
  localConnectionStatus: string | null;
  consentStatus: string | null;
};

export function buildVerificationSnapshotReference(
  jobId: string,
  verifiedAt: string,
  stillActive: number[],
): string {
  const digest = createHash('sha256')
    .update(`${jobId}:${verifiedAt}:${stillActive.join(',')}`)
    .digest('hex')
    .slice(0, 16);
  return `dimo-privilege-verification:${jobId}:${verifiedAt}:${digest}`;
}

export function extractPrivilegedSnapshot(progress: OrganizationOffboardingExecutionProgress): {
  lastVerifiedAt: string | null;
  stillPrivilegedTokenIds: number[] | null;
  detailCode: string | null;
  providerCheckStatus: DimoPrivilegeProviderCheckStatus;
} {
  const verification = progress.dimoPrivilegeVerification;
  if (verification) {
    return {
      lastVerifiedAt: verification.lastVerifiedAt,
      stillPrivilegedTokenIds: verification.privilegedStillActiveTokenIds,
      detailCode: verification.detailCode,
      providerCheckStatus: verification.providerCheckStatus as DimoPrivilegeProviderCheckStatus,
    };
  }

  const dimoRaw = progress.providerQuiesce?.providerEvidence?.dimo;
  const dimoChannel =
    dimoRaw && typeof dimoRaw === 'object'
      ? (dimoRaw as ProviderDisconnectChannelResult)
      : undefined;
  if (!dimoChannel) {
    return {
      lastVerifiedAt: null,
      stillPrivilegedTokenIds: null,
      detailCode: null,
      providerCheckStatus: 'NOT_VERIFIED',
    };
  }

  const evidence = dimoChannel.providerEvidence;
  const attemptedAt =
    evidence && typeof evidence === 'object' && 'attemptedAt' in evidence
      ? String((evidence as { attemptedAt: unknown }).attemptedAt)
      : progress.providerQuiesce?.providerEvidence?.assessedAt ?? null;

  const summaryStill =
    evidence &&
    typeof evidence === 'object' &&
    'summary' in evidence &&
    evidence.summary &&
    typeof evidence.summary === 'object' &&
    Array.isArray((evidence.summary as { stillPrivileged?: unknown }).stillPrivileged)
      ? ((evidence.summary as { stillPrivileged: number[] }).stillPrivileged ?? null)
      : null;

  return {
    lastVerifiedAt: attemptedAt,
    stillPrivilegedTokenIds: summaryStill,
    detailCode: dimoChannel.detailCode ?? null,
    providerCheckStatus: mapLiveChannelToProviderCheckStatus(
      dimoChannel.externalOutcome,
      dimoChannel.detailCode,
    ),
  };
}

export function mapLiveChannelToProviderCheckStatus(
  externalOutcome: string | undefined,
  detailCode: string | null | undefined,
): DimoPrivilegeProviderCheckStatus {
  if (detailCode === 'DIMO_PRIVILEGE_STILL_ACTIVE') {
    return 'PRIVILEGE_STILL_ACTIVE';
  }
  switch (externalOutcome) {
    case 'CONFIRMED':
      return 'CONFIRMED_ABSENT';
    case 'REVIEW_REQUIRED':
      return 'REVIEW_REQUIRED';
    case 'NO_DEPENDENCY':
      return 'NO_DIMO_DEPENDENCY';
    case 'NOT_AVAILABLE':
      return 'NOT_AVAILABLE';
    default:
      return 'NOT_VERIFIED';
  }
}

export function mapPrivilegeReadToProviderCheckStatus(
  live: OrganizationProviderLiveChannelResult,
): DimoPrivilegeProviderCheckStatus {
  if (live.detailCode === 'DIMO_PRIVILEGE_STILL_ACTIVE') {
    return 'PRIVILEGE_STILL_ACTIVE';
  }
  switch (live.outcome) {
    case 'CONFIRMED':
      return 'CONFIRMED_ABSENT';
    case 'REVIEW_REQUIRED':
      return 'REVIEW_REQUIRED';
    case 'NO_DEPENDENCY':
      return 'NO_DIMO_DEPENDENCY';
    case 'NOT_AVAILABLE':
      return 'NOT_AVAILABLE';
    default:
      return 'NOT_VERIFIED';
  }
}

export function stillPrivilegedTokenIdsFromLiveResult(
  live: OrganizationProviderLiveChannelResult,
): number[] {
  const summary = live.providerEvidence.summary;
  if (Array.isArray(summary.stillPrivileged)) {
    return summary.stillPrivileged.filter((id): id is number => typeof id === 'number' && Number.isFinite(id));
  }
  return [];
}

export function summarizeProviderEvidence(
  live: OrganizationProviderLiveChannelResult,
): Record<string, unknown> {
  const { summary, attemptedAt, provider, organizationId } = live.providerEvidence;
  return {
    attemptedAt,
    provider,
    organizationId,
    privilegedStillActive: Array.isArray(summary.stillPrivileged) ? summary.stillPrivileged : undefined,
    orgTokenIds: Array.isArray(summary.orgTokenIds) ? summary.orgTokenIds : undefined,
    privilegedCount: summary.privilegedCount,
    pagesTraversed: summary.pagesTraversed,
    paginationComplete: summary.paginationComplete,
    note: summary.note,
  };
}

export function buildVehiclePrivilegeRows(
  inventory: OrgDimoVehicleInventoryRow[],
  snapshot: {
    stillPrivilegedTokenIds: number[] | null;
    providerCheckStatus: DimoPrivilegeProviderCheckStatus;
  },
): OrganizationDimoPrivilegeVehicleRow[] {
  const privilegedSet =
    snapshot.stillPrivilegedTokenIds != null ? new Set(snapshot.stillPrivilegedTokenIds) : null;
  const verifiedExternally =
    snapshot.providerCheckStatus === 'CONFIRMED_ABSENT' ||
    snapshot.providerCheckStatus === 'PRIVILEGE_STILL_ACTIVE';

  return inventory.map((row) => {
    if (row.tokenId == null || !Number.isFinite(row.tokenId)) {
      return {
        ...row,
        stillPrivileged: null,
        verificationStatus: 'REVIEW_REQUIRED',
      };
    }

    if (!verifiedExternally || privilegedSet == null) {
      return {
        ...row,
        stillPrivileged: null,
        verificationStatus: 'UNVERIFIED',
      };
    }

    const stillPrivileged = privilegedSet.has(row.tokenId);
    const verificationStatus: DimoPrivilegeVehicleVerificationStatus = stillPrivileged
      ? 'VERIFIED_STILL_PRIVILEGED'
      : 'VERIFIED_ABSENT';

    return {
      ...row,
      stillPrivileged,
      verificationStatus,
    };
  });
}
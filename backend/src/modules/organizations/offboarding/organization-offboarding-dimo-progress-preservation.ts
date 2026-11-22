import type { DimoOwnerHandoffRecord } from './organization-offboarding-dimo-privilege.types';
import type { OrganizationOffboardingExecutionProgress } from './organization-offboarding-execution.progress';

type DimoVerificationBlock = NonNullable<
  OrganizationOffboardingExecutionProgress['dimoPrivilegeVerification']
>;

function parseIsoMillis(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function pickNewerDimoPrivilegeVerification(
  stored: DimoVerificationBlock | undefined,
  candidate: DimoVerificationBlock | undefined,
): DimoVerificationBlock | undefined {
  if (!stored) return candidate;
  if (!candidate) return stored;
  const storedMs = parseIsoMillis(stored.lastVerifiedAt);
  const candidateMs = parseIsoMillis(candidate.lastVerifiedAt);
  return candidateMs >= storedMs ? candidate : stored;
}

export function pickLongerDimoOwnerHandoffList(
  stored: DimoOwnerHandoffRecord[] | undefined,
  candidate: DimoOwnerHandoffRecord[] | undefined,
): DimoOwnerHandoffRecord[] | undefined {
  const storedLen = stored?.length ?? 0;
  const candidateLen = candidate?.length ?? 0;
  if (storedLen === 0) return candidate;
  if (candidateLen === 0) return stored;
  if (candidateLen > storedLen) return candidate;
  if (storedLen > candidateLen) return stored;
  const storedTail = stored?.[storedLen - 1]?.requestedAt;
  const candidateTail = candidate?.[candidateLen - 1]?.requestedAt;
  return parseIsoMillis(candidateTail) >= parseIsoMillis(storedTail) ? candidate : stored;
}

/** Preserve operator DIMO fields when execution/finalization merges a stale in-memory progress snapshot. */
export function mergeOffboardingProgressPreservingDimoOperatorFields(
  stored: OrganizationOffboardingExecutionProgress,
  candidate: OrganizationOffboardingExecutionProgress,
): OrganizationOffboardingExecutionProgress {
  const spread = { ...stored, ...candidate };
  return {
    ...spread,
    dimoPrivilegeVerification: pickNewerDimoPrivilegeVerification(
      stored.dimoPrivilegeVerification,
      candidate.dimoPrivilegeVerification,
    ),
    dimoOwnerHandoffs: pickLongerDimoOwnerHandoffList(stored.dimoOwnerHandoffs, candidate.dimoOwnerHandoffs),
  };
}
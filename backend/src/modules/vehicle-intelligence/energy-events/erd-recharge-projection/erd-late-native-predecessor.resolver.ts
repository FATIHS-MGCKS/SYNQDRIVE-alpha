import type { HvChargeSession, Prisma } from '@prisma/client';
import {
  HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE,
  HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
} from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';

export const ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION = {
  NO_PREDECESSOR: 'no_predecessor',
  ONE_AUTHORITATIVE_PREDECESSOR: 'one_authoritative_predecessor',
  AMBIGUOUS_PREDECESSOR: 'ambiguous_predecessor',
  INVALID_SUPERSESSION_EVIDENCE: 'invalid_supersession_evidence',
} as const;

export type ErdLateNativePredecessorResolutionKind =
  (typeof ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION)[keyof typeof ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION];

export type ErdLateNativePredecessorResolution =
  | { kind: typeof ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.NO_PREDECESSOR }
  | {
      kind: typeof ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.ONE_AUTHORITATIVE_PREDECESSOR;
      predecessor: HvChargeSession;
    }
  | { kind: typeof ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.AMBIGUOUS_PREDECESSOR }
  | {
      kind: typeof ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.INVALID_SUPERSESSION_EVIDENCE;
      reason: string;
    };

function readSupersededByFingerprint(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object') return null;
  const value = (metadata as { supersededBySegmentFingerprint?: unknown })
    .supersededBySegmentFingerprint;
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Validates persisted E3 supersession metadata for a fallback claiming authority over native N.
 * Does not re-run physical matching — consumes E3-written evidence only.
 */
export function validateE3PersistedSupersessionMetadata(
  metadata: unknown,
  nativeSegmentFingerprint: string,
): 'not_claiming_native' | 'valid' | 'invalid' {
  const claimed = readSupersededByFingerprint(metadata);
  if (claimed == null) return 'not_claiming_native';
  if (claimed !== nativeSegmentFingerprint) return 'not_claiming_native';

  if (metadata == null || typeof metadata !== 'object') return 'invalid';
  const meta = metadata as Record<string, unknown>;
  const supersededAt = meta.supersededAt;
  if (typeof supersededAt !== 'string' || supersededAt.trim() === '') {
    return 'invalid';
  }
  if (meta.erdMatchVersion == null || meta.erdMatchVersion === '') {
    return 'invalid';
  }
  const erdMatchReason = meta.erdMatchReason;
  if (typeof erdMatchReason !== 'string' || erdMatchReason.trim() === '') {
    return 'invalid';
  }
  return 'valid';
}

export function classifyE3SupersededFallbackPredecessors(input: {
  nativeSession: Pick<HvChargeSession, 'segmentFingerprint' | 'source'>;
  fallbackSessions: HvChargeSession[];
}): ErdLateNativePredecessorResolution {
  if (input.nativeSession.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    return { kind: ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.NO_PREDECESSOR };
  }

  const nativeFp = input.nativeSession.segmentFingerprint;
  const authoritative: HvChargeSession[] = [];
  let sawInvalidForNative = false;

  for (const fallback of input.fallbackSessions) {
    if (fallback.source !== HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
      continue;
    }
    const validation = validateE3PersistedSupersessionMetadata(
      fallback.metadata,
      nativeFp,
    );
    if (validation === 'not_claiming_native') continue;
    if (validation === 'invalid') {
      sawInvalidForNative = true;
      continue;
    }
    authoritative.push(fallback);
  }

  if (authoritative.length === 0) {
    if (sawInvalidForNative) {
      return {
        kind: ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.INVALID_SUPERSESSION_EVIDENCE,
        reason: 'supersession_metadata_invalid_for_native_fingerprint',
      };
    }
    return { kind: ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.NO_PREDECESSOR };
  }
  if (authoritative.length > 1) {
    return { kind: ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.AMBIGUOUS_PREDECESSOR };
  }
  return {
    kind: ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.ONE_AUTHORITATIVE_PREDECESSOR,
    predecessor: authoritative[0]!,
  };
}

export async function resolveAuthoritativeFallbackPredecessorForNative(
  tx: Prisma.TransactionClient,
  nativeSession: HvChargeSession,
): Promise<ErdLateNativePredecessorResolution> {
  if (nativeSession.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    return { kind: ERD_LATE_NATIVE_PREDECESSOR_RESOLUTION.NO_PREDECESSOR };
  }

  const fallbackSessions = await tx.hvChargeSession.findMany({
    where: {
      vehicleId: nativeSession.vehicleId,
      organizationId: nativeSession.organizationId,
      source: HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK,
    },
  });

  return classifyE3SupersededFallbackPredecessors({
    nativeSession,
    fallbackSessions,
  });
}

import type {
  ActiveRpmProfileLabel,
  IceRpmApplicability,
  LvStandbyProfileLabel,
  ObservedRpmDensityLabel,
  ProfileConfidenceLevel,
} from './master-intelligence.types';
import type { MasterVsiProfileSummaryDto } from './vsi-master-intelligence-api.types';

export function mapSummaryToLvBadge(profile: MasterVsiProfileSummaryDto): {
  profile: LvStandbyProfileLabel;
  limitationCode: string | null;
} {
  const limitationCode =
    profile.evaluationBlocked && profile.evaluationBlockedCodes.length > 0
      ? profile.evaluationBlockedCodes[0]!
      : profile.lvStandbyProfile === 'UNKNOWN' && profile.profileLimitations.length > 0
        ? profile.profileLimitations[0]!
        : null;
  return {
    profile: profile.lvStandbyProfile,
    limitationCode,
  };
}

export function mapSummaryToRpmBadge(profile: MasterVsiProfileSummaryDto): {
  profile: ActiveRpmProfileLabel;
  applicability: IceRpmApplicability;
} {
  return {
    profile: profile.rpmActiveProfile,
    applicability: profile.rpmApplicability,
  };
}

export function mapConfidenceLevel(raw: string | null | undefined): ProfileConfidenceLevel {
  if (raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW') return raw;
  return 'UNKNOWN';
}

export function mapObservedDensity(raw: string | null | undefined): ObservedRpmDensityLabel {
  if (
    raw === 'SUB_ONE_HZ' ||
    raw === 'ONE_SECOND_BUCKETS_UNPROVEN' ||
    raw === 'IRREGULAR' ||
    raw === 'NOT_APPLICABLE'
  ) {
    return raw;
  }
  return 'UNKNOWN';
}

export function evidenceKindFromSummary(
  profile: MasterVsiProfileSummaryDto,
): 'evaluation_blocked' | 'observed' | 'insufficient_evidence' {
  if (profile.evaluationBlocked) return 'evaluation_blocked';
  if (
    profile.lvStandbyProfile === 'UNKNOWN' &&
    profile.rpmActiveProfile === 'UNKNOWN' &&
    profile.rpmApplicability === 'UNKNOWN'
  ) {
    return 'insufficient_evidence';
  }
  return 'observed';
}

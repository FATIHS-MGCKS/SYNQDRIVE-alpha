import type { VehicleSignalCapabilityProfile } from '@prisma/client';
import type { VsiProfileSignalFingerprintV1 } from './vsi-profile.types';
import type {
  MasterVsiProfileDetailDto,
  MasterVsiProfileSummaryDto,
  MasterVsiRevisionTimelineItemDto,
  MasterVsiSignalDetailDto,
} from './vsi-master-intelligence-read.types';
import type { VsiProfileRevisionHistoryRowV1 } from './vsi-profile-revision-history.types';

const OPEN_TRIP_BLOCK = 'OPEN_TRIP_BLOCKS_STANDBY_CLASSIFICATION';

export function maskFingerprintPrefix(fingerprint: string): string {
  const trimmed = fingerprint.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 12)}…`;
}

function parseSignalsSnapshot(raw: unknown): VsiProfileSignalFingerprintV1[] {
  if (!Array.isArray(raw)) return [];
  return raw as VsiProfileSignalFingerprintV1[];
}

function collectEvaluationBlocked(limitations: string[], signalLimitations: string[]): {
  blocked: boolean;
  codes: string[];
} {
  const codes = [...limitations, ...signalLimitations].filter(
    (c) => c === OPEN_TRIP_BLOCK || c.includes('BLOCK'),
  );
  const blocked = codes.includes(OPEN_TRIP_BLOCK);
  return { blocked, codes: [...new Set(codes)] };
}

function extractCadenceLabels(signals: VsiProfileSignalFingerprintV1[]): {
  lvStandbyProfile: MasterVsiProfileSummaryDto['lvStandbyProfile'];
  lvClassificationDecisionCode: string | null;
  lvEvidenceConfidence: string | null;
  rpmActiveProfile: MasterVsiProfileSummaryDto['rpmActiveProfile'];
  rpmApplicability: MasterVsiProfileSummaryDto['rpmApplicability'];
  rpmClassificationDecisionCode: string | null;
  observedDensityLabel: string | null;
  signalLimitations: string[];
} {
  const lv = signals.find((s) => s.canonicalSignalKey === 'lv_voltage');
  const rpm = signals.find((s) => s.canonicalSignalKey === 'engine_rpm');
  const lvCadence = lv?.cadenceIntelligence;
  const rpmCadence = rpm?.cadenceIntelligence;

  const lvStandby = lvCadence?.lvStandbyTransmissionProfile;
  const rpmProfile = rpmCadence?.activeRpmProfile;

  return {
    lvStandbyProfile: lvStandby?.profile ?? 'UNKNOWN',
    lvClassificationDecisionCode: lvStandby?.classificationDecisionCode ?? null,
    lvEvidenceConfidence: lvStandby?.evidenceConfidence ?? lvCadence?.evidenceConfidence ?? null,
    rpmActiveProfile: rpmProfile?.activeProfile ?? 'UNKNOWN',
    rpmApplicability:
      rpmCadence?.observedDensityLabel === 'NOT_APPLICABLE'
        ? 'NOT_APPLICABLE'
        : rpmProfile
          ? 'APPLICABLE'
          : 'UNKNOWN',
    rpmClassificationDecisionCode: rpmProfile?.classificationDecisionCode ?? null,
    observedDensityLabel: rpmCadence?.observedDensityLabel ?? null,
    signalLimitations: [
      ...(lvCadence?.limitations ?? []),
      ...(lvStandby?.limitations ?? []),
      ...(rpmProfile ? [] : []),
    ],
  };
}

export function mapProfileRowToSummary(
  row: VehicleSignalCapabilityProfile,
  provider: string | null,
): MasterVsiProfileSummaryDto {
  const limitations = Array.isArray(row.profileLimitations)
    ? (row.profileLimitations as string[])
    : [];
  const signals = parseSignalsSnapshot(row.signalsSnapshot);
  const cadence = extractCadenceLabels(signals);
  const block = collectEvaluationBlocked(limitations, cadence.signalLimitations);

  let lvStandbyProfile = cadence.lvStandbyProfile;
  if (block.blocked) {
    lvStandbyProfile = 'UNKNOWN';
  }

  return {
    providerSourceLinkId: row.providerSourceLinkId,
    providerIdentity: row.providerIdentity,
    provider,
    profileRevision: row.profileRevision,
    profileContractVersion: row.profileContractVersion,
    evaluatedAt: row.evaluatedAt.toISOString(),
    lastMaterializedSourceTimestamp: row.lastMaterializedSourceTimestamp?.toISOString() ?? null,
    lastMaterializedProviderFetchAt: row.lastMaterializedProviderFetchAt?.toISOString() ?? null,
    profileLimitations: limitations,
    lvStandbyProfile,
    lvClassificationDecisionCode: cadence.lvClassificationDecisionCode,
    lvEvidenceConfidence: cadence.lvEvidenceConfidence,
    rpmActiveProfile: cadence.rpmActiveProfile,
    rpmApplicability: cadence.rpmApplicability,
    rpmClassificationDecisionCode: cadence.rpmClassificationDecisionCode,
    observedDensityLabel: cadence.observedDensityLabel,
    evaluationBlocked: block.blocked,
    evaluationBlockedCodes: block.codes,
  };
}

function mapSignalDetail(signal: VsiProfileSignalFingerprintV1): MasterVsiSignalDetailDto {
  return {
    canonicalSignalKey: signal.canonicalSignalKey,
    providerNativeSignalName: signal.providerNativeSignalName,
    declaredSupport: signal.declaredSupport,
    empiricalObservation: signal.empiricalObservation,
    qualityClassification: signal.qualityClassification ?? null,
    confidenceLevel: signal.confidenceLevel ?? null,
    lastValidObservationAt: signal.lastValidObservationAt,
    lastSourceTimestamp: signal.lastSourceTimestamp,
    lastProviderFetchAt: signal.lastProviderFetchAt,
    freshnessClassification: signal.freshnessClassification,
    evidenceProvenance: signal.evidenceProvenance ?? [],
    limitations: signal.limitations ?? [],
    cadenceIntelligence: signal.cadenceIntelligence
      ? (signal.cadenceIntelligence as unknown as Record<string, unknown>)
      : null,
  };
}

export function mapProfileRowToDetail(
  row: VehicleSignalCapabilityProfile,
  provider: string | null,
): MasterVsiProfileDetailDto {
  const summary = mapProfileRowToSummary(row, provider);
  const signals = parseSignalsSnapshot(row.signalsSnapshot);
  return {
    ...summary,
    contentFingerprintPrefix: maskFingerprintPrefix(row.contentFingerprint),
    signals: signals.map(mapSignalDetail),
    fetchTimeIsNotNewSignalProof: true,
  };
}

export function mapRevisionRowToTimelineItem(
  row: VsiProfileRevisionHistoryRowV1,
): MasterVsiRevisionTimelineItemDto {
  const signals = parseSignalsSnapshot(row.signalsSnapshot);
  const cadence = extractCadenceLabels(signals);
  return {
    profileRevision: row.profileRevision,
    evaluatedAt: row.evaluatedAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
    materializationTrigger: row.materializationTrigger,
    profileLimitations: row.profileLimitations,
    lvStandbyProfile: cadence.lvStandbyProfile,
    rpmActiveProfile: cadence.rpmActiveProfile,
    contentFingerprintPrefix: maskFingerprintPrefix(row.contentFingerprint),
  };
}

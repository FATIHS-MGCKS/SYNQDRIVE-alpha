import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';

/** Material session scalars that drive M2 sampling and M3 segment-aggregate validation. */
export interface HvCapacityShadowEvidenceScalars {
  startAt: Date;
  endAt: Date | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  startEnergyKwh: number | null;
  endEnergyKwh: number | null;
  energyAddedKwh: number | null;
  deltaSocPercent: number | null;
  segmentAddedEnergyMinKwh?: number | null;
}

export function buildHvCapacityShadowEvidenceFingerprint(
  input: HvCapacityShadowEvidenceScalars,
): string {
  return [
    input.startAt.getTime(),
    input.endAt?.getTime() ?? 'ongoing',
    input.startSocPercent,
    input.endSocPercent,
    input.startEnergyKwh,
    input.endEnergyKwh,
    input.energyAddedKwh,
    input.deltaSocPercent,
    input.segmentAddedEnergyMinKwh ?? null,
  ].join(':');
}

export function shadowEvidenceFromChargeSessionRow(
  session: HvCapacityShadowEvidenceScalars,
  metadata: HvChargeSessionMetadata,
): HvCapacityShadowEvidenceScalars {
  return {
    ...session,
    segmentAddedEnergyMinKwh: metadata.segmentAddedEnergyMinKwh ?? null,
  };
}

export function isHvCapacityShadowEvidenceCurrent(input: {
  session: HvCapacityShadowEvidenceScalars;
  metadata: HvChargeSessionMetadata;
}): boolean {
  const fingerprint = buildHvCapacityShadowEvidenceFingerprint(
    shadowEvidenceFromChargeSessionRow(input.session, input.metadata),
  );
  return input.metadata.shadowEvidenceFingerprint === fingerprint;
}

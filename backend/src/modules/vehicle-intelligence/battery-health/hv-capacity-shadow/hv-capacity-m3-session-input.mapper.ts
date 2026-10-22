import type { HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import type { HvCapacityM3SessionInput } from './hv-capacity-m3.types';

type HvChargeSessionM3ScalarRow = Pick<
  HvChargeSession,
  | 'source'
  | 'isOngoing'
  | 'startAt'
  | 'endAt'
  | 'startSocPercent'
  | 'endSocPercent'
  | 'startEnergyKwh'
  | 'endEnergyKwh'
  | 'energyAddedKwh'
  | 'deltaSocPercent'
>;

export function buildHvCapacityM3SessionInput(
  session: HvChargeSessionM3ScalarRow,
  metadata: HvChargeSessionMetadata,
  quality: {
    capacityValidationEligible: boolean;
    boundaryStrength: NonNullable<HvCapacityM3SessionInput['boundaryStrength']>;
  },
): HvCapacityM3SessionInput {
  return {
    source: session.source,
    isOngoing: session.isOngoing,
    startAt: session.startAt,
    endAt: session.endAt,
    startSocPercent: session.startSocPercent,
    endSocPercent: session.endSocPercent,
    startEnergyKwh: session.startEnergyKwh,
    endEnergyKwh: session.endEnergyKwh,
    energyAddedKwh: session.energyAddedKwh,
    deltaSocPercent: session.deltaSocPercent,
    addedEnergyMinKwh: metadata.segmentAddedEnergyMinKwh ?? null,
    addedEnergyMaxKwh: metadata.segmentAddedEnergyMaxKwh ?? null,
    capacityValidationEligible: quality.capacityValidationEligible,
    qualityStatus: metadata.qualityStatus ?? null,
    boundaryStrength: quality.boundaryStrength,
  };
}

export function resolveM3BoundaryStrengthFromSessionRow(
  session: Pick<HvChargeSession, 'source' | 'startAt' | 'endAt'>,
): HvCapacityM3SessionInput['boundaryStrength'] {
  if (
    session.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE &&
    session.startAt &&
    session.endAt
  ) {
    return 'strong';
  }
  if (session.startAt && session.endAt) {
    return 'weak';
  }
  return 'invalid';
}

export function mapHvChargeSessionRowToM3Input(
  session: HvChargeSessionM3ScalarRow,
  metadata: HvChargeSessionMetadata,
): HvCapacityM3SessionInput {
  return buildHvCapacityM3SessionInput(session, metadata, {
    capacityValidationEligible: metadata.capacityValidationEligible === true,
    boundaryStrength:
      resolveM3BoundaryStrengthFromSessionRow(session) ?? 'invalid',
  });
}

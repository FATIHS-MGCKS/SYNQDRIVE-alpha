import type { HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import type { HvCapacityM3SessionInput } from '../hv-capacity-shadow/hv-capacity-m3.types';

export function mapHvChargeSessionToM3Input(
  session: Pick<
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
  >,
  metadata: HvChargeSessionMetadata,
): HvCapacityM3SessionInput {
  let boundaryStrength: HvCapacityM3SessionInput['boundaryStrength'] = 'invalid';
  if (
    session.source === HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE &&
    session.startAt &&
    session.endAt
  ) {
    boundaryStrength = 'strong';
  } else if (session.startAt && session.endAt) {
    boundaryStrength = 'weak';
  }
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
    capacityValidationEligible: metadata.capacityValidationEligible === true,
    qualityStatus: metadata.qualityStatus ?? null,
    boundaryStrength,
  };
}

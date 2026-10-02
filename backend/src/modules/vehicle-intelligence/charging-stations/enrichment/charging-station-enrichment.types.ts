import { VehicleEnergyEventDetectionSource, type VehicleEnergyEvent } from '@prisma/client';

export const RECHARGE_STATION_ENRICHMENT_JOB_NAME = 'recharge.station.enrich' as const;

export interface RechargeStationEnrichmentJobData {
  energyEventId: string;
}

export const CHARGING_STATION_ENRICHMENT_ERROR_CODE = {
  EVENT_NOT_FOUND: 'event_not_found',
  NOT_CANONICAL_RECHARGE: 'not_canonical_recharge',
  NOT_RECHARGE: 'not_recharge',
  RESOLVER_ERROR: 'resolver_error',
  WORKER_MAX_RETRIES: 'worker_max_retries',
} as const;

export function isCanonicalErdRechargeForChargingEnrichment(event: Pick<VehicleEnergyEvent, 'kind' | 'detectionSource'>): boolean {
  return (
    event.kind === 'RECHARGE' &&
    event.detectionSource === VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION
  );
}

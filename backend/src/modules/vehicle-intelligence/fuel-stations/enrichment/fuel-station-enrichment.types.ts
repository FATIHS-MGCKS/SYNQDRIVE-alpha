export interface RefuelStationEnrichmentJobData {
  energyEventId: string;
}

export const FUEL_STATION_ENRICHMENT_JOB_NAME = 'refuel.station.enrich' as const;

export const FUEL_STATION_ENRICHMENT_ERROR_CODE = {
  RESOLVER_ERROR: 'RESOLVER_ERROR',
  WORKER_MAX_RETRIES: 'WORKER_MAX_RETRIES',
  EVENT_NOT_FOUND: 'EVENT_NOT_FOUND',
  NOT_REFUEL: 'NOT_REFUEL',
} as const;

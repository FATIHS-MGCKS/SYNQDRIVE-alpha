import type { M3_3HvH3ExposureAxisAuditV1 } from './m3-3-hv-h3.types';

/** Static audit — fields may exist in code/DB but are not durable H3 V1 longitudinal axes. */
export function buildM3_3HvH3ExposureAxisAuditV1(): M3_3HvH3ExposureAxisAuditV1 {
  return {
    calendarTime: {
      availability: 'AVAILABLE',
      durableAuthority: true,
      lifecycleComplete: true,
      h3V1Used: true,
      reason: 'H2 observation timestamps provide calendar-time ordering for descriptive Theil–Sen V1',
      source: 'M3_3HvH2LongitudinalInputCandidateV1.observedAt',
    },
    odometer: {
      availability: 'PARTIAL',
      durableAuthority: false,
      lifecycleComplete: false,
      h3V1Used: false,
      reason: 'HvChargeSession.metadata odometer fields exist but no lifecycle-complete longitudinal exposure authority',
      source: 'HvChargeSession.metadata.odometerStartKm/odometerEndKm',
    },
    cumulativeChargeThroughput: {
      availability: 'PARTIAL',
      durableAuthority: false,
      lifecycleComplete: false,
      h3V1Used: false,
      reason: 'Session energyAddedKwh is session-scoped, not accumulated lifecycle throughput authority',
      source: 'HvChargeSession.energyAddedKwh',
    },
    fullEquivalentCycles: {
      availability: 'NOT_AVAILABLE',
      durableAuthority: false,
      lifecycleComplete: false,
      h3V1Used: false,
      reason: 'No durable FEC longitudinal authority audited for H3 V1',
      source: null,
    },
    temperatureExposure: {
      availability: 'NOT_AVAILABLE',
      durableAuthority: false,
      lifecycleComplete: false,
      h3V1Used: false,
      reason: 'No durable temperature exposure longitudinal authority audited for H3 V1',
      source: null,
    },
    fastChargeExposure: {
      availability: 'NOT_AVAILABLE',
      durableAuthority: false,
      lifecycleComplete: false,
      h3V1Used: false,
      reason: 'No durable fast-charge exposure longitudinal authority audited for H3 V1',
      source: null,
    },
    socWindowExposure: {
      availability: 'NOT_AVAILABLE',
      durableAuthority: false,
      lifecycleComplete: false,
      h3V1Used: false,
      reason: 'No durable SOC window exposure longitudinal authority audited for H3 V1',
      source: null,
    },
  };
}

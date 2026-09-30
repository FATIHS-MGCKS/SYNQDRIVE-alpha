import type { M3_3HvH3ExposureAxisAuditV1 } from './m3-3-hv-h3.types';

/** Static audit — calendar lifecycle completeness reflects H2 truncation. */
export function buildM3_3HvH3ExposureAxisAuditV1(
  h2Truncated: boolean,
): M3_3HvH3ExposureAxisAuditV1 {
  const calendarReason = h2Truncated
    ? 'H2 source history is bounded/truncated; calendar-time ordering is available but lifecycle completeness is not asserted for H3 V1'
    : 'H2 observation timestamps provide calendar-time ordering for descriptive Theil–Sen V1 within the H2 contract';

  return {
    calendarTime: {
      availability: 'AVAILABLE',
      durableAuthority: true,
      lifecycleComplete: !h2Truncated,
      h3V1Used: true,
      reason: calendarReason,
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

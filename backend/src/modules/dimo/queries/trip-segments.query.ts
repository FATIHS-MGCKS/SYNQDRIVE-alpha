export type DimoDetectionMechanism =
  | 'ignitionDetection'
  | 'frequencyAnalysis'
  | 'changePointDetection'
  // Native DIMO energy-segment detectors. These do NOT produce driving trips;
  // they emit stationary windows during which the fuel tank grew (refuel) or
  // the traction-battery SoC rose (recharge). Consumed by
  // DimoSegmentsService.fetchEnergyEventSegments → persisted as
  // VehicleEnergyEvent rows.
  | 'refuel'
  | 'recharge';

/**
 * Canonical DIMO trip segments for repair/backfill windows.
 *
 * We prefer changePointDetection for historical repair because it remains
 * usable even when ignition transitions are noisy or were missed during
 * a polling outage.
 */
export function buildTripSegmentsQuery(
  tokenId: number,
  from: Date,
  to: Date,
  mechanism: DimoDetectionMechanism,
): string {
  return `
    query TripSegments {
      segments(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        mechanism: ${mechanism}
        config: {
          minSegmentDurationSeconds: 60
          maxGapSeconds: 300
          signalCountThreshold: 1
        }
        signalRequests: [
          { name: "speed", agg: MAX }
          { name: "powertrainTransmissionTravelledDistance", agg: MIN }
          { name: "powertrainTransmissionTravelledDistance", agg: MAX }
        ]
      ) {
        start {
          timestamp
          value { latitude longitude }
        }
        end {
          timestamp
          value { latitude longitude }
        }
        duration
        isOngoing
        startedBeforeRange
        signals {
          name
          value
        }
      }
    }
  `.trim();
}

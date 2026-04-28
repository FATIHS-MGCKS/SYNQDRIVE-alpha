import type { DimoDetectionMechanism } from './trip-segments.query';

/**
 * Energy-event segments (native DIMO detectors).
 *
 * DIMO's telemetry API exposes `segments(mechanism: refuel|recharge)` which
 * emit stationary windows where either:
 *   - the absolute fuel tank level grew (RefuelDetector), or
 *   - the traction battery SoC rose (RechargeDetector)
 *
 * Unlike driving-trip segments we DO NOT request speed (the vehicle is
 * stationary) or the transmission odometer as range markers. We do request
 * start/end fuel & SoC snapshots plus an odometer snapshot so the UI can show
 * "tank +32 L / SoC +48 %" and attach the event to a vehicle km reading.
 */
export function buildEnergyEventSegmentsQuery(
  tokenId: number,
  from: Date,
  to: Date,
  mechanism: Extract<DimoDetectionMechanism, 'refuel' | 'recharge'>,
): string {
  const commonSignals = [
    '{ name: "powertrainTransmissionTravelledDistance", agg: MIN }',
    '{ name: "powertrainTransmissionTravelledDistance", agg: MAX }',
  ];

  const refuelSignals = [
    '{ name: "powertrainFuelSystemAbsoluteLevel", agg: MIN }',
    '{ name: "powertrainFuelSystemAbsoluteLevel", agg: MAX }',
    '{ name: "powertrainFuelSystemRelativeLevel", agg: MIN }',
    '{ name: "powertrainFuelSystemRelativeLevel", agg: MAX }',
  ];

  const rechargeSignals = [
    '{ name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MIN }',
    '{ name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MAX }',
    '{ name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MIN }',
    '{ name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MAX }',
  ];

  const signalRequests = [
    ...commonSignals,
    ...(mechanism === 'refuel' ? refuelSignals : rechargeSignals),
  ].join('\n          ');

  return `
    query EnergyEventSegments {
      segments(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        mechanism: ${mechanism}
        signalRequests: [
          ${signalRequests}
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

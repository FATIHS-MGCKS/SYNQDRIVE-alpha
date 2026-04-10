/**
 * DIMO Telemetry API — Driving Event Signals Query (LTE_R1 path)
 *
 * Fetches the history of harsh-event signals over a trip window.
 * DIMO reports these as boolean/flag signals when a harsh event is detected
 * by the on-board sensor.  Each sample where the value is truthy represents
 * one event occurrence.
 *
 * Signal mapping (DIMO signal → SynqDrive DrivingEventType):
 *   safetySystemBrakingHarshBraking        → HARSH_BRAKING
 *   safetySystemBrakingExtremeEmergency    → EXTREME_BRAKING
 *   safetySystemAccelerationHarshAcceleration → HARSH_ACCELERATION
 *   safetySystemCorneringHarshCornering    → HARSH_CORNERING
 *
 * Additional context signals fetched alongside (for severity/speed context):
 *   speed — vehicle speed at event time
 *
 * NOTE: The DIMO signal names follow the VSS naming convention used by the
 * DIMO Telemetry API.  If a vehicle does not report a particular signal,
 * the response will include null entries which are filtered out by the caller.
 */

export interface DimoSignalSample {
  timestamp: string;
  /** Signal value — for event signals: 1 = event detected, null = no event */
  safetySystemBrakingHarshBraking: number | null;
  safetySystemBrakingExtremeEmergency: number | null;
  safetySystemAccelerationHarshAcceleration: number | null;
  safetySystemCorneringHarshCornering: number | null;
  /** Speed context at time of sample */
  speed: number | null;
}

export function buildDrivingEventsQuery(
  tokenId: number,
  from: Date,
  to: Date,
): string {
  // Use a 1-second interval to capture individual event occurrences.
  // For event-type signals, DIMO reports TRUE/1 at the exact moment the
  // device detects the event; all other samples will be null or 0.
  return `
    query DrivingEvents {
      signals(
        tokenId: ${tokenId}
        from: "${from.toISOString()}"
        to: "${to.toISOString()}"
        interval: "1s"
      ) {
        timestamp
        safetySystemBrakingHarshBraking(agg: MAX)
        safetySystemBrakingExtremeEmergency(agg: MAX)
        safetySystemAccelerationHarshAcceleration(agg: MAX)
        safetySystemCorneringHarshCornering(agg: MAX)
        speed(agg: AVG)
      }
    }
  `.trim();
}

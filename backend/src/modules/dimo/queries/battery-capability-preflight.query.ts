import { BOOLEAN_SIGNAL_SPECS, SIGNAL_SPECS } from '../mappers/dimo-battery-signal.mapper';

const BATTERY_FLOAT_SIGNAL_NAMES = [
  ...Object.values(SIGNAL_SPECS).map((spec) => spec.dimoSignalName),
  ...Object.values(BOOLEAN_SIGNAL_SPECS).map((spec) => spec.dimoSignalName),
];

/**
 * Root `availableSignals` + `signalsLatest` for battery capability preflight.
 * Does not request tokens or secrets — caller supplies vehicle JWT at HTTP layer only.
 */
export function buildBatteryCapabilityPreflightQuery(tokenId: number): string {
  const signalFields = BATTERY_FLOAT_SIGNAL_NAMES.map(
    (name) => `${name} { timestamp value source }`,
  ).join('\n        ');

  return `
    query BatteryCapabilityPreflight {
      availableSignals(tokenId: ${tokenId})
      signalsLatest(tokenId: ${tokenId}) {
        lastSeen
        ${signalFields}
      }
    }
  `.trim();
}

/** Lightweight recharge-segment probe (read-only, limit 1). */
export function buildRechargeSegmentsProbeQuery(
  tokenId: number,
  fromIso: string,
  toIso: string,
): string {
  return `
    query RechargeSegmentsProbe {
      segments(
        tokenId: ${tokenId}
        from: "${fromIso}"
        to: "${toIso}"
        mechanism: recharge
        limit: 1
      ) {
        start { timestamp }
        end { timestamp }
      }
    }
  `.trim();
}

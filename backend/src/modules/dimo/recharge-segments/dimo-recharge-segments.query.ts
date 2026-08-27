import type { DimoRechargeSegmentAggregation } from './dimo-recharge-segments.types';

export interface BuildDimoRechargeSegmentsQueryInput {
  tokenId: number;
  fromIso: string;
  toIso: string;
  sourceFilter?: string | null;
}

const RECHARGE_SIGNAL_REQUESTS: Array<{
  name: string;
  agg: DimoRechargeSegmentAggregation;
}> = [
  { name: 'powertrainTransmissionTravelledDistance', agg: 'MIN' },
  { name: 'powertrainTransmissionTravelledDistance', agg: 'MAX' },
  { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MIN' },
  { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MAX' },
  {
    name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    agg: 'MIN',
  },
  {
    name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    agg: 'MAX',
  },
  { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MIN' },
  { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MAX' },
  { name: 'powertrainTractionBatteryChargingIsCharging', agg: 'MIN' },
  { name: 'powertrainTractionBatteryChargingIsCharging', agg: 'MAX' },
  {
    name: 'powertrainTractionBatteryChargingIsChargingCableConnected',
    agg: 'MIN',
  },
  {
    name: 'powertrainTractionBatteryChargingIsChargingCableConnected',
    agg: 'MAX',
  },
];

function renderSignalRequests(): string {
  return RECHARGE_SIGNAL_REQUESTS.map(
    (entry) => `{ name: "${entry.name}", agg: ${entry.agg} }`,
  ).join('\n          ');
}

function renderSourceFilter(sourceFilter?: string | null): string {
  const normalized = sourceFilter?.trim();
  if (!normalized) return '';
  return `\n        signalFilter: { source: { eq: "${normalized}" } }`;
}

/**
 * Canonical DIMO GraphQL query for `segments(mechanism: recharge)`.
 *
 * Aligned with the live Telemetry schema and `buildEnergyEventSegmentsQuery`:
 * - no `id` on Segment (unsupported — HTTP 422)
 * - no `limit` / `after` pagination args (unsupported — HTTP 422)
 * - signals selection returns `name` + `value` only (no `agg`)
 */
export function buildDimoRechargeSegmentsQuery(
  input: BuildDimoRechargeSegmentsQueryInput,
): string {
  return `
    query DimoRechargeSegments {
      segments(
        tokenId: ${input.tokenId}
        from: "${input.fromIso}"
        to: "${input.toIso}"
        mechanism: recharge${renderSourceFilter(input.sourceFilter)}
        signalRequests: [
          ${renderSignalRequests()}
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

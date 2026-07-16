/**
 * Sanitized DIMO recharge segment GraphQL payloads.
 * Source: `docs/audits/dimo-tesla-hv-signal-capability.md` (KS FH 660E, tokenId 186946).
 */

export const TESLA_RECHARGE_AUDIT_TOKEN_ID = 186946;

/** First page — segments 1–3 from audit §7. */
export const TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1 = {
  data: {
    segments: [
      {
        id: 'seg-audit-ksfh-1',
        start: { timestamp: '2026-06-15T17:47:29.000Z', value: { latitude: 51.2, longitude: 9.4 } },
        end: { timestamp: '2026-06-16T10:39:23.000Z', value: { latitude: 51.2, longitude: 9.4 } },
        duration: 60714,
        isOngoing: false,
        startedBeforeRange: false,
        signals: [
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MIN', value: 41.2 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MAX', value: 48.5 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MIN', value: 23.1 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MAX', value: 26.74 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MIN', value: 0.12 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MAX', value: 14.04 },
          { name: 'powertrainTractionBatteryChargingIsCharging', agg: 'MIN', value: 0 },
          { name: 'powertrainTractionBatteryChargingIsCharging', agg: 'MAX', value: 1 },
          { name: 'powertrainTractionBatteryChargingIsChargingCableConnected', agg: 'MIN', value: 0 },
          { name: 'powertrainTractionBatteryChargingIsChargingCableConnected', agg: 'MAX', value: 1 },
          { name: 'powertrainTransmissionTravelledDistance', agg: 'MIN', value: 179100 },
          { name: 'powertrainTransmissionTravelledDistance', agg: 'MAX', value: 179100 },
        ],
      },
      {
        id: null,
        start: { timestamp: '2026-06-17T13:52:22.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        end: { timestamp: '2026-06-17T16:20:03.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        duration: 8861,
        isOngoing: false,
        startedBeforeRange: false,
        signals: [
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MIN', value: 52.0 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MAX', value: 60.7 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MIN', value: 29.1 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MAX', value: 33.62 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MIN', value: 0.0 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MAX', value: 4.8 },
        ],
      },
      {
        id: 'seg-audit-ksfh-3',
        start: { timestamp: '2026-06-18T05:05:33.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        end: { timestamp: '2026-06-18T09:58:36.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        duration: 17583,
        isOngoing: false,
        startedBeforeRange: false,
        signals: [
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MIN', value: 44.0 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MAX', value: 56.4 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MIN', value: 24.5 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MAX', value: 31.14 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MIN', value: 0.0 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MAX', value: 7.0 },
        ],
      },
    ],
  },
} as const;

/** Pagination follow-up page — segment 4 (high SOC delta). */
export const TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2 = {
  data: {
    segments: [
      {
        id: 'seg-audit-ksfh-4',
        start: { timestamp: '2026-06-21T19:00:08.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        end: { timestamp: '2026-06-22T05:36:49.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        duration: 38201,
        isOngoing: false,
        startedBeforeRange: false,
        signals: [
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MIN', value: 35.0 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MAX', value: 62.4 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MIN', value: 19.5 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MAX', value: 34.0 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MIN', value: 0.0 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MAX', value: 15.18 },
        ],
      },
    ],
  },
} as const;

/** Ongoing segment at window end (synthetic sanitized fixture). */
export const TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT = {
  data: {
    segments: [
      {
        id: 'seg-audit-ksfh-ongoing',
        start: { timestamp: '2026-07-16T11:30:00.000Z', value: { latitude: 51.3, longitude: 9.5 } },
        end: null,
        duration: 5400,
        isOngoing: true,
        startedBeforeRange: false,
        signals: [
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MIN', value: 60.0 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', agg: 'MAX', value: 68.5 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MIN', value: 33.5 },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', agg: 'MAX', value: 38.2 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MIN', value: 0.0 },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', agg: 'MAX', value: 4.1 },
          { name: 'powertrainTractionBatteryChargingIsCharging', agg: 'MIN', value: 1 },
          { name: 'powertrainTractionBatteryChargingIsCharging', agg: 'MAX', value: 1 },
        ],
      },
    ],
  },
} as const;

/**
 * LIVE_CONTRACT fixtures — match production GraphQL `segments(mechanism: recharge)` shape:
 * no Segment `id`, signals `{ name, value }` only (no `agg`).
 */

export const TESLA_RECHARGE_AUDIT_TOKEN_ID = 186946;

export const GENERIC_NATIVE_RECHARGE_TOKEN_ID = 187336;

function liveSignals(
  entries: Array<{ name: string; values: number[] }>,
): Array<{ name: string; value: number }> {
  const rows: Array<{ name: string; value: number }> = [];
  for (const entry of entries) {
    for (const value of entry.values) {
      rows.push({ name: entry.name, value });
    }
  }
  return rows;
}

export const TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_1 = {
  data: {
    segments: [
      {
        start: {
          timestamp: '2026-06-15T17:47:29.000Z',
          value: { latitude: 51.2, longitude: 9.4 },
        },
        end: {
          timestamp: '2026-06-16T10:39:23.000Z',
          value: { latitude: 51.2, longitude: 9.4 },
        },
        duration: 60714,
        isOngoing: false,
        startedBeforeRange: false,
        signals: liveSignals([
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', values: [41.2, 48.5] },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', values: [23.1, 26.74] },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', values: [0.12, 14.04] },
          { name: 'powertrainTractionBatteryChargingIsCharging', values: [0, 1] },
          { name: 'powertrainTractionBatteryChargingIsChargingCableConnected', values: [0, 1] },
          { name: 'powertrainTransmissionTravelledDistance', values: [179100, 179100] },
        ]),
      },
      {
        start: {
          timestamp: '2026-06-17T13:52:22.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        end: {
          timestamp: '2026-06-17T16:20:03.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        duration: 8861,
        isOngoing: false,
        startedBeforeRange: false,
        signals: liveSignals([
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', values: [52.0, 60.7] },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', values: [29.1, 33.62] },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', values: [0.0, 4.8] },
        ]),
      },
      {
        start: {
          timestamp: '2026-06-18T05:05:33.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        end: {
          timestamp: '2026-06-18T09:58:36.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        duration: 17583,
        isOngoing: false,
        startedBeforeRange: false,
        signals: liveSignals([
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', values: [44.0, 56.4] },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', values: [24.5, 31.14] },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', values: [0.0, 7.0] },
        ]),
      },
    ],
  },
} as const;

export const TESLA_RECHARGE_AUDIT_SEGMENTS_PAGE_2 = {
  data: {
    segments: [
      {
        start: {
          timestamp: '2026-06-21T19:00:08.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        end: {
          timestamp: '2026-06-22T05:36:49.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        duration: 38201,
        isOngoing: false,
        startedBeforeRange: false,
        signals: liveSignals([
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', values: [35.0, 62.4] },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', values: [19.5, 34.0] },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', values: [0.0, 15.18] },
        ]),
      },
    ],
  },
} as const;

export const TESLA_RECHARGE_AUDIT_ONGOING_SEGMENT = {
  data: {
    segments: [
      {
        start: {
          timestamp: '2026-07-16T11:30:00.000Z',
          value: { latitude: 51.3, longitude: 9.5 },
        },
        end: null,
        duration: 5400,
        isOngoing: true,
        startedBeforeRange: false,
        signals: liveSignals([
          { name: 'powertrainTractionBatteryStateOfChargeCurrent', values: [60.0, 68.5] },
          { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', values: [33.5, 38.2] },
          { name: 'powertrainTractionBatteryChargingAddedEnergy', values: [0.0, 4.1] },
          { name: 'powertrainTractionBatteryChargingIsCharging', values: [1, 1] },
        ]),
      },
    ],
  },
} as const;

export const GENERIC_NATIVE_RECHARGE_COMPLETED_SEGMENT = {
  start: {
    timestamp: '2026-08-10T12:00:00.000Z',
    value: { latitude: 52.1, longitude: 8.2 },
  },
  end: {
    timestamp: '2026-08-10T14:30:00.000Z',
    value: { latitude: 52.1, longitude: 8.2 },
  },
  duration: 9000,
  isOngoing: false,
  startedBeforeRange: false,
  signals: liveSignals([
    { name: 'powertrainTractionBatteryStateOfChargeCurrent', values: [30, 55] },
    { name: 'powertrainTractionBatteryStateOfChargeCurrentEnergy', values: [18, 28] },
    { name: 'powertrainTractionBatteryChargingAddedEnergy', values: [0, 9.5] },
  ]),
} as const;

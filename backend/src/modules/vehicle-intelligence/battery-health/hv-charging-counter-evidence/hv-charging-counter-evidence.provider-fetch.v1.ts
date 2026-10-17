import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

export type HvChargingCounterIntervalFetchStatusV1 =
  | 'success'
  | 'no_vehicle_jwt'
  | 'invalid_response_shape'
  | 'empty_interval_series';

export interface HvChargingCounterIntervalFetchResultV1 {
  status: HvChargingCounterIntervalFetchStatusV1;
  rows: HvChargingCounterDimoIntervalRowV1[];
}

export function classifyDimoIntervalGraphqlPayload(
  payload: unknown,
): HvChargingCounterIntervalFetchResultV1 {
  if (payload == null || typeof payload !== 'object') {
    return { status: 'invalid_response_shape', rows: [] };
  }
  const signals = (payload as { signals?: unknown }).signals;
  if (!Array.isArray(signals)) {
    return { status: 'invalid_response_shape', rows: [] };
  }
  if (signals.length === 0) {
    return { status: 'empty_interval_series', rows: [] };
  }
  return { status: 'success', rows: signals as HvChargingCounterDimoIntervalRowV1[] };
}

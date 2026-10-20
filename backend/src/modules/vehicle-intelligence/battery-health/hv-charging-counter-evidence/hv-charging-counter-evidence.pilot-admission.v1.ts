import {
  BATTERY_V2_HV_CHARGING_COUNTER_PILOT_EPOCH_ENV,
  BATTERY_V2_HV_CHARGING_COUNTER_PILOT_HV_CHARGE_SESSION_ID_ENV,
  BATTERY_V2_HV_CHARGING_COUNTER_PILOT_MODE_ENABLED_ENV,
} from '@config/battery-health-v2.config';

export type HvChargingCounterPilotAdmissionStateV1 =
  | { kind: 'disabled' }
  | {
      kind: 'active';
      pilotEpoch: string;
      sourceHvChargeSessionId: string;
    }
  | { kind: 'deny_all'; reason: 'invalid_configuration' };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBooleanEnv(raw: string | undefined): boolean {
  if (raw == null || raw === '') return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function parseHvChargingCounterPilotAdmissionStateV1(env: {
  pilotModeEnabled?: string;
  pilotEpoch?: string;
  pilotHvChargeSessionId?: string;
}): HvChargingCounterPilotAdmissionStateV1 {
  if (!parseBooleanEnv(env.pilotModeEnabled)) {
    return { kind: 'disabled' };
  }

  const pilotEpoch = env.pilotEpoch?.trim() ?? '';
  const sessionId = env.pilotHvChargeSessionId?.trim() ?? '';
  if (!pilotEpoch || !sessionId || !UUID_RE.test(sessionId)) {
    return { kind: 'deny_all', reason: 'invalid_configuration' };
  }

  return {
    kind: 'active',
    pilotEpoch,
    sourceHvChargeSessionId: sessionId,
  };
}

export function getHvChargingCounterPilotAdmissionStateV1(): HvChargingCounterPilotAdmissionStateV1 {
  return parseHvChargingCounterPilotAdmissionStateV1({
    pilotModeEnabled: process.env[BATTERY_V2_HV_CHARGING_COUNTER_PILOT_MODE_ENABLED_ENV],
    pilotEpoch: process.env[BATTERY_V2_HV_CHARGING_COUNTER_PILOT_EPOCH_ENV],
    pilotHvChargeSessionId:
      process.env[BATTERY_V2_HV_CHARGING_COUNTER_PILOT_HV_CHARGE_SESSION_ID_ENV],
  });
}

export function isHvChargingCounterPilotSessionAdmittedV1(
  state: HvChargingCounterPilotAdmissionStateV1,
  sourceHvChargeSessionId: string,
): boolean {
  return (
    state.kind === 'active' && state.sourceHvChargeSessionId === sourceHvChargeSessionId
  );
}

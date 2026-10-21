import type { ReferenceCaptureTemporalClass } from './reference-capture.types';

const WAVEFORM_FIELDS = new Set([
  'speed',
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'chassisAxleRow2WheelLeftSpeed',
  'chassisAxleRow2WheelRightSpeed',
  'brakeCircuit1Pressure',
  'brakeCircuit2Pressure',
  'brakePedalPosition',
  'brakePedalState',
]);

const POWERTRAIN_FIELDS = new Set([
  'powertrainCombustionEngineSpeed',
  'obdThrottlePosition',
  'powertrainCombustionEngineTPS',
  'obdEngineLoad',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainCombustionEngineMAF',
  'powertrainTractionBatteryPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
]);

const SPATIAL_FIELDS = new Set([
  'latitude',
  'longitude',
  'currentLocationLatitude',
  'currentLocationLongitude',
  'heading',
  'currentLocationHeading',
]);

const SLOW_CONTEXT_FIELDS = new Set([
  'exteriorAirTemperature',
  'tirePressureRow1Left',
  'tirePressureRow1Right',
  'tirePressureRow2Left',
  'tirePressureRow2Right',
  'powertrainTransmissionTemperature',
]);

export function inferTemporalClass(providerField: string): ReferenceCaptureTemporalClass {
  if (WAVEFORM_FIELDS.has(providerField)) return 'WAVEFORM_DYNAMICS';
  if (POWERTRAIN_FIELDS.has(providerField)) return 'POWERTRAIN_DYNAMIC';
  if (SPATIAL_FIELDS.has(providerField)) return 'SPATIAL_ROUTE';
  if (SLOW_CONTEXT_FIELDS.has(providerField)) return 'SLOW_PHYSICAL_CONTEXT';
  if (providerField.toLowerCase().includes('dtc') || providerField.toLowerCase().includes('diagnostic')) {
    return 'HEALTH_DIAGNOSTIC';
  }
  if (providerField.startsWith('behavior.')) return 'EVENT';
  return 'SLOW_PHYSICAL_CONTEXT';
}

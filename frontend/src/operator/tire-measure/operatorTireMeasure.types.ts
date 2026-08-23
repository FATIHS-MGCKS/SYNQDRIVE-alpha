export type OperatorTireMeasureStep = 'vehicle' | 'set' | 'tread' | 'context' | 'review';

export const OPERATOR_TIRE_MEASURE_STEPS: OperatorTireMeasureStep[] = [
  'vehicle',
  'set',
  'tread',
  'context',
  'review',
];

export type OperatorTireMeasureSource = 'manual' | 'workshop' | 'ai_confirmed';

export interface OperatorTireTreadForm {
  fl: string;
  fr: string;
  rl: string;
  rr: string;
}

export interface OperatorTireContextForm {
  measuredAt: string;
  odometerKm: string;
  source: OperatorTireMeasureSource;
  workshopName: string;
  note: string;
}

export interface OperatorTireSetupOption {
  id: string;
  label: string;
  season: string | null;
  isActive: boolean;
}

export type OperatorTireMeasureValidationCode =
  | 'TREAD_REQUIRED'
  | 'MEASURED_AT_INVALID'
  | 'ODOMETER_INVALID';

export type OperatorTirePlausibilityCode =
  | 'RANGE'
  | 'LEGAL_MIN'
  | 'LOW'
  | 'HIGH'
  | 'FRONT_AXLE_DIFF'
  | 'REAR_AXLE_DIFF';

export type OperatorTireMeasureLoadErrorCode = 'LOAD_FAILED';

export interface OperatorTirePlausibilityWarning {
  id: string;
  code: OperatorTirePlausibilityCode;
  params: Record<string, string | number>;
}

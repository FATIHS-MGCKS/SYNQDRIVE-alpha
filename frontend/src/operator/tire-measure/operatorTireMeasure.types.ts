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
  /** Operator attests odometer at measurement time (required for V3 ground-truth evidence). */
  confirmOdometerKm: boolean;
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

export interface OperatorTirePlausibilityWarning {
  id: string;
  message: string;
}

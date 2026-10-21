import { BatteryMeasurementScope } from '../battery-v2-domain';
import type { HvCapacityMethod } from '../hv-method-profile/hv-method-profile.types';
import { M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1 } from './m3-3-hv-h1.constants';

export const M3_3_HV_H1_SCIENTIFIC_MATURITY = [
  'RAW_TELEMETRY',
  'DERIVED_EVIDENCE',
  'SESSION_EVIDENCE',
  'METHOD_SHADOW_EVIDENCE',
  'LONGITUDINAL_INPUT_CANDIDATE',
] as const;

export type M3_3HvH1ScientificMaturity = (typeof M3_3_HV_H1_SCIENTIFIC_MATURITY)[number];

export interface M3_3HvH1LongitudinalInputCandidateV1 {
  contractVersion: typeof M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1;
  organizationId: string;
  vehicleId: string;
  batteryScope: typeof BatteryMeasurementScope.HV;
  method: HvCapacityMethod | 'PROVIDER_OBSERVATION';
  observedAt: string;
  sessionId: string | null;
  provider: string;
  quality: string;
  freshness: string;
  evidenceStrength: string;
  sourceProvenance: string;
  eligibility: 'eligible' | 'ineligible';
  reasonCodes: string[];
  maturity: M3_3HvH1ScientificMaturity;
  /** No health conclusion — input candidacy only. */
  healthConclusion: null;
}

export interface M3_3HvH1LongitudinalInputCandidateEnvelopeV1 {
  contractVersion: typeof M3_3_HV_H1_LONGITUDINAL_INPUT_CANDIDATE_V1;
  organizationId: string;
  vehicleId: string;
  candidates: M3_3HvH1LongitudinalInputCandidateV1[];
  methodIdentityRequired: true;
  crossMethodPoolingDefault: false;
}

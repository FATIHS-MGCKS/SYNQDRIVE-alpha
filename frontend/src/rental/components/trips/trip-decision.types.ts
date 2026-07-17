import type { DrivingDecisionRecommendation } from './trip-decision.types';

export type DataBasisLevel =
  | 'BELASTBAR'
  | 'EINGESCHRAENKT'
  | 'UNZUREICHEND'
  | 'NICHT_UNTERSTUETZT';

export type TripDecisionSummary = {
  modelVersion: string;
  computedAt: string;
  dataBasis: DataBasisLevel;
  dataBasisReasons: string[];
  vehicleLoad: {
    level: string;
    score: number | null;
    evidenceStrength: string;
  } | null;
  driverConduct: {
    level: string;
    primaryEvidence: string;
    eventCountVisible: number;
  } | null;
  misuseEvidence: {
    level: string;
    caseCount: number;
    informationalOnly: boolean;
  };
  attribution: {
    level: string;
    confidence: string;
    customerChargeable: boolean;
  };
  recommendation: {
    level: DrivingDecisionRecommendation;
    primaryReason: string;
    reasons: string[];
  };
  partial: boolean;
};

export type DrivingDecisionRecommendation =
  | 'KEINE_MASSNAHME'
  | 'BEOBACHTEN'
  | 'KUNDENGESPRAECH'
  | 'MANUELLE_MIETFREIGABE'
  | 'FAHRZEUGPRUEFUNG'
  | 'TECHNISCHE_DATENPRUEFUNG';

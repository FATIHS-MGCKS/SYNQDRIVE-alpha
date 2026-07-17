import type {
  DriverAttributionType,
  DrivingAttributionConfidence,
  DrivingDecisionRecommendation,
} from '@prisma/client';

export const TRIP_DECISION_SUMMARY_MODEL_VERSION = 'trip-decision-summary-v1';

export type DataBasisLevel = 'BELASTBAR' | 'EINGESCHRAENKT' | 'UNZUREICHEND' | 'NICHT_UNTERSTUETZT';

export type VehicleLoadLevel = 'SCHONEND' | 'NORMAL' | 'ERHOHT' | 'STARK_ERHOHT';

export type DriverConductLevel =
  | 'UNAUFFAELLIG'
  | 'DYNAMISCH'
  | 'AUFFAELLIG'
  | 'STARK_AUFFAELLIG'
  | 'NICHT_BEWERTBAR';

export type MisuseEvidenceLevel =
  | 'KEINE'
  | 'EINZELNER_HINWEIS'
  | 'MEHRERE_BELASTBARE_HINWEISE'
  | 'STARKER_VERDACHT'
  | 'SCHADENSPRUEFUNG';

export type AttributionSummaryLevel =
  | 'BESTAETIGTER_FAHRER'
  | 'BUCHUNGSKUNDE'
  | 'ZUGEWIESENER_FAHRER'
  | 'FAHRZEUGBEZOGEN'
  | 'UNKLAR'
  | 'PRIVAT_NICHT_ZUGEORDNET';

export type TripDecisionSummaryCta = {
  action: string;
  label: string;
  eligible: boolean;
};

export type TripDecisionSummary = {
  modelVersion: string;
  inputFingerprint: string;
  computedAt: string;
  dataBasis: DataBasisLevel;
  dataBasisReasons: string[];
  vehicleLoad: {
    level: VehicleLoadLevel;
    score: number | null;
    per100km: {
      hardBrakes: number;
      hardAccelerations: number;
    };
    evidenceStrength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  } | null;
  driverConduct: {
    level: DriverConductLevel;
    primaryEvidence: 'NATIVE' | 'RECONSTRUCTED' | 'STRESS_ONLY' | 'NONE';
    eventCountVisible: number;
    per100km: number | null;
  } | null;
  misuseEvidence: {
    level: MisuseEvidenceLevel;
    caseCount: number;
    informationalOnly: boolean;
  };
  attribution: {
    level: AttributionSummaryLevel;
    confidence: DrivingAttributionConfidence;
    customerChargeable: boolean;
    attributionType: DriverAttributionType | null;
  };
  recommendation: {
    level: DrivingDecisionRecommendation;
    primaryReason: string;
    reasons: string[];
    ctas: TripDecisionSummaryCta[];
  };
  partial: boolean;
  stages: Record<string, string | null>;
};

export type TripListBadge = {
  recommendation: DrivingDecisionRecommendation;
  dataBasis: DataBasisLevel;
};

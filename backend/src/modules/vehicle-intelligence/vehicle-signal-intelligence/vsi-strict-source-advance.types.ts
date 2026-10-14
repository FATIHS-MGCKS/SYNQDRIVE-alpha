import type {
  VehicleProviderSourceObservationOutcome,
  VehicleProviderSourceObservationRecordPhase,
} from '@prisma/client';

export type VsiStrictSourceAdvanceClassification =
  | 'ADVANCED'
  | 'NOT_ADVANCED'
  | 'REGRESSION_OR_CONFLICT'
  | 'UNKNOWN';

export type VsiStrictSourceAdvanceEvaluation = {
  classification: VsiStrictSourceAdvanceClassification;
  strictSourceAdvanced: boolean | 'UNKNOWN';
  reasons: string[];
  latestObservationIndex?: bigint;
  previousObservationIndex?: bigint;
};

export type VsiSourceObservationRow = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingId: string | null;
  providerBindingScopeKey: string;
  providerTokenReference: string | null;
  providerTokenScopeKey: string;
  observationIndex: bigint;
  providerFetchedAt: Date;
  providerSourceTimestamp: Date | null;
  observationOutcome: VehicleProviderSourceObservationOutcome;
  recordPhase: VehicleProviderSourceObservationRecordPhase;
  fetchCorrelationId: string | null;
};

export type VsiLatestStateProvenanceSlice = {
  providerBindingId: string | null;
  providerSource: string | null;
  sourceTimestamp: Date | null;
  providerFetchedAt: Date | null;
};

export type VsiFetchObservationContinuity = {
  latest: VsiSourceObservationRow | null;
  previous: VsiSourceObservationRow | null;
  continuityIntact: boolean;
  latestVlsApplicationProven: boolean;
};

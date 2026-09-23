export type RestSessionFeatureInspectionSessionScope = {
  organizationId: string;
  restSessionId: string;
};

export type RestSessionFeatureRevisionIntegrityAggregate = {
  totalRows: number;
  incrementalRows: number;
  finalRows: number;
  validRows: number;
  invalidatedRows: number;
  latestSemanticRevision: number | null;
  positiveRevisionRowCount: number;
  distinctPositiveRevisionCount: number;
  minPositiveSemanticRevision: number | null;
  maxPositiveSemanticRevision: number | null;
  nonPositiveRevisionRowCount: number;
};

export type MisuseCaseUpsertContext = {
  tripEndTime: Date | null;
  behaviorEventCount: number;
  drivingEventCount: number;
  contextAnchorCount: number;
  dimoSafetyEventCount: number;
  dtcEventCount: number;
  analysisRunId?: string | null;
};

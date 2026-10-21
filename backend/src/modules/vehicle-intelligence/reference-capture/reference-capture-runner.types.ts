export type ReferenceCaptureJobData = {
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  manifestVersion: string;
  powertrainProfile: string | null;
  cycleNumber: number;
  cycleUuid: string;
  transientRetryCount?: number;
};

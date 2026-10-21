export type SettlementShadowJobData = {
  scheduleId: string;
  experimentId: string;
  sessionId: string;
  organizationId: string;
};

export type SettlementShadowPreflightCheck = {
  code: string;
  ok: boolean;
  detail: string;
};

export type SettlementShadowPreflightResult = {
  ready: boolean;
  checks: SettlementShadowPreflightCheck[];
  expectedSettlementShadowRequests: number;
  expectedPostTripShadowRequests: number;
  expectedTotalShadowRequests: number;
  nextSequence: string;
  calibrationPlanVersion: string;
};

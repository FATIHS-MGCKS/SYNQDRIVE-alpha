/** Durable start-proxy pilot provider request lifecycle (persisted). */
export const START_PROXY_PILOT_PROVIDER_LIFECYCLE = {
  REQUEST_STARTED: 'REQUEST_STARTED',
  COMPLETED: 'COMPLETED',
  UNKNOWN_OUTCOME: 'UNKNOWN_OUTCOME',
} as const;

export type StartProxyPilotProviderLifecycleStateV1 =
  (typeof START_PROXY_PILOT_PROVIDER_LIFECYCLE)[keyof typeof START_PROXY_PILOT_PROVIDER_LIFECYCLE];

export const START_PROXY_PILOT_DEFAULT_MAX_REQUESTS_PER_TRIP_V1 = 1;

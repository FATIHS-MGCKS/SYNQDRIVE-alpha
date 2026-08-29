/**
 * P1.3 canonical DIMO provider operation classification.
 * S1: classification + extension point only — no limiter behavior.
 */
export enum DimoProviderOperation {
  /** Telemetry GraphQL POST /query (vehicle JWT). */
  TELEMETRY_GRAPHQL = 'TELEMETRY_GRAPHQL',
  /**
   * Telemetry GraphQL vehicle summary query.
   * Preserves legacy 10s client timeout and non-throwing summary semantics.
   */
  TELEMETRY_VEHICLE_SUMMARY = 'TELEMETRY_VEHICLE_SUMMARY',
  /**
   * Telemetry GraphQL VIN VC query.
   * Preserves legacy catch-all → null semantics.
   */
  TELEMETRY_VEHICLE_VIN = 'TELEMETRY_VEHICLE_VIN',
}

export interface DimoProviderRequestContext {
  tokenId?: number;
  vehicleId?: string;
  organizationId?: string;
}

export interface DimoProviderExecuteParams<T> {
  operation: DimoProviderOperation;
  requestContext?: DimoProviderRequestContext;
  invoke: () => Promise<T>;
}

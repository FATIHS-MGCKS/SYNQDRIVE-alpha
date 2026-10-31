import type { OneAutoExecutionMode } from './oneauto-service-catalog';

/**
 * Provider contracts attested against official One Auto OpenAPI / Postman evidence.
 * Empty in P1 — no SKU may dispatch outbound HTTP until an entry is added here with
 * full verification (endpoint, method, VIN param, async semantics, pricing, parsing).
 */
export type VerifiedOneAutoProviderContract = {
  serviceSku: string;
  providerPathTemplate: string;
  httpMethod: 'GET';
  /** Query parameter name for VIN — must match verified docs (not guessed). */
  vinQueryParameter: 'vin';
  executionMode: OneAutoExecutionMode;
  /**
   * When true, vendor docs verify that polling the same URL after 202 does not create
   * a new billable request. When false or unset on async SKUs, polling is blocked.
   */
  asyncPollSameUrlWithoutNewCharge: boolean;
  /** Response stored opaquely — no field mapping into vehicle records. */
  responseHandling: 'OPAQUE_JSON';
  /** Indicative list price attestation version (not a billing guarantee). */
  pricingSourceVersion: string;
};

/** Production registry — intentionally empty until contract attestation lands. */
export const ONEAUTO_VERIFIED_PROVIDER_CONTRACTS: ReadonlyMap<
  string,
  VerifiedOneAutoProviderContract
> = new Map();

export function getVerifiedOneAutoContract(
  serviceSku: string,
): VerifiedOneAutoProviderContract | undefined {
  return ONEAUTO_VERIFIED_PROVIDER_CONTRACTS.get(serviceSku);
}

export function isOneAutoSkuContractVerified(serviceSku: string): boolean {
  return ONEAUTO_VERIFIED_PROVIDER_CONTRACTS.has(serviceSku);
}

export type OneAutoContractGateField =
  | 'endpoint'
  | 'httpMethod'
  | 'vinParameter'
  | 'asyncSemantics'
  | 'price'
  | 'responseParsing';

export type OneAutoContractGateReport = {
  serviceSku: string;
  executable: boolean;
  reason: 'CONTRACT_UNVERIFIED' | 'EXECUTABLE';
  unverifiedFields: OneAutoContractGateField[];
};

export function buildOneAutoContractGateReport(serviceSku: string): OneAutoContractGateReport {
  const verified = getVerifiedOneAutoContract(serviceSku);
  if (!verified) {
    return {
      serviceSku,
      executable: false,
      reason: 'CONTRACT_UNVERIFIED',
      unverifiedFields: [
        'endpoint',
        'httpMethod',
        'vinParameter',
        'asyncSemantics',
        'price',
        'responseParsing',
      ],
    };
  }
  return {
    serviceSku,
    executable: true,
    reason: 'EXECUTABLE',
    unverifiedFields: [],
  };
}

export type OneAutoExecutionMode = 'SYNC' | 'ASYNC_POLL';

export type OneAutoCatalogAvailability =
  | 'AVAILABLE'
  | 'DISABLED_FLAG'
  | 'PRICE_NOT_CONFIGURED'
  | 'PATH_UNVERIFIED';

export type OneAutoServiceCatalogEntry = {
  serviceSku: string;
  displayName: string;
  description: string;
  /** Relative path under base URL — PATH UNVERIFIED until Swagger/Postman attestation. */
  providerPathTemplate: string;
  httpMethod: 'GET';
  executionMode: OneAutoExecutionMode;
  requiredParameters: readonly ('vin')[];
  indicativePriceMinor: number | null;
  currency: string;
  pricingSourceVersion: string;
  availabilityStatus: OneAutoCatalogAvailability;
  resultHandling: 'EXTERNAL_STORE_ONLY';
};

const CATALOG_VERSION = 'synqdrive-oneauto-catalog-v1';

/** Internal catalog — provider path segments are placeholders until verified against OpenAPI. */
export const ONEAUTO_SERVICE_CATALOG: readonly OneAutoServiceCatalogEntry[] = [
  {
    serviceSku: 'OE_SERVICE_HISTORY_EU',
    displayName: 'OE Service History EU',
    description: 'Manufacturer service history (EU) — external provider payload only.',
    providerPathTemplate: 'oe/servicehistoryeu/v1/lookup',
    httpMethod: 'GET',
    executionMode: 'ASYNC_POLL',
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'PATH_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
  },
  {
    serviceSku: 'OE_SERVICE_SCHEDULE',
    displayName: 'OE Service Schedule',
    description: 'Manufacturer service schedule — external provider payload only.',
    providerPathTemplate: 'oe/serviceschedule/v1/lookup',
    httpMethod: 'GET',
    executionMode: 'ASYNC_POLL',
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'PATH_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
  },
  {
    serviceSku: 'OE_BUILD_DECODE',
    displayName: 'OE Build Decode',
    description: 'Build / specification decode — external provider payload only.',
    providerPathTemplate: 'oe/builddecode/v1/lookup',
    httpMethod: 'GET',
    executionMode: 'SYNC',
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'PATH_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
  },
  {
    serviceSku: 'OE_BUILD_SHEET_EU',
    displayName: 'OE Build Sheet EU',
    description: 'EU build sheet — external provider payload only.',
    providerPathTemplate: 'oe/buildsheeteu/v1/lookup',
    httpMethod: 'GET',
    executionMode: 'ASYNC_POLL',
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'PATH_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
  },
  {
    serviceSku: 'OE_VIN_LOOKUP_EU',
    displayName: 'OE VIN Lookup EU',
    description: 'EU VIN lookup — external provider payload only.',
    providerPathTemplate: 'oe/vinlookupeu/v1/lookup',
    httpMethod: 'GET',
    executionMode: 'SYNC',
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'PATH_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
  },
  {
    serviceSku: 'RECALL_CHECK',
    displayName: 'Recall Check',
    description: 'Recall check — external provider payload only.',
    providerPathTemplate: 'oe/recallcheck/v1/lookup',
    httpMethod: 'GET',
    executionMode: 'SYNC',
    requiredParameters: ['vin'],
    indicativePriceMinor: null,
    currency: 'GBP',
    pricingSourceVersion: CATALOG_VERSION,
    availabilityStatus: 'PATH_UNVERIFIED',
    resultHandling: 'EXTERNAL_STORE_ONLY',
  },
] as const;

export function getOneAutoCatalogEntry(serviceSku: string): OneAutoServiceCatalogEntry | undefined {
  return ONEAUTO_SERVICE_CATALOG.find((e) => e.serviceSku === serviceSku);
}

export function resolveCatalogEntryForRuntime(
  entry: OneAutoServiceCatalogEntry,
  opts: {
    providerEnabled: boolean;
    indicativePriceMinorBySku: Record<string, number>;
    pricingCatalogVersion: string;
  },
): OneAutoServiceCatalogEntry {
  const configuredPrice = opts.indicativePriceMinorBySku[entry.serviceSku] ?? null;
  let availabilityStatus: OneAutoCatalogAvailability = entry.availabilityStatus;
  if (!opts.providerEnabled) availabilityStatus = 'DISABLED_FLAG';
  else if (configuredPrice == null) availabilityStatus = 'PRICE_NOT_CONFIGURED';
  return {
    ...entry,
    indicativePriceMinor: configuredPrice,
    pricingSourceVersion: opts.pricingCatalogVersion,
    availabilityStatus,
  };
}

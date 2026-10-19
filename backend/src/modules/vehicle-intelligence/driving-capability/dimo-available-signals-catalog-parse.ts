import { VsiProviderCatalogSnapshotCompleteness } from '../vehicle-signal-intelligence/vsi-p3a-catalog-axis.contract';

export type DimoAvailableSignalsGraphQLResult = {
  data?: { availableSignals?: unknown } | null;
  errors?: unknown;
} | null
  | undefined;

export type ParsedDimoAvailableSignalsCatalog = {
  availableSignals: readonly string[];
  catalogSnapshotCompleteness: (typeof VsiProviderCatalogSnapshotCompleteness)[keyof typeof VsiProviderCatalogSnapshotCompleteness];
  catalogParseReason: string;
  graphqlErrorMessages: string[];
};

function normalizeStringSignalList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') return null;
    out.push(entry);
  }
  return out;
}

/**
 * Classify DIMO availableSignals GraphQL payload for P3A catalog completeness.
 * Never treats missing/malformed availableSignals as a complete provider catalog.
 */
export function parseDimoAvailableSignalsCatalogResponse(input: {
  signalsResult: DimoAvailableSignalsGraphQLResult;
  providerError: Record<string, unknown> | null;
}): ParsedDimoAvailableSignalsCatalog {
  const rawErrors = input.signalsResult?.errors;
  const graphqlErrorMessages =
    Array.isArray(rawErrors) && rawErrors.length > 0
      ? rawErrors.map((e) =>
          e && typeof e === 'object' && 'message' in e
            ? String((e as { message?: string }).message ?? 'GraphQL error')
            : 'GraphQL error',
        )
      : [];

  if (input.providerError) {
    return {
      availableSignals: [],
      catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness.PROVIDER_ERROR,
      catalogParseReason: 'provider_error',
      graphqlErrorMessages,
    };
  }

  const data = input.signalsResult?.data;
  if (data == null || typeof data !== 'object') {
    return {
      availableSignals: [],
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
      catalogParseReason: 'missing_graphql_data',
      graphqlErrorMessages,
    };
  }

  const normalized = normalizeStringSignalList(data.availableSignals);
  if (normalized === null) {
    const missing =
      data.availableSignals === undefined || data.availableSignals === null;
    return {
      availableSignals: [],
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
      catalogParseReason: missing ? 'available_signals_absent' : 'available_signals_malformed',
      graphqlErrorMessages,
    };
  }

  if (graphqlErrorMessages.length > 0) {
    return {
      availableSignals: normalized,
      catalogSnapshotCompleteness:
        VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
      catalogParseReason: 'graphql_errors_with_data',
      graphqlErrorMessages,
    };
  }

  return {
    availableSignals: normalized,
    catalogSnapshotCompleteness:
      VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    catalogParseReason: 'complete_provider_catalog',
    graphqlErrorMessages,
  };
}

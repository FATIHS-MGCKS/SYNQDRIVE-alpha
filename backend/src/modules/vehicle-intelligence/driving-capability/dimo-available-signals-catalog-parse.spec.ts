import { parseDimoAvailableSignalsCatalogResponse } from './dimo-available-signals-catalog-parse';
import { VsiProviderCatalogSnapshotCompleteness } from '../vehicle-signal-intelligence/vsi-p3a-catalog-axis.contract';

describe('parseDimoAvailableSignalsCatalogResponse', () => {
  it('treats valid empty array as complete provider catalog', () => {
    const parsed = parseDimoAvailableSignalsCatalogResponse({
      signalsResult: { data: { availableSignals: [] } },
      providerError: null,
    });
    expect(parsed.catalogSnapshotCompleteness).toBe(
      VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG,
    );
    expect(parsed.availableSignals).toEqual([]);
  });

  it('does not treat missing availableSignals as complete', () => {
    const parsed = parseDimoAvailableSignalsCatalogResponse({
      signalsResult: { data: {} },
      providerError: null,
    });
    expect(parsed.catalogSnapshotCompleteness).toBe(
      VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
    );
  });

  it('does not treat null availableSignals as complete', () => {
    const parsed = parseDimoAvailableSignalsCatalogResponse({
      signalsResult: { data: { availableSignals: null } },
      providerError: null,
    });
    expect(parsed.catalogSnapshotCompleteness).toBe(
      VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
    );
  });

  it('does not treat malformed availableSignals as complete', () => {
    const parsed = parseDimoAvailableSignalsCatalogResponse({
      signalsResult: { data: { availableSignals: ['speed', 42] } },
      providerError: null,
    });
    expect(parsed.catalogSnapshotCompleteness).toBe(
      VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
    );
  });

  it('marks GraphQL errors with data as incomplete', () => {
    const parsed = parseDimoAvailableSignalsCatalogResponse({
      signalsResult: {
        data: { availableSignals: ['speed'] },
        errors: [{ message: 'partial failure' }],
      },
      providerError: null,
    });
    expect(parsed.catalogSnapshotCompleteness).toBe(
      VsiProviderCatalogSnapshotCompleteness.INCOMPLETE_PROVIDER_RESPONSE,
    );
    expect(parsed.availableSignals).toEqual(['speed']);
  });

  it('maps provider errors to PROVIDER_ERROR completeness', () => {
    const parsed = parseDimoAvailableSignalsCatalogResponse({
      signalsResult: null,
      providerError: { providerError: true },
    });
    expect(parsed.catalogSnapshotCompleteness).toBe(
      VsiProviderCatalogSnapshotCompleteness.PROVIDER_ERROR,
    );
  });
});

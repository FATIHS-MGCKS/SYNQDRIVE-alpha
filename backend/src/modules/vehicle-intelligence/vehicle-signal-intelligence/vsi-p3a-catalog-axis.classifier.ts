import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import type { VsiP3aMaterializationCatalogKey } from './vsi-p3a-catalog-axis.contract';
import { VSI_P3A_MATERIALIZATION_CATALOG_KEYS } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogSnapshotCompleteness } from './vsi-p3a-catalog-axis.contract';
import { VsiProviderCatalogStatus } from './vehicle-signal-evidence.contract';

function isEvPowertrain(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  return normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV' || normalized === 'PLUGIN_HYBRID';
}

function isApplicable(
  key: VsiP3aMaterializationCatalogKey,
  fuelType: string | null | undefined,
): boolean {
  const def = getVsiCanonicalSignalDefinition(key);
  const ev = isEvPowertrain(fuelType);
  if (def.iceOnly && ev) return false;
  if (def.evOnly && !ev) return false;
  return true;
}

export type VsiP3aCatalogAxisClassification = {
  canonicalSignalKey: VsiP3aMaterializationCatalogKey;
  providerNativeSignalName: string;
  declaredCatalogStatus: VsiProviderCatalogStatus;
  metadata: Record<string, unknown>;
};

/**
 * Classify declared catalog status from a complete DIMO availableSignals snapshot only.
 * Does not infer LISTED from segment detectors, poll success, or partial catalogs.
 */
export function classifyVsiP3aCatalogAxes(input: {
  availableSignals: readonly string[];
  fuelType: string | null | undefined;
  catalogSnapshotCompleteness: VsiProviderCatalogSnapshotCompleteness;
}): VsiP3aCatalogAxisClassification[] {
  const available = new Set(input.availableSignals);
  const canProveNotListed =
    input.catalogSnapshotCompleteness ===
    VsiProviderCatalogSnapshotCompleteness.COMPLETE_PROVIDER_CATALOG;

  return VSI_P3A_MATERIALIZATION_CATALOG_KEYS.map((key) => {
    const def = getVsiCanonicalSignalDefinition(key);
    const native = def.primaryDimoSignalName;
    if (!native) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: key,
        declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
        metadata: { reason: 'missing_primary_dimo_signal_name' },
      };
    }

    if (!isApplicable(key, input.fuelType)) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
        metadata: {
          reason: 'powertrain_not_applicable',
          listedInAvailableSignals: false,
        },
      };
    }

    const listed = available.has(native);
    if (listed) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.LISTED,
        metadata: {
          listedInAvailableSignals: true,
          reason: 'listed_in_available_signals',
        },
      };
    }

    if (canProveNotListed) {
      return {
        canonicalSignalKey: key,
        providerNativeSignalName: native,
        declaredCatalogStatus: VsiProviderCatalogStatus.NOT_LISTED,
        metadata: {
          listedInAvailableSignals: false,
          reason: 'signal_not_in_availableSignals',
        },
      };
    }

    return {
      canonicalSignalKey: key,
      providerNativeSignalName: native,
      declaredCatalogStatus: VsiProviderCatalogStatus.UNKNOWN,
      metadata: {
        reason: 'catalog_snapshot_incomplete',
        listedInAvailableSignals: 'UNKNOWN',
      },
    };
  });
}

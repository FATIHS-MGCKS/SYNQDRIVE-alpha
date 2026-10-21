import type { DimoProviderRequestContext } from './dimo-provider-gateway.types';

/**
 * Canonical DIMO provider request context builder.
 * Ensures tokenId is always merged with optional vehicle/org scoping for canary admission.
 */
export function buildDimoProviderRequestContext(
  tokenId?: number,
  partial?: DimoProviderRequestContext,
): DimoProviderRequestContext {
  const merged: DimoProviderRequestContext = { ...partial };
  if (tokenId != null) {
    merged.tokenId = tokenId;
  }
  return merged;
}

/** Merge two partial contexts without dropping defined fields on either side. */
export function mergeDimoProviderRequestContext(
  base?: DimoProviderRequestContext,
  override?: DimoProviderRequestContext,
): DimoProviderRequestContext {
  if (!base && !override) {
    return {};
  }
  return {
    ...base,
    ...override,
    tokenId: override?.tokenId ?? base?.tokenId,
    vehicleId: override?.vehicleId ?? base?.vehicleId,
    organizationId: override?.organizationId ?? base?.organizationId,
  };
}

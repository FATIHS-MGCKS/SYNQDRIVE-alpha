export type VsiProviderSourceObservationScope = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingScopeKey: string;
  providerTokenScopeKey: string;
};

export function counterScopeUniqueWhere(
  scope: VsiProviderSourceObservationScope,
): {
  organizationId_vehicleId_provider_providerBindingScopeKey_providerTokenScopeKey: {
    organizationId: string;
    vehicleId: string;
    provider: string;
    providerBindingScopeKey: string;
    providerTokenScopeKey: string;
  };
} {
  return {
    organizationId_vehicleId_provider_providerBindingScopeKey_providerTokenScopeKey: {
      organizationId: scope.organizationId,
      vehicleId: scope.vehicleId,
      provider: scope.provider,
      providerBindingScopeKey: scope.providerBindingScopeKey,
      providerTokenScopeKey: scope.providerTokenScopeKey,
    },
  };
}

export function buildProviderSourceObservationScope(input: {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerBindingId: string | null;
  providerTokenReference: string | null;
}): VsiProviderSourceObservationScope {
  return {
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    provider: input.provider,
    providerBindingScopeKey: input.providerBindingId ?? 'UNRESOLVED',
    providerTokenScopeKey: input.providerTokenReference ?? 'NONE',
  };
}

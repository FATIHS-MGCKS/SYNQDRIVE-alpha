export const PROVIDER_SCOPE_ALLOWLIST: Record<string, readonly string[]> = {
  DIMO: ['telemetry', 'location', 'dtc', 'snapshot', 'identity'],
  HIGH_MOBILITY: ['health', 'tire_pressure', 'service_info', 'telemetry', 'location'],
} as const;

export const KNOWN_PROVIDERS = Object.keys(PROVIDER_SCOPE_ALLOWLIST);

export function assertProviderScopesAllowed(provider: string, scopes: string[]): void {
  const normalizedProvider = provider.trim().toUpperCase();
  const allowlist = PROVIDER_SCOPE_ALLOWLIST[normalizedProvider];
  if (!allowlist) {
    throw new Error(`provider_scope_provider_unknown:${normalizedProvider}`);
  }
  for (const scope of scopes) {
    const key = scope.trim().toLowerCase();
    if (!allowlist.includes(key)) {
      throw new Error(`provider_scope_not_allowed:${normalizedProvider}:${key}`);
    }
  }
}

export function normalizeProviderScopes(provider: string, scopes: string[]): string[] {
  assertProviderScopesAllowed(provider, scopes);
  return [...new Set(scopes.map((scope) => scope.trim().toLowerCase()))];
}

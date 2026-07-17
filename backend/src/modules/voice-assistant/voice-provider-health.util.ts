export type ProviderVerificationLevel =
  | 'configured'
  | 'reachable'
  | 'authorized'
  | 'healthy'
  | 'unknown'
  | 'not_verified';

export interface ProviderHealthSnapshot {
  configured: boolean;
  reachable: boolean;
  authorized: boolean;
  healthy: boolean;
  verification: ProviderVerificationLevel;
  label: string;
}

export function evaluateConfiguredProviderHealth(
  configured: boolean,
  providerLabel: string,
): ProviderHealthSnapshot {
  if (!configured) {
    return {
      configured: false,
      reachable: false,
      authorized: false,
      healthy: false,
      verification: 'not_verified',
      label: `${providerLabel} not configured`,
    };
  }

  return {
    configured: true,
    reachable: false,
    authorized: false,
    healthy: false,
    verification: 'not_verified',
    label: `${providerLabel} configured (connectivity not verified)`,
  };
}

export function readinessCheckOkFromHealth(health: ProviderHealthSnapshot): boolean {
  return health.configured;
}

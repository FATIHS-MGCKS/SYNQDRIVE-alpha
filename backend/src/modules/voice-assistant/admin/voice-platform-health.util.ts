export type VoicePlatformHealthState =
  | 'healthy'
  | 'degraded'
  | 'incident'
  | 'disabled'
  | 'not_configured';

export function deriveProviderHealthState(input: {
  configured: boolean;
  healthy: boolean;
  degraded?: boolean;
  explicitlyDisabled?: boolean;
}): VoicePlatformHealthState {
  if (input.explicitlyDisabled) return 'disabled';
  if (!input.configured) return 'not_configured';
  if (input.healthy) return 'healthy';
  if (input.degraded) return 'degraded';
  return 'incident';
}

export function deriveOverallPlatformHealth(input: {
  providerStates: VoicePlatformHealthState[];
  hasCriticalIncident: boolean;
  hasWarningIncident: boolean;
}): VoicePlatformHealthState {
  if (input.hasCriticalIncident) return 'incident';
  if (input.providerStates.includes('incident')) return 'incident';
  if (input.providerStates.includes('degraded') || input.hasWarningIncident) return 'degraded';
  if (input.providerStates.every(state => state === 'not_configured' || state === 'disabled')) {
    return input.providerStates.some(state => state === 'disabled') ? 'disabled' : 'not_configured';
  }
  if (input.providerStates.includes('healthy')) return 'healthy';
  return 'degraded';
}

export function healthStateLabel(state: VoicePlatformHealthState): string {
  switch (state) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'incident':
      return 'Incident';
    case 'disabled':
      return 'Disabled';
    default:
      return 'Not configured';
  }
}

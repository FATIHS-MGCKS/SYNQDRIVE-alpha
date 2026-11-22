import type { ProviderExternalOutcome } from './organization-offboarding-provider-disconnect.service';

/** Map live adapter outcome when org had historical/provider dependency — never upgrade NO_DEPENDENCY to CONFIRMED. */
export function mapLiveAdapterOutcomeForHistoricalDependency(
  liveOutcome: ProviderExternalOutcome,
  hadDependency: boolean,
): ProviderExternalOutcome {
  if (hadDependency && liveOutcome === 'NO_DEPENDENCY') {
    return 'REVIEW_REQUIRED';
  }
  return liveOutcome;
}

export function blocksExternalDisconnectConfirmation(outcome: ProviderExternalOutcome): boolean {
  return outcome === 'FAILED' || outcome === 'NOT_AVAILABLE' || outcome === 'REVIEW_REQUIRED';
}
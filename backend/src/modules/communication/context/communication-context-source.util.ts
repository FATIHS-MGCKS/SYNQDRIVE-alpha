import { CommunicationContextResolutionSource } from './communication-context.types';

const SOURCE_STRENGTH: Record<CommunicationContextResolutionSource, number> = {
  [CommunicationContextResolutionSource.NATIVE_RELATION]: 100,
  [CommunicationContextResolutionSource.EXISTING_CANONICAL]: 80,
  [CommunicationContextResolutionSource.BOOKING_RELATION]: 60,
  [CommunicationContextResolutionSource.BOOKING_TIME_WINDOW]: 50,
  [CommunicationContextResolutionSource.EXACT_PHONE]: 30,
  [CommunicationContextResolutionSource.EXACT_EMAIL]: 30,
};

export function communicationContextSourceStrength(
  source: CommunicationContextResolutionSource,
): number {
  return SOURCE_STRENGTH[source];
}

export function isStrongerCommunicationContextSource(
  candidate: CommunicationContextResolutionSource,
  incumbent: CommunicationContextResolutionSource,
): boolean {
  return communicationContextSourceStrength(candidate) > communicationContextSourceStrength(incumbent);
}

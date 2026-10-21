import type { SnapshotWakeOutcome } from '../../../snapshot-wake/snapshot-wake.types';
import type { ApdShadowCanonicalEnqueueOutcome } from './p25-apd-shadow-execution-versions';

export function toApdShadowCanonicalEnqueueOutcome(
  outcome: SnapshotWakeOutcome,
): ApdShadowCanonicalEnqueueOutcome {
  switch (outcome) {
    case 'ENQUEUED':
      return 'ENQUEUED';
    case 'RECOVERED_TERMINAL':
      return 'RECOVERED_TERMINAL';
    case 'COALESCED':
      return 'COALESCED';
    case 'QUEUE_FAILED':
      return 'QUEUE_FAILED';
    case 'PERSIST_FAILED':
      return 'PERSIST_FAILED';
    default:
      return 'COALESCED';
  }
}

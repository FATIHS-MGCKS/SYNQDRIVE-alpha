import { CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO } from '@config/device-connection-webhook-inbox.config';
import {
  isEligibleForRuntimeLifecycleReconciliation,
  isHistoricalLifecycleOrphan,
} from './connectivity-lifecycle-runtime.policy';

const CUTOVER = new Date(CONNECTIVITY_LIFECYCLE_RUNTIME_RECONCILE_AFTER_ISO);

describe('connectivity-lifecycle-runtime.policy', () => {
  it('marks July historical events as orphans', () => {
    const july20 = new Date('2026-07-20T11:05:03.768Z');
    expect(isHistoricalLifecycleOrphan(july20, CUTOVER)).toBe(true);
    expect(isEligibleForRuntimeLifecycleReconciliation(july20, CUTOVER)).toBe(false);
  });

  it('marks post-cutover events as eligible', () => {
    const post = new Date('2026-08-25T12:00:00.000Z');
    expect(isEligibleForRuntimeLifecycleReconciliation(post, CUTOVER)).toBe(true);
    expect(isHistoricalLifecycleOrphan(post, CUTOVER)).toBe(false);
  });

  it('treats exact cutover instant as eligible', () => {
    expect(isEligibleForRuntimeLifecycleReconciliation(CUTOVER, CUTOVER)).toBe(true);
  });
});

/**
 * Guardrails: DIMO Developer Console does NOT offer RPM/throttle/engine-load
 * webhooks. These tests document forbidden vocabulary so future work cannot
 * silently re-introduce RPM webhook intake.
 */
import {
  ANCHOR_TYPES,
  CONTEXT_REASON_CODES,
  FUTURE_ONLY_CONTEXT_CLASSIFICATIONS,
} from './event-context.types';
import { isBlockedEngineWebhookSignal } from '../../dimo/dimo-webhook-payload.util';

describe('RPM webhook vocabulary guardrails', () => {
  it('AnchorType is native DIMO behavior events only', () => {
    expect(ANCHOR_TYPES).toEqual(['DIMO_NATIVE_BEHAVIOR_EVENT']);
    expect(ANCHOR_TYPES).not.toContain('RPM_WEBHOOK_CANDIDATE' as never);
  });

  it('ContextReasonCode has no RPM_WEBHOOK_ANCHOR', () => {
    expect(CONTEXT_REASON_CODES).not.toContain('RPM_WEBHOOK_ANCHOR' as never);
  });

  it('future-only classifications are not active emit targets', () => {
    expect(FUTURE_ONLY_CONTEXT_CLASSIFICATIONS).toContain('REV_IN_IDLE_CONFIRMED');
    expect(FUTURE_ONLY_CONTEXT_CLASSIFICATIONS).toContain('HIGH_RPM_UNDER_LOAD');
  });

  it('blocked engine webhook signals include RPM (intake must ignore)', () => {
    expect(isBlockedEngineWebhookSignal('powertrainCombustionEngineSpeed')).toBe(true);
    expect(isBlockedEngineWebhookSignal('rpm')).toBe(true);
    expect(isBlockedEngineWebhookSignal('obdIsPluggedIn')).toBe(false);
  });
});

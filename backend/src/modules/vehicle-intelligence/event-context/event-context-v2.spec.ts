import { resolveV2ContextStatus } from './event-context-enrichment.service';
import {
  buildPerEventContextJobIdempotencyKey,
  isPerEventContextJobIdempotencyKey,
  parsePerEventContextJobIdempotencyKey,
} from './driving-event-context-job.contract';
import { normalizeEventContextStatus, isTerminalEventContextStatus } from './event-context-status';

describe('resolveV2ContextStatus', () => {
  it('maps successful classification to SUCCESS', () => {
    expect(
      resolveV2ContextStatus({
        classifierStatus: 'COMPLETED',
        evidenceGrade: 'B',
        reasonCodes: ['NATIVE_EVENT_ANCHOR'],
      }),
    ).toBe('SUCCESS');
  });

  it('maps sparse cadence reason to INSUFFICIENT_CADENCE', () => {
    expect(
      resolveV2ContextStatus({
        classifierStatus: 'COMPLETED',
        evidenceGrade: 'B',
        reasonCodes: ['SPARSE_SIGNAL_CADENCE'],
      }),
    ).toBe('INSUFFICIENT_CADENCE');
  });

  it('maps provider fetch errors to PROVIDER_ERROR', () => {
    expect(
      resolveV2ContextStatus({
        classifierStatus: 'COMPLETED',
        evidenceGrade: 'B',
        reasonCodes: [],
        fetchError: '503 Service Unavailable',
      }),
    ).toBe('PROVIDER_ERROR');
  });

  it('maps skipped powertrain to UNSUPPORTED', () => {
    expect(
      resolveV2ContextStatus({
        classifierStatus: 'INSUFFICIENT_CONTEXT',
        evidenceGrade: 'D',
        reasonCodes: [],
        skipped: true,
      }),
    ).toBe('UNSUPPORTED');
  });
});

describe('driving-event-context-job.contract', () => {
  it('round-trips per-event idempotency keys', () => {
    const key = buildPerEventContextJobIdempotencyKey('ev-1', '2026-07-16.1');
    expect(isPerEventContextJobIdempotencyKey(key)).toBe(true);
    expect(parsePerEventContextJobIdempotencyKey(key)).toEqual({
      drivingEventId: 'ev-1',
      contextModelVersion: '2026-07-16.1',
    });
  });
});

describe('event-context-status', () => {
  it('normalizes legacy COMPLETED to SUCCESS', () => {
    expect(normalizeEventContextStatus('COMPLETED')).toBe('SUCCESS');
    expect(isTerminalEventContextStatus('SUCCESS')).toBe(true);
  });
});

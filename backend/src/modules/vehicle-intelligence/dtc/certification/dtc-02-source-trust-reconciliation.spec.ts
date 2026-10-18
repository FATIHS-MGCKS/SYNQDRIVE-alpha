import { assessDtc02SourceTrustSurface } from './dtc-02-source-trust-reconciliation';

const T0 = Date.parse('2026-10-15T12:00:00Z');
const STALE = 6 * 60 * 60_000;

describe('assessDtc02SourceTrustSurface', () => {
  it('reports ALIGNED when surfaces agree', () => {
    const r = assessDtc02SourceTrustSurface({
      hasSourceHead: true,
      headLastPollFetchAtMs: T0,
      vlsLastDtcPollAtMs: T0,
      vlsLastSuccessfulCheckAtMs: T0 - 3600_000,
      lastConfirmedCompleteSourceAtMs: T0 - 3600_000,
      lastPartialWebhookSourceAtMs: null,
      activeDtcCodes: new Set(['P0301']),
      vlsObdDtcList: ['P0301'],
      outboxPendingCount: 0,
      evaluatedAtMs: T0,
      operationalStaleMs: STALE,
    });
    expect(r.divergences).toEqual(['ALIGNED']);
    expect(r.blocksFutureDeferral).toBe(false);
  });

  it('detects head poll ahead of VLS', () => {
    const r = assessDtc02SourceTrustSurface({
      hasSourceHead: true,
      headLastPollFetchAtMs: T0,
      vlsLastDtcPollAtMs: T0 - 1000,
      vlsLastSuccessfulCheckAtMs: T0 - 3600_000,
      lastConfirmedCompleteSourceAtMs: T0 - 3600_000,
      lastPartialWebhookSourceAtMs: null,
      activeDtcCodes: new Set(),
      vlsObdDtcList: [],
      outboxPendingCount: 0,
      evaluatedAtMs: T0,
      operationalStaleMs: STALE,
    });
    expect(r.divergences).toContain('HEAD_POLL_AHEAD_OF_VLS');
    expect(r.blocksFutureDeferral).toBe(true);
  });

  it('detects partial after complete watermark', () => {
    const r = assessDtc02SourceTrustSurface({
      hasSourceHead: true,
      headLastPollFetchAtMs: T0,
      vlsLastDtcPollAtMs: T0,
      vlsLastSuccessfulCheckAtMs: T0 - 3600_000,
      lastConfirmedCompleteSourceAtMs: T0 - 7200_000,
      lastPartialWebhookSourceAtMs: T0 - 1800_000,
      activeDtcCodes: new Set(['P0301']),
      vlsObdDtcList: ['P0301'],
      outboxPendingCount: 0,
      evaluatedAtMs: T0,
      operationalStaleMs: STALE,
    });
    expect(r.divergences).toContain('PARTIAL_AFTER_COMPLETE');
  });
});

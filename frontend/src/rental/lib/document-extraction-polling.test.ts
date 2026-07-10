import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createExtractionPoller, getPollIntervalMsForTest } from './document-extraction-polling';
import type { PublicDocumentExtraction } from './document-extraction.types';

function makeRecord(status: PublicDocumentExtraction['status']): PublicDocumentExtraction {
  return {
    id: 'ext-1',
    vehicleId: 'v1',
    organizationId: 'org-1',
    status,
    processingStage: 'REVIEW',
    documentType: 'SERVICE',
    effectiveDocumentType: 'SERVICE',
    requestedDocumentType: 'AUTO',
    classificationMode: 'AUTO',
    allowedActions: [],
    hasStoredFile: true,
  };
}

describe('document-extraction polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses backoff intervals 2s / 5s / 10s', () => {
    expect(getPollIntervalMsForTest(0)).toBe(2000);
    expect(getPollIntervalMsForTest(25_000)).toBe(5000);
    expect(getPollIntervalMsForTest(90_000)).toBe(10_000);
  });

  it('stops polling on terminal status', async () => {
    const fetchRecord = vi
      .fn()
      .mockResolvedValueOnce(makeRecord('PROCESSING'))
      .mockResolvedValueOnce(makeRecord('READY_FOR_REVIEW'));
    const onRecord = vi.fn();
    const poller = createExtractionPoller({ fetchRecord, onRecord });
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    poller.stop();
    expect(onRecord).toHaveBeenCalledTimes(2);
    expect(fetchRecord).toHaveBeenCalledTimes(2);
  });

  it('continues after transient fetch errors', async () => {
    const fetchRecord = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeRecord('PROCESSING'));
    const onError = vi.fn();
    createExtractionPoller({ fetchRecord, onRecord: vi.fn(), onError });
    await vi.runOnlyPendingTimersAsync();
    await vi.runOnlyPendingTimersAsync();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 1);
    expect(fetchRecord.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

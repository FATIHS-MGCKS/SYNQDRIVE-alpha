import { describe, expect, it, vi } from 'vitest';
import { mapServerToFlowStatus } from '../lib/document-extraction-lifecycle';
import { createExtractionPoller } from '../lib/document-extraction-polling';
import { buildAcceptAttribute, validateUploadFile } from '../lib/document-extraction-validation';

const metadata = {
  documentTypes: [{ value: 'SERVICE', labelKey: 'documentExtraction.type.SERVICE' }],
  classificationOptions: [{ value: 'AUTO', labelKey: 'documentExtraction.classification.AUTO' }],
  mimeTypes: ['application/pdf', 'image/png'],
  extensions: ['.pdf', '.png'],
  maxUploadBytes: 1024,
  maxUploadMb: 1,
  statuses: [],
  stages: [],
  errorPhases: [],
};

describe('useDocumentExtractionFlow shared contract', () => {
  it('builds accept attribute from backend metadata extensions', () => {
    expect(buildAcceptAttribute(metadata.extensions)).toBe('.pdf,.png');
  });

  it('rejects empty files before upload (client validation gate)', () => {
    const empty = new File([], 'empty.pdf', { type: 'application/pdf' });
    const result = validateUploadFile(empty, metadata, { vehicleSelected: true });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('EMPTY_FILE');
  });

  it('maps server lifecycle states used by drawer/operator flow', () => {
    expect(mapServerToFlowStatus('QUEUED')).toBe('queued');
    expect(mapServerToFlowStatus('PROCESSING', 'OCR')).toBe('ocr');
    expect(mapServerToFlowStatus('AWAITING_DOCUMENT_TYPE')).toBe('awaiting_type');
    expect(mapServerToFlowStatus('APPLIED')).toBe('done');
  });

  it('uses single-flight backoff poller (no parallel interval polls)', async () => {
    vi.useFakeTimers();
    let inFlight = 0;
    let calls = 0;
    const fetchRecord = vi.fn(async () => {
      inFlight += 1;
      calls += 1;
      await new Promise((r) => setTimeout(r, 500));
      inFlight -= 1;
      return { status: 'QUEUED' } as never;
    });

    const poller = createExtractionPoller({ fetchRecord, onRecord: () => undefined });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(2500);
    poller.stop();
    vi.useRealTimers();

    expect(calls).toBeGreaterThanOrEqual(1);
    expect(inFlight).toBeLessThanOrEqual(1);
  });
});

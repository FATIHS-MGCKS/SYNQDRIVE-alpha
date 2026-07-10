import {
  buildExtractionJobId,
  buildExtractionJobOptions,
  computeNextRetryAt,
  isProductionEnvironment,
} from './document-extraction-queue.util';
import {
  mapAiExtractionFailure,
  normalizeDocumentProcessingError,
  DocumentExtractionPipelineError,
  DOCUMENT_PIPELINE_ERROR_CODES,
} from './document-extraction.errors';

describe('document-extraction-queue.util', () => {
  it('builds stable job ids from extraction id', () => {
    expect(buildExtractionJobId('abc')).toBe('extract-abc');
  });

  it('builds job options with attempts and backoff', () => {
    const opts = buildExtractionJobOptions(
      { jobAttempts: 4, jobBackoffMs: 5000, jobTimeoutMs: 120000 } as any,
      'e1',
    );
    expect(opts.jobId).toBe('extract-e1');
    expect(opts.attempts).toBe(4);
    expect(opts.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });

  it('computes exponential next retry timestamps', () => {
    const t1 = computeNextRetryAt(5000, 1).getTime();
    const t2 = computeNextRetryAt(5000, 2).getTime();
    expect(t2 - t1).toBeGreaterThanOrEqual(5000);
  });
});

describe('document-extraction.errors processing matrix', () => {
  it('maps AI 429 failures as retryable', () => {
    const err = mapAiExtractionFailure('HTTP 429 Too Many Requests');
    expect(err.retryable).toBe(true);
    expect(err.stage).toBe('EXTRACTION');
  });

  it('maps AI 500 failures as retryable', () => {
    const err = mapAiExtractionFailure('upstream 500 internal server error');
    expect(err.retryable).toBe(true);
  });

  it('maps permanent pipeline errors as non-retryable', () => {
    const err = new DocumentExtractionPipelineError({
      code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
      safeMessage: 'Unsupported',
      retryable: false,
      stage: 'UPLOAD',
    });
    expect(err.retryable).toBe(false);
  });

  it('normalizes unknown errors with transient heuristics', () => {
    const err = normalizeDocumentProcessingError(new Error('network timeout while reading'));
    expect(err.retryable).toBe(true);
  });
});

describe('isProductionEnvironment', () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it('detects production', () => {
    process.env.NODE_ENV = 'production';
    expect(isProductionEnvironment()).toBe(true);
  });
});

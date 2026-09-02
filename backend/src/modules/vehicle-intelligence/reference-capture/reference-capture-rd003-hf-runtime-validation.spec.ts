import {
  groupHfQueryExecutionsByField,
  validateFieldQueryWindowBounded,
  validateFieldWatermarkSequence,
  validateHfRuntimeMechanisms,
  type HfQueryExecution,
  type HfRuntimeObservationRow,
} from './reference-capture-rd003-hf-runtime-validation';

const SESSION_START_MS = Date.parse('2026-09-02T18:59:15.695Z');

function makeHfRow(args: {
  field: string;
  seq: number;
  requestStartedAt: string;
  hfWindowFrom: string;
  hfWindowTo: string;
  providerTimestamp?: string;
}): HfRuntimeObservationRow {
  return {
    observationKind: 'SIGNAL_POINT',
    providerField: args.field,
    acquisitionSurface: 'HF_HISTORICAL',
    providerTimestamp: args.providerTimestamp ?? args.hfWindowFrom,
    synqReceivedAt: args.requestStartedAt,
    requestStartedAt: args.requestStartedAt,
    requestCompletedAt: args.requestStartedAt,
    sequenceNumber: args.seq,
    physicalSampleFingerprint: `fp-${args.seq}`,
    rawValueJson: { value: 1 },
    createdAt: args.requestStartedAt,
    provenanceJson: {
      hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2',
      hfWindowFrom: args.hfWindowFrom,
      hfWindowTo: args.hfWindowTo,
      hfActualQueryTo: args.hfWindowTo,
      aggregateBucketIdentity: `bucket-${args.seq}`,
      requestedInterval: '1s',
      requestedAggregation: 'AVG',
    },
  };
}

function makeBoundedSequence(field: string, count: number): HfRuntimeObservationRow[] {
  const rows: HfRuntimeObservationRow[] = [];
  let seq = 1;
  for (let i = 0; i < count; i++) {
    const fromMs = SESSION_START_MS + i * 6000;
    const toMs = fromMs + 8000;
    const from = new Date(fromMs).toISOString();
    const to = new Date(toMs).toISOString();
    rows.push(
      makeHfRow({
        field,
        seq: seq++,
        requestStartedAt: to,
        hfWindowFrom: from,
        hfWindowTo: to,
      }),
    );
  }
  return rows;
}

describe('reference-capture-rd003-hf-runtime-validation', () => {
  describe('watermark sequence proof', () => {
    it('passes correct bounded overlap sequence in acquisition order', () => {
      const rows = makeBoundedSequence('speed', 5);
      const byField = groupHfQueryExecutionsByField(rows);
      const result = validateFieldWatermarkSequence('speed', byField.get('speed')!);
      expect(result.validated).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('detects regressing watermark when sorted post-hoc would hide it', () => {
      const execs: HfQueryExecution[] = [
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 10_000,
          hfWindowFromMs: SESSION_START_MS,
          hfWindowToMs: SESSION_START_MS + 8000,
          hfActualQueryToMs: SESSION_START_MS + 8000,
          maxProviderTimestampMs: SESSION_START_MS + 6000,
        },
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 20_000,
          hfWindowFromMs: SESSION_START_MS + 6000,
          hfWindowToMs: SESSION_START_MS + 5000,
          hfActualQueryToMs: SESSION_START_MS + 5000,
          maxProviderTimestampMs: SESSION_START_MS + 4000,
        },
      ];
      const result = validateFieldWatermarkSequence('speed', execs);
      expect(result.validated).toBe(false);
      expect(result.violations.some((v) => v.code === 'WATERMARK_REGRESSION')).toBe(true);
    });

    it('detects out-of-order watermark regression in adversarial acquisition sequence', () => {
      const rows = [
        makeHfRow({
          field: 'speed',
          seq: 1,
          requestStartedAt: '2026-09-02T19:00:00.000Z',
          hfWindowFrom: '2026-09-02T18:59:50.000Z',
          hfWindowTo: '2026-09-02T19:00:00.000Z',
        }),
        makeHfRow({
          field: 'speed',
          seq: 2,
          requestStartedAt: '2026-09-02T19:00:10.000Z',
          hfWindowFrom: '2026-09-02T18:59:58.000Z',
          hfWindowTo: '2026-09-02T18:59:59.000Z',
        }),
      ];
      const runtime = validateHfRuntimeMechanisms(rows, SESSION_START_MS);
      expect(runtime.HF_DATA_WATERMARK_RUNTIME_VALIDATED).not.toBe('YES');
    });
  });

  describe('query window bounded proof', () => {
    it('passes correct bounded sequence', () => {
      const rows = makeBoundedSequence('obdEngineLoad', 4);
      const byField = groupHfQueryExecutionsByField(rows);
      const result = validateFieldQueryWindowBounded(
        'obdEngineLoad',
        byField.get('obdEngineLoad')!,
        SESSION_START_MS,
      );
      expect(result.validated).toBe(true);
    });

    it('detects intermediate unbounded query window', () => {
      const execs: HfQueryExecution[] = [
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 10_000,
          hfWindowFromMs: SESSION_START_MS,
          hfWindowToMs: SESSION_START_MS + 8000,
          hfActualQueryToMs: SESSION_START_MS + 8000,
          maxProviderTimestampMs: null,
        },
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 20_000,
          hfWindowFromMs: SESSION_START_MS,
          hfWindowToMs: SESSION_START_MS + 120_000,
          hfActualQueryToMs: SESSION_START_MS + 120_000,
          maxProviderTimestampMs: null,
        },
      ];
      const result = validateFieldQueryWindowBounded('speed', execs, SESSION_START_MS, {
        maxWindowMs: 15_000,
      });
      expect(result.validated).toBe(false);
      expect(result.violations.some((v) => v.code === 'UNBOUNDED_QUERY_WINDOW')).toBe(true);
    });

    it('detects stale silent field pinned to session start', () => {
      const execs: HfQueryExecution[] = [
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 10_000,
          hfWindowFromMs: SESSION_START_MS,
          hfWindowToMs: SESSION_START_MS + 8000,
          hfActualQueryToMs: SESSION_START_MS + 8000,
          maxProviderTimestampMs: null,
        },
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 20_000,
          hfWindowFromMs: SESSION_START_MS,
          hfWindowToMs: SESSION_START_MS + 18_000,
          hfActualQueryToMs: SESSION_START_MS + 18_000,
          maxProviderTimestampMs: null,
        },
      ];
      const result = validateFieldQueryWindowBounded('speed', execs, SESSION_START_MS);
      expect(result.validated).toBe(false);
      expect(result.violations.some((v) => v.code === 'STALE_SESSION_START_PIN')).toBe(true);
    });

    it('detects regressing query coverage', () => {
      const execs: HfQueryExecution[] = [
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 20_000,
          hfWindowFromMs: SESSION_START_MS + 12_000,
          hfWindowToMs: SESSION_START_MS + 20_000,
          hfActualQueryToMs: SESSION_START_MS + 20_000,
          maxProviderTimestampMs: null,
        },
        {
          providerField: 'speed',
          requestStartedAtMs: SESSION_START_MS + 30_000,
          hfWindowFromMs: SESSION_START_MS + 18_000,
          hfWindowToMs: SESSION_START_MS + 15_000,
          hfActualQueryToMs: SESSION_START_MS + 15_000,
          maxProviderTimestampMs: null,
        },
      ];
      const result = validateFieldQueryWindowBounded('speed', execs, SESSION_START_MS);
      expect(result.validated).toBe(false);
      expect(result.violations.some((v) => v.code === 'QUERY_COVERAGE_REGRESSION')).toBe(true);
    });
  });

  describe('aggregate runtime validation', () => {
    it('would FAIL lexical-sort monotonicity proof on adversarial out-of-order data', () => {
      const rows = [
        makeHfRow({
          field: 'speed',
          seq: 1,
          requestStartedAt: '2026-09-02T19:00:00.000Z',
          hfWindowFrom: '2026-09-02T18:59:50.000Z',
          hfWindowTo: '2026-09-02T19:00:00.000Z',
        }),
        makeHfRow({
          field: 'speed',
          seq: 2,
          requestStartedAt: '2026-09-02T19:00:10.000Z',
          hfWindowFrom: '2026-09-02T18:59:58.000Z',
          hfWindowTo: '2026-09-02T18:59:59.000Z',
        }),
      ];
      const sortedTo = rows.map((r) => String(r.provenanceJson?.hfWindowTo)).sort();
      expect(sortedTo[0] < sortedTo[1]).toBe(true);
      const runtime = validateHfRuntimeMechanisms(rows, SESSION_START_MS);
      expect(runtime.HF_DATA_WATERMARK_RUNTIME_VALIDATED).toBe('PARTIAL');
    });
  });
});

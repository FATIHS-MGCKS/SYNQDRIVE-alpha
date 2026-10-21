import {
  buildP4hRawArchiveInput,
  sealP4hRawArchive,
  verifyP4hRawArchive,
} from './p4h-raw-archive.v1';
import { resolveP4hEvaluatedAt } from './p4h-evaluation-semantics';
import { assessBucketTemporalCoherence } from './p4h-bucket-temporal-coherence';
import { evaluateP4hArchivedTrip } from './p4h-offline-trip-evaluation';
import { evaluateStartProxyCadenceGate } from '../battery-start-proxy-cadence-gate';

const TRIP_START = new Date('2026-01-15T12:00:00.000Z');
const WINDOW_TO = '2026-01-15T12:02:00.000Z';

function seriesEvery5s(
  fromMs: number,
  count: number,
  voltage: number,
  rpm: number | null,
): Array<{ timestamp: string; voltage: number | null; rpm: number | null }> {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(fromMs + i * 5_000).toISOString(),
    voltage,
    rpm,
  }));
}

function buildArchive(
  points: Array<{ timestamp: string; voltage: number | null; rpm: number | null }>,
  requestStatus: 'ok' | 'error' = 'ok',
) {
  const payload = buildP4hRawArchiveInput({
    capturedAtUtc: '2026-01-15T12:05:00.000Z',
    extractorGateVersion: '1.0.0',
    vehicleLabel: 'Fixture',
    vehicleId: '00000000-0000-0000-0000-000000000001',
    tripId: '11111111-1111-1111-1111-111111111111',
    tripStartUtc: TRIP_START.toISOString(),
    telemetryUrl: 'https://telemetry-api.dimo.zone/query',
    windowFromUtc: '2026-01-15T11:59:30.000Z',
    windowToUtc: WINDOW_TO,
    requestIndex: 1,
    httpStatus: requestStatus === 'ok' ? 200 : 500,
    requestStatus,
    errorMessage: requestStatus === 'ok' ? null : 'HTTP 500',
    retries: 0,
    points,
  });
  return sealP4hRawArchive(payload);
}

describe('P4H historical research harness', () => {
  it('seals and verifies archive integrity', () => {
    const points = seriesEvery5s(TRIP_START.getTime() - 25_000, 30, 12.4, 0);
    const archive = buildArchive(points);
    expect(verifyP4hRawArchive(archive).ok).toBe(true);
    archive.samples[0].voltageVolts = 9.9;
    expect(verifyP4hRawArchive(archive).ok).toBe(false);
  });

  it('detects clear start dip under HISTORICAL_REPLAY', () => {
    const startMs = TRIP_START.getTime();
    const points = [
      ...seriesEvery5s(startMs - 25_000, 5, 12.6, 0),
      { timestamp: new Date(startMs - 5_000).toISOString(), voltage: 12.5, rpm: 0 },
      { timestamp: new Date(startMs + 2_500).toISOString(), voltage: 11.2, rpm: 650 },
      ...seriesEvery5s(startMs + 5_000, 24, 12.4, 800),
    ];
    const archive = buildArchive(points);
    const result = evaluateP4hArchivedTrip(archive, {
      liveIngestAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const live = result.evaluations.find((e) => e.mode === 'LIVE_INGEST');
    const hist = result.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY');
    expect(live?.reasonCode).toBe('provider_delay');
    expect(hist?.gateOk).toBe(true);
    expect(result.evidence.validatedProxyWithValues).toBe(true);
    expect(result.metrics.voltageDropV).toBeGreaterThan(0.1);
  });

  it('handles no dip scenario', () => {
    const points = seriesEvery5s(TRIP_START.getTime() - 25_000, 30, 12.45, 0);
    const result = evaluateP4hArchivedTrip(buildArchive(points));
    expect(result.evidence.validatedProxyGate).toBe(true);
    expect(result.evidence.plausibleStartDip).toBe(false);
    expect(result.metrics.voltageDropV ?? 0).toBeLessThanOrEqual(0.1);
  });

  it('flags missing pre-crank voltage', () => {
    const startMs = TRIP_START.getTime();
    const points = seriesEvery5s(startMs + 5_000, 28, 12.2, 500);
    const result = evaluateP4hArchivedTrip(buildArchive(points));
    expect(result.metrics.vPreCrank).toBeNull();
    expect(result.rejectionReason).toBe('pre_crank_missing');
  });

  it('handles sparse series without validated recovery labels', () => {
    const startMs = TRIP_START.getTime();
    const points = [
      { timestamp: new Date(startMs - 20_000).toISOString(), voltage: 12.5, rpm: 0 },
      { timestamp: new Date(startMs).toISOString(), voltage: 11.0, rpm: 700 },
      { timestamp: new Date(startMs + 25_000).toISOString(), voltage: 12.3, rpm: 800 },
    ];
    const result = evaluateP4hArchivedTrip(buildArchive(points));
    expect(
      result.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY')?.reasonCode,
    ).toBe('insufficient_cadence');
    expect(result.metrics.recoveryDeltaV).toBeNull();
  });

  it('rejects coarse sampling via insufficient_cadence', () => {
    const startMs = TRIP_START.getTime();
    const points = [
      { timestamp: new Date(startMs - 20_000).toISOString(), voltage: 12.5, rpm: 0 },
      { timestamp: new Date(startMs).toISOString(), voltage: 11.5, rpm: 600 },
      { timestamp: new Date(startMs + 25_000).toISOString(), voltage: 12.4, rpm: 700 },
    ];
    const result = evaluateP4hArchivedTrip(buildArchive(points));
    expect(
      result.evaluations.find((e) => e.mode === 'HISTORICAL_REPLAY')?.reasonCode,
    ).toBe('insufficient_cadence');
  });

  it('rejects empty provider series', () => {
    const result = evaluateP4hArchivedTrip(buildArchive([]));
    expect(result.evaluations[0].reasonCode).toBe('no_data');
    expect(result.evidence.grade).toBe('REJECTED');
  });

  it('applies live freshness gate at ingest time', () => {
    const points = seriesEvery5s(TRIP_START.getTime() - 25_000, 30, 12.4, 0);
    const { evaluatedAt } = resolveP4hEvaluatedAt('LIVE_INGEST', {
      liveIngestAt: new Date('2026-06-01T00:00:00.000Z'),
      queryWindowToUtc: WINDOW_TO,
    });
    const gate = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt,
    });
    expect(gate.reasonCode).toBe('provider_delay');
  });

  it('marks aggregated bucket MIN/MAX as weak temporal evidence', () => {
    const startMs = TRIP_START.getTime();
    const points = [
      { timestamp: new Date(startMs - 10_000).toISOString(), voltage: 12.5, rpm: 0 },
      { timestamp: new Date(startMs).toISOString(), voltage: 11.0, rpm: 0 },
      { timestamp: new Date(startMs + 5_000).toISOString(), voltage: 12.4, rpm: 900 },
    ];
    const coherence = assessBucketTemporalCoherence(points, TRIP_START);
    expect(coherence.assessment).toBe('INSUFFICIENT_TEMPORAL_RESOLUTION');
  });

  it('handles provider request error archive', () => {
    const result = evaluateP4hArchivedTrip(buildArchive([], 'error'));
    expect(result.requestStatus).toBe('error');
    expect(result.rejectionReason).toBe('provider_request_failed');
    expect(result.evidence.grade).toBe('NONE');
  });

  it('replays identically from sealed archive', () => {
    const points = seriesEvery5s(TRIP_START.getTime() - 25_000, 28, 12.4, 100);
    const archive = buildArchive(points);
    const fixedLive = new Date('2026-03-01T12:00:00.000Z');
    const a = evaluateP4hArchivedTrip(archive, { liveIngestAt: fixedLive });
    const b = evaluateP4hArchivedTrip(archive, { liveIngestAt: fixedLive });
    expect(a).toEqual(b);
  });
});

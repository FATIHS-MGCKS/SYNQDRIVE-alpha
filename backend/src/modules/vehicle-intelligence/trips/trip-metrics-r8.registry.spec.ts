import { TripMetricsService } from '../../observability/trip-metrics.service';
import {
  observeEndCandidateLatency,
  observeEndRecognitionLatency,
  observeStartCandidateLatency,
  observeTripDuration,
} from './trip-fsm-timing-observability.util';

describe('trip-metrics R8 registry', () => {
  let metrics: TripMetricsService;

  beforeEach(() => {
    metrics = new TripMetricsService();
  });

  it('registers R8 timing metrics with expected HELP/TYPE and low-cardinality labels', async () => {
    observeStartCandidateLatency(metrics, {
      profile: 'ICE',
      clockSource: 'PROVIDER_EVENT_TIME',
      candidateAt: new Date('2026-09-06T10:00:00.000Z'),
      enteredAt: new Date('2026-09-06T10:00:02.000Z'),
    });
    observeEndRecognitionLatency(metrics, {
      profile: 'ICE',
      commitConfirmation: 'direct',
      recognizedAt: new Date('2026-09-06T11:00:00.000Z'),
      canonicalEndAt: new Date('2026-09-06T10:58:00.000Z'),
    });
    observeTripDuration(metrics, {
      profile: 'ICE',
      startAt: new Date('2026-09-06T10:00:00.000Z'),
      endAt: new Date('2026-09-06T10:30:00.000Z'),
    });
    metrics.tripTimingSampleRejected.inc({
      metric: 'end_candidate_latency',
      reason: 'negative_delta',
    });

    const serialized = await metrics.registry.metrics();
    const expected = [
      'synqdrive_trip_start_candidate_latency_seconds',
      'synqdrive_trip_start_recognition_latency_seconds',
      'synqdrive_trip_start_boundary_adjustment_seconds',
      'synqdrive_trip_end_candidate_latency_seconds',
      'synqdrive_trip_end_recognition_latency_seconds',
      'synqdrive_trip_end_boundary_adjustment_seconds',
      'synqdrive_trip_duration_seconds',
      'synqdrive_trip_timing_sample_rejected_total',
    ];
    for (const name of expected) {
      expect(serialized).toContain(`# HELP ${name}`);
      expect(serialized).toContain(`# TYPE ${name}`);
    }
    expect(serialized).toContain('DEPRECATED: trip duration');
    expect(serialized).toContain('DEPRECATED: canonical end boundary delta');
    expect(serialized).not.toContain('vehicleId');
    expect(serialized).not.toContain('tripId');
    expect(serialized).not.toContain('organizationId');
  });

  it('records rejected timing samples for invalid timestamps', async () => {
    observeEndCandidateLatency(metrics, {
      profile: 'ICE',
      evidencePath: 'CONTINUITY',
      clockSource: 'PROVIDER_EVENT_TIME',
      candidateAt: new Date(Number.NaN),
      enteredAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    const serialized = await metrics.registry.metrics();
    expect(serialized).toContain(
      'synqdrive_trip_timing_sample_rejected_total{metric="end_candidate_latency",reason="invalid_timestamp"} 1',
    );
  });

  it('records rejected timing samples for negative end candidate latency', async () => {
    observeEndCandidateLatency(metrics, {
      profile: 'ICE',
      evidencePath: 'CONTINUITY',
      clockSource: 'PROVIDER_EVENT_TIME',
      candidateAt: new Date('2026-09-06T12:00:10.000Z'),
      enteredAt: new Date('2026-09-06T12:00:00.000Z'),
    });
    const serialized = await metrics.registry.metrics();
    expect(serialized).toContain(
      'synqdrive_trip_timing_sample_rejected_total{metric="end_candidate_latency",reason="negative_delta"} 1',
    );
  });
});

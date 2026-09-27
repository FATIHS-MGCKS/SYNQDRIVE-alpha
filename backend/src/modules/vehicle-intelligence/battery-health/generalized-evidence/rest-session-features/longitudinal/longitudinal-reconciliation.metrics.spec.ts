import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { LongitudinalReconciliationTickOutcome } from './longitudinal-reconciliation.service';
import {
  assertLongitudinalReconciliationProcessedOutcomeSum,
  recordLongitudinalReconciliationAckOutcome,
  recordLongitudinalReconciliationSchedulerTick,
  recordLongitudinalReconciliationTickOutcomes,
} from './longitudinal-reconciliation.metrics';

function createMetricsSpy() {
  const metrics = new TripMetricsService();
  const spies = {
    ticksInc: jest.spyOn(metrics.batteryLongitudinalReconciliationTicksTotal, 'inc'),
    ticksObserve: jest.spyOn(
      metrics.batteryLongitudinalReconciliationDurationSeconds,
      'observe',
    ),
    candidatesObserve: jest.spyOn(metrics.batteryLongitudinalReconciliationCandidates, 'observe'),
    processedInc: jest.spyOn(metrics.batteryLongitudinalReconciliationProcessedTotal, 'inc'),
    ackInc: jest.spyOn(metrics.batteryLongitudinalReconciliationAckTotal, 'inc'),
    lastSuccessSet: jest.spyOn(
      metrics.batteryLongitudinalReconciliationLastSuccessTimestamp,
      'set',
    ),
  };
  return { metrics, spies };
}

describe('longitudinal-reconciliation.metrics', () => {
  it('T1 NOT_LEADER — ticks_total{result=NOT_LEADER}', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationSchedulerTick(metrics, { result: 'NOT_LEADER' });
    expect(spies.ticksInc).toHaveBeenCalledWith({ result: 'NOT_LEADER' });
    expect(spies.candidatesObserve).not.toHaveBeenCalled();
  });

  it('T2 FLAG_OFF — ticks_total{result=FLAG_OFF}', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationSchedulerTick(metrics, { result: 'FLAG_OFF' });
    expect(spies.ticksInc).toHaveBeenCalledWith({ result: 'FLAG_OFF' });
  });

  it('T3 OVERLAP — ticks_total{result=OVERLAP}', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationSchedulerTick(metrics, { result: 'OVERLAP' });
    expect(spies.ticksInc).toHaveBeenCalledWith({ result: 'OVERLAP' });
  });

  it('T4 COMPLETED zero candidates — candidate histogram + last success', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationSchedulerTick(metrics, {
      result: 'COMPLETED',
      durationSeconds: 0.12,
      candidateCount: 0,
    });
    expect(spies.ticksInc).toHaveBeenCalledWith({ result: 'COMPLETED' });
    expect(spies.candidatesObserve).toHaveBeenCalledWith(0);
    expect(spies.lastSuccessSet).toHaveBeenCalled();
  });

  it('T5 COMPLETED with candidates — observes candidate count', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationSchedulerTick(metrics, {
      result: 'COMPLETED',
      durationSeconds: 0.5,
      candidateCount: 2,
    });
    expect(spies.candidatesObserve).toHaveBeenCalledWith(2);
  });

  it('T6 FAILED — ticks_total{result=FAILED} + duration', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationSchedulerTick(metrics, {
      result: 'FAILED',
      durationSeconds: 0.01,
    });
    expect(spies.ticksInc).toHaveBeenCalledWith({ result: 'FAILED' });
    expect(spies.ticksObserve).toHaveBeenCalledWith({ result: 'FAILED' }, 0.01);
  });

  it('T7–T12 processed outcomes mirror tick outcome counts', () => {
    const { metrics, spies } = createMetricsSpy();
    const outcome: LongitudinalReconciliationTickOutcome = {
      status: 'COMPLETED',
      candidateCount: 3,
      processedCount: 3,
      createdCount: 1,
      existingCount: 1,
      d1RejectedCount: 1,
      d2RejectedCount: 0,
      errorCount: 0,
    };
    recordLongitudinalReconciliationTickOutcomes(metrics, outcome);
    expect(spies.processedInc).toHaveBeenCalledWith({ outcome: 'CREATED' }, 1);
    expect(spies.processedInc).toHaveBeenCalledWith({ outcome: 'EXISTING' }, 1);
    expect(spies.processedInc).toHaveBeenCalledWith({ outcome: 'D1_REJECTED' }, 1);
  });

  it('T13 ack CREATED metric', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationAckOutcome(metrics, 'CREATED');
    expect(spies.ackInc).toHaveBeenCalledWith({ outcome: 'CREATED' });
  });

  it('T14 ack EXISTING metric', () => {
    const { metrics, spies } = createMetricsSpy();
    recordLongitudinalReconciliationAckOutcome(metrics, 'EXISTING');
    expect(spies.ackInc).toHaveBeenCalledWith({ outcome: 'EXISTING' });
  });

  it('T15 metric failure cannot affect ack recording path (fail-open)', () => {
    const metrics = {
      batteryLongitudinalReconciliationAckTotal: {
        inc: () => {
          throw new Error('prometheus down');
        },
      },
    } as unknown as TripMetricsService;
    expect(() => recordLongitudinalReconciliationAckOutcome(metrics, 'CREATED')).not.toThrow();
  });

  it('T19 metric families use bounded labels only', async () => {
    const metrics = new TripMetricsService();
    recordLongitudinalReconciliationSchedulerTick(metrics, {
      result: 'COMPLETED',
      durationSeconds: 0.01,
      candidateCount: 1,
    });
    recordLongitudinalReconciliationTickOutcomes(metrics, {
      status: 'COMPLETED',
      candidateCount: 1,
      processedCount: 1,
      createdCount: 1,
      existingCount: 0,
      d1RejectedCount: 0,
      d2RejectedCount: 0,
      errorCount: 0,
    });
    recordLongitudinalReconciliationAckOutcome(metrics, 'CREATED');
    const text = await metrics.getMetrics();
    const forbidden = [
      'organization_id',
      'organizationId',
      'vehicle_id',
      'vehicleId',
      'revision_id',
      'revisionId',
      'fingerprint',
      'vin',
      'candidate_id',
    ];
    const families = [
      'synqdrive_battery_longitudinal_reconciliation_ticks_total',
      'synqdrive_battery_longitudinal_reconciliation_candidates',
      'synqdrive_battery_longitudinal_reconciliation_processed_total',
      'synqdrive_battery_longitudinal_reconciliation_ack_total',
      'synqdrive_battery_longitudinal_reconciliation_duration_seconds',
      'synqdrive_battery_longitudinal_reconciliation_last_success_timestamp',
    ];
    for (const family of families) {
      expect(text).toContain(family);
      const block = text.split(`# TYPE ${family}`)[1]?.split('\n#')[0] ?? text;
      for (const label of forbidden) {
        expect(block).not.toContain(`${label}=`);
      }
    }
  });

  it('processed outcome sum invariant fails tests directly; recording path fail-open', () => {
    const bad: LongitudinalReconciliationTickOutcome = {
      status: 'COMPLETED',
      candidateCount: 1,
      processedCount: 2,
      createdCount: 1,
      existingCount: 0,
      d1RejectedCount: 0,
      d2RejectedCount: 0,
      errorCount: 0,
    };
    expect(() => assertLongitudinalReconciliationProcessedOutcomeSum(bad)).toThrow(
      /processed outcome sum/,
    );
    const { metrics } = createMetricsSpy();
    expect(() => recordLongitudinalReconciliationTickOutcomes(metrics, bad)).not.toThrow();
  });
});

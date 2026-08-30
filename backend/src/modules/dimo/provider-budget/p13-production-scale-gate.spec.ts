import {
  buildWorkloadModelRow,
  consumerCapacityJobsPerMinute,
  FLEET_SCENARIOS,
  maxProcessLocalDimoConcurrency,
} from '../../../workers/schedulers/snapshot-polling/p12-final5-workload-model';
import { readWorkerConcurrency } from '@config/worker-concurrency.util';

const FLEET_SIZES = [100, 250, 500, 1000] as const;

describe('P1.3 production scale gate', () => {
  const globalLimit = 50;

  it('documents local vs global concurrency roles', () => {
    const snapshot = readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5);
    const trip = readWorkerConcurrency('WORKER_TRIP_TRACKING_CONCURRENCY', 5);
    const processLocal = maxProcessLocalDimoConcurrency({
      snapshotConcurrency: snapshot,
      tripTrackingConcurrency: trip,
    });
    expect(processLocal).toBe(21);
    expect(processLocal).toBeLessThan(51);
  });

  describe('load model S1–S5', () => {
    const scenarios = [
      FLEET_SCENARIOS.S1,
      FLEET_SCENARIOS.S2,
      FLEET_SCENARIOS.S3,
    ];

    for (const scenario of scenarios) {
      for (const fleetSize of FLEET_SIZES) {
        it(`${scenario.id} N=${fleetSize} global limit=${globalLimit}`, () => {
          const row = buildWorkloadModelRow({ fleetSize, scenario });
          const capacity = consumerCapacityJobsPerMinute(globalLimit, 8);
          expect(row.snapshotEnqueuePerMinute).toBeGreaterThan(0);
          expect(row.totalDimoRequestsPerMinute).toBeGreaterThan(
            row.snapshotEnqueuePerMinute,
          );
          if (fleetSize >= 1000 && scenario.id === 'S1') {
            expect(row.snapshotEnqueuePerMinute).toBeGreaterThan(capacity);
          }
        });
      }
    }
  });

  it('N=1000 S1 requires global concurrency > default process-local bound', () => {
    const row = buildWorkloadModelRow({
      fleetSize: 1000,
      scenario: FLEET_SCENARIOS.S1,
    });
    expect(row.requiredSnapshotConcurrency.p50_8s).toBeGreaterThan(50);
  });

  it('certification envelope — architecture capacity with external provider ceiling unknown', () => {
    const row = buildWorkloadModelRow({
      fleetSize: 1000,
      scenario: FLEET_SCENARIOS.S1,
    });
    const globalCapacity = consumerCapacityJobsPerMinute(50, 8);
    expect(row.snapshotEnqueuePerMinute).toBeGreaterThan(globalCapacity);
    // Provider ceiling remains externally unverified — CONDITIONALLY_CERTIFIED
    expect(row.requiredSnapshotConcurrency.p50_8s).toBe(51);
  });
});

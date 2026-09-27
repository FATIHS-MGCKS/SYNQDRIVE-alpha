import {
  getBatteryV2LongitudinalReconciliationBatchSize,
  getBatteryV2LongitudinalReconciliationIntervalMs,
  LONGITUDINAL_RECONCILIATION_BATCH_DEFAULT,
  LONGITUDINAL_RECONCILIATION_BATCH_MAX,
  LONGITUDINAL_RECONCILIATION_INTERVAL_DEFAULT_MS,
  LONGITUDINAL_RECONCILIATION_INTERVAL_MIN_MS,
} from './longitudinal-reconciliation.config';

describe('longitudinal-reconciliation.config', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('defaults interval to 900000 and batch to 2', () => {
    delete process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS;
    delete process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE;
    expect(getBatteryV2LongitudinalReconciliationIntervalMs()).toBe(
      LONGITUDINAL_RECONCILIATION_INTERVAL_DEFAULT_MS,
    );
    expect(getBatteryV2LongitudinalReconciliationBatchSize()).toBe(
      LONGITUDINAL_RECONCILIATION_BATCH_DEFAULT,
    );
  });

  it('clamps interval to minimum 300000', () => {
    process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS = '1000';
    expect(getBatteryV2LongitudinalReconciliationIntervalMs()).toBe(
      LONGITUDINAL_RECONCILIATION_INTERVAL_MIN_MS,
    );
  });

  it('caps batch at 5 and rejects malformed integers', () => {
    process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE = '99';
    expect(getBatteryV2LongitudinalReconciliationBatchSize()).toBe(
      LONGITUDINAL_RECONCILIATION_BATCH_MAX,
    );
    process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE = '1.5';
    expect(getBatteryV2LongitudinalReconciliationBatchSize()).toBe(
      LONGITUDINAL_RECONCILIATION_BATCH_DEFAULT,
    );
    process.env.BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE = '1e2';
    expect(getBatteryV2LongitudinalReconciliationBatchSize()).toBe(
      LONGITUDINAL_RECONCILIATION_BATCH_DEFAULT,
    );
  });
});

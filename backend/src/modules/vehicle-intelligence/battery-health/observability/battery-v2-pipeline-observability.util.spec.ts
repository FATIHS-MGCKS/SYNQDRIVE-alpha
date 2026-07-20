import {
  bucketPublicationAgeHours,
  computePublicationEvidenceAgeHours,
  fingerprintBatteryV2IdempotencyKey,
  fingerprintBatteryV2JobId,
  formatBatteryV2PipelineLog,
} from './battery-v2-pipeline-observability.util';

describe('battery-v2-pipeline-observability.util', () => {
  it('formats structured pipeline logs without raw idempotency keys', () => {
    const line = formatBatteryV2PipelineLog({
      component: 'enqueue',
      event: 'enqueue_success',
      status: 'completed',
      jobType: 'BATTERY_REST_TARGET_EVALUATE',
      organizationId: 'clorg1234567890123456789012',
      vehicleId: 'clveh1234567890123456789012',
      keyFp: fingerprintBatteryV2IdempotencyKey('rest-target:veh:REST_60M:123'),
      jobIdFp: fingerprintBatteryV2JobId('battery-v2:rest-target:veh:REST_60M:123'),
      correlationId: 'corr-1',
    });

    const parsed = JSON.parse(line);
    expect(parsed.component).toBe('enqueue');
    expect(parsed.keyFp).toMatch(/^[a-f0-9]{12}$/);
    expect(parsed.jobIdFp).toMatch(/^[a-f0-9]{12}$/);
    expect(parsed).not.toHaveProperty('idempotencyKey');
    expect(parsed).not.toHaveProperty('jobId');
    expect(parsed).not.toHaveProperty('vin');
  });

  it('buckets publication age into low-cardinality labels', () => {
    expect(bucketPublicationAgeHours(null)).toBe('unknown');
    expect(bucketPublicationAgeHours(0.5)).toBe('lt_1h');
    expect(bucketPublicationAgeHours(3)).toBe('1_6h');
    expect(bucketPublicationAgeHours(12)).toBe('6_24h');
    expect(bucketPublicationAgeHours(48)).toBe('1_7d');
    expect(bucketPublicationAgeHours(24 * 10)).toBe('gt_7d');
  });

  it('computes publication evidence age in hours', () => {
    const now = new Date('2026-07-20T12:00:00.000Z');
    const first = '2026-07-19T12:00:00.000Z';
    expect(computePublicationEvidenceAgeHours(first, now)).toBe(24);
    expect(computePublicationEvidenceAgeHours(null, now)).toBeNull();
  });
});

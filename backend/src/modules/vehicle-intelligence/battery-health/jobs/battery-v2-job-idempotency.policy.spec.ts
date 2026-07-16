import {
  buildAssessmentJobIdempotencyKey,
  buildCapabilityRefreshJobIdempotencyKey,
  buildHvCapacityJobIdempotencyKey,
  buildHvSessionJobIdempotencyKey,
  buildObservationJobIdempotencyKey,
  buildPublicationJobIdempotencyKey,
  buildRestTargetJobIdempotencyKey,
  buildStartProxyJobIdempotencyKey,
} from './battery-v2-job-idempotency.policy';

const VEH = 'clveh1234567890123456789012';
const ORG = 'clorg1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';
const ASSESS = 'classess123456789012345678901';
const SESSION = 'clsess123456789012345678901';

describe('battery-v2-job-idempotency.policy', () => {
  it('builds observation identity from vehicle + signal + provider + observedAt + value', () => {
    const observedAt = new Date('2026-07-16T12:00:00.000Z');
    const key = buildObservationJobIdempotencyKey({
      organizationId: ORG,
      vehicleId: VEH,
      signalName: 'lowVoltageBatteryCurrentVoltage',
      providerSource: 'DIMO',
      observedAt,
      normalizedValue: 12.4,
    });
    expect(key).toMatch(/^battery-obs:/);
    expect(key).toContain(ORG);
    expect(key).toContain(VEH);
    expect(key).toContain(String(observedAt.getTime()));
    expect(key).toContain('12.4');
  });

  it('builds rest target identity from vehicle + window + target type', () => {
    const startedAt = new Date('2026-07-16T08:00:00.000Z');
    const key = buildRestTargetJobIdempotencyKey({
      vehicleId: VEH,
      restWindowStartedAt: startedAt,
      restTargetType: 'REST_6H',
    });
    expect(key).toBe(`rest-target:${VEH}:REST_6H:${startedAt.getTime()}`);
  });

  it('builds start proxy identity from trip id + model version', () => {
    const key = buildStartProxyJobIdempotencyKey({ tripId: TRIP, modelVersion: '1.0.0' });
    expect(key).toBe(`start-proxy:1.0.0:trip:${TRIP}`);
  });

  it('builds assessment identity from vehicle + type + input version', () => {
    const key = buildAssessmentJobIdempotencyKey({
      vehicleId: VEH,
      assessmentType: 'LV_CRANK',
      inputVersion: 3,
    });
    expect(key).toBe(`assess:${VEH}:LV_CRANK:3`);
  });

  it('builds publication identity from assessment id + publication version', () => {
    const key = buildPublicationJobIdempotencyKey({
      assessmentId: ASSESS,
      publicationVersion: '2',
    });
    expect(key).toBe(`pub:${ASSESS}:v2`);
  });

  it('builds HV session identity from vehicle + segment fingerprint', () => {
    const key = buildHvSessionJobIdempotencyKey({
      vehicleId: VEH,
      segmentFingerprint: 'seg-abc123',
    });
    expect(key).toBe(`hv-session:${VEH}:seg-abc123`);
  });

  it('builds HV capacity identity from session + method + model version', () => {
    const key = buildHvCapacityJobIdempotencyKey({
      chargeSessionId: SESSION,
      method: 'DELTA_SOC',
      modelVersion: '1.0.0',
    });
    expect(key).toBe(`hv-cap:${SESSION}:DELTA_SOC:m1.0.0`);
  });

  it('builds capability refresh identity from vehicle + provider + signal scope + trigger', () => {
    const key = buildCapabilityRefreshJobIdempotencyKey({
      vehicleId: VEH,
      providerSource: 'DIMO',
      signalScope: 'HV_TELEMETRY',
      trigger: 'PERIODIC',
      periodBucket: '42',
    });
    expect(key).toBe(`cap-refresh:${VEH}:DIMO:HV_TELEMETRY:PERIODIC:42`);
  });
});

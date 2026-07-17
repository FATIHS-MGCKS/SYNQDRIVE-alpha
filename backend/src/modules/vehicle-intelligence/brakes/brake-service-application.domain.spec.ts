import {
  buildBrakeServiceIdempotencyKey,
  hashBrakeServiceRequest,
} from './brake-service-application.domain';

describe('brake-service-application.domain', () => {
  it('builds stable idempotency keys', () => {
    const key = buildBrakeServiceIdempotencyKey({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      clientRequestId: 'req-42',
    });
    expect(key).toBe('brake:org-1:veh-1:req-42');
  });

  it('hashes request payloads deterministically', () => {
    const a = hashBrakeServiceRequest({ kind: 'pads_service', scope: ['front_pads'] });
    const b = hashBrakeServiceRequest({ scope: ['front_pads'], kind: 'pads_service' });
    expect(a).toBe(b);
  });
});

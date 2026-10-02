import {
  buildR9ProviderWakeCorrelationContext,
  buildR9WakePayloadFingerprint,
  computeWakeCorrelationId,
  extractProviderDeliveryId,
  resolveR9DegradedIdentityStrategy,
} from './r9-wake-correlation.util';
import { WAKE_CORRELATION_ID_VERSION } from './r9-wake-correlation.constants';

const ORG_A = 'org-a-00000000-0000-0000-0000-000000000001';
const ORG_B = 'org-b-00000000-0000-0000-0000-000000000002';
const VEH_1 = 'veh-1-00000000-0000-0000-0000-000000000001';
const VEH_2 = 'veh-2-00000000-0000-0000-0000-000000000002';

describe('r9-wake-correlation.util', () => {
  const receivedAt = new Date('2026-10-01T12:00:00.000Z');
  const observedAt = new Date('2026-10-01T11:59:50.000Z');

  it('produces deterministic correlation ID for the same event', () => {
    const a = buildR9ProviderWakeCorrelationContext({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 187361,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: observedAt,
      receivedAt,
      providerDeliveryId: 'cloud-event-abc',
    });
    const b = buildR9ProviderWakeCorrelationContext({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 187361,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: observedAt,
      receivedAt: new Date('2026-10-01T12:00:05.000Z'),
      providerDeliveryId: 'cloud-event-abc',
    });
    expect(a.wakeCorrelationId).toBe(b.wakeCorrelationId);
    expect(a.wakeCorrelationVersion).toBe(WAKE_CORRELATION_ID_VERSION);
  });

  it('differs across organizations', () => {
    const base = {
      vehicleId: VEH_1,
      dimoTokenId: 1,
      signalName: 'speed' as const,
      wakeReason: 'SPEED_MOVEMENT' as const,
      providerObservedAt: observedAt,
      receivedAt,
      providerDeliveryId: 'evt-1',
    };
    const a = buildR9ProviderWakeCorrelationContext({ ...base, organizationId: ORG_A });
    const b = buildR9ProviderWakeCorrelationContext({ ...base, organizationId: ORG_B });
    expect(a.wakeCorrelationId).not.toBe(b.wakeCorrelationId);
  });

  it('differs across vehicles', () => {
    const base = {
      organizationId: ORG_A,
      dimoTokenId: 1,
      signalName: 'speed' as const,
      wakeReason: 'SPEED_MOVEMENT' as const,
      providerObservedAt: observedAt,
      receivedAt,
      providerDeliveryId: 'evt-1',
    };
    const a = buildR9ProviderWakeCorrelationContext({ ...base, vehicleId: VEH_1 });
    const b = buildR9ProviderWakeCorrelationContext({ ...base, vehicleId: VEH_2 });
    expect(a.wakeCorrelationId).not.toBe(b.wakeCorrelationId);
  });

  it('uses provider delivery id precedence over observed-at hash', () => {
    const strategy = resolveR9DegradedIdentityStrategy({
      providerDeliveryId: 'evt-99',
      providerObservedAt: observedAt,
      payloadFingerprint: 'abc',
    });
    expect(strategy).toBe('PROVIDER_DELIVERY_ID');
  });

  it('falls back deterministically when providerObservedAt is null', () => {
    const fp = buildR9WakePayloadFingerprint({
      dimoTokenId: 1,
      signalName: 'isIgnitionOn',
      wakeReason: 'IGNITION_ON',
      providerObservedAt: null,
      value: true,
    });
    const id1 = computeWakeCorrelationId({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 1,
      signalName: 'isIgnitionOn',
      wakeReason: 'IGNITION_ON',
      providerObservedAt: null,
      providerDeliveryId: null,
      payloadFingerprint: fp,
    });
    const id2 = computeWakeCorrelationId({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 1,
      signalName: 'isIgnitionOn',
      wakeReason: 'IGNITION_ON',
      providerObservedAt: null,
      providerDeliveryId: null,
      payloadFingerprint: fp,
    });
    expect(id1).toBe(id2);
    expect(resolveR9DegradedIdentityStrategy({
      providerDeliveryId: null,
      providerObservedAt: null,
      payloadFingerprint: fp,
    })).toBe('PAYLOAD_FINGERPRINT');
  });

  it('materially different events produce different IDs', () => {
    const a = buildR9ProviderWakeCorrelationContext({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 1,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: observedAt,
      receivedAt,
    });
    const b = buildR9ProviderWakeCorrelationContext({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 1,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: new Date('2026-10-01T11:58:00.000Z'),
      receivedAt,
    });
    expect(a.wakeCorrelationId).not.toBe(b.wakeCorrelationId);
  });

  it('extracts cloud event id from payload', () => {
    expect(
      extractProviderDeliveryId({
        id: 'ce-123',
        type: 'dimo.trigger',
        data: { signal: { name: 'speed', value: 10 } },
      }),
    ).toBe('ce-123');
  });

  it('preserves distinct providerObservedAt and receivedAt on context', () => {
    const ctx = buildR9ProviderWakeCorrelationContext({
      organizationId: ORG_A,
      vehicleId: VEH_1,
      dimoTokenId: 1,
      signalName: 'speed',
      wakeReason: 'SPEED_MOVEMENT',
      providerObservedAt: observedAt,
      receivedAt,
    });
    expect(ctx.providerObservedAt).toBe(observedAt.toISOString());
    expect(ctx.receivedAt).toBe(receivedAt.toISOString());
    expect(ctx.providerObservedAt).not.toBe(ctx.receivedAt);
  });
});

import { parseDiV0S4DiscoveryTripEndNotBefore } from '../di-v0-s4b-discovery-containment';
import { isDiV0S4DiscoveryConfigured } from '../di-v0-s4b-config';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';

const ON = parseDiV0S4ControlPlaneConfig({
  DI_V0_S4_MASTER_ENABLED: 'true',
  DI_V0_S4_DISCOVERY_ENABLED: 'true',
  DI_V0_S4_POSITION_ENABLED: 'true',
  DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-1',
  DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1',
});

describe('DI_V0_S4 discovery trip-end NOT_BEFORE containment', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');

  it('missing/malformed/future fail closed', () => {
    expect(parseDiV0S4DiscoveryTripEndNotBefore(undefined, now).kind).toBe('UNAVAILABLE');
    expect(parseDiV0S4DiscoveryTripEndNotBefore('not-a-date', now).kind).toBe('UNAVAILABLE');
    expect(parseDiV0S4DiscoveryTripEndNotBefore('2030-01-01T00:00:00.000Z', now).kind).toBe('UNAVAILABLE');
  });

  it('valid ISO parses AVAILABLE', () => {
    const r = parseDiV0S4DiscoveryTripEndNotBefore('2026-09-01T00:00:00.000Z', now);
    expect(r).toEqual({ kind: 'AVAILABLE', notBeforeUtc: new Date('2026-09-01T00:00:00.000Z') });
  });

  it('discovery configured requires valid containment', () => {
    expect(isDiV0S4DiscoveryConfigured(ON, { kind: 'UNAVAILABLE', reason: 'MISSING' })).toBe(false);
    expect(
      isDiV0S4DiscoveryConfigured(ON, { kind: 'AVAILABLE', notBeforeUtc: new Date('2026-09-01T00:00:00.000Z') }),
    ).toBe(true);
  });

  it('first-Tiny KS MS 661 allowlists stay narrow (no wildcard expansion)', () => {
    const ksMs661 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_DISCOVERY_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_R1_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      DI_V0_S4_VEHICLE_ALLOWLIST: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    });
    const cutoff = parseDiV0S4DiscoveryTripEndNotBefore('2026-10-01T00:00:00.000Z', now);
    expect(isDiV0S4DiscoveryConfigured(ksMs661, cutoff)).toBe(true);
    expect(ksMs661.organizationAllowlist).toEqual(new Set(['faa710c9-6d91-4079-a7d5-91fdccdec14a']));
    expect(ksMs661.vehicleAllowlist).toEqual(new Set(['c10351f8-b6a2-4258-947f-631aeaa6d359']));
    const tesla = parseDiV0S4ControlPlaneConfig({
      ...{
        DI_V0_S4_MASTER_ENABLED: 'true',
        DI_V0_S4_DISCOVERY_ENABLED: 'true',
        DI_V0_S4_POSITION_ENABLED: 'true',
        DI_V0_S4_ORGANIZATION_ALLOWLIST: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
        DI_V0_S4_VEHICLE_ALLOWLIST: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      },
      DI_V0_S4_VEHICLE_ALLOWLIST: '00000000-0000-0000-0000-000000000099',
    });
    expect(isDiV0S4DiscoveryConfigured(tesla, cutoff)).toBe(true);
    expect(tesla.vehicleAllowlist.has('c10351f8-b6a2-4258-947f-631aeaa6d359')).toBe(false);
  });
});

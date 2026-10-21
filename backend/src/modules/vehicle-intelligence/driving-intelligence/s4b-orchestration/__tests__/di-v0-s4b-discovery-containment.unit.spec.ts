import {
  formatDiV0S4DiscoveryTripEndNotBeforeCanonical,
  parseDiV0S4DiscoveryTripEndNotBefore,
} from '../di-v0-s4b-discovery-containment';
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

  it('accepts canonical UTC Z timestamps only', () => {
    const valid = '2026-10-01T12:00:00.000Z';
    const r = parseDiV0S4DiscoveryTripEndNotBefore(valid, now);
    expect(r).toEqual({ kind: 'AVAILABLE', notBeforeUtc: new Date(valid) });
    if (r.kind !== 'AVAILABLE') throw new Error('expected AVAILABLE');
    expect(formatDiV0S4DiscoveryTripEndNotBeforeCanonical(r.notBeforeUtc.getTime())).toBe(valid);
  });

  it('accepts leap-day canonical timestamp', () => {
    const leap = '2024-02-29T12:00:00.000Z';
    expect(parseDiV0S4DiscoveryTripEndNotBefore(leap, now)).toEqual({
      kind: 'AVAILABLE',
      notBeforeUtc: new Date(leap),
    });
  });

  it('rejects non-canonical and invalid inputs (fail-closed)', () => {
    const reject = [
      '2026-10-01',
      '2026-10-01T12:00:00',
      '2026-10-01T12:00:00+02:00',
      '2026-10-01T12:00:00.000+00:00',
      '2026-02-30T12:00:00.000Z',
      '2026-13-01T12:00:00.000Z',
      '2026-10-01T25:00:00.000Z',
      'garbage',
      '',
      undefined,
      '  ',
    ];
    for (const raw of reject) {
      const r = parseDiV0S4DiscoveryTripEndNotBefore(raw, now);
      expect(r.kind).toBe('UNAVAILABLE');
    }
  });

  it('rejects future canonical timestamp', () => {
    expect(parseDiV0S4DiscoveryTripEndNotBefore('2030-01-01T00:00:00.000Z', now).kind).toBe('UNAVAILABLE');
  });

  it('trims surrounding whitespace before validation', () => {
    expect(parseDiV0S4DiscoveryTripEndNotBefore('  2026-09-01T00:00:00.000Z  ', now).kind).toBe('AVAILABLE');
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

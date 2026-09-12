import {
  buildBindingScopeFromToken,
  buildDeviceConnectionBindingKey,
  normalizeConnectivityProvider,
} from './device-connection-physical-state.binding';

describe('device-connection-physical-state.binding', () => {
  it('normalizes provider casing deterministically', () => {
    expect(normalizeConnectivityProvider('dimo')).toBe('DIMO');
    expect(normalizeConnectivityProvider(' DIMO ')).toBe('DIMO');
  });

  it('uses providerDeviceIdHash as sole binding key discriminator', () => {
    const hash = 'abc123hash';
    expect(
      buildDeviceConnectionBindingKey({ provider: 'DIMO', providerDeviceIdHash: hash }),
    ).toBe('DIMO:device:abc123hash');
  });

  it('converges webhook and snapshot paths to the same bindingKey', () => {
    const tokenId = 187336;
    const withoutLink = buildBindingScopeFromToken({
      provider: 'dimo',
      tokenId,
    });
    const withLink = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId,
      deviceBindingId: 'link-uuid-123',
    });
    expect(withoutLink.bindingKey).toBe(withLink.bindingKey);
    expect(withLink.deviceBindingId).toBe('link-uuid-123');
    expect(withoutLink.providerDeviceIdHash).toBe(withLink.providerDeviceIdHash);
  });

  it('distinguishes device replacement via new token hash', () => {
    const a = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 1 });
    const b = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 2 });
    expect(a.bindingKey).not.toBe(b.bindingKey);
  });
});

import { describe, expect, it } from 'vitest';
import { grantsVisibleForClient } from './known-scopes';
import { clearOneTimeSecretState } from './CoreAppServiceClientsHub';

describe('service client UI helpers', () => {
  it('grantsVisibleForClient requires matching loaded client', () => {
    expect(grantsVisibleForClient('a', 'a')).toBe(true);
    expect(grantsVisibleForClient('a', 'b')).toBe(false);
    expect(grantsVisibleForClient(null, 'a')).toBe(false);
  });

  it('clearOneTimeSecretState only clears when secret present', () => {
    let cleared = false;
    clearOneTimeSecretState(null, () => {
      cleared = true;
    });
    expect(cleared).toBe(false);
    clearOneTimeSecretState('secret', () => {
      cleared = true;
    });
    expect(cleared).toBe(true);
  });
});
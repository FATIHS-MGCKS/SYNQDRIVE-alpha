import { describe, expect, it, vi } from 'vitest';
import { clearOneTimeSecretState } from './CoreAppServiceClientsHub';

describe('CoreAppServiceClientsHub — one-time secret', () => {
  it('clears secret from UI state on dismiss', () => {
    const onClear = vi.fn();
    clearOneTimeSecretState('super-secret', onClear);
    expect(onClear).toHaveBeenCalledTimes(1);
    clearOneTimeSecretState(null, onClear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
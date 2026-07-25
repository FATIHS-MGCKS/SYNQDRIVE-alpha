import { describe, expect, it } from 'vitest';
import {
  assertNoOperatorSensitiveLocalStorage,
  isOperatorSensitiveStorageKey,
  purgeOperatorSensitiveSessionState,
} from './operatorClientPrivacy';

describe('operatorClientPrivacy', () => {
  it('flags operator storage key prefix', () => {
    expect(isOperatorSensitiveStorageKey('synqdrive:operator:signature')).toBe(true);
    expect(isOperatorSensitiveStorageKey('theme')).toBe(false);
  });

  it('purges sensitive keys from in-memory state', () => {
    const state = {
      odometerKm: '12000',
      customerSigData: 'data:image/png;base64,abc',
      staffSigData: 'data:image/png;base64,def',
    };
    const purged = purgeOperatorSensitiveSessionState(state, [
      'customerSigData',
      'staffSigData',
    ]);
    expect(purged.customerSigData).toBeNull();
    expect(purged.staffSigData).toBeNull();
    expect(purged.odometerKm).toBe('12000');
  });

  it('assertNoOperatorSensitiveLocalStorage is safe without window', () => {
    expect(() => assertNoOperatorSensitiveLocalStorage()).not.toThrow();
  });
});

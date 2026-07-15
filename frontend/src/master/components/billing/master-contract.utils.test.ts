import { describe, expect, it } from 'vitest';
import {
  createMasterContractIdempotencyKey,
  domainStatusLabel,
  mapMasterContractError,
  syncStatusLabel,
  tariffLabelFromRow,
} from './master-contract.utils';

describe('master contract utils', () => {
  it('maps known backend error codes to German copy', () => {
    expect(mapMasterContractError(new Error('[SUBSCRIPTION_NOT_FOUND] missing'))).toBe(
      'Für diese Organisation existiert kein Vertrag.',
    );
    expect(mapMasterContractError(new Error('optimistic lock conflict'))).toContain(
      'zwischenzeitlich geändert',
    );
  });

  it('creates stable idempotency key prefix', () => {
    const key = createMasterContractIdempotencyKey('activate', 'org-1');
    expect(key.startsWith('master-contract:activate:org-1:')).toBe(true);
  });

  it('labels domain and sync states in German', () => {
    expect(domainStatusLabel('TRIALING')).toBe('Testphase');
    expect(syncStatusLabel('PARTIAL')).toBe('Teilweise');
    expect(tariffLabelFromRow(null, 'RENTAL')).toBe('Rental');
  });
});

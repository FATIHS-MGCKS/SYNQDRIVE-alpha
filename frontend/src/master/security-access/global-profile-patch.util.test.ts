import { describe, expect, it } from 'vitest';
import { buildChangedProfilePatch, profileDtoToDraft } from './global-profile-patch.util';

describe('global-profile-patch.util', () => {
  const base = {
    name: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+49111',
    mobile: null,
    address: null,
    language: 'en',
    timezone: 'Europe/Berlin',
    dateFormat: 'DD.MM.YYYY',
  };

  it('sends only changed fields', () => {
    const draft = profileDtoToDraft(base);
    draft.firstName = 'Augusta';
    const patch = buildChangedProfilePatch(base, draft);
    expect(patch).toEqual({ firstName: 'Augusta' });
  });

  it('allows intentional phone clear', () => {
    const draft = profileDtoToDraft(base);
    draft.phone = '';
    const patch = buildChangedProfilePatch(base, draft);
    expect(patch).toEqual({ phone: null });
  });

  it('returns null patch when unchanged', () => {
    const draft = profileDtoToDraft(base);
    expect(buildChangedProfilePatch(base, draft)).toBeNull();
  });
});
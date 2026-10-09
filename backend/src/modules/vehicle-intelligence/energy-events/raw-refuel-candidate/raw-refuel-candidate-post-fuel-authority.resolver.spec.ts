import {
  parsePostFuelAuthorityMeta,
  resolveStoredEffectivePostFuelAuthority,
} from './raw-refuel-candidate-post-fuel-authority.resolver';

describe('post-fuel authority resolver', () => {
  it('infers PEAK only when legacy authority key is absent', () => {
    expect(resolveStoredEffectivePostFuelAuthority({
      storedDetectionVersion: 'rfrf-rise-v1',
      evidenceMeta: null,
    })).toBe('PEAK_INSTANTANEOUS');
    expect(resolveStoredEffectivePostFuelAuthority({
      storedDetectionVersion: 'rfrf-rise-v1',
      evidenceMeta: {},
    })).toBe('PEAK_INSTANTANEOUS');
    expect(resolveStoredEffectivePostFuelAuthority({
      storedDetectionVersion: 'rfrf-rise-v1',
      evidenceMeta: { otherField: true },
    })).toBe('PEAK_INSTANTANEOUS');
  });

  it('does not infer PEAK when legacy authority key is malformed', () => {
    expect(parsePostFuelAuthorityMeta({ postFuelAuthority: 'BOGUS' }).kind).toBe('INVALID');
    expect(parsePostFuelAuthorityMeta({ postFuelAuthority: 123 }).kind).toBe('INVALID');
    expect(parsePostFuelAuthorityMeta({ postFuelAuthority: null }).kind).toBe('INVALID');
    expect(
      resolveStoredEffectivePostFuelAuthority({
        storedDetectionVersion: 'rfrf-rise-v1',
        evidenceMeta: { postFuelAuthority: 'BOGUS' },
      }),
    ).toBeNull();
  });
});

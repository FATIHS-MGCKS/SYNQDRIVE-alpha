import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import {
  EXP021_UNKNOWN_RUNTIME_BUILD_SHA,
  resolveExp021MaturationShadowRuntimeBuildSha,
} from './reference-capture-exp021-maturation-shadow-runtime-sha.lib';

describe('resolveExp021MaturationShadowRuntimeBuildSha', () => {
  it('returns unknown when disabled-default and not required', () => {
    expect(resolveExp021MaturationShadowRuntimeBuildSha({ env: {}, required: false })).toBe(
      EXP021_UNKNOWN_RUNTIME_BUILD_SHA,
    );
  });

  it('fails closed when required and missing', () => {
    expect(() => resolveExp021MaturationShadowRuntimeBuildSha({ env: {}, required: true })).toThrow(
      Exp021MaturationShadowFamilyIdentityError,
    );
  });

  it('returns concrete sha when env present', () => {
    expect(
      resolveExp021MaturationShadowRuntimeBuildSha({
        env: { GITHUB_SHA: 'abc123def4567890abc123def4567890abc123de' },
        required: true,
      }),
    ).toBe('abc123def4567890abc123def4567890abc123de');
  });
});

import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';

export const EXP021_UNKNOWN_RUNTIME_BUILD_SHA = 'unknown-runtime-sha';

/**
 * Runtime/build SHA authority for maturation shadow enrollment and attempts.
 * When `required` is true (enabled execution), fail closed if SHA is unknown.
 */
export function resolveExp021MaturationShadowRuntimeBuildSha(
  options: { required?: boolean; env?: NodeJS.ProcessEnv } = {},
): string {
  const env = options.env ?? process.env;
  const candidates = [
    env.SYNQDRIVE_DEPLOY_GIT_SHA,
    env.SYNQDRIVE_RUNTIME_BUILD_SHA,
    env.GITHUB_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
  ];
  for (const value of candidates) {
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  if (options.required) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Authoritative runtime build SHA is required when EXP-021 maturation shadow is enabled',
    );
  }

  return EXP021_UNKNOWN_RUNTIME_BUILD_SHA;
}

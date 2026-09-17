/**
 * Runtime/build SHA authority for maturation shadow enrollment and attempts.
 */
export function resolveExp021MaturationShadowRuntimeBuildSha(
  env: NodeJS.ProcessEnv = process.env,
): string {
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
  return 'unknown-runtime-sha';
}

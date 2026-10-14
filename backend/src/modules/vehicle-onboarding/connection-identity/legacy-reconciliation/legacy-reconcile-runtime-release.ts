const RELEASE_GIT_SHA_ENV = 'SYNQDRIVE_RELEASE_GIT_SHA';

/** Runtime release identity — set by VPS deploy / operator shell (not committed per-release SHA). */
export function resolveLegacyReconcileRuntimeReleaseGitSha(): string {
  const fromEnv = process.env[RELEASE_GIT_SHA_ENV]?.trim();
  if (!fromEnv) {
    throw new Error('LEGACY_RECONCILE_RUNTIME_RELEASE_SHA_UNRESOLVED');
  }
  if (!/^[0-9a-f]{40}$/i.test(fromEnv)) {
    throw new Error('LEGACY_RECONCILE_RUNTIME_RELEASE_SHA_INVALID');
  }
  return fromEnv.toLowerCase();
}

export function assertLegacyReconcileRuntimeReleaseMatches(approvedReleaseSha: string): void {
  const runtime = resolveLegacyReconcileRuntimeReleaseGitSha();
  const approved = approvedReleaseSha.trim().toLowerCase();
  if (runtime !== approved) {
    throw new Error('LEGACY_RECONCILE_RUNTIME_RELEASE_SHA_MISMATCH');
  }
}

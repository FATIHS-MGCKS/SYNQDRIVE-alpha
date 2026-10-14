/** Committed operator admission registry — not writable at runtime without code review. */
export const VO_SIG_B1_TRUSTED_RELEASE_SHA_REGISTRY: ReadonlySet<string> = new Set([
  // PostgreSQL integration / CI admission (tests + VO-2 B1 gate).
  'b1-pg-trusted-release-sha',
]);

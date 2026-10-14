/**
 * CI / ephemeral PostgreSQL admission only.
 * Production release SHA is **not** committed here (self-referential SHA problem).
 * Production execute uses owner-issued authorization bound to runtime `SYNQDRIVE_RELEASE_GIT_SHA`.
 */
export const VO_SIG_B1_TRUSTED_RELEASE_SHA_REGISTRY: ReadonlySet<string> = new Set([
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
]);

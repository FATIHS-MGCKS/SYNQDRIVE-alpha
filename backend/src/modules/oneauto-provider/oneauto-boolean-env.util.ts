/**
 * Strict boolean env parsing for OneAuto feature flags.
 * Unknown values resolve to `defaultValue` (never accidentally enable).
 */
export function readOneAutoBooleanEnv(
  name: string,
  defaultValue = false,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[name];
  if (raw == null || raw.trim() === '') {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return defaultValue;
}

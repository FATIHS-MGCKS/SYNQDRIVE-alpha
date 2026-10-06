export function isApdShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.WORKER_APD_SHADOW_ENABLED;
  if (raw == null || raw.trim() === '') return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** Log line emitted when automatic DIMO trigger bootstrap is off (default). */
export const DIMO_TRIGGER_BOOTSTRAP_DISABLED_LOG =
  'DIMO trigger bootstrap disabled; webhooks are managed manually in DIMO Developer Console.';

export function isDimoTriggerBootstrapEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (env.DIMO_TRIGGER_BOOTSTRAP_ENABLED ?? '').trim().toLowerCase() === 'true';
}

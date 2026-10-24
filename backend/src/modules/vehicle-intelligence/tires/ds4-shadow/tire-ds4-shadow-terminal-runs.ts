/** Sentinel DS4 run ids — terminal materialization markers (not load evidence). */
export const TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED =
  '00000000-0000-4000-a000-000000000001';
export const TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE =
  '00000000-0000-4000-a000-000000000002';

export const TIRE_DS4_SHADOW_TERMINAL_RUN_IDS = [
  TIRE_DS4_SHADOW_TERMINAL_RUN_RETRY_EXHAUSTED,
  TIRE_DS4_SHADOW_TERMINAL_RUN_DS4_NOT_AVAILABLE,
] as const;

export function isTireDs4ShadowTerminalRunId(runId: string): boolean {
  return (TIRE_DS4_SHADOW_TERMINAL_RUN_IDS as readonly string[]).includes(runId);
}

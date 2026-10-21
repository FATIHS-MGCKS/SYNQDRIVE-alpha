/**
 * Ops-wrapper preflight: S4 control-plane flags must remain off (S4F-4 global-budget rollout).
 */
import {
  DI_V0_S4_ENV_FLAGS,
  parseDiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';

export function assertDiV0S4OpsControlFlagsSafe(env: Readonly<Record<string, string | undefined>>): {
  ok: boolean;
  unsafeKeys: string[];
} {
  const cfg = parseDiV0S4ControlPlaneConfig(env);
  const unsafeKeys: string[] = [];
  if (cfg.masterEnabled) unsafeKeys.push(DI_V0_S4_ENV_FLAGS.master);
  if (cfg.discoveryEnabled) unsafeKeys.push(DI_V0_S4_ENV_FLAGS.discovery);
  if (cfg.workerEnabled) unsafeKeys.push(DI_V0_S4_ENV_FLAGS.worker);
  if (cfg.positionEnabled) unsafeKeys.push(DI_V0_S4_ENV_FLAGS.position);
  if (cfg.r1Enabled) unsafeKeys.push(DI_V0_S4_ENV_FLAGS.r1);
  if (cfg.nativeEnabled) unsafeKeys.push(DI_V0_S4_ENV_FLAGS.native);
  return { ok: unsafeKeys.length === 0, unsafeKeys };
}

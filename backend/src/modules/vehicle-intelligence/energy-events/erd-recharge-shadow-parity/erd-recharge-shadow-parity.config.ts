import { ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG } from './erd-recharge-shadow-parity.constants';

export function isErdRechargeShadowParityEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[ERD_RECHARGE_SHADOW_PARITY_ENV_FLAG];
  return raw === '1' || raw === 'true';
}

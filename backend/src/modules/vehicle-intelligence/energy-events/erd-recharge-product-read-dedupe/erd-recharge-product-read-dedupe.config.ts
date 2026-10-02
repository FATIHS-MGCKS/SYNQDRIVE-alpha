import { ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENV_FLAG } from './erd-recharge-product-read-dedupe.constants';

/** Strict gate: only `1` or `true` enables read dedupe; unset/0/false/other => OFF. */
export function isErdRechargeProductReadDedupeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[ERD_RECHARGE_PRODUCT_READ_DEDUPE_ENV_FLAG];
  return raw === '1' || raw === 'true';
}

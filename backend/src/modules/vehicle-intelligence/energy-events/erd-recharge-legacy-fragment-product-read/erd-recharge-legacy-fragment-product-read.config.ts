import { ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENV_FLAG } from './erd-recharge-legacy-fragment-product-read.constants';

/** Strict gate: only `1` or `true` enables legacy fragment product-read collapse; unset/0/false/other => OFF. */
export function isErdRechargeLegacyFragmentProductReadEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[ERD_RECHARGE_LEGACY_FRAGMENT_PRODUCT_READ_ENV_FLAG];
  return raw === '1' || raw === 'true';
}

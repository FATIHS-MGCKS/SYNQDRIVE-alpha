import {
  ERD_RECHARGE_WRITE_CUTOVER_AT_ENV,
  ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED_ENV,
} from './erd-recharge-write-authority.constants';

/** Strict: only canonical `true` (case/whitespace tolerant). Rejects 1/yes/on. */
export function parseErdRechargeWriteCutoverAuthorized(
  value: string | undefined,
): boolean {
  if (value == null || value.trim() === '') return false;
  return value.trim().toLowerCase() === 'true';
}

export function isErdRechargeWriteCutoverAuthorized(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return parseErdRechargeWriteCutoverAuthorized(
    env[ERD_RECHARGE_WRITE_CUTOVER_AUTHORIZED_ENV],
  );
}

/** Explicit ISO instant only — no implicit Date.now() or deployment defaults. */
export function parseErdRechargeWriteCutoverAt(
  value: string | undefined,
): Date | null {
  if (value == null || value.trim() === '') return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function resolveErdRechargeWriteCutoverAt(
  env: NodeJS.ProcessEnv = process.env,
): Date | null {
  return parseErdRechargeWriteCutoverAt(env[ERD_RECHARGE_WRITE_CUTOVER_AT_ENV]);
}

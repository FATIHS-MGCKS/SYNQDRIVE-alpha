import { Prisma } from '@prisma/client';
import { POLICY_SINGLE_ACTIVE_INDEX } from './policy-lifecycle.constants';

export type PolicyEntityKind = keyof typeof POLICY_SINGLE_ACTIVE_INDEX;

export function isPolicySingleActiveViolation(
  err: unknown,
  entityKind: PolicyEntityKind,
): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const indexName = POLICY_SINGLE_ACTIVE_INDEX[entityKind];
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(indexName);
  }
  if (typeof target === 'string') {
    return target.includes(indexName);
  }
  const message = err.message ?? '';
  return message.includes(indexName);
}

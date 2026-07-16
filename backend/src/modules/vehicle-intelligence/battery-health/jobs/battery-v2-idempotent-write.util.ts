import { Prisma } from '@prisma/client';

export interface IdempotentWriteResult<T> {
  record: T;
  created: boolean;
}

export function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

/**
 * Create-or-find helper for Prisma unique constraints — safe under parallel retry.
 */
export async function createOrFindByUnique<T>(input: {
  create: () => Promise<T>;
  findExisting: () => Promise<T | null>;
}): Promise<IdempotentWriteResult<T>> {
  try {
    const record = await input.create();
    return { record, created: true };
  } catch (error) {
    if (!isPrismaUniqueViolation(error)) {
      throw error;
    }
    const existing = await input.findExisting();
    if (!existing) {
      throw error;
    }
    return { record: existing, created: false };
  }
}

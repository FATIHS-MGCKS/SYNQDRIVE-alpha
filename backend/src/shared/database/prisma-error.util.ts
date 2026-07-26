import { Prisma } from '@prisma/client';

function normalizeConstraintField(field: string): string {
  return field.replace(/_/g, '').toLowerCase();
}

export function isPrismaUniqueViolation(
  error: unknown,
  targetFields?: string[],
): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError)
    || error.code !== 'P2002'
  ) {
    return false;
  }

  if (!targetFields?.length) {
    return true;
  }

  const target = error.meta?.target;
  const fields = Array.isArray(target)
    ? target.map(String)
    : typeof target === 'string'
      ? [target]
      : [];

  const normalizedTargets = new Set(fields.map(normalizeConstraintField));

  return targetFields.every((field) =>
    normalizedTargets.has(normalizeConstraintField(field)),
  );
}

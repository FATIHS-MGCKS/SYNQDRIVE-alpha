import type { Prisma } from '@prisma/client';

/** Audit rows reference `User` via FK — omit unknown actor ids (e.g. test harness labels). */
export async function resolveMotionPhysicsAuditActorUserId(
  tx: Prisma.TransactionClient,
  actorUserId: string | null | undefined,
): Promise<string | null> {
  if (!actorUserId) return null;
  const user = await tx.user.findUnique({
    where: { id: actorUserId },
    select: { id: true },
  });
  return user?.id ?? null;
}

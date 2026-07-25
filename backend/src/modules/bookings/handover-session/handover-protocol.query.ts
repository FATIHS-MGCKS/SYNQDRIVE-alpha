import type { HandoverKind, Prisma } from '@prisma/client';

export function currentHandoverProtocolWhere(
  bookingId: string,
  kind: HandoverKind,
): Prisma.BookingHandoverProtocolWhereInput {
  return {
    bookingId,
    kind,
    isCurrent: true,
  };
}

export function currentHandoverCompletionRecordWhere(
  bookingId: string,
  kind: HandoverKind,
): Prisma.BookingHandoverCompletionRecordWhereInput {
  return {
    bookingId,
    kind,
    isCurrent: true,
  };
}

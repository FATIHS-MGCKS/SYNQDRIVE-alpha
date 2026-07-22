import { Prisma } from '@prisma/client';
import { LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX } from './legal-documents.errors';

export function isLegalDocumentSingleActiveViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return false;
  }
  const target = err.meta?.target;
  if (Array.isArray(target)) {
    return target.includes(LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX);
  }
  if (typeof target === 'string') {
    return target.includes(LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX);
  }
  const message = err.message ?? '';
  return message.includes(LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX);
}

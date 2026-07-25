import { randomUUID } from 'crypto';
import { safeStorageSegment } from '@modules/documents/storage/document-storage-key.util';

export function buildOperatorUploadObjectKey(input: {
  organizationId: string;
  bookingId: string;
  kind: string;
  now?: Date;
}): string {
  const orgSeg = safeStorageSegment(input.organizationId);
  const bookingSeg = safeStorageSegment(input.bookingId);
  const kindSeg = safeStorageSegment(input.kind.toLowerCase()) || 'upload';
  if (!orgSeg || !bookingSeg) {
    throw new Error('Invalid operator upload storage scope');
  }
  const now = input.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return [
    'organizations',
    orgSeg,
    'operator-uploads',
    'bookings',
    bookingSeg,
    kindSeg,
    yyyy,
    mm,
    randomUUID(),
  ].join('/');
}

export function assertOperatorUploadObjectKeyForOrg(objectKey: string, organizationId: string): void {
  const orgSeg = safeStorageSegment(organizationId);
  const expectedPrefix = `organizations/${orgSeg}/operator-uploads/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw new Error('Storage object key outside organization scope');
  }
  if (objectKey.includes('..') || objectKey.includes('\0')) {
    throw new Error('Invalid storage object key');
  }
}

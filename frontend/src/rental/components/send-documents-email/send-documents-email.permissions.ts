/** Roles allowed to send booking documents via outbound email (matches backend). */
export function canSendDocumentsEmail(
  role: string | null | undefined,
): boolean {
  return (
    role === 'ORG_ADMIN' ||
    role === 'MASTER_ADMIN' ||
    role === 'SUB_ADMIN' ||
    role === 'WORKER'
  );
}

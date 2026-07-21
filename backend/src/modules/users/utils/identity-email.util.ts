/**
 * Canonical identity email normalization for invites, auth matching, and IAM lookups.
 */
export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function identityEmailsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  return normalizeIdentityEmail(left) === normalizeIdentityEmail(right);
}

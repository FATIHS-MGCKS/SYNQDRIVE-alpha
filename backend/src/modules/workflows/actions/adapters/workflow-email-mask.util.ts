/** Mask recipient email for audit logs and dry-run previews. */
export function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.length <= 1 ? '*' : local[0];
  return `${visible}***@${domain}`;
}

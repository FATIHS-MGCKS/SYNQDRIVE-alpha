/** Mask phone numbers for audit/preview output (PII redaction). */
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const visible = digits.slice(-4);
  const masked = digits.slice(0, -4).replace(/\d/g, '*');
  return `+${masked}${visible}`;
}

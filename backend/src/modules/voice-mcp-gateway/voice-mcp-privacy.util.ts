export function maskPhoneNumber(
  phone: string | null | undefined,
  options: { revealForCall?: boolean } = {},
): string | null {
  if (!phone?.trim()) {
    return null;
  }
  if (options.revealForCall) {
    return phone.trim();
  }

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) {
    return '***';
  }
  const tail = digits.slice(-4);
  return `***${tail}`;
}

export function toBookingReference(bookingId: string): string {
  const compact = bookingId.replace(/-/g, '').toUpperCase();
  return compact.slice(-8);
}

export function toCustomerReference(customerId: string): string {
  const compact = customerId.replace(/-/g, '').toUpperCase();
  return compact.slice(-8);
}

export function stripInternalIds<T extends Record<string, unknown>>(
  value: T,
  keys: string[] = ['id', 'customerId', 'vehicleId', 'bookingId', 'invoiceId', 'stationId', 'organizationId'],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (keys.includes(key)) {
      continue;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      output[key] = stripInternalIds(entry as Record<string, unknown>, keys);
      continue;
    }
    output[key] = entry;
  }
  return output;
}

export function redactSensitiveCustomerFields(
  customer: Record<string, unknown>,
  options: { revealPhoneForCall?: boolean } = {},
): Record<string, unknown> {
  const {
    id: _id,
    organizationId: _org,
    licenseNumber: _license,
    licenseNumberNormalized: _licenseNorm,
    idNumber: _idNumber,
    idNumberNormalized: _idNorm,
    dateOfBirth: _dob,
    paymentCardLast4: _card,
    stripeCustomerId: _stripe,
    documents: _docs,
    ...safe
  } = customer;

  return {
    ...stripInternalIds(safe as Record<string, unknown>),
    customerRef: typeof customer.id === 'string' ? toCustomerReference(customer.id) : null,
    phone: maskPhoneNumber(typeof customer.phone === 'string' ? customer.phone : null, {
      revealForCall: options.revealPhoneForCall,
    }),
    email: typeof customer.email === 'string' ? maskEmail(customer.email) : null,
  };
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email?.trim()) {
    return null;
  }
  const [local, domain] = email.split('@');
  if (!domain) {
    return '***';
  }
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function hashForAudit(value: unknown): string {
  const text = JSON.stringify(value ?? null);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function redactToolOutput(value: Record<string, unknown>): Record<string, unknown> {
  const clone = stripInternalIds(value, [
    'id',
    'customerId',
    'vehicleId',
    'bookingId',
    'invoiceId',
    'stationId',
    'organizationId',
    'documentIds',
    'generatedDocumentId',
    'outboundEmailId',
  ]);
  if (typeof clone.recipientEmail === 'string') {
    clone.recipientEmail = maskEmail(clone.recipientEmail);
  }
  return clone;
}

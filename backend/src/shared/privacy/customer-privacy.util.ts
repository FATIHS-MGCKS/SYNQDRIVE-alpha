/**
 * Shared customer PII masking for operator, voice MCP, and API minimization.
 */

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
  return `***${digits.slice(-4)}`;
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

export function maskDisplayName(fullName: string | null | undefined): string | null {
  if (!fullName?.trim()) return null;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].length <= 2 ? `${parts[0][0]}***` : `${parts[0].slice(0, 2)}***`;
  }
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function toCustomerReference(customerId: string): string {
  const compact = customerId.replace(/-/g, '').toUpperCase();
  return compact.slice(-8);
}

export function redactSensitiveCustomerFields(
  customer: Record<string, unknown>,
  options: { revealPhoneForCall?: boolean; revealFullName?: boolean } = {},
): Record<string, unknown> {
  const {
    id: customerId,
    organizationId: _org,
    licenseNumber: _license,
    licenseNumberNormalized: _licenseNorm,
    idNumber: _idNumber,
    idNumberNormalized: _idNorm,
    dateOfBirth: _dob,
    paymentCardLast4: _card,
    stripeCustomerId: _stripe,
    documents: _docs,
    bookings: _bookings,
    notes: _notes,
    address: _address,
    addressLine2: _address2,
    city: _city,
    postalCode: _postal,
    country: _country,
    riskLevel: _risk,
    totalRevenueCents: _revenue,
    bookingCount: _bookingCount,
    openInvoiceCount: _invoices,
    openFineCount: _fines,
    ...safe
  } = customer;

  const fullName =
    typeof customer.firstName === 'string' || typeof customer.lastName === 'string'
      ? [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim()
      : typeof customer.fullName === 'string'
        ? customer.fullName
        : null;

  return {
    ...safe,
    customerId: typeof customerId === 'string' ? customerId : null,
    customerRef: typeof customerId === 'string' ? toCustomerReference(customerId) : null,
    displayName: options.revealFullName ? fullName : maskDisplayName(fullName),
    phone: maskPhoneNumber(typeof customer.phone === 'string' ? customer.phone : null, {
      revealForCall: options.revealPhoneForCall,
    }),
    email: maskEmail(typeof customer.email === 'string' ? customer.email : null),
  };
}

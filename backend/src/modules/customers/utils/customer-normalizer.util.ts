export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  // Keep leading country code when present; strip formatting only.
  return digits;
}

export function normalizeLicenseNumber(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeIdNumber(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeFullName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const parts = [firstName, lastName]
    .map((p) => (p ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(' ');
}

export interface CustomerNormalizedFields {
  emailNormalized: string | null;
  phoneNormalized: string | null;
  licenseNumberNormalized: string | null;
  idNumberNormalized: string | null;
  fullNameNormalized: string | null;
}

export function buildCustomerNormalizedFields(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  licenseNumber?: string | null;
  idNumber?: string | null;
}): CustomerNormalizedFields {
  return {
    emailNormalized: normalizeEmail(input.email),
    phoneNormalized: normalizePhone(input.phone),
    licenseNumberNormalized: normalizeLicenseNumber(input.licenseNumber),
    idNumberNormalized: normalizeIdNumber(input.idNumber),
    fullNameNormalized: normalizeFullName(input.firstName, input.lastName),
  };
}

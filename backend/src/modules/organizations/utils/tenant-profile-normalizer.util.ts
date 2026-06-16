const IANA_TZ_RE = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+$/;

const ALLOWED_LOGO_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

const ALLOWED_LOGO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export const SUPPORTED_ORG_LANGUAGES = ['de-DE', 'en-US', 'de', 'en'] as const;

export const SUPPORTED_LEGAL_FORMS = [
  'GMBH',
  'UG',
  'AG',
  'KG',
  'OHG',
  'GBR',
  'EINZELUNTERNEHMEN',
  'FREIBERUFLER',
  'OTHER',
] as const;

export function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.trim();
}

export function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWebsite(value: unknown): string | null | undefined {
  const normalized = normalizeNullableString(value);
  if (normalized === undefined) return undefined;
  if (normalized === null) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

export function assertValidTimezone(value: string): void {
  if (!IANA_TZ_RE.test(value)) {
    throw new Error('Invalid IANA timezone');
  }
}

export function normalizeTimezoneInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return 'Europe/Berlin';
  assertValidTimezone(trimmed);
  return trimmed;
}

export function isAllowedLogoUpload(file: {
  mimetype: string;
  originalname: string;
}): boolean {
  const mime = file.mimetype.toLowerCase();
  if (!ALLOWED_LOGO_MIMES.has(mime)) return false;
  const ext = file.originalname.toLowerCase().match(/\.[^.]+$/)?.[0] ?? '';
  return ALLOWED_LOGO_EXTENSIONS.has(ext);
}

export function collectChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  return keys.filter((key) => {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    return a !== b;
  });
}

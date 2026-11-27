import { BadRequestException } from '@nestjs/common';

const PRODUCT_LOCALES = new Set(['de', 'en', 'pl', 'fr', 'cs', 'nl', 'es', 'tr', 'it']);
function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
const DATE_FORMATS = new Set(['DD.MM.YYYY', 'YYYY-MM-DD']);

export function assertOptionalStringField(
  field: string,
  value: unknown,
  opts?: { maxLength?: number; allowClearToNull?: boolean },
): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) {
    if (opts?.allowClearToNull) return '';
    throw new BadRequestException({
      code: 'PROFILE_FIELD_NULL_REJECTED',
      message: `${field} cannot be null`,
    });
  }
  if (typeof value !== 'string') {
    throw new BadRequestException({
      code: 'PROFILE_FIELD_INVALID',
      message: `${field} must be a string`,
    });
  }
  const trimmed = value.trim();
  if (opts?.maxLength && trimmed.length > opts.maxLength) {
    throw new BadRequestException({
      code: 'PROFILE_FIELD_TOO_LONG',
      message: `${field} exceeds maximum length`,
    });
  }
  return trimmed;
}

export function validateGlobalProfilePatchValues(input: {
  language?: string;
  timezone?: string;
  dateFormat?: string;
}): void {
  if (input.language !== undefined && !PRODUCT_LOCALES.has(input.language)) {
    throw new BadRequestException({
      code: 'PROFILE_LANGUAGE_INVALID',
      message: 'language must be a supported product locale',
    });
  }
  if (input.timezone !== undefined && !isValidIanaTimezone(input.timezone)) {
    throw new BadRequestException({
      code: 'PROFILE_TIMEZONE_INVALID',
      message: 'timezone must be a valid IANA timezone (e.g. Europe/Berlin)',
    });
  }
  if (input.dateFormat !== undefined && !DATE_FORMATS.has(input.dateFormat)) {
    throw new BadRequestException({
      code: 'PROFILE_DATE_FORMAT_INVALID',
      message: 'dateFormat must be DD.MM.YYYY or YYYY-MM-DD',
    });
  }
}
import { PhysicalDeviceModelCode } from '@prisma/client';

/**
 * Canonical normalization for physical device identifiers (inventory authority).
 *
 * Ruptela R1 serials follow DIMO/connection-identity convention: prefix `R1-`
 * (see telemetry-source-family RUPTELA_R1_SERIAL_PREFIX). Stored form is
 * uppercase trimmed with collapsed internal whitespace; hyphen structure preserved.
 *
 * IMEI is stored as 15 decimal digits (ITU-T E.212); non-digit characters are
 * stripped before validation. Invalid length/checksum → null canonical (clarification).
 */

const RUPTELA_R1_SERIAL_PREFIX = 'R1-';
const RUPTELA_R1_SERIAL_PATTERN = /^R1-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

export type NormalizedPhysicalDeviceIdentifiers = {
  serialNumber: string | null;
  imei: string | null;
  serialClarificationReason: string | null;
  imeiClarificationReason: string | null;
};

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeImeiDigits(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 15) return null;
  if (!isImeiLuhnValid(digits)) return null;
  return digits;
}

function isImeiLuhnValid(imei: string): boolean {
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let digit = Number(imei[i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function normalizePhysicalDeviceSerial(
  raw: string | undefined,
  modelCode: PhysicalDeviceModelCode,
): { canonical: string | null; clarificationReason: string | null } {
  if (!raw?.trim()) {
    return { canonical: null, clarificationReason: null };
  }

  const collapsed = collapseWhitespace(raw).toUpperCase();

  if (
    modelCode === PhysicalDeviceModelCode.RUPTELA_R1 ||
    modelCode === PhysicalDeviceModelCode.RUPTELA_AIR_ONE
  ) {
    if (!collapsed.startsWith(RUPTELA_R1_SERIAL_PREFIX)) {
      return {
        canonical: collapsed,
        clarificationReason: 'RUPTELA_SERIAL_PREFIX_MISMATCH',
      };
    }
    if (!RUPTELA_R1_SERIAL_PATTERN.test(collapsed)) {
      return {
        canonical: collapsed,
        clarificationReason: 'RUPTELA_SERIAL_FORMAT_INVALID',
      };
    }
    return { canonical: collapsed, clarificationReason: null };
  }

  if (modelCode === PhysicalDeviceModelCode.SMART5) {
    const compact = collapsed.replace(/\s/g, '');
    if (compact.length < 4) {
      return { canonical: compact, clarificationReason: 'SMART5_SERIAL_TOO_SHORT' };
    }
    return { canonical: compact, clarificationReason: null };
  }

  return { canonical: collapsed, clarificationReason: null };
}

export function normalizePhysicalDeviceIdentifiers(
  input: {
    serialNumber?: string;
    imei?: string;
    modelCode: PhysicalDeviceModelCode;
  },
): NormalizedPhysicalDeviceIdentifiers {
  const serial = normalizePhysicalDeviceSerial(input.serialNumber, input.modelCode);
  const imeiDigits = normalizeImeiDigits(input.imei);
  const imeiClarificationReason =
    input.imei?.trim() && !imeiDigits ? 'IMEI_FORMAT_OR_CHECKSUM_INVALID' : null;

  return {
    serialNumber: serial.canonical,
    imei: imeiDigits,
    serialClarificationReason: serial.clarificationReason,
    imeiClarificationReason,
  };
}

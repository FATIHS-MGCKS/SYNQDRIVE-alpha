import { createHash } from 'crypto';
import type { VoiceDestinationRegionPolicy } from '@prisma/client';

/** EEA member states (ISO 3166-1 alpha-2) for default destination policy. */
export const EEA_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE',
  'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const;

const DIAL_PREFIX_TO_COUNTRY: Record<string, string> = {
  '+49': 'DE',
  '+43': 'AT',
  '+41': 'CH',
  '+31': 'NL',
  '+33': 'FR',
  '+44': 'GB',
  '+39': 'IT',
  '+34': 'ES',
  '+48': 'PL',
  '+1': 'US',
  '+7': 'RU',
  '+90': 'TR',
  '+971': 'AE',
};

/** Premium / special service number prefixes (non-exhaustive, conservative). */
export const BLOCKED_DESTINATION_PREFIXES = [
  '+49116', '+49118', '+49119', '+49112', '+49110', '+49115',
  '+900', '+901', '+902', '+903', '+905', '+906', '+907', '+908', '+909',
  '+911', '+999', '+112', '+110', '+116', '+118', '+119',
  '+44871', '+44872', '+44873', '+449',
  '+3190', '+338', '+3490',
];

export type NormalizedDestination = {
  e164: string;
  countryCode: string | null;
  digest: string;
};

export function normalizeDestinationE164(raw: string): NormalizedDestination | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('+')) {
    return null;
  }

  const digits = trimmed.slice(1).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return null;
  }

  const e164 = `+${digits}`;
  const countryCode = resolveCountryFromE164(e164);
  const digest = createHash('sha256').update(e164).digest('hex').slice(0, 32);

  return { e164, countryCode, digest };
}

export function resolveCountryFromE164(e164: string): string | null {
  const sortedPrefixes = Object.keys(DIAL_PREFIX_TO_COUNTRY).sort((a, b) => b.length - a.length);
  for (const prefix of sortedPrefixes) {
    if (e164.startsWith(prefix)) {
      return DIAL_PREFIX_TO_COUNTRY[prefix];
    }
  }
  return null;
}

export function isBlockedSpecialDestination(e164: string): boolean {
  return BLOCKED_DESTINATION_PREFIXES.some((prefix) => e164.startsWith(prefix));
}

export function resolveAllowedCountries(params: {
  regionPolicy: VoiceDestinationRegionPolicy;
  customAllowedCountries: string[];
}): string[] {
  if (params.regionPolicy === 'DE_ONLY') {
    return ['DE'];
  }
  if (params.regionPolicy === 'DE_EEA') {
    return [...EEA_COUNTRY_CODES];
  }
  return params.customAllowedCountries.map((code) => code.trim().toUpperCase()).filter(Boolean);
}

export function isDestinationCountryAllowed(
  destination: NormalizedDestination,
  allowedCountries: string[],
): boolean {
  if (!allowedCountries.length) {
    return true;
  }
  if (!destination.countryCode) {
    return false;
  }
  return allowedCountries.includes(destination.countryCode);
}

export function countryDialPrefix(countryCode: string): string | null {
  const map: Record<string, string> = {
    DE: '+49', AT: '+43', CH: '+41', NL: '+31', FR: '+33', GB: '+44', US: '+1',
  };
  return map[countryCode.trim().toUpperCase()] ?? null;
}

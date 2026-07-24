export const PROCESSOR_DPA_CONFIG = {
  /** Block external processing when no valid active DPA exists. */
  requireValidContractForExternalProcessing:
    process.env.DPA_REQUIRE_VALID_CONTRACT !== 'false',
  /** warn | block when contract effectiveUntil is in the past. */
  expiredContractMode: (process.env.DPA_EXPIRED_CONTRACT_MODE ?? 'block') as 'warn' | 'block',
  /** warn | block when third-country transfer mechanism is NOT_ASSESSED. */
  transferNotAssessedMode: (process.env.DPA_TRANSFER_NOT_ASSESSED_MODE ?? 'warn') as 'warn' | 'block',
  /** Days before reviewDate to surface review warning. */
  reviewDueLeadDays: Number(process.env.DPA_REVIEW_DUE_LEAD_DAYS ?? 30),
  disclaimer:
    'Vertrags- und Transferstatus sind technische Governance-Hinweise — keine automatische juristische Bewertung.',
} as const;

export const PROCESSOR_DPA_EEA_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE',
  'IT', 'LI', 'LV', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

export function isThirdCountry(countryCode: string | null | undefined): boolean {
  if (!countryCode?.trim()) return false;
  return !PROCESSOR_DPA_EEA_COUNTRIES.has(countryCode.trim().toUpperCase());
}

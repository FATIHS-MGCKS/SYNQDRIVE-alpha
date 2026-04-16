/**
 * High Mobility OEM routing strategy.
 *
 * Different OEM brands have different onboarding paths in the HM platform:
 *
 *  ELIGIBILITY_FIRST  — call HM Eligibility API first, then request fleet clearance
 *  DIRECT_FLEET_CLEARANCE — skip Eligibility API entirely, go straight to fleet clearance
 *
 * VW Group brands and Porsche must NEVER call the Eligibility API.
 * Doing so produces a confusing error that looks like a real failure when it is not.
 * For these brands, fleet clearance is the only and correct onboarding path.
 *
 * Centralizing this logic here ensures every backend service and controller
 * uses the same routing rules without scattered brand if-statements.
 */

export type HmOemPath = 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';

/**
 * VW Group brands — Eligibility API NOT supported.
 * Clearance request must include tags: { 'vw-group-customer-name': '<customer name>' }.
 */
export const VW_GROUP_BRANDS: ReadonlySet<string> = new Set([
  'volkswagen',
  'volkswagen-commercial-vehicles',
  'audi',
  'skoda',
  'seat',
  'cupra',
]);

export type HmFleetClearanceTags = Record<string, string>;
export const DEFAULT_VW_GROUP_CUSTOMER_NAME = 'F.S Mobility Service';

/**
 * Porsche — Eligibility API NOT supported.
 * Direct fleet clearance activation.
 */
export const PORSCHE_BRANDS: ReadonlySet<string> = new Set([
  'porsche',
]);

/**
 * Brands that officially support the HM Eligibility API.
 * For all others (including VW Group and Porsche), skip the Eligibility API.
 */
export const ELIGIBILITY_SUPPORTED_BRANDS: ReadonlySet<string> = new Set([
  'bmw',
  'mercedes-benz',
  'mini',
  'opel',
  'vauxhall',
  'peugeot',
  'citroen',
  'ds',
  'fiat',
  'alfaromeo',
  'jeep',
  'ford',
  'renault',
  'dacia',
  'toyota',
  'lexus',
  'maserati',
  'kia',
  'tesla',
  'volvo-cars',
  'nissan',
  'polestar',
  'sandbox',
]);

/**
 * Normalize raw brand string (display name or alias) to HM canonical lowercase enum.
 * Shared source of truth — do NOT duplicate this map in other services.
 */
export function normalizeToHmBrand(brand: string): string {
  const b = brand.toLowerCase().trim();
  const MAP: Record<string, string> = {
    'bmw':                            'bmw',
    'mercedes-benz':                  'mercedes-benz',
    'mercedes':                       'mercedes-benz',
    'mini':                           'mini',
    'audi':                           'audi',
    'volkswagen':                     'volkswagen',
    'vw':                             'volkswagen',
    'volkswagen-commercial-vehicles': 'volkswagen-commercial-vehicles',
    'volkswagen commercial vehicles': 'volkswagen-commercial-vehicles',
    'vw commercial':                  'volkswagen-commercial-vehicles',
    'porsche':                        'porsche',
    'skoda':                          'skoda',
    'seat':                           'seat',
    'cupra':                          'cupra',
    'opel':                           'opel',
    'vauxhall':                       'vauxhall',
    'peugeot':                        'peugeot',
    'citroen':                        'citroen',
    'citroën':                        'citroen',
    'ds':                             'ds',
    'fiat':                           'fiat',
    'alfa romeo':                     'alfaromeo',
    'alfaromeo':                      'alfaromeo',
    'jeep':                           'jeep',
    'ford':                           'ford',
    'renault':                        'renault',
    'dacia':                          'dacia',
    'toyota':                         'toyota',
    'lexus':                          'lexus',
    'tesla':                          'tesla',
    'volvo':                          'volvo-cars',
    'volvo-cars':                     'volvo-cars',
    'kia':                            'kia',
    'maserati':                       'maserati',
    'nissan':                         'nissan',
    'polestar':                       'polestar',
    'sandbox':                        'sandbox',
  };
  return MAP[b] ?? b;
}

/** Returns true if this brand officially supports the HM Eligibility API. */
export function supportsEligibility(brand: string): boolean {
  return ELIGIBILITY_SUPPORTED_BRANDS.has(normalizeToHmBrand(brand));
}

/**
 * Returns true if this brand requires direct fleet clearance
 * (Eligibility API must be skipped entirely).
 */
export function usesDirectFleetClearance(brand: string): boolean {
  const normalized = normalizeToHmBrand(brand);
  return VW_GROUP_BRANDS.has(normalized) || PORSCHE_BRANDS.has(normalized);
}

/** Returns true for all Volkswagen Group brands (including Audi, Skoda, SEAT, CUPRA). */
export function isVolkswagenGroupBrand(brand: string): boolean {
  return VW_GROUP_BRANDS.has(normalizeToHmBrand(brand));
}

/** Returns true for Porsche (separate sub-path within direct clearance). */
export function isPorscheBrand(brand: string): boolean {
  return PORSCHE_BRANDS.has(normalizeToHmBrand(brand));
}

/**
 * Determine the OEM onboarding path for a given brand.
 *  ELIGIBILITY_FIRST      — call eligibility, then request clearance
 *  DIRECT_FLEET_CLEARANCE — skip eligibility, go straight to clearance
 *  UNKNOWN                — brand not recognized; attempt direct clearance as safe fallback
 */
export function getOemPath(brand: string): HmOemPath {
  const normalized = normalizeToHmBrand(brand);
  if (ELIGIBILITY_SUPPORTED_BRANDS.has(normalized)) return 'ELIGIBILITY_FIRST';
  if (VW_GROUP_BRANDS.has(normalized) || PORSCHE_BRANDS.has(normalized)) return 'DIRECT_FLEET_CLEARANCE';
  return 'UNKNOWN';
}

/**
 * Returns the HM fleet clearance tags required for a given brand.
 * VW Group brands require an object payload, not a tag-name array.
 */
export function getFleetClearanceTags(brand: string): HmFleetClearanceTags | null {
  if (!isVolkswagenGroupBrand(brand)) return null;

  const customerName =
    process.env.HM_VW_GROUP_CUSTOMER_NAME?.trim() || DEFAULT_VW_GROUP_CUSTOMER_NAME;

  return {
    'vw-group-customer-name': customerName,
  };
}

/**
 * Human-readable routing note for the UI — explains why eligibility check is skipped.
 */
export function getOemRoutingNote(brand: string): string | null {
  const normalized = normalizeToHmBrand(brand);
  if (VW_GROUP_BRANDS.has(normalized)) {
    return 'VW Group brands (Audi, Volkswagen, Skoda, SEAT, CUPRA) do not use the HM Eligibility API. Starting direct fleet clearance activation.';
  }
  if (PORSCHE_BRANDS.has(normalized)) {
    return 'Porsche does not use the HM Eligibility API. Starting direct fleet clearance activation.';
  }
  return null;
}

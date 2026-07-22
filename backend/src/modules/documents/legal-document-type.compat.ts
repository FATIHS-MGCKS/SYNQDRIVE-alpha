/** Canonical document type strings (duplicated to avoid circular imports with documents.constants). */
const CANONICAL_DOCUMENT_TYPE = {
  TERMS_AND_CONDITIONS: 'TERMS_AND_CONDITIONS',
  CONSUMER_INFORMATION: 'CONSUMER_INFORMATION',
  WITHDRAWAL_INFORMATION: 'WITHDRAWAL_INFORMATION',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
} as const;

/**
 * Administratively selectable variants within the CONSUMER_INFORMATION category.
 * SynqDrive does not determine which variant applies — the rental company chooses.
 */
export const CONSUMER_INFORMATION_VARIANT = {
  WITHDRAWAL_RIGHT_NOTICE: 'WITHDRAWAL_RIGHT_NOTICE',
  NO_WITHDRAWAL_RIGHT_NOTICE: 'NO_WITHDRAWAL_RIGHT_NOTICE',
  OTHER_CONSUMER_INFORMATION: 'OTHER_CONSUMER_INFORMATION',
} as const;

export type ConsumerInformationVariant =
  (typeof CONSUMER_INFORMATION_VARIANT)[keyof typeof CONSUMER_INFORMATION_VARIANT];

export const CONSUMER_INFORMATION_VARIANTS: readonly ConsumerInformationVariant[] = Object.values(
  CONSUMER_INFORMATION_VARIANT,
);

/**
 * SynqDrive executes administratively approved legal text rules but does not
 * replace legal review or legal advice. Display in admin surfaces where helpful.
 */
export const LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE =
  'SynqDrive führt administrativ freigegebene Rechtstextregeln aus, ersetzt jedoch keine juristische Prüfung oder Rechtsberatung.';

/** @deprecated Legacy API/storage alias — maps to CONSUMER_INFORMATION + WITHDRAWAL_RIGHT_NOTICE */
export const LEGACY_DOCUMENT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  WITHDRAWAL_INFORMATION: 'CONSUMER_INFORMATION',
};

/** Default variant when a legacy type is normalized without an explicit variant. */
export const LEGACY_DEFAULT_VARIANT: Readonly<Partial<Record<string, ConsumerInformationVariant>>> = {
  WITHDRAWAL_INFORMATION: CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE,
};

/** Neutral default titles per consumer-information variant (admin UI, not legal advice). */
export const CONSUMER_INFORMATION_VARIANT_TITLE_DE: Record<ConsumerInformationVariant, string> = {
  [CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE]: 'Widerrufsbelehrung',
  [CONSUMER_INFORMATION_VARIANT.NO_WITHDRAWAL_RIGHT_NOTICE]:
    'Information über das Nichtbestehen eines Widerrufsrechts',
  [CONSUMER_INFORMATION_VARIANT.OTHER_CONSUMER_INFORMATION]: 'Sonstige Verbraucherinformation',
};

export function isConsumerInformationVariant(value: string): value is ConsumerInformationVariant {
  return (CONSUMER_INFORMATION_VARIANTS as string[]).includes(value);
}

/** Canonical document type for storage and lifecycle logic. */
export function normalizeLegalDocumentType(documentType: string): string {
  return LEGACY_DOCUMENT_TYPE_ALIASES[documentType] ?? documentType;
}

/** Resolve variant for upload/API input (legacy types imply a default variant). */
export function resolveLegalVariantInput(
  documentType: string,
  legalVariant?: string | null,
): ConsumerInformationVariant | null {
  const canonical = normalizeLegalDocumentType(documentType);
  if (canonical !== CANONICAL_DOCUMENT_TYPE.CONSUMER_INFORMATION) {
    return null;
  }
  if (legalVariant?.trim()) {
    const v = legalVariant.trim();
    if (!isConsumerInformationVariant(v)) {
      throw new Error(`Invalid consumer information variant: ${v}`);
    }
    return v;
  }
  return (
    LEGACY_DEFAULT_VARIANT[documentType] ??
    CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE
  );
}

/** Legacy documentType value for API backward compatibility (read path). */
export function toLegacyDocumentType(
  documentType: string,
  legalVariant?: string | null,
): string | null {
  if (
    documentType === CANONICAL_DOCUMENT_TYPE.CONSUMER_INFORMATION &&
    legalVariant === CONSUMER_INFORMATION_VARIANT.WITHDRAWAL_RIGHT_NOTICE
  ) {
    return CANONICAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION;
  }
  return null;
}

/** Whether an incoming API documentType is accepted (canonical or legacy alias). */
export function isAcceptedLegalDocumentTypeInput(value: string): boolean {
  const canonical = normalizeLegalDocumentType(value);
  return (
    canonical === CANONICAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS ||
    canonical === CANONICAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ||
    canonical === CANONICAL_DOCUMENT_TYPE.PRIVACY_POLICY
  );
}

/** Lookup key for bundle/active-legal maps — includes legacy alias when applicable. */
export function legalDocumentLookupKeys(
  documentType: string,
  legalVariant?: string | null,
): string[] {
  const keys = new Set<string>([documentType]);
  const canonical = normalizeLegalDocumentType(documentType);
  keys.add(canonical);

  const legacy = toLegacyDocumentType(canonical, legalVariant);
  if (legacy) keys.add(legacy);

  // Historical org/bundle maps may still key consumer information by legacy type.
  if (canonical === CANONICAL_DOCUMENT_TYPE.CONSUMER_INFORMATION) {
    keys.add(CANONICAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION);
  }
  if (canonical === CANONICAL_DOCUMENT_TYPE.WITHDRAWAL_INFORMATION) {
    keys.add(CANONICAL_DOCUMENT_TYPE.CONSUMER_INFORMATION);
  }
  return [...keys];
}

export function hasOrgActiveLegalDocument(
  orgActiveLegal: Partial<Record<string, { id: string } | undefined>>,
  documentType: string,
  legalVariant?: string | null,
): boolean {
  return legalDocumentLookupKeys(documentType, legalVariant).some((key) => !!orgActiveLegal[key]);
}

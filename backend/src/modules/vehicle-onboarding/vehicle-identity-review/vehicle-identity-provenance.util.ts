import type {
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityCanonicalIdentity,
  RegistrationIdentityFieldProvenanceEntry,
  RegistrationIdentityProvenanceDocument,
} from './vehicle-identity-canonical.types';

export function parseRegistrationIdentityProvenance(
  raw: unknown,
): RegistrationIdentityProvenanceDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as RegistrationIdentityProvenanceDocument;
  if (doc.version !== 1 || !doc.fields || typeof doc.fields !== 'object') return null;
  return doc;
}

export function isProtectedProvenanceEntry(
  entry: RegistrationIdentityFieldProvenanceEntry | undefined,
): boolean {
  if (!entry) return false;
  return entry.confirmationStatus === 'USER_CONFIRMED' || entry.confirmationStatus === 'PROTECTED';
}

export function mergeProvenanceOnSave(input: {
  existing: RegistrationIdentityProvenanceDocument | null;
  canonical: RegistrationIdentityCanonicalIdentity;
  acceptedSuggestions?: Partial<
    Record<RegistrationIdentityCanonicalFieldKey | 'engineDisplacementCc', RegistrationIdentityFieldProvenanceEntry>
  >;
}): RegistrationIdentityProvenanceDocument {
  const now = new Date().toISOString();
  const fields: RegistrationIdentityProvenanceDocument['fields'] = {
    ...(input.existing?.fields ?? {}),
  };

  for (const field of input.canonical.fields) {
    const prev = fields[field.key];
    if (isProtectedProvenanceEntry(prev) && prev?.value !== field.value) {
      continue;
    }
    fields[field.key] = {
      value: field.value,
      provenance: field.provenance,
      confirmationStatus: 'USER_CONFIRMED',
      confirmedAt: now,
      documentExtractionId: field.documentExtractionId,
    };
  }

  if (input.acceptedSuggestions) {
    for (const [key, entry] of Object.entries(input.acceptedSuggestions)) {
      const k = key as RegistrationIdentityCanonicalFieldKey;
      const prev = fields[k];
      if (isProtectedProvenanceEntry(prev)) continue;
      if (!entry) continue;
      fields[k] = {
        ...entry,
        confirmationStatus: entry.confirmationStatus ?? 'SUGGESTED',
      };
    }
  }

  return {
    version: 1,
    updatedAt: now,
    fields,
  };
}

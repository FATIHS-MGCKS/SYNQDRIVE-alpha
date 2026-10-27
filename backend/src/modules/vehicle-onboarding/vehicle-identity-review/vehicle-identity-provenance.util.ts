import type {
  RegistrationIdentityCanonicalFieldKey,
  RegistrationIdentityCanonicalIdentity,
  RegistrationIdentityFieldProvenanceEntry,
  RegistrationIdentityProvenanceDocument,
} from './vehicle-identity-canonical.types';
import {
  getProtectedProvenanceValue,
  normalizeProvenanceStorageKey,
  valuesEqual,
} from './vehicle-identity-field-mapping.util';

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
  acceptedSuggestions?: Partial<Record<string, RegistrationIdentityFieldProvenanceEntry>>;
  explicitlyConfirmedCanonicalKeys?: Set<RegistrationIdentityCanonicalFieldKey>;
}): RegistrationIdentityProvenanceDocument {
  const now = new Date().toISOString();
  const fields: RegistrationIdentityProvenanceDocument['fields'] = {
    ...(input.existing?.fields ?? {}),
  };
  const explicit = input.explicitlyConfirmedCanonicalKeys ?? new Set();

  for (const field of input.canonical.fields) {
    const prev = getProtectedProvenanceValue(
      { version: 1, updatedAt: input.existing?.updatedAt ?? now, fields },
      field.key,
    );
    if (prev && !valuesEqual(prev.value, field.value) && !explicit.has(field.key)) {
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
    const extended = fields as Record<string, RegistrationIdentityFieldProvenanceEntry>;
    for (const [key, entry] of Object.entries(input.acceptedSuggestions)) {
      if (!entry) continue;
      const canonicalKey = normalizeProvenanceStorageKey(key);
      const protectedKey =
        canonicalKey === 'systemMotorPowerKw' || canonicalKey === 'resolvedVariant'
          ? null
          : (canonicalKey as RegistrationIdentityCanonicalFieldKey);
      if (protectedKey) {
        const prev = getProtectedProvenanceValue(
          { version: 1, updatedAt: input.existing?.updatedAt ?? now, fields },
          protectedKey,
        );
        if (prev && !valuesEqual(prev.value, entry.value)) {
          continue;
        }
      }
      extended[canonicalKey] = {
        ...entry,
        confirmationStatus: entry.confirmationStatus ?? 'SUGGESTED',
      };
      if (key !== canonicalKey && extended[key]) {
        delete extended[key];
      }
    }
  }

  return {
    version: 1,
    updatedAt: now,
    fields,
  };
}

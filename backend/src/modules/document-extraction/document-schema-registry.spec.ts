import { DOCUMENT_SUBTYPES } from './document-taxonomy.types';
import { DOCUMENT_SUBTYPE_SCHEMA_ENTRIES } from './document-schema-registry.entries';
import { documentSchemaRegistry } from './document-schema-registry';
import { DOCUMENT_SCHEMA_REGISTRY_VERSION } from './document-schema-registry.types';
import { isSensitiveDocumentField } from './document-schema-registry.field-meta';
import { SUPPORTED_DOCUMENT_TYPES } from './document-extraction.schemas';

describe('DocumentSchemaRegistry', () => {
  it('registers every taxonomy subtype', () => {
    expect(documentSchemaRegistry.listSubtypes().sort()).toEqual([...DOCUMENT_SUBTYPES].sort());
    expect(DOCUMENT_SUBTYPE_SCHEMA_ENTRIES).toHaveLength(DOCUMENT_SUBTYPES.length);
  });

  it('exposes complete metadata for each registered subtype', () => {
    for (const subtype of DOCUMENT_SUBTYPES) {
      const entry = documentSchemaRegistry.getBySubtype(subtype);
      expect(entry).toBeTruthy();
      expect(entry?.schemaVersion).toBe(DOCUMENT_SCHEMA_REGISTRY_VERSION);
      expect(entry?.category).toBeTruthy();
      expect(entry?.legacyDocumentTypes.length).toBeGreaterThan(0);
      expect(entry?.requiredFields.length).toBeGreaterThan(0);
      expect(entry?.plausibilityRules.length).toBeGreaterThan(0);
      expect(entry?.entityResolvers.length).toBeGreaterThan(0);
      expect(entry?.allowedActions.length).toBeGreaterThan(0);
      expect(entry?.followUpSuggestionRules).toBeDefined();

      const legacy = entry!.legacyDocumentTypes[0];
      const fields = entry!.uiFields(legacy);
      expect(fields.length).toBeGreaterThan(0);
      const fieldKeys = new Set(
        entry!.legacyDocumentTypes.flatMap((legacyType) =>
          entry!.extractionFields(legacyType).map((field) => field.key),
        ),
      );
      for (const required of entry!.requiredFields) {
        expect(fieldKeys.has(required)).toBe(true);
      }
    }
  });

  it('maps legacy document types to registry entries via taxonomy', () => {
    for (const legacyType of SUPPORTED_DOCUMENT_TYPES) {
      const entry = documentSchemaRegistry.resolve({ legacyDocumentType: legacyType });
      expect(entry).toBeTruthy();
      expect(entry?.legacyDocumentTypes).toContain(legacyType);
    }
  });

  it('resolves subtype-specific finance variants', () => {
    const credit = documentSchemaRegistry.resolve({
      legacyDocumentType: 'INVOICE',
      documentSubtype: 'CREDIT_NOTE',
    });
    expect(credit?.subtype).toBe('CREDIT_NOTE');
    expect(credit?.allowedActions.some((row) => row.semanticAction === 'CREATE_CREDIT_NOTE_DRAFT')).toBe(
      true,
    );
  });

  it('marks sensitive UI fields in public schema output', () => {
    const schema = documentSchemaRegistry.toPublicSchema(
      documentSchemaRegistry.getBySubtype('FINE_NOTICE')!,
      'FINE',
    );
    const plate = schema.fields.find((field) => field.key === 'licensePlate');
    expect(plate?.sensitive).toBe(true);
    expect(isSensitiveDocumentField('sender')).toBe(true);
  });

  it('lists public schemas for frontend consumption', () => {
    const schemas = documentSchemaRegistry.listPublicSchemas();
    expect(schemas).toHaveLength(DOCUMENT_SUBTYPES.length);
    expect(schemas.every((row) => row.fields.length > 0)).toBe(true);
  });
});

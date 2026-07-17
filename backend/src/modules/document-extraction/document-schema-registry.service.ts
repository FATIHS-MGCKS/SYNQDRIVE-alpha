import { Injectable, NotFoundException } from '@nestjs/common';
import { isApplyDocumentType } from './document-extraction.schemas';
import { documentSchemaRegistry } from './document-schema-registry';
import type { DocumentSubtype } from './document-taxonomy.types';
import { normalizeDocumentSubtype } from './document-taxonomy.util';

@Injectable()
export class DocumentSchemaRegistryService {
  listSchemas() {
    return {
      registryVersion: documentSchemaRegistry.listPublicSchemas()[0]?.schemaVersion ?? '1.0.0',
      subtypes: documentSchemaRegistry.listPublicSchemas(),
    };
  }

  getSchema(subtypeRaw: string, legacyDocumentType?: string | null) {
    const subtype = normalizeDocumentSubtype(subtypeRaw) as DocumentSubtype | null;
    if (!subtype) {
      throw new NotFoundException(`Unknown document subtype: ${subtypeRaw}`);
    }
    const entry = documentSchemaRegistry.getBySubtype(subtype);
    if (!entry) {
      throw new NotFoundException(`No schema registry entry for subtype: ${subtype}`);
    }
    const legacy =
      legacyDocumentType && isApplyDocumentType(legacyDocumentType)
        ? legacyDocumentType
        : null;
    return documentSchemaRegistry.toPublicSchema(entry, legacy);
  }

  resolveSchema(input: { documentSubtype?: string | null; legacyDocumentType?: string | null }) {
    const entry = documentSchemaRegistry.resolve(input);
    if (!entry) {
      throw new NotFoundException('No schema registry entry resolved for input');
    }
    const legacy =
      input.legacyDocumentType && isApplyDocumentType(input.legacyDocumentType)
        ? input.legacyDocumentType
        : entry.legacyDocumentTypes[0];
    return documentSchemaRegistry.toPublicSchema(entry, legacy);
  }
}

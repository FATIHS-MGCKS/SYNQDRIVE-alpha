import type { ApplyDocumentExtractionType } from './document-extraction.schemas';
import { isApplyDocumentType, DOCUMENT_FIELD_SCHEMAS } from './document-extraction.schemas';
import { collectArchivePlausibilityChecks, isArchiveDocumentType } from './document-archive-extraction.rules';
import { collectBatteryPlausibilityChecks } from './document-battery-extraction.rules';
import { collectBrakePlausibilityChecks } from './document-brake-extraction.rules';
import { collectDamagePlausibilityChecks, isDamageDocumentType } from './document-damage-extraction.rules';
import {
  collectInspectionPlausibilityChecks,
  isInspectionDocumentType,
} from './document-inspection-extraction.rules';
import { collectInvoicePlausibilityChecks } from './document-invoice-extraction.rules';
import { collectTirePlausibilityChecks } from './document-tire-extraction.rules';
import {
  collectCrossDocumentConsistencyChecks,
  type PlausibilityConsistencyContext,
} from './document-plausibility-consistency.rules';
import type { PlausibilityVehicleContext, PlausibilityRunOptions } from './document-extraction-plausibility.service';
import { DOCUMENT_SUBTYPE_SCHEMA_ENTRIES } from './document-schema-registry.entries';
import type {
  DocumentPlausibilityCollector,
  DocumentPlausibilityRuleKey,
  DocumentSchemaRegistryResolveInput,
  DocumentSubtypeSchemaEntry,
  PublicDocumentSubtypeSchemaDto,
} from './document-schema-registry.types';
import type { PlausibilityCheck } from './document-plausibility.types';
import { normalizeDocumentSubtype } from './document-taxonomy.util';
import type { DocumentSubtype } from './document-taxonomy.types';
import { resolveDocumentTaxonomy } from './document-taxonomy.util';

const PLAUSIBILITY_COLLECTORS: Record<
  Exclude<DocumentPlausibilityRuleKey, 'cross_document_consistency' | 'none'>,
  DocumentPlausibilityCollector
> = {
  invoice: (legacy, fields, _context, options) =>
    collectInvoicePlausibilityChecks(fields, { documentSubtype: options?.documentSubtype }),
  archive: (legacy, fields) =>
    isArchiveDocumentType(legacy) ? collectArchivePlausibilityChecks(legacy, fields) : [],
  inspection: (legacy, fields) =>
    isInspectionDocumentType(legacy) ? collectInspectionPlausibilityChecks(legacy, fields) : [],
  damage: (legacy, fields) =>
    isDamageDocumentType(legacy) ? collectDamagePlausibilityChecks(legacy, fields) : [],
  tire: (legacy, fields) => (legacy === 'TIRE' ? collectTirePlausibilityChecks(fields) : []),
  brake: (legacy, fields) => (legacy === 'BRAKE' ? collectBrakePlausibilityChecks(fields) : []),
  battery: (legacy, fields) => (legacy === 'BATTERY' ? collectBatteryPlausibilityChecks(fields) : []),
  fine: () => [],
};

export class DocumentSchemaRegistry {
  private readonly bySubtype = new Map<DocumentSubtype, DocumentSubtypeSchemaEntry>();
  private readonly byLegacyType = new Map<ApplyDocumentExtractionType, DocumentSubtypeSchemaEntry[]>();

  constructor(entries: readonly DocumentSubtypeSchemaEntry[] = DOCUMENT_SUBTYPE_SCHEMA_ENTRIES) {
    for (const entry of entries) {
      this.bySubtype.set(entry.subtype, entry);
      for (const legacy of entry.legacyDocumentTypes) {
        const list = this.byLegacyType.get(legacy) ?? [];
        list.push(entry);
        this.byLegacyType.set(legacy, list);
      }
    }
  }

  listSubtypes(): DocumentSubtype[] {
    return [...this.bySubtype.keys()];
  }

  getBySubtype(subtype: DocumentSubtype): DocumentSubtypeSchemaEntry | null {
    return this.bySubtype.get(subtype) ?? null;
  }

  getByLegacyType(legacyDocumentType: ApplyDocumentExtractionType): DocumentSubtypeSchemaEntry | null {
    const matches = this.byLegacyType.get(legacyDocumentType) ?? [];
    if (matches.length === 1) return matches[0];
    return matches[0] ?? null;
  }

  resolve(input: DocumentSchemaRegistryResolveInput): DocumentSubtypeSchemaEntry | null {
    const normalizedSubtype = normalizeDocumentSubtype(input.documentSubtype);
    if (normalizedSubtype) {
      return this.bySubtype.get(normalizedSubtype) ?? null;
    }

    if (input.legacyDocumentType && isApplyDocumentType(input.legacyDocumentType)) {
      const taxonomy = resolveDocumentTaxonomy({ legacyDocumentType: input.legacyDocumentType });
      return this.bySubtype.get(taxonomy.documentSubtype) ?? this.getByLegacyType(input.legacyDocumentType);
    }

    return null;
  }

  resolveLegacyDocumentType(input: DocumentSchemaRegistryResolveInput): ApplyDocumentExtractionType | null {
    if (input.legacyDocumentType && isApplyDocumentType(input.legacyDocumentType)) {
      return input.legacyDocumentType;
    }
    const entry = this.resolve(input);
    return entry?.legacyDocumentTypes[0] ?? null;
  }

  getExtractionFields(input: DocumentSchemaRegistryResolveInput) {
    const legacy = this.resolveLegacyDocumentType(input);
    const entry = this.resolve(input);
    if (!entry || !legacy) {
      return DOCUMENT_FIELD_SCHEMAS.OTHER;
    }
    return entry.extractionFields(legacy);
  }

  collectPlausibilityChecks(
    entry: DocumentSubtypeSchemaEntry,
    legacyDocumentType: ApplyDocumentExtractionType,
    fields: Record<string, unknown>,
    context: PlausibilityVehicleContext,
    options?: PlausibilityRunOptions,
  ): PlausibilityCheck[] {
    const checks: PlausibilityCheck[] = [];
    for (const rule of entry.plausibilityRules) {
      if (rule === 'cross_document_consistency') {
        checks.push(
          ...collectCrossDocumentConsistencyChecks(
            legacyDocumentType,
            fields,
            {
              vehicle: context,
              existingInvoiceNumbers: options?.existingInvoiceNumbers,
              existingReferenceNumbers: options?.existingReferenceNumbers,
              bookingStartDate: options?.bookingStartDate,
              bookingEndDate: options?.bookingEndDate,
              currentExtractionId: options?.currentExtractionId,
            },
            { extractionConflicts: options?.extractionConflicts },
          ),
        );
        continue;
      }
      if (rule === 'none') continue;
      const collector = PLAUSIBILITY_COLLECTORS[rule];
      if (collector) {
        for (const row of collector(legacyDocumentType, fields, context, options)) {
          checks.push({ ...row, explanation: row.message });
        }
      }
    }
    return checks;
  }

  toPublicSchema(
    entry: DocumentSubtypeSchemaEntry,
    legacyDocumentType?: ApplyDocumentExtractionType | null,
  ): PublicDocumentSubtypeSchemaDto {
    const legacy = legacyDocumentType ?? entry.legacyDocumentTypes[0];
    return {
      subtype: entry.subtype,
      category: entry.category,
      schemaVersion: entry.schemaVersion,
      legacyDocumentTypes: [...entry.legacyDocumentTypes],
      requiredFields: [...entry.requiredFields],
      plausibilityRules: [...entry.plausibilityRules],
      entityResolvers: [...entry.entityResolvers],
      allowedActions: [...entry.allowedActions],
      followUpSuggestionRules: [...entry.followUpSuggestionRules],
      fields: entry.uiFields(legacy),
    };
  }

  listPublicSchemas(): PublicDocumentSubtypeSchemaDto[] {
    return [...this.bySubtype.values()].map((entry) => this.toPublicSchema(entry));
  }
}

export const documentSchemaRegistry = new DocumentSchemaRegistry();

export function getRegistryExtractionFields(
  legacyDocumentType: ApplyDocumentExtractionType,
  documentSubtype?: string | null,
) {
  return (
    documentSchemaRegistry.getExtractionFields({
      legacyDocumentType,
      documentSubtype,
    }) ?? DOCUMENT_FIELD_SCHEMAS[legacyDocumentType] ?? DOCUMENT_FIELD_SCHEMAS.OTHER
  );
}

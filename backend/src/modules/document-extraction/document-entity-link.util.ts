import type { AcceptedEntityLink } from './document-action.types';
import {
  mergePipelinePlausibility,
  readPipelinePayload,
} from './document-content-cache.util';
import type {
  DocumentEntityLinkOperation,
  DocumentEntityLinkType,
  SupersededEntityLink,
} from './document-entity-link.types';
import { DOCUMENT_ENTITY_LINK_TYPES } from './document-entity-link.types';
import { readAcceptedEntityLinks } from './document-fine-extraction.rules';

export function normalizeDocumentEntityLinkType(value: string): DocumentEntityLinkType | null {
  const normalized = value.trim().toLowerCase();
  return (DOCUMENT_ENTITY_LINK_TYPES as readonly string[]).includes(normalized)
    ? (normalized as DocumentEntityLinkType)
    : null;
}

export function readSupersededEntityLinks(plausibility: unknown): SupersededEntityLink[] {
  const pipeline = readPipelinePayload(plausibility);
  const raw = pipeline.supersededEntityLinks;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is SupersededEntityLink =>
      Boolean(row) &&
      typeof row === 'object' &&
      typeof (row as SupersededEntityLink).entityType === 'string' &&
      typeof (row as SupersededEntityLink).entityId === 'string' &&
      typeof (row as SupersededEntityLink).supersededAt === 'string',
  );
}

export function appendSupersededEntityLinks(
  plausibility: unknown,
  entries: SupersededEntityLink[],
): Record<string, unknown> {
  if (entries.length === 0) return mergePipelinePlausibility(plausibility, {});
  const current = readSupersededEntityLinks(plausibility);
  return mergePipelinePlausibility(plausibility, {
    supersededEntityLinks: [...current, ...entries],
  });
}

export function readConfirmedDataObject(confirmedData: unknown): Record<string, unknown> {
  if (!confirmedData || typeof confirmedData !== 'object' || Array.isArray(confirmedData)) {
    return {};
  }
  return { ...(confirmedData as Record<string, unknown>) };
}

export function applyEntityLinkOperations(input: {
  confirmedData: unknown;
  operations: DocumentEntityLinkOperation[];
  userId?: string | null;
  at?: string;
}): {
  acceptedEntityLinks: AcceptedEntityLink[];
  superseded: SupersededEntityLink[];
  changed: boolean;
} {
  const at = input.at ?? new Date().toISOString();
  const links = readAcceptedEntityLinks(readConfirmedDataObject(input.confirmedData));
  const superseded: SupersededEntityLink[] = [];
  let changed = false;

  for (const operation of input.operations) {
    const entityType = operation.entityType;
    const existingIndex = links.findIndex((row) => row.entityType === entityType);
    const existing = existingIndex >= 0 ? links[existingIndex] : null;

    if (operation.operation === 'remove') {
      if (!existing) continue;
      superseded.push({
        ...existing,
        supersededAt: at,
        supersededByUserId: input.userId ?? null,
        supersededReason: 'removed',
        replacedByEntityId: null,
      });
      links.splice(existingIndex, 1);
      changed = true;
      continue;
    }

    const entityId = operation.entityId?.trim();
    if (!entityId) {
      throw new Error(`entityId is required for ${operation.operation}`);
    }

    if (operation.operation === 'confirm') {
      if (existing?.entityId === entityId) continue;
      if (existing) {
        superseded.push({
          ...existing,
          supersededAt: at,
          supersededByUserId: input.userId ?? null,
          supersededReason: 'confirmed_replaced',
          replacedByEntityId: entityId,
        });
        links[existingIndex] = {
          entityType,
          entityId,
          label: operation.label ?? existing.label ?? null,
        };
      } else {
        links.push({
          entityType,
          entityId,
          label: operation.label ?? null,
        });
      }
      changed = true;
      continue;
    }

    if (operation.operation === 'change') {
      if (!existing) {
        throw new Error(`No existing ${entityType} link to change`);
      }
      if (operation.previousEntityId && operation.previousEntityId !== existing.entityId) {
        throw new Error(`previousEntityId does not match current ${entityType} link`);
      }
      if (existing.entityId === entityId) continue;
      superseded.push({
        ...existing,
        supersededAt: at,
        supersededByUserId: input.userId ?? null,
        supersededReason: 'changed',
        replacedByEntityId: entityId,
      });
      links[existingIndex] = {
        entityType,
        entityId,
        label: operation.label ?? existing.label ?? null,
      };
      changed = true;
    }
  }

  return { acceptedEntityLinks: links, superseded, changed };
}

export function resolveVehicleIdFromEntityLinks(
  currentVehicleId: string | null,
  links: AcceptedEntityLink[],
): string | null {
  const vehicleLink = links.find((row) => row.entityType === 'vehicle');
  if (vehicleLink) return vehicleLink.entityId;
  return currentVehicleId;
}

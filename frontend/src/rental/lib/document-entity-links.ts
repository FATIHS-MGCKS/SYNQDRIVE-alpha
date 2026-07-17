import type { PublicDocumentExtraction } from './document-extraction.types';

export const DOCUMENT_ENTITY_LINK_TYPES = [
  'vehicle',
  'booking',
  'customer',
  'driver',
  'vendor',
] as const;

export type DocumentEntityLinkType = (typeof DOCUMENT_ENTITY_LINK_TYPES)[number];

export type AcceptedEntityLink = {
  entityType: string;
  entityId: string;
  label?: string | null;
};

export type DocumentEntityLinkOperation = {
  operation: 'confirm' | 'change' | 'remove';
  entityType: DocumentEntityLinkType;
  entityId?: string;
  label?: string;
  previousEntityId?: string;
};

export function readAcceptedEntityLinks(confirmedData: unknown): AcceptedEntityLink[] {
  if (!confirmedData || typeof confirmedData !== 'object') return [];
  const raw = (confirmedData as Record<string, unknown>).acceptedEntityLinks;
  if (!Array.isArray(raw)) return [];

  const links: AcceptedEntityLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const entityType = typeof row.entityType === 'string' ? row.entityType.trim().toLowerCase() : '';
    const entityId = typeof row.entityId === 'string' ? row.entityId.trim() : '';
    if (!entityType || !entityId) continue;
    links.push({
      entityType,
      entityId,
      label: typeof row.label === 'string' ? row.label : null,
    });
  }
  return links;
}

export function findAcceptedEntityLink(
  links: AcceptedEntityLink[],
  entityType: DocumentEntityLinkType,
): AcceptedEntityLink | null {
  return links.find((link) => link.entityType === entityType) ?? null;
}

export function resolveEntityLinksScope(input: {
  orgId: string;
  vehicleId?: string | null;
  recordVehicleId?: string | null;
}): { orgId: string; vehicleId: string | null; useOrgRoute: boolean } {
  const vehicleId = input.vehicleId ?? input.recordVehicleId ?? null;
  return {
    orgId: input.orgId,
    vehicleId,
    useOrgRoute: !vehicleId,
  };
}

export function readConfirmedDataObject(record: PublicDocumentExtraction | null): Record<string, unknown> {
  if (!record?.confirmedData || typeof record.confirmedData !== 'object') return {};
  return record.confirmedData as Record<string, unknown>;
}

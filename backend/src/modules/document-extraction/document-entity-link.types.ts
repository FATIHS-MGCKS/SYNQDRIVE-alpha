import type { AcceptedEntityLink } from './document-action.types';

export const DOCUMENT_ENTITY_LINK_TYPES = [
  'vehicle',
  'booking',
  'customer',
  'driver',
  'vendor',
] as const;

export type DocumentEntityLinkType = (typeof DOCUMENT_ENTITY_LINK_TYPES)[number];

export const DOCUMENT_ENTITY_LINK_OPERATIONS = ['confirm', 'change', 'remove'] as const;

export type DocumentEntityLinkOperationKind =
  (typeof DOCUMENT_ENTITY_LINK_OPERATIONS)[number];

export type DocumentEntityLinkOperation = {
  operation: DocumentEntityLinkOperationKind;
  entityType: DocumentEntityLinkType;
  entityId?: string | null;
  label?: string | null;
  previousEntityId?: string | null;
};

export type SupersededEntityLink = AcceptedEntityLink & {
  supersededAt: string;
  supersededByUserId?: string | null;
  supersededReason: 'confirmed_replaced' | 'changed' | 'removed';
  replacedByEntityId?: string | null;
};

export type DocumentEntityLinkPipelineState = {
  supersededEntityLinks?: SupersededEntityLink[];
};

export type DocumentEntityLinkUpdateResult = {
  acceptedEntityLinks: AcceptedEntityLink[];
  supersededEntityLinks: SupersededEntityLink[];
  changed: boolean;
  vehicleId: string | null;
};

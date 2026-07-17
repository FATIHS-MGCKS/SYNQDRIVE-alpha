import {
  buildDocumentIntakeSearch,
  type DocumentIntakeTab,
} from './document-intake-navigation';

export type DocumentIntakeContextType =
  | 'VEHICLE'
  | 'BOOKING'
  | 'CUSTOMER'
  | 'DRIVER'
  | 'FINE'
  | 'INVOICE'
  | 'NONE';

export type DocumentIntakeSourceSurface =
  | 'rental_ui'
  | 'org_inbox'
  | 'vehicle_detail'
  | 'booking_detail'
  | 'customer_detail'
  | 'driver_detail'
  | 'invoices_page'
  | 'fines_page'
  | 'damage_page'
  | 'service_page'
  | 'health_page'
  | 'operator_ai_upload';

export const DOCUMENT_INTAKE_CONTEXT_PARAM = 'intakeContextType';
export const DOCUMENT_INTAKE_CONTEXT_ID_PARAM = 'intakeContextId';
export const DOCUMENT_INTAKE_VEHICLE_PARAM = 'intakeVehicleId';
export const DOCUMENT_INTAKE_SOURCE_SURFACE_PARAM = 'intakeSourceSurface';
export const DOCUMENT_INTAKE_RETURN_VIEW_PARAM = 'intakeReturnView';
export const DOCUMENT_INTAKE_RETURN_ENTITY_PARAM = 'intakeReturnEntityId';

const ALLOWED_CONTEXT_TYPES = new Set<DocumentIntakeContextType>([
  'VEHICLE',
  'BOOKING',
  'CUSTOMER',
  'DRIVER',
  'FINE',
  'INVOICE',
  'NONE',
]);

export interface DocumentIntakeEntryRequest {
  optionalContextType?: DocumentIntakeContextType;
  optionalContextId?: string;
  contextVehicleId?: string | null;
  sourceSurface?: DocumentIntakeSourceSurface;
  returnView?: string;
  returnEntityId?: string | null;
  documentTab?: DocumentIntakeTab;
}

export interface DocumentIntakeEntryState {
  optionalContextType: DocumentIntakeContextType | null;
  optionalContextId: string | null;
  contextVehicleId: string | null;
  sourceSurface: DocumentIntakeSourceSurface | null;
  returnView: string | null;
  returnEntityId: string | null;
}

export function parseDocumentIntakeContextType(
  value: string | null | undefined,
): DocumentIntakeContextType | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !ALLOWED_CONTEXT_TYPES.has(normalized as DocumentIntakeContextType)) {
    return null;
  }
  return normalized as DocumentIntakeContextType;
}

export function readDocumentIntakeEntry(search = ''): DocumentIntakeEntryState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const contextType = parseDocumentIntakeContextType(params.get(DOCUMENT_INTAKE_CONTEXT_PARAM));
  const contextId = params.get(DOCUMENT_INTAKE_CONTEXT_ID_PARAM)?.trim() || null;
  const vehicleId = params.get(DOCUMENT_INTAKE_VEHICLE_PARAM)?.trim() || null;
  const sourceSurface = (params.get(DOCUMENT_INTAKE_SOURCE_SURFACE_PARAM)?.trim() ||
    null) as DocumentIntakeSourceSurface | null;
  const returnView = params.get(DOCUMENT_INTAKE_RETURN_VIEW_PARAM)?.trim() || null;
  const returnEntityId = params.get(DOCUMENT_INTAKE_RETURN_ENTITY_PARAM)?.trim() || null;

  return {
    optionalContextType: contextType,
    optionalContextId: contextId,
    contextVehicleId: vehicleId,
    sourceSurface,
    returnView,
    returnEntityId,
  };
}

export function buildDocumentIntakeEntrySearch(
  request: DocumentIntakeEntryRequest,
  baseSearch = '',
): string {
  const params = new URLSearchParams(baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch);

  if (request.optionalContextType) {
    params.set(DOCUMENT_INTAKE_CONTEXT_PARAM, request.optionalContextType);
  } else {
    params.delete(DOCUMENT_INTAKE_CONTEXT_PARAM);
  }

  if (request.optionalContextId?.trim()) {
    params.set(DOCUMENT_INTAKE_CONTEXT_ID_PARAM, request.optionalContextId.trim());
  } else {
    params.delete(DOCUMENT_INTAKE_CONTEXT_ID_PARAM);
  }

  if (request.contextVehicleId?.trim()) {
    params.set(DOCUMENT_INTAKE_VEHICLE_PARAM, request.contextVehicleId.trim());
  } else {
    params.delete(DOCUMENT_INTAKE_VEHICLE_PARAM);
  }

  if (request.sourceSurface) {
    params.set(DOCUMENT_INTAKE_SOURCE_SURFACE_PARAM, request.sourceSurface);
  } else {
    params.delete(DOCUMENT_INTAKE_SOURCE_SURFACE_PARAM);
  }

  if (request.returnView?.trim()) {
    params.set(DOCUMENT_INTAKE_RETURN_VIEW_PARAM, request.returnView.trim());
  } else {
    params.delete(DOCUMENT_INTAKE_RETURN_VIEW_PARAM);
  }

  if (request.returnEntityId?.trim()) {
    params.set(DOCUMENT_INTAKE_RETURN_ENTITY_PARAM, request.returnEntityId.trim());
  } else {
    params.delete(DOCUMENT_INTAKE_RETURN_ENTITY_PARAM);
  }

  const tabSearch = buildDocumentIntakeSearch({
    tab: request.documentTab ?? 'upload',
    baseSearch: params.toString() ? `?${params.toString()}` : '',
  });

  return tabSearch;
}

export function pushDocumentIntakeEntry(request: DocumentIntakeEntryRequest) {
  if (typeof window === 'undefined') return;
  const next = buildDocumentIntakeEntrySearch(request, window.location.search);
  const href = `${window.location.pathname}${next}${window.location.hash}`;
  window.history.pushState(null, '', href);
}

export function clearDocumentIntakeEntryParams(baseSearch = ''): string {
  const params = new URLSearchParams(baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch);
  for (const key of [
    DOCUMENT_INTAKE_CONTEXT_PARAM,
    DOCUMENT_INTAKE_CONTEXT_ID_PARAM,
    DOCUMENT_INTAKE_VEHICLE_PARAM,
    DOCUMENT_INTAKE_SOURCE_SURFACE_PARAM,
    DOCUMENT_INTAKE_RETURN_VIEW_PARAM,
    DOCUMENT_INTAKE_RETURN_ENTITY_PARAM,
  ]) {
    params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function shouldUseOrgUploadForContext(
  optionalContextType: string | null | undefined,
): boolean {
  if (!optionalContextType || optionalContextType === 'NONE') return false;
  return optionalContextType !== 'VEHICLE';
}

export function mapOperatorContextModeToEntry(input: {
  contextMode?: string;
  vehicleId?: string;
  bookingId?: string | null;
  customerId?: string | null;
}): Pick<DocumentIntakeEntryRequest, 'optionalContextType' | 'optionalContextId' | 'contextVehicleId'> {
  if (input.bookingId) {
    return {
      optionalContextType: 'BOOKING',
      optionalContextId: input.bookingId,
      contextVehicleId: input.vehicleId ?? null,
    };
  }
  if (input.customerId) {
    return {
      optionalContextType: 'CUSTOMER',
      optionalContextId: input.customerId,
      contextVehicleId: input.vehicleId ?? null,
    };
  }
  if (input.vehicleId) {
    return {
      optionalContextType: 'VEHICLE',
      optionalContextId: input.vehicleId,
      contextVehicleId: input.vehicleId,
    };
  }
  return {};
}

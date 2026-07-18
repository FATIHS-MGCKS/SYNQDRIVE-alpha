import {
  DOCUMENT_UPLOAD_CONTEXT_CONFIRMATION_STATUS,
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES,
  DOCUMENT_UPLOAD_CONTEXT_INPUT_ENTITY_TYPES,
  DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS,
  type DocumentUploadContextCandidate,
  type DocumentUploadContextConflict,
  type DocumentUploadContextEntitySnapshot,
  type DocumentUploadContextEntityType,
  type DocumentUploadContextInputEntityType,
  type DocumentUploadContextPipelineState,
  type DocumentUploadContextResolverState,
  type DocumentUploadContextSearchScope,
  type DocumentUploadResolverHints,
} from './document-upload-context.types';

const CONTEXT_SURFACE_LABELS: Record<string, string> = {
  rental_ui: 'Mietoberfläche',
  org_inbox: 'Organisations-Inbox',
  vehicle_detail: 'Fahrzeugdetail',
  operator_ai_upload: 'Operator AI Upload',
  api: 'API',
};

const ENTITY_TYPE_LABELS: Record<DocumentUploadContextInputEntityType, string> = {
  VEHICLE: 'Fahrzeug',
  BOOKING: 'Buchung',
  CUSTOMER: 'Kunde',
  DRIVER: 'Fahrer',
  FINE: 'Bußgeld',
  INVOICE: 'Rechnung',
};

function normalizeCompare(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return raw.toUpperCase().replace(/[\s\-._/]+/g, '');
}

export function isUploadContextInputEntityType(
  value: unknown,
): value is DocumentUploadContextInputEntityType {
  return (
    typeof value === 'string' &&
    (DOCUMENT_UPLOAD_CONTEXT_INPUT_ENTITY_TYPES as readonly string[]).includes(value)
  );
}

export function parseUploadContextEntityType(
  value?: string | null,
): DocumentUploadContextEntityType | null {
  const normalized = value?.trim().toUpperCase() || null;
  if (!normalized) return null;
  if (normalized === DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.NONE) {
    return DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.NONE;
  }
  return isUploadContextInputEntityType(normalized) ? normalized : null;
}

export function buildUploadContextCandidate(input: {
  entityType: DocumentUploadContextInputEntityType;
  entityId: string;
  sourceSurface: string;
  providedByUserId?: string | null;
  providedAt?: string;
}): DocumentUploadContextCandidate {
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    sourceSurface: input.sourceSurface,
    providedAt: input.providedAt ?? new Date().toISOString(),
    providedByUserId: input.providedByUserId ?? null,
    confirmationStatus: DOCUMENT_UPLOAD_CONTEXT_CONFIRMATION_STATUS.CANDIDATE,
  };
}

export function buildUploadContextSearchScope(
  candidate: DocumentUploadContextCandidate | null,
): DocumentUploadContextSearchScope | null {
  if (!candidate) return null;
  return {
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    narrowsSearch: true,
  };
}

export function buildInitialUploadContextPipelineState(
  candidate: DocumentUploadContextCandidate | null,
): DocumentUploadContextPipelineState {
  return {
    candidate,
    searchScope: buildUploadContextSearchScope(candidate),
    resolver: candidate
      ? { status: DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.PENDING, evaluatedAt: null, conflicts: [] }
      : null,
  };
}

export function readUploadContextPipelineState(
  plausibility: unknown,
): DocumentUploadContextPipelineState | null {
  if (!plausibility || typeof plausibility !== 'object' || Array.isArray(plausibility)) {
    return null;
  }
  const pipeline = (plausibility as Record<string, unknown>)._pipeline;
  if (!pipeline || typeof pipeline !== 'object' || Array.isArray(pipeline)) {
    return null;
  }
  const uploadContext = (pipeline as Record<string, unknown>).uploadContext;
  if (!uploadContext || typeof uploadContext !== 'object' || Array.isArray(uploadContext)) {
    return null;
  }
  return uploadContext as DocumentUploadContextPipelineState;
}

export function extractUploadResolverHints(
  extractedData: unknown,
): DocumentUploadResolverHints {
  if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
    return {};
  }
  const data = extractedData as Record<string, unknown>;
  const customerName = [data.customerName, data.driverName, data.lesseeName]
    .find((v) => typeof v === 'string' && v.trim())
    ?.toString()
    .trim();
  return {
    licensePlate: typeof data.licensePlate === 'string' ? data.licensePlate : null,
    vin: typeof data.vin === 'string' ? data.vin : null,
    invoiceNumber:
      typeof data.invoiceNumber === 'string'
        ? data.invoiceNumber
        : typeof data.referenceNumber === 'string'
          ? data.referenceNumber
          : null,
    reportNumber:
      typeof data.reportNumber === 'string'
        ? data.reportNumber
        : typeof data.fineNumber === 'string'
          ? data.fineNumber
          : null,
    bookingReference:
      typeof data.bookingReference === 'string'
        ? data.bookingReference
        : typeof data.bookingId === 'string'
          ? data.bookingId
          : null,
    customerName: customerName ?? null,
  };
}

function pushConflict(
  conflicts: DocumentUploadContextConflict[],
  input: Omit<DocumentUploadContextConflict, 'severity'> & { severity?: 'INFO' | 'WARNING' },
) {
  conflicts.push({
    severity: input.severity ?? 'WARNING',
    field: input.field,
    contextValue: input.contextValue,
    resolvedValue: input.resolvedValue,
    message: input.message,
  });
}

export function evaluateUploadContextResolver(input: {
  candidate: DocumentUploadContextCandidate;
  hints: DocumentUploadResolverHints;
  entitySnapshot?: DocumentUploadContextEntitySnapshot | null;
}): DocumentUploadContextResolverState {
  const conflicts: DocumentUploadContextConflict[] = [];
  const { candidate, hints, entitySnapshot } = input;

  switch (candidate.entityType) {
    case DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.VEHICLE: {
      const contextPlate = normalizeCompare(entitySnapshot?.licensePlate);
      const resolvedPlate = normalizeCompare(hints.licensePlate);
      if (contextPlate && resolvedPlate && contextPlate !== resolvedPlate) {
        pushConflict(conflicts, {
          field: 'licensePlate',
          contextValue: entitySnapshot?.licensePlate ?? null,
          resolvedValue: hints.licensePlate ?? null,
          message: 'OCR-Kennzeichen weicht vom Kontext-Fahrzeug ab',
        });
      }
      const contextVin = normalizeCompare(entitySnapshot?.vin);
      const resolvedVin = normalizeCompare(hints.vin);
      if (contextVin && resolvedVin && contextVin !== resolvedVin) {
        pushConflict(conflicts, {
          field: 'vin',
          contextValue: entitySnapshot?.vin ?? null,
          resolvedValue: hints.vin ?? null,
          message: 'OCR-VIN weicht vom Kontext-Fahrzeug ab',
        });
      }
      if (!resolvedPlate && !resolvedVin) {
        return {
          status: DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.NO_SIGNAL,
          evaluatedAt: new Date().toISOString(),
          conflicts,
        };
      }
      break;
    }
    case DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.INVOICE: {
      const contextNumber = normalizeCompare(entitySnapshot?.invoiceNumber);
      const resolvedNumber = normalizeCompare(hints.invoiceNumber);
      if (contextNumber && resolvedNumber && contextNumber !== resolvedNumber) {
        pushConflict(conflicts, {
          field: 'invoiceNumber',
          contextValue: entitySnapshot?.invoiceNumber ?? null,
          resolvedValue: hints.invoiceNumber ?? null,
          message: 'OCR-Rechnungsnummer weicht vom Kontext ab',
        });
      } else if (!resolvedNumber) {
        return {
          status: DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.NO_SIGNAL,
          evaluatedAt: new Date().toISOString(),
          conflicts,
        };
      }
      break;
    }
    case DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.FINE: {
      const contextNumber = normalizeCompare(entitySnapshot?.reportNumber);
      const resolvedNumber = normalizeCompare(hints.reportNumber);
      if (contextNumber && resolvedNumber && contextNumber !== resolvedNumber) {
        pushConflict(conflicts, {
          field: 'reportNumber',
          contextValue: entitySnapshot?.reportNumber ?? null,
          resolvedValue: hints.reportNumber ?? null,
          message: 'OCR-Aktenzeichen weicht vom Kontext-Bußgeld ab',
        });
      } else if (!resolvedNumber) {
        return {
          status: DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.NO_SIGNAL,
          evaluatedAt: new Date().toISOString(),
          conflicts,
        };
      }
      break;
    }
    case DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.BOOKING: {
      const contextRef = normalizeCompare(entitySnapshot?.bookingReference ?? candidate.entityId);
      const resolvedRef = normalizeCompare(hints.bookingReference ?? hints.invoiceNumber);
      if (contextRef && resolvedRef && contextRef !== resolvedRef) {
        pushConflict(conflicts, {
          field: 'bookingReference',
          contextValue: entitySnapshot?.bookingReference ?? candidate.entityId,
          resolvedValue: hints.bookingReference ?? hints.invoiceNumber ?? null,
          message: 'OCR-Bezug weicht vom Kontext-Buchung ab',
        });
      } else if (!resolvedRef) {
        return {
          status: DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.NO_SIGNAL,
          evaluatedAt: new Date().toISOString(),
          conflicts,
        };
      }
      break;
    }
    case DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.CUSTOMER:
    case DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.DRIVER: {
      const contextName = normalizeCompare(entitySnapshot?.customerName);
      const resolvedName = normalizeCompare(hints.customerName);
      if (contextName && resolvedName && contextName !== resolvedName) {
        pushConflict(conflicts, {
          field: 'customerName',
          contextValue: entitySnapshot?.customerName ?? null,
          resolvedValue: hints.customerName ?? null,
          message: 'OCR-Name weicht vom Kontext ab',
        });
      } else if (!resolvedName) {
        return {
          status: DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.NO_SIGNAL,
          evaluatedAt: new Date().toISOString(),
          conflicts,
        };
      }
      break;
    }
    default:
      break;
  }

  return {
    status:
      conflicts.length > 0
        ? DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.CONFLICT
        : DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.ALIGNED,
    evaluatedAt: new Date().toISOString(),
    conflicts,
  };
}

export function narrowEntitySearchCandidates<T extends { entityType?: string; entityId?: string | null }>(
  candidates: T[],
  searchScope: DocumentUploadContextSearchScope | null | undefined,
): T[] {
  if (!searchScope?.narrowsSearch) return candidates;
  const narrowed = candidates.filter(
    (row) =>
      row.entityType === searchScope.entityType &&
      (row.entityId == null || row.entityId === searchScope.entityId),
  );
  return narrowed.length > 0 ? narrowed : candidates;
}

export function formatUploadContextSurfaceLabel(sourceSurface: string): string {
  return CONTEXT_SURFACE_LABELS[sourceSurface] ?? sourceSurface;
}

export function formatUploadContextEntityLabel(entityType: DocumentUploadContextInputEntityType): string {
  return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export function buildUploadContextDisplayLabel(candidate: DocumentUploadContextCandidate): string {
  const surface = formatUploadContextSurfaceLabel(candidate.sourceSurface);
  const entity = formatUploadContextEntityLabel(candidate.entityType);
  return `Aufgerufen aus ${entity} (${surface}) – noch nicht bestätigt`;
}

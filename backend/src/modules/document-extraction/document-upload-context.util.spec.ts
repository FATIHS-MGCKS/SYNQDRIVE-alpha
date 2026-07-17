import {
  DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES,
  DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS,
} from './document-upload-context.types';
import {
  buildUploadContextCandidate,
  buildUploadContextDisplayLabel,
  evaluateUploadContextResolver,
  narrowEntitySearchCandidates,
  parseUploadContextEntityType,
} from './document-upload-context.util';

describe('document-upload-context.util', () => {
  const vehicleCandidate = buildUploadContextCandidate({
    entityType: 'VEHICLE',
    entityId: 'veh-1',
    sourceSurface: 'vehicle_detail',
    providedByUserId: 'user-1',
    providedAt: '2026-07-17T12:00:00.000Z',
  });

  it('builds German display label for unconfirmed candidate', () => {
    expect(buildUploadContextDisplayLabel(vehicleCandidate)).toBe(
      'Aufgerufen aus Fahrzeug (Fahrzeugdetail) – noch nicht bestätigt',
    );
  });

  it('parses NONE as explicit no-context', () => {
    expect(parseUploadContextEntityType('none')).toBe(DOCUMENT_UPLOAD_CONTEXT_ENTITY_TYPES.NONE);
  });

  it('marks aligned resolver when OCR plate matches context vehicle', () => {
    const result = evaluateUploadContextResolver({
      candidate: vehicleCandidate,
      hints: { licensePlate: 'B-AB 123' },
      entitySnapshot: { licensePlate: 'B AB 123', vin: null },
    });
    expect(result.status).toBe(DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.ALIGNED);
    expect(result.conflicts).toHaveLength(0);
  });

  it('marks conflict when OCR plate contradicts context vehicle', () => {
    const result = evaluateUploadContextResolver({
      candidate: vehicleCandidate,
      hints: { licensePlate: 'M-XY 999' },
      entitySnapshot: { licensePlate: 'B-AB 123', vin: null },
    });
    expect(result.status).toBe(DOCUMENT_UPLOAD_CONTEXT_RESOLVER_STATUS.CONFLICT);
    expect(result.conflicts?.[0]?.field).toBe('licensePlate');
  });

  it('narrows entity search without inventing entities', () => {
    const narrowed = narrowEntitySearchCandidates(
      [
        { entityType: 'VEHICLE', entityId: 'veh-1', label: 'Match' },
        { entityType: 'VEHICLE', entityId: 'veh-2', label: 'Other' },
        { entityType: 'CUSTOMER', entityId: 'cust-1', label: 'Customer' },
      ],
      { entityType: 'VEHICLE', entityId: 'veh-1', narrowsSearch: true },
    );
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0].entityId).toBe('veh-1');
  });

  it('falls back to original candidates when narrowing would empty the list', () => {
    const candidates = [{ entityType: 'CUSTOMER', entityId: 'cust-1', label: 'Customer' }];
    const narrowed = narrowEntitySearchCandidates(candidates, {
      entityType: 'VEHICLE',
      entityId: 'veh-1',
      narrowsSearch: true,
    });
    expect(narrowed).toEqual(candidates);
  });
});

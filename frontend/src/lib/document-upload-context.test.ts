import { describe, expect, it } from 'vitest';
import { buildOriginContextHint, formatUploadContextBanner, hasUploadContextConflict } from './document-upload-context';

describe('document-upload-context', () => {
  const base = {
    entityType: 'VEHICLE',
    entityId: 'veh-1',
    sourceSurface: 'vehicle_detail',
    providedAt: '2026-07-17T12:00:00.000Z',
    providedByUserId: 'user-1',
    confirmationStatus: 'CANDIDATE' as const,
    label: 'Aufgerufen aus Fahrzeug (Fahrzeugdetail) – noch nicht bestätigt',
    resolverStatus: 'PENDING' as const,
    conflicts: [],
  };

  it('renders backend label for unconfirmed candidate', () => {
    expect(formatUploadContextBanner(base)).toBe(
      'Aufgerufen aus Fahrzeug (Fahrzeugdetail) – noch nicht bestätigt',
    );
  });

  it('detects resolver conflict state', () => {
    expect(hasUploadContextConflict({ ...base, resolverStatus: 'CONFLICT' })).toBe(true);
    expect(hasUploadContextConflict({ ...base, resolverStatus: 'ALIGNED' })).toBe(false);
  });

  it('builds static origin hint with unconfirmed suffix', () => {
    expect(buildOriginContextHint('BMW 320d', 'Fahrzeugdetail')).toBe(
      'Aufgerufen aus BMW 320d (Fahrzeugdetail) – noch nicht bestätigt',
    );
  });
});

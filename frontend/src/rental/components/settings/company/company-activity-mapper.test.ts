import { describe, expect, it } from 'vitest';
import type { ActivityLogRow } from './useCompanyCenter';
import {
  mapCompanyActivityLogEntries,
  mapCompanyActivityLogEntry,
} from './company-activity-mapper';

function row(partial: Partial<ActivityLogRow> & Pick<ActivityLogRow, 'id' | 'description'>): ActivityLogRow {
  return {
    action: 'Updated',
    entity: 'Organization',
    userName: 'Max Mustermann',
    createdAt: '2026-07-03T10:00:00.000Z',
    ...partial,
  };
}

describe('mapCompanyActivityLogEntry', () => {
  it('maps PATCH organization profile route to readable title', () => {
    const mapped = mapCompanyActivityLogEntry(
      row({
        id: '1',
        description: 'PATCH /api/v1/organizations/org-1/profile → 200',
      }),
    );
    expect(mapped.title).toBe('Unternehmensdaten aktualisiert');
    expect(mapped.technicalDetail).toContain('PATCH');
  });

  it('maps tenant profile audit message', () => {
    const mapped = mapCompanyActivityLogEntry(
      row({ id: '2', description: 'Tenant company profile updated' }),
    );
    expect(mapped.title).toBe('Unternehmensprofil geändert');
    expect(mapped.technicalDetail).toBeUndefined();
  });

  it('maps legal document upload route', () => {
    const mapped = mapCompanyActivityLogEntry(
      row({
        id: '3',
        description: 'POST /api/v1/organizations/org-1/legal-documents/upload → 201',
      }),
    );
    expect(mapped.title).toBe('Rechtstext hochgeladen');
  });

  it('hides unknown technical routes from the title', () => {
    const mapped = mapCompanyActivityLogEntry(
      row({
        id: '4',
        description: 'PATCH /api/v1/organizations/org-1/unknown → 200',
      }),
    );
    expect(mapped.title).toBe('Änderung gespeichert');
    expect(mapped.title).not.toContain('/api/');
  });
});

describe('mapCompanyActivityLogEntries', () => {
  it('merges duplicate profile events within the merge window', () => {
    const merged = mapCompanyActivityLogEntries([
      row({
        id: 'a',
        description: 'PATCH /api/v1/organizations/org-1/profile → 200',
        createdAt: '2026-07-03T10:00:00.000Z',
      }),
      row({
        id: 'b',
        description: 'Tenant company profile updated',
        createdAt: '2026-07-03T10:00:30.000Z',
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Unternehmensprofil geändert');
    expect(merged[0].sourceIds).toEqual(['a', 'b']);
    expect(merged[0].technicalDetails?.length).toBe(1);
  });

  it('merges logo upload with profile patch in the same save window', () => {
    const merged = mapCompanyActivityLogEntries([
      row({
        id: 'logo-http',
        description: 'POST /api/v1/organizations/org-1/profile/logo → 200',
        createdAt: '2026-07-03T11:00:00.000Z',
      }),
      row({
        id: 'logo-audit',
        description: 'Organization logo uploaded',
        createdAt: '2026-07-03T11:00:10.000Z',
      }),
      row({
        id: 'profile-audit',
        description: 'Tenant company profile updated',
        createdAt: '2026-07-03T11:00:12.000Z',
      }),
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Logo aktualisiert');
    expect(merged[0].sourceIds).toHaveLength(3);
  });

  it('does not merge events outside the merge window', () => {
    const merged = mapCompanyActivityLogEntries([
      row({
        id: 'old',
        description: 'Tenant company profile updated',
        createdAt: '2026-07-03T09:00:00.000Z',
      }),
      row({
        id: 'new',
        description: 'Tenant company profile updated',
        createdAt: '2026-07-03T10:05:00.000Z',
      }),
    ]);

    expect(merged).toHaveLength(2);
  });
});

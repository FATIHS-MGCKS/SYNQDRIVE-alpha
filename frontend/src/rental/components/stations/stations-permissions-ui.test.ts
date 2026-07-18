import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stationsDir = resolve(import.meta.dirname);

describe('stations permissions UI wiring', () => {
  it('loads stations via org summaries instead of per-station overview stats', () => {
    const listSource = readFileSync(resolve(stationsDir, 'StationsView.tsx'), 'utf8');
    expect(listSource).toContain('useStationOrgSummaries');
    expect(listSource).not.toContain('overviewStats');
    expect(listSource).not.toContain('loadOverviewBatch');
    expect(listSource).not.toContain('.catch(() => null)');
  });

  it('uses useStationsV2Permissions in list and detail views', () => {
    const listSource = readFileSync(resolve(stationsDir, 'StationsView.tsx'), 'utf8');
    const detailSource = readFileSync(resolve(stationsDir, 'StationDetailView.tsx'), 'utf8');
    expect(listSource).toContain('useStationsV2Permissions');
    expect(detailSource).toContain('useStationsV2Permissions');
    expect(listSource).toContain('stations.permissions.noAccessTitle');
    expect(detailSource).toContain('stations.detail.tab.activity');
  });

  it('gates sidebar stations navigation on stations read', () => {
    const sidebarSource = readFileSync(resolve(stationsDir, '../Sidebar.tsx'), 'utf8');
    expect(sidebarSource).toContain('useStationsV2Permissions');
    expect(sidebarSource).toContain('canStations');
  });

  it('passes form capabilities into StationFormModal', () => {
    const formSource = readFileSync(resolve(stationsDir, 'StationFormModal.tsx'), 'utf8');
    expect(formSource).toContain('formCapabilities');
    expect(formSource).toContain('!caps.canSubmit');
  });
});

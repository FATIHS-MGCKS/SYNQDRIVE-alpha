import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stationsDir = resolve(import.meta.dirname);

describe('stations permissions UI wiring', () => {
  it('loads stations via org summaries instead of per-station overview stats', () => {
    const listSource = readFileSync(resolve(stationsDir, 'StationsView.tsx'), 'utf8');
    expect(listSource).toContain('useStationOrgSummaries');
    expect(listSource).toContain('stations.kpi.homeFleet');
    expect(listSource).toContain('stations.card.onSite');
    expect(listSource).toContain('stations.permissions.noAccessTitle');
    expect(listSource).not.toContain('overviewStats');
    expect(listSource).not.toContain('loadOverviewBatch');
    expect(listSource).not.toContain('.catch(() => null)');
  });

  it('uses useStationsV2Permissions in list and detail views', () => {
    const listSource = readFileSync(resolve(stationsDir, 'StationsView.tsx'), 'utf8');
    const detailSource = readFileSync(resolve(stationsDir, 'StationDetailView.tsx'), 'utf8');
    expect(listSource).toContain('useStationsV2Permissions');
    expect(detailSource).toContain('useStationsV2Permissions');
    expect(detailSource).toContain('buildStationDetailTabDescriptors');
    expect(detailSource).toContain('StationOverviewTab');
    const overviewSource = readFileSync(resolve(stationsDir, 'StationOverviewTab.tsx'), 'utf8');
    expect(overviewSource).toContain('station-overview-decision.utils');
    expect(overviewSource).toContain('buildStationOverviewDecisionModel');
    expect(detailSource).toContain("activeTab === 'schedule'");
    expect(detailSource).toContain("activeTab === 'operations'");
    expect(detailSource).not.toContain('stations.detail.tab.staff');
    expect(detailSource).not.toContain('stations.detail.staffEmptyTitle');
    expect(detailSource).toContain("activeTab === 'activity'");
    expect(detailSource).toContain('stationCaps.canViewActivity');
  });

  it('syncs station detail navigation through App URL helpers', () => {
    const appSource = readFileSync(resolve(stationsDir, '../../App.tsx'), 'utf8');
    expect(appSource).toContain('parseStationDetailFromUrl');
    expect(appSource).toContain('writeStationDetailUrl');
    expect(appSource).toContain('handleStationDetailBack');
    expect(appSource).toContain('onTabChange={setStationDetailTab}');
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

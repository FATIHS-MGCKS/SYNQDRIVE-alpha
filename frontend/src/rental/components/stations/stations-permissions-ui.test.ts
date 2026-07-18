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
    expect(detailSource).toContain('StationFleetTab');
    const fleetSource = readFileSync(resolve(stationsDir, 'StationFleetTab.tsx'), 'utf8');
    expect(fleetSource).toContain('station-fleet-read-model.utils');
    expect(fleetSource).toContain('ErrorState');
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

  it('uses workflow menu instead of assign vehicle modal', () => {
    const detailSource = readFileSync(resolve(stationsDir, 'StationDetailView.tsx'), 'utf8');
    const listSource = readFileSync(resolve(stationsDir, 'StationsView.tsx'), 'utf8');
    expect(detailSource).toContain('StationVehicleWorkflowMenu');
    expect(detailSource).not.toContain('StationAssignVehicleModal');
    expect(listSource).toContain('StationVehicleWorkflowModal');
    expect(listSource).toContain('availableStationVehicleWorkflows');
    expect(listSource).not.toContain('StationAssignVehicleModal');
  });

  it('wires station vehicle workflow utilities and API client', () => {
    const utilsSource = readFileSync(resolve(stationsDir, '../../lib/station-vehicle-workflow.utils.ts'), 'utf8');
    const modalSource = readFileSync(resolve(stationsDir, 'StationVehicleWorkflowModal.tsx'), 'utf8');
    expect(utilsSource).toContain('availableStationVehicleWorkflows');
    expect(utilsSource).toContain('isVersionConflictError');
    expect(modalSource).toContain('lookupVehicleWorkflowVehicles');
    expect(modalSource).toContain('previewVehicleWorkflow');
    expect(modalSource).toContain('stations.workflow.preview.from');
  });
});

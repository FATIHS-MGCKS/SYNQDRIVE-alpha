import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import {
  handleStationTabListKeyDown,
  stationTabId,
  stationTabPanelId,
} from '../../lib/stations-tab-a11y';
import { formatStationCount } from '../../lib/stations-ui-format';

const stationsDir = resolve(__dirname);

function readComponent(name: string): string {
  return readFileSync(resolve(stationsDir, name), 'utf8');
}

describe('stations ui quality', () => {
  it('aligns glossary fleet labels in DE/EN', () => {
    expect(en['stations.card.onSite']).toBe('Currently on site');
    expect(de['stations.card.onSite']).toBe('Aktuell vor Ort');
    expect(en['stations.detail.fleetCurrentStation']).toBe('Current location');
    expect(de['stations.detail.fleetCurrentStation']).toBe('Aktueller Standort');
    expect(en['stations.detail.fleetGroup.expected']).toBe('Expected arrival');
    expect(de['stations.detail.fleetGroup.expected']).toBe('Erwartete Ankunft');
  });

  it('keeps overview ready-for-rent translated in DE', () => {
    expect(de['stations.detail.overviewReadyForRent']).toBe('Bereit zur Vermietung');
    expect(de['stations.detail.overviewReadyForRent']).not.toBe(en['stations.detail.overviewReadyForRent']);
  });

  it('formats large KPI counts with locale grouping', () => {
    expect(formatStationCount(1500, 'de')).toBe('1.500');
    expect(formatStationCount(1500, 'en')).toBe('1,500');
  });

  it('wires tab panel accessibility ids', () => {
    expect(stationTabId('overview')).toBe('station-tab-overview');
    expect(stationTabPanelId('fleet')).toBe('station-tabpanel-fleet');
  });

  it('supports keyboard navigation between tabs', () => {
    const selectTab = vi.fn();
    const event = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLDivElement>;

    handleStationTabListKeyDown(event, ['overview', 'fleet', 'schedule'], 'overview', selectTab);

    expect(selectTab).toHaveBeenCalledWith('fleet');
  });

  it('exposes dialog semantics in station modals', () => {
    const formModal = readComponent('StationFormModal.tsx');
    const workflowModal = readComponent('StationVehicleWorkflowModal.tsx');

    expect(formModal).toContain('useStationModalA11y');
    expect(formModal).toContain("aria-label={t('common.close')}");
    expect(workflowModal).toContain('role="dialog"');
    expect(workflowModal).toContain('aria-labelledby={titleId}');
  });

  it('labels search inputs for screen readers', () => {
    const listView = readComponent('StationsView.tsx');
    const fleetTab = readComponent('StationFleetTab.tsx');
    const activityTab = readComponent('StationActivityTab.tsx');

    expect(listView).toContain("aria-label={t('stations.a11y.searchStations')}");
    expect(fleetTab).toContain("aria-label={t('stations.a11y.searchFleet')}");
    expect(activityTab).toContain("aria-label={t('stations.a11y.searchActivity')}");
  });

  it('uses responsive truncation for long station names and addresses', () => {
    const detailView = readComponent('StationDetailView.tsx');
    const listView = readComponent('StationsView.tsx');

    expect(detailView).toContain('titleClassName="line-clamp-2"');
    expect(detailView).toContain('line-clamp-2 min-w-0');
    expect(listView).toContain('truncate');
  });
});

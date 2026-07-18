import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stationsDir = resolve(import.meta.dirname);

describe('station canonical data states wiring', () => {
  it('exposes shared view-state resolvers and boundary components', () => {
    const stateSource = readFileSync(resolve(stationsDir, '../../lib/station-view-state.ts'), 'utf8');
    const boundarySource = readFileSync(resolve(stationsDir, 'StationViewStateBoundary.tsx'), 'utf8');
    expect(stateSource).toContain('resolveStationFetchState');
    expect(stateSource).toContain('resolveStationTabFetchState');
    expect(stateSource).toContain('resolveStationContextBanners');
    expect(boundarySource).toContain('StationFetchStateBoundary');
    expect(boundarySource).toContain('StationContextBanners');
  });

  it('wires list and detail views through canonical fetch boundaries', () => {
    const listSource = readFileSync(resolve(stationsDir, 'StationsView.tsx'), 'utf8');
    const detailSource = readFileSync(resolve(stationsDir, 'StationDetailView.tsx'), 'utf8');
    const overviewSource = readFileSync(resolve(stationsDir, 'StationOverviewTab.tsx'), 'utf8');
    const fleetSource = readFileSync(resolve(stationsDir, 'StationFleetTab.tsx'), 'utf8');

    expect(listSource).toContain('resolveStationFetchState');
    expect(listSource).toContain('StationContextBanners');
    expect(listSource).toContain('StationFetchStateBoundary');
    expect(listSource).not.toContain('.catch(() => null)');

    expect(detailSource).toContain('summaryError');
    expect(detailSource).toContain('resolveStationContextBanners');
    expect(detailSource).toContain('resolveStationTabFetchState');
    expect(detailSource).not.toContain('Promise.all');

    expect(overviewSource).toContain('summaryError');
    expect(overviewSource).toContain('StationFetchStateBoundary');

    expect(fleetSource).toContain('resolveStationTabFetchState');
    expect(fleetSource).toContain('StationFetchStateBoundary');
    expect(fleetSource).not.toContain('EmptyState');
  });

  it('classifies API errors with HTTP status on api client', () => {
    const apiSource = readFileSync(resolve(stationsDir, '../../../lib/api.ts'), 'utf8');
    expect(apiSource).toContain('err.status = res.status');
  });

  it('includes i18n keys for canonical station states', () => {
    const enSource = readFileSync(resolve(stationsDir, '../../i18n/translations/en.ts'), 'utf8');
    expect(enSource).toContain("'stations.state.apiErrorTitle'");
    expect(enSource).toContain("'stations.state.partialDataTitle'");
    expect(enSource).toContain("'stations.state.staleDataTitle'");
    expect(enSource).toContain("'stations.detail.fleetSearchEmptyTitle'");
  });
});

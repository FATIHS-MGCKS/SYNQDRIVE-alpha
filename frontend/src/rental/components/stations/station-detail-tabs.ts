import type { StationTeamDto } from '../../../lib/api';
import type { StationsUiCapabilities } from '../../lib/stations-v2-ui-capabilities';
import {
  resolveVisibleStationDetailTabs,
  type StationDetailTab,
} from './station-detail-navigation';

export interface StationDetailTabDescriptor {
  key: StationDetailTab;
  labelKey:
    | 'stations.detail.tab.overview'
    | 'stations.detail.tab.fleet'
    | 'stations.detail.tab.schedule'
    | 'stations.detail.tab.operations'
    | 'stations.detail.tab.team'
    | 'stations.detail.tab.activity';
}

const TAB_LABELS: Record<StationDetailTab, StationDetailTabDescriptor['labelKey']> = {
  overview: 'stations.detail.tab.overview',
  fleet: 'stations.detail.tab.fleet',
  schedule: 'stations.detail.tab.schedule',
  operations: 'stations.detail.tab.operations',
  team: 'stations.detail.tab.team',
  activity: 'stations.detail.tab.activity',
};

export function isStationTeamTabWired(team: StationTeamDto | null | undefined): boolean {
  return (team?.staff?.length ?? 0) > 0;
}

export function buildStationDetailTabDescriptors(
  stationCaps: Pick<StationsUiCapabilities, 'canViewActivity'>,
  team: StationTeamDto | null | undefined,
): StationDetailTabDescriptor[] {
  const visible = resolveVisibleStationDetailTabs({
    canViewActivity: stationCaps.canViewActivity,
    teamWired: isStationTeamTabWired(team),
  });

  return visible.map((key) => ({
    key,
    labelKey: TAB_LABELS[key],
  }));
}

export type StationDetailTabDataKey = 'schedule' | 'operations' | 'team' | 'activity';

export function tabRequiresDataLoad(tab: StationDetailTab): StationDetailTabDataKey | null {
  if (tab === 'schedule') return 'schedule';
  if (tab === 'operations') return 'operations';
  if (tab === 'team') return 'team';
  if (tab === 'activity') return 'activity';
  return null;
}

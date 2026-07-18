export const STATION_DETAIL_VIEW = 'station-detail';
export const STATION_VIEW_PARAM = 'view';
export const STATION_ID_PARAM = 'stationId';
export const STATION_TAB_PARAM = 'stationTab';

export type StationDetailTab =
  | 'overview'
  | 'fleet'
  | 'schedule'
  | 'operations'
  | 'team'
  | 'activity';

export const STATION_DETAIL_CORE_TABS: StationDetailTab[] = [
  'overview',
  'fleet',
  'schedule',
  'operations',
];

export const STATION_DETAIL_OPTIONAL_TABS: StationDetailTab[] = ['team', 'activity'];

const ALL_TABS = new Set<StationDetailTab>([
  ...STATION_DETAIL_CORE_TABS,
  ...STATION_DETAIL_OPTIONAL_TABS,
]);

export function isStationDetailTab(value: string | null | undefined): value is StationDetailTab {
  return Boolean(value && ALL_TABS.has(value as StationDetailTab));
}

export function parseStationDetailFromUrl(search = ''): {
  stationId: string;
  tab: StationDetailTab;
} | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.get(STATION_VIEW_PARAM) !== STATION_DETAIL_VIEW) return null;

  const stationId = params.get(STATION_ID_PARAM)?.trim();
  if (!stationId) return null;

  const tabParam = params.get(STATION_TAB_PARAM);
  const tab = isStationDetailTab(tabParam) ? tabParam : 'overview';
  return { stationId, tab };
}

export function buildStationDetailSearch(
  stationId: string,
  tab: StationDetailTab,
  baseSearch = '',
): string {
  const params = new URLSearchParams(baseSearch.startsWith('?') ? baseSearch.slice(1) : baseSearch);
  params.set(STATION_VIEW_PARAM, STATION_DETAIL_VIEW);
  params.set(STATION_ID_PARAM, stationId);
  params.set(STATION_TAB_PARAM, tab);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function writeStationDetailUrl(
  stationId: string,
  tab: StationDetailTab,
  mode: 'push' | 'replace' = 'push',
): void {
  if (typeof window === 'undefined') return;
  const search = buildStationDetailSearch(stationId, tab, window.location.search);
  const nextUrl = `${window.location.pathname}${search}`;
  if (`${window.location.pathname}${window.location.search}` === nextUrl) return;
  if (mode === 'replace') {
    window.history.replaceState({ stationDetail: { stationId, tab } }, '', nextUrl);
    return;
  }
  window.history.pushState({ stationDetail: { stationId, tab } }, '', nextUrl);
}

export function clearStationDetailUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.delete(STATION_VIEW_PARAM);
  params.delete(STATION_ID_PARAM);
  params.delete(STATION_TAB_PARAM);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
  window.history.pushState(null, '', nextUrl);
}

export function resolveVisibleStationDetailTabs(input: {
  canViewActivity: boolean;
  teamWired: boolean;
}): StationDetailTab[] {
  const tabs: StationDetailTab[] = [...STATION_DETAIL_CORE_TABS];
  if (input.teamWired) tabs.push('team');
  if (input.canViewActivity) tabs.push('activity');
  return tabs;
}

export function normalizeStationDetailTab(
  tab: StationDetailTab,
  visibleTabs: StationDetailTab[],
): StationDetailTab {
  if (visibleTabs.includes(tab)) return tab;
  return visibleTabs[0] ?? 'overview';
}

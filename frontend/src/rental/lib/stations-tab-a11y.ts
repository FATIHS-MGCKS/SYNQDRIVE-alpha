import type { StationDetailTab } from '../components/stations/station-detail-navigation';

export function stationTabId(tab: StationDetailTab): string {
  return `station-tab-${tab}`;
}

export function stationTabPanelId(tab: StationDetailTab): string {
  return `station-tabpanel-${tab}`;
}

export function handleStationTabListKeyDown(
  event: React.KeyboardEvent<HTMLDivElement>,
  tabs: StationDetailTab[],
  activeTab: StationDetailTab,
  selectTab: (tab: StationDetailTab) => void,
): void {
  const currentIndex = tabs.indexOf(activeTab);
  if (currentIndex < 0) return;

  let nextIndex: number | null = null;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      nextIndex = (currentIndex + 1) % tabs.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = tabs.length - 1;
      break;
    default:
      return;
  }

  event.preventDefault();
  selectTab(tabs[nextIndex]);
}

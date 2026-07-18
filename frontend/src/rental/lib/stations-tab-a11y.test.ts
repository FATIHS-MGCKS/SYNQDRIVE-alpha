import { describe, expect, it, vi } from 'vitest';
import {
  handleStationTabListKeyDown,
  stationTabId,
  stationTabPanelId,
} from './stations-tab-a11y';

describe('stations-tab-a11y', () => {
  it('builds stable tab and panel ids', () => {
    expect(stationTabId('fleet')).toBe('station-tab-fleet');
    expect(stationTabPanelId('fleet')).toBe('station-tabpanel-fleet');
  });

  it('moves selection with arrow keys', () => {
    const selectTab = vi.fn();
    const event = {
      key: 'ArrowRight',
      preventDefault: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLDivElement>;

    handleStationTabListKeyDown(event, ['overview', 'fleet'], 'overview', selectTab);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(selectTab).toHaveBeenCalledWith('fleet');
  });
});

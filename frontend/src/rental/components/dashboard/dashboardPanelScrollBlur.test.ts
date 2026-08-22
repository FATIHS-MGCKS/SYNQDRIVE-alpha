import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shouldShowBottomScrollFade,
  DASHBOARD_PANEL_SCROLL_FADE_THRESHOLD_PX,
} from './dashboardPanelScrollBlur';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('shouldShowBottomScrollFade', () => {
  function el(partial: Partial<HTMLElement>): HTMLElement {
    return partial as HTMLElement;
  }

  it('shows fade when content overflows and user is not at bottom', () => {
    expect(
      shouldShowBottomScrollFade(
        el({ scrollHeight: 400, clientHeight: 200, scrollTop: 0 }),
      ),
    ).toBe(true);
  });

  it('hides fade when scrolled to bottom', () => {
    expect(
      shouldShowBottomScrollFade(
        el({
          scrollHeight: 400,
          clientHeight: 200,
          scrollTop: 200 - DASHBOARD_PANEL_SCROLL_FADE_THRESHOLD_PX,
        }),
      ),
    ).toBe(false);
  });

  it('hides fade when content fits without scrolling', () => {
    expect(
      shouldShowBottomScrollFade(
        el({ scrollHeight: 200, clientHeight: 200, scrollTop: 0 }),
      ),
    ).toBe(false);
  });
});

describe('dashboard panel scroll blur integration', () => {
  const attentionSrc = readFileSync(
    resolve(testDir, './attention/AttentionScopedList.tsx'),
    'utf8',
  );
  const tasksSrc = readFileSync(resolve(testDir, './DashboardTasksOverviewPanel.tsx'), 'utf8');

  it('wires scroll blur into attention lists and tasks preview', () => {
    expect(attentionSrc).toMatch(/DashboardPanelScrollBlur/);
    expect(tasksSrc).toMatch(/DashboardPanelScrollBlur/);
  });
});

// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { ORG_DETAIL_TABS, type OrgDetailTab } from '../organizations/types';
import { MasterPageTabs } from './MasterPageTabs';

function OrgDetailTabsHarness() {
  const [activeId, setActiveId] = useState<OrgDetailTab>(ORG_DETAIL_TABS[0].id);
  return createElement(MasterPageTabs<OrgDetailTab>, {
    tabs: ORG_DETAIL_TABS.map((t) => ({ id: t.id, label: t.label })),
    activeId,
    onChange: setActiveId,
    ariaLabel: 'Organisation',
    testIdPrefix: 'org-detail',
  });
}

function renderAtWidth(widthPx: number) {
  const container = document.createElement('div');
  container.style.width = `${widthPx}px`;
  container.style.maxWidth = '100%';
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(createElement(OrgDetailTabsHarness));
  });
  return { container, root };
}

describe('MasterPageTabs organization detail (responsive)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps horizontal scroll on tab rail only at 375px', () => {
    const { container } = renderAtWidth(375);
    const tabbar = container.querySelector('[data-testid="org-detail-tabbar"]') as HTMLElement;
    const scrollRail = tabbar.querySelector('.overflow-x-auto') as HTMLElement;

    expect(scrollRail).toBeTruthy();
    expect(tabbar.className).toContain('w-full');
    expect(container.scrollWidth).toBeLessThanOrEqual(375 + 2);
  });

  it('exposes all eight org detail tabs in the tab list', () => {
    const { container } = renderAtWidth(375);
    const buttons = container.querySelectorAll('[role="tab"]');
    expect(buttons.length).toBe(8);
  });
});
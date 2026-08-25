import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('dashboard layout contracts', () => {
  it('centers station via 1fr auto 1fr context-header grid', () => {
    const headerSrc = readFileSync(resolve(testDir, './DashboardContextHeader.tsx'), 'utf8');
    const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');
    const shellSrc = readFileSync(resolve(testDir, './dashboardShell.tsx'), 'utf8');

    expect(headerSrc).toMatch(/grid-cols-\[1fr_auto_1fr\]/);
    expect(headerSrc).toMatch(/col-start-2[\s\S]*justify-self-center/);
    expect(headerSrc).toMatch(/dateLabelShort[\s\S]*SyncStatusBadge/);
    expect(headerSrc).toMatch(/resolveDashboardSyncBadge/);
    expect(headerSrc).toMatch(/common\.loading/);
    expect(dashboardViewSrc).toMatch(/<DashboardContextHeader vm=\{vm\}/);
    expect(dashboardViewSrc).not.toMatch(/<DashboardControlHeader/);
    expect(dashboardViewSrc).toMatch(/operationsGrid[\s\S]*<ControlKpiStrip/);
    expect(dashboardViewSrc).toMatch(/operationsGridContents/);
    expect(shellSrc).toMatch(/operationsGrid:[\s\S]*grid-cols-2/);
    expect(shellSrc).toMatch(/controlFinanceKpiGrid:[\s\S]*contents/);
  });

  it('renders six independent Operations cards without an outer surface wrapper', () => {
    const dashboardViewSrc = readFileSync(resolve(testDir, '../DashboardView.tsx'), 'utf8');
    const controlHeaderSrc = readFileSync(resolve(testDir, './DashboardControlHeader.tsx'), 'utf8');
    const financeStripSrc = readFileSync(resolve(testDir, './FinanceKpiStrip.tsx'), 'utf8');

    expect(dashboardViewSrc).toMatch(/<FinanceKpiStrip/);
    expect(dashboardViewSrc).not.toMatch(/controlCenterCard/);
    expect(controlHeaderSrc).not.toMatch(/surface-premium/);
    expect(financeStripSrc).toMatch(/operationsGridContents/);
    expect(financeStripSrc).toMatch(/PRIMARY_BUSINESS_METRICS\.map/);
  });
});

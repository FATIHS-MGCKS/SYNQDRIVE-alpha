import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DASHBOARDS_DIR = join(__dirname, '../../../monitoring/grafana/dashboards');
const REQUIRED_MASTER_DASHBOARDS = [
  'synqdrive-platform-overview.json',
  'synqdrive-infrastructure.json',
  'synqdrive-databases.json',
  'synqdrive-queues-workers.json',
  'synqdrive-billing-payments.json',
  'synqdrive-dimo-integration.json',
  'synqdrive-ai-platform.json',
  'synqdrive-tenant-overview.json',
];

describe('Grafana dashboards', () => {
  const files = readdirSync(DASHBOARDS_DIR).filter((f) => f.endsWith('.json'));

  it('includes all Master Admin production dashboards', () => {
    for (const name of REQUIRED_MASTER_DASHBOARDS) {
      expect(files).toContain(name);
    }
  });

  it.each(REQUIRED_MASTER_DASHBOARDS)('%s is valid JSON with uid and panels', (file) => {
    const raw = readFileSync(join(DASHBOARDS_DIR, file), 'utf8');
    const dashboard = JSON.parse(raw) as {
      uid: string;
      title: string;
      panels: unknown[];
      tags: string[];
    };
    expect(dashboard.uid).toBeTruthy();
    expect(dashboard.title).toMatch(/^SynqDrive —/);
    expect(dashboard.panels.length).toBeGreaterThan(5);
    expect(dashboard.tags).toContain('master-admin');
  });

  it('platform overview links to drilldown dashboards', () => {
    const platform = JSON.parse(
      readFileSync(join(DASHBOARDS_DIR, 'synqdrive-platform-overview.json'), 'utf8'),
    ) as { links: Array<{ url: string }> };
    const urls = platform.links.map((l) => l.url);
    expect(urls.some((u) => u.includes('synqdrive-databases'))).toBe(true);
    expect(urls.some((u) => u.includes('synqdrive-queues-workers'))).toBe(true);
  });
});

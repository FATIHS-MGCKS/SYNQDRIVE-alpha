import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ClickHouse Docker config (VPS memory hardening)', () => {
  const configDir = join(__dirname, '..', '..', '..', 'docker', 'clickhouse', 'config.d');

  it('includes z_memory_budget.xml with explicit server memory cap', () => {
    const path = join(configDir, 'z_memory_budget.xml');
    expect(existsSync(path)).toBe(true);
    const xml = readFileSync(path, 'utf8');
    expect(xml).toContain('<max_server_memory_usage>2000000000</max_server_memory_usage>');
    expect(xml).toContain('<max_server_memory_usage_to_ram_ratio>0</max_server_memory_usage_to_ram_ratio>');
  });

  it('removes metric_log in z_system_logs.xml (OOM incident guard)', () => {
    const path = join(configDir, 'z_system_logs.xml');
    const xml = readFileSync(path, 'utf8');
    expect(xml).toContain('<metric_log remove="1"/>');
    expect(xml).not.toMatch(/<metric_log>\s*<ttl>/);
  });
});

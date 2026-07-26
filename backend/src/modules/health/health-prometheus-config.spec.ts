import { readFileSync } from 'fs';
import { join } from 'path';

const PROMETHEUS_DIR = join(__dirname, '../../../monitoring/prometheus');

describe('prometheus application health alerts', () => {
  const alertsAppHealth = readFileSync(join(PROMETHEUS_DIR, 'alerts-app-health.yml'), 'utf8');
  const prometheusVps = readFileSync(join(PROMETHEUS_DIR, 'prometheus.vps.yml'), 'utf8');

  it('loads alerts-app-health.yml on VPS config', () => {
    expect(prometheusVps).toContain('alerts-app-health.yml');
  });

  it('defines dependency_up alerts for core integrations', () => {
    expect(alertsAppHealth).toContain('synqdrive_dependency_up{dependency="postgres"}');
    expect(alertsAppHealth).toContain('synqdrive_dependency_up{dependency="queue"}');
    expect(alertsAppHealth).toContain('synqdrive_dependency_up{dependency="notification"}');
    expect(alertsAppHealth).toContain('synqdrive_dependency_up{dependency="storage"}');
  });
});

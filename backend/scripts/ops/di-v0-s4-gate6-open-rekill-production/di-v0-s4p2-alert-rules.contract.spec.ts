import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DI_V0_S4P2_CRITICAL_ALERT_RESPONSE_ROUTE,
  DI_V0_S4P2_PROMETHEUS_ALERT_RULES,
} from './di-v0-s4p2-alert-rules.contract';

const FORBIDDEN_HIGH_CARD_LABELS = ['vehicle_id', 'trip_id', 'organization_id', 'org_id'];

describe('EXP021 S4P2 Prometheus alert contract', () => {
  const alertsYaml = readFileSync(
    join(__dirname, '../../../monitoring/prometheus/alerts-di-s4.yml'),
    'utf8',
  );

  it('alerts-di-s4.yml defines every catalogued alert with matching severity', () => {
    for (const rule of DI_V0_S4P2_PROMETHEUS_ALERT_RULES) {
      expect(alertsYaml).toContain(`alert: ${rule.alert}`);
      expect(alertsYaml).toContain(`severity: ${rule.severity}`);
      for (const metric of rule.metricFamilies) {
        expect(alertsYaml).toContain(metric);
      }
    }
  });

  it('S4 alert rules avoid high-cardinality labels', () => {
    for (const label of FORBIDDEN_HIGH_CARD_LABELS) {
      expect(alertsYaml).not.toContain(`${label}=`);
      expect(alertsYaml).not.toContain(`{${label}`);
    }
  });

  it('documents critical alert human response route (not automatic rekill)', () => {
    expect(DI_V0_S4P2_CRITICAL_ALERT_RESPONSE_ROUTE).toMatch(/EMERGENCY_REKILL/i);
    expect(DI_V0_S4P2_CRITICAL_ALERT_RESPONSE_ROUTE).toMatch(/manual/i);
    const critical = DI_V0_S4P2_PROMETHEUS_ALERT_RULES.filter((r) => r.severity === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ACTIVE_HEALTH_FINDING_TYPE,
  type ActiveHealthFinding,
} from './vehicle-row-operational-projection';
import {
  classifyReasonBadgeDomain,
  isOperationalAttentionReasonBadge,
  isOperationalAttentionReasonCode,
  shouldSuppressHealthReasonBadge,
} from './fleet-reason-badge-domain';
import {
  resolveRowOperationalAttentionBadge,
} from './vehicle-row-operational-attention';
import { buildVehicleRowOperationalProjection } from './vehicle-row-operational-projection';
import {
  canonicalAvailability,
  canonicalConnectivityRuntime,
  dashboardTestVehicle,
} from '../components/dashboard/runtime/dashboard-canonical-test-fixtures';
import { en as enTranslations } from '../i18n/translations/en';

const tireFinding: ActiveHealthFinding = {
  type: ACTIVE_HEALTH_FINDING_TYPE.TIRE,
  severity: 'warning',
  reasonCode: 'rental_health:tires:warning',
  source: 'rental_health',
  localizationKey: 'fleet.rowFinding.tire.warning',
};

function healthBadge(text: string, code = 'rental_health:tires') {
  return {
    text,
    tone: 'watch' as const,
    code,
    domain: 'health' as const,
    source: code,
  };
}

function operationalBadge(text: string, code: string) {
  return {
    text,
    tone: 'watch' as const,
    code,
    domain: 'operational' as const,
    source: 'ui_projection',
  };
}

describe('fleet-reason-badge-domain L1-L10 language independence', () => {
  it('L1 — arbitrary health label suppressed by machine domain when findings exist', () => {
    const badge = healthBadge('XYZ-HEALTH-LABEL');
    expect(shouldSuppressHealthReasonBadge(badge, [tireFinding])).toBe(true);
    expect(isOperationalAttentionReasonBadge(badge)).toBe(false);
  });

  it('L2 — Turkish-like arbitrary health label suppressed', () => {
    const badge = healthBadge('Lastik izleme gerekli');
    expect(shouldSuppressHealthReasonBadge(badge, [tireFinding])).toBe(true);
  });

  it('L3 — French-like arbitrary health label suppressed', () => {
    const badge = healthBadge('Surveiller les pneus');
    expect(shouldSuppressHealthReasonBadge(badge, [tireFinding])).toBe(true);
  });

  it('L4 — operational label containing word "warning" is not suppressed', () => {
    const badge = operationalBadge('Provider warning pending', 'CONNECTIVITY_VERIFICATION_REQUIRED');
    expect(shouldSuppressHealthReasonBadge(badge, [tireFinding])).toBe(false);
    expect(isOperationalAttentionReasonBadge(badge)).toBe(true);
  });

  it('L5 — operational label containing word "service" is not suppressed', () => {
    const badge = operationalBadge('Service appointment required', 'DEVICE_CHECK_REQUIRED');
    expect(shouldSuppressHealthReasonBadge(badge, [tireFinding])).toBe(false);
    expect(classifyReasonBadgeDomain('DEVICE_CHECK_REQUIRED')).toBe('operational');
  });

  it('L6 — health label with no legacy regex terms suppressed by machine domain', () => {
    const badge = healthBadge('QZX-99');
    expect(shouldSuppressHealthReasonBadge(badge, [tireFinding])).toBe(true);
  });

  it('L7 — AUTHORIZATION_REQUIRED preserved as operational attention', () => {
    expect(isOperationalAttentionReasonCode('AUTHORIZATION_REQUIRED')).toBe(true);
    expect(classifyReasonBadgeDomain('AUTHORIZATION_REQUIRED')).toBe('operational');
    const vehicle = dashboardTestVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'AUTHORIZATION_REQUIRED',
        attentionState: 'ACTION_REQUIRED',
        reasonCodes: ['AUTHORIZATION_REQUIRED'],
      }),
      operationalAvailability: canonicalAvailability('NEEDS_VERIFICATION', {
        attention: 'ACTION_REQUIRED',
        primaryReason: 'CONNECTIVITY_VERIFICATION_REQUIRED',
      }),
    });
    const projection = buildVehicleRowOperationalProjection({ vehicle, locale: 'en' });
    const badge = resolveRowOperationalAttentionBadge({
      projection,
      t: (key) => enTranslations[key] ?? key,
    });
    expect(badge?.text).toBe('Connectivity verification required');
  });

  it('L8 — DEVICE_UNPLUGGED preserved', () => {
    const vehicle = dashboardTestVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'DEVICE_UNPLUGGED',
        attentionState: 'CRITICAL',
        reasonCodes: ['DEVICE_UNPLUGGED'],
      }),
    });
    const projection = buildVehicleRowOperationalProjection({ vehicle, locale: 'en' });
    const badge = resolveRowOperationalAttentionBadge({
      projection,
      t: (key) => enTranslations[key] ?? key,
    });
    expect(badge?.text).toBe('Device disconnected');
  });

  it('L9 — INTEGRATION_ERROR preserved', () => {
    const vehicle = dashboardTestVehicle({
      connectivityRuntime: canonicalConnectivityRuntime({
        overallState: 'INTEGRATION_ERROR',
        attentionState: 'CRITICAL',
        reasonCodes: ['INTEGRATION_ERROR'],
      }),
    });
    const projection = buildVehicleRowOperationalProjection({ vehicle, locale: 'en' });
    const badge = resolveRowOperationalAttentionBadge({
      projection,
      t: (key) => enTranslations[key] ?? key,
    });
    expect(badge?.text).toBe('Integration issue');
  });

  it('L10 — HEALTH_RENTAL_BLOCKED + active findings suppresses duplicate generic health text', () => {
    const rentalBlockedBadge = {
      text: 'Rental blocked due to health',
      tone: 'critical' as const,
      code: 'HEALTH_RENTAL_BLOCKED',
      domain: 'health' as const,
      source: 'ui_projection',
    };
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const projection = buildVehicleRowOperationalProjection({
      vehicle,
      rentalHealth: {
        vehicle_id: vehicle.id,
        organization_id: 'org-1',
        overall_state: 'warning',
        rental_blocked: true,
        blocking_reasons: ['HEALTH_RENTAL_BLOCKED'],
        modules: {
          battery: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
          tires: { state: 'warning', reason: 'watch', last_updated_at: null, data_stale: false },
          brakes: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
          error_codes: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
          service_compliance: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
          complaints: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
          vehicle_alerts: { state: 'good', reason: '', last_updated_at: null, data_stale: false },
        },
        generated_at: '2026-08-26T12:00:00.000Z',
      },
      locale: 'en',
    });
    expect(projection.activeHealthFindings.length).toBeGreaterThan(0);
    expect(shouldSuppressHealthReasonBadge(rentalBlockedBadge, projection.activeHealthFindings)).toBe(
      true,
    );
    expect(
      resolveRowOperationalAttentionBadge({
        projection,
        reasonBadge: rentalBlockedBadge,
        t: (key) => enTranslations[key] ?? key,
      }),
    ).toBeNull();
  });

  it('L10b — HEALTH_RENTAL_BLOCKED without concrete findings shows unique blocker text', () => {
    const rentalBlockedBadge = {
      text: 'Rental blocked due to health',
      tone: 'critical' as const,
      code: 'HEALTH_RENTAL_BLOCKED',
      domain: 'health' as const,
      source: 'ui_projection',
    };
    const vehicle = dashboardTestVehicle({ withCanonicalHealth: true });
    const projection = buildVehicleRowOperationalProjection({ vehicle, locale: 'en' });
    expect(projection.activeHealthFindings).toHaveLength(0);
    expect(shouldSuppressHealthReasonBadge(rentalBlockedBadge, projection.activeHealthFindings)).toBe(
      false,
    );
    expect(
      resolveRowOperationalAttentionBadge({
        projection,
        reasonBadge: rentalBlockedBadge,
        t: (key) => enTranslations[key] ?? key,
      })?.text,
    ).toBe('Rental blocked due to health');
  });
});

describe('SERVICE and COMPLIANCE domain classification', () => {
  it('service_compliance module codes classify as health domain', () => {
    expect(classifyReasonBadgeDomain('rental_health:service_compliance')).toBe('health');
  });

  it('SERVICE finding type is health — not operational attention', () => {
    const serviceFinding: ActiveHealthFinding = {
      type: ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
      severity: 'critical',
      reasonCode: 'rental_health:service_compliance:critical',
      source: 'rental_health',
      localizationKey: 'fleet.rowFinding.service.critical',
    };
    const badge = healthBadge('Service overdue', 'rental_health:service_compliance');
    expect(shouldSuppressHealthReasonBadge(badge, [serviceFinding])).toBe(true);
    expect(isOperationalAttentionReasonBadge(badge)).toBe(false);
  });

  it('COMPLIANCE reserved finding type classifies as health via rental_health code', () => {
    expect(classifyReasonBadgeDomain('rental_health:compliance')).toBe('health');
  });
});

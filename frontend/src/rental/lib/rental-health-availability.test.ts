import { describe, expect, it } from 'vitest';
import type { VehicleHealthResponse } from '../../lib/api';
import {
  healthRentalUnverifiedMessage,
  healthUnavailableMessage,
  isHealthPipelineDegraded,
  isHealthPipelineReady,
  isModulePipelineUnavailable,
  isRentalBlockedConfirmed,
  isRentalBlockedConfirmedSafe,
  isRentalBlockedUnverified,
} from './rental-health-availability';

function health(
  overrides: Partial<VehicleHealthResponse> = {},
): VehicleHealthResponse {
  return {
    vehicle_id: 'v1',
    organization_id: 'org1',
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    blocking_reasons: [],
    modules: {} as VehicleHealthResponse['modules'],
    generated_at: '2026-06-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('rental-health-availability', () => {
  it('treats partial and unavailable as pipeline degraded', () => {
    expect(isHealthPipelineDegraded(health({ availability: 'partial' }))).toBe(true);
    expect(isHealthPipelineDegraded(health({ availability: 'unavailable' }))).toBe(true);
    expect(isHealthPipelineReady(health({ availability: 'ready' }))).toBe(true);
  });

  it('never confirms rental safe when blocked state is null or pipeline degraded', () => {
    expect(isRentalBlockedConfirmed(health({ rental_blocked: null }))).toBe(false);
    expect(isRentalBlockedConfirmedSafe(health({ rental_blocked: null }))).toBe(false);
    expect(
      isRentalBlockedConfirmedSafe(
        health({ availability: 'partial', rental_blocked: false }),
      ),
    ).toBe(false);
    expect(isRentalBlockedUnverified(health({ rental_blocked: null }))).toBe(true);
    expect(isRentalBlockedUnverified(health({ availability: 'unavailable' }))).toBe(true);
    expect(isRentalBlockedUnverified(null)).toBe(false);
  });

  it('confirms rental safe only when pipeline is ready and gate is open', () => {
    expect(isRentalBlockedConfirmedSafe(health())).toBe(true);
    expect(isRentalBlockedConfirmed(health({ rental_blocked: true }))).toBe(true);
  });

  it('detects module pipeline unavailability', () => {
    expect(
      isModulePipelineUnavailable({
        state: 'unknown',
        reason: 'Pipeline failed',
        last_updated_at: null,
        data_stale: false,
        pipeline_available: false,
      }),
    ).toBe(true);
  });

  it('exposes localized unavailable copy', () => {
    expect(healthUnavailableMessage('de')).toBe(
      'Technischer Status nicht vollständig verfügbar',
    );
    expect(healthRentalUnverifiedMessage('de')).toBe('Mietfreigabe nicht verifiziert');
  });
});

import {
  attentionDrilldownSection,
  attentionReasonLabel,
  buildVehicleAttention,
  deriveIntegrationConnectivity,
  deriveIntegrityState,
} from './vehicle-attention.util';

describe('vehicle-attention.util', () => {
  const baseInput = {
    vehicleId: 'v1',
    dimoVehicleId: 'd1',
    registrationState: 'registered' as const,
    ownership: 'assigned' as const,
    integrationConnectivity: 'connected' as const,
    telemetryFreshness: 'live' as const,
    telemetryAgeMs: 1000,
    platformDimoDegraded: false,
    lastPollStatus: 'SUCCESS' as const,
    lastPollAt: new Date().toISOString(),
    mappingConflict: false,
  };

  it('returns healthy integrity when no attention reasons', () => {
    const attention = buildVehicleAttention(baseInput);
    expect(attention.severity).toBe('none');
    expect(deriveIntegrityState(attention)).toBe('healthy');
  });

  it('flags mapping conflict as critical', () => {
    const attention = buildVehicleAttention({
      ...baseInput,
      ownership: 'conflict',
      mappingConflict: true,
    });
    expect(attention.severity).toBe('critical');
    expect(deriveIntegrityState(attention)).toBe('conflict');
    expect(attention.primaryReason).toBe('MAPPING_CONFLICT');
  });

  it('suppresses ingestion errors when platform DIMO is degraded', () => {
    const attention = buildVehicleAttention({
      ...baseInput,
      platformDimoDegraded: true,
      lastPollStatus: 'FAILURE',
    });
    expect(attention.reasons.some((r) => r.code === 'INGESTION_ERROR')).toBe(false);
  });

  it('derives integration connectivity from DIMO connection status', () => {
    expect(deriveIntegrationConnectivity('d1', 'CONNECTED', false)).toBe('connected');
    expect(deriveIntegrationConnectivity('d1', 'DISCONNECTED', false)).toBe('disconnected');
    expect(deriveIntegrationConnectivity(null, 'CONNECTED', false)).toBe('none');
    expect(deriveIntegrationConnectivity('d1', 'CONNECTED', true)).toBe('error');
  });

  it('maps attention labels and drilldown sections', () => {
    expect(attentionReasonLabel('TELEMETRY_NO_SIGNAL')).toBe('Kein Signal');
    expect(attentionDrilldownSection('DIMO_DISCONNECTED')).toBe('connectivity');
    expect(attentionDrilldownSection('PIPELINE_STALE')).toBe('pipeline');
  });
});

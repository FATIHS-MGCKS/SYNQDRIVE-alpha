import { assembleProviderLinkEvidence } from './provider-link-evidence.assembler';
import { ProviderLinkStateBuilder } from './provider-link-state.builder';
import { ConsentLedgerStatus } from './provider-link-state.types';

const NOW_MS = new Date('2026-07-18T12:00:00.000Z').getTime();

describe('assembleProviderLinkEvidence', () => {
  it('assembles fully active evidence from DB-shaped rows', () => {
    const evidence = assembleProviderLinkEvidence({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      nowMs: NOW_MS,
      dimoVehicleId: 'dimo-1',
      dimoVehicle: { tokenId: 99, connectionStatus: 'CONNECTED' },
      dataSourceLinks: [
        {
          id: 'link-1',
          provider: 'DIMO',
          isActive: true,
          organizationId: 'org-1',
        },
      ],
      providerConsents: [
        {
          organizationId: 'org-1',
          provider: 'DIMO',
          status: 'ACTIVE',
          grantedAt: new Date('2026-01-01'),
          expiresAt: null,
          revokedAt: null,
        },
      ],
      orgAuthorization: {
        status: 'ACTIVE',
        expiresAt: null,
        revokedAt: null,
      },
      lastSuccessfulTelemetryAt: new Date('2026-07-18T11:00:00.000Z'),
    });

    const result = ProviderLinkStateBuilder.build(evidence);
    expect(result.state).toBe('ACTIVE');
    expect(evidence.consent.status).toBe(ConsentLedgerStatus.ACTIVE);
  });

  it('detects mapping without consent ledger', () => {
    const evidence = assembleProviderLinkEvidence({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      nowMs: NOW_MS,
      dimoVehicleId: 'dimo-1',
      dimoVehicle: { tokenId: 99, connectionStatus: 'CONNECTED' },
      dataSourceLinks: [
        { id: 'link-1', provider: 'DIMO', isActive: true, organizationId: 'org-1' },
      ],
      providerConsents: [],
      orgAuthorization: null,
      lastSuccessfulTelemetryAt: new Date('2026-07-18T11:00:00.000Z'),
    });

    const result = ProviderLinkStateBuilder.build(evidence);
    expect(result.state).toBe('REAUTH_REQUIRED');
    expect(result.reasonCodes).toContain('CONSENT_MISSING');
  });
});

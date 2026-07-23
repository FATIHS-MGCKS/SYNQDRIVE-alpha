import { DataAuthorizationLegacyMigrationReviewReason } from '@prisma/client';
import {
  classifyOrgDataAuthorization,
  classifyVehicleProviderConsent,
  mapLegacyCategories,
} from './data-authorization-legacy-migration.mapping';
import { DIMO_TELEMETRY_SYSTEM_KEY } from '../../data-authorization.constants';

describe('data-authorization-legacy-migration.mapping', () => {
  const baseOrgAuth = {
    id: 'oda-1',
    organizationId: 'org-1',
    title: 'DIMO Telemetry Authorization',
    purpose: 'LIVE_MAP',
    purposes: ['TRIPS', 'VEHICLE_HEALTH'],
    dataCategories: ['GPS_LOCATION', 'TELEMETRY_DATA', 'legacy_unknown_cat'],
    scope: 'CONNECTED_VEHICLES',
    status: 'ACTIVE',
    sourceType: 'DIMO',
    systemKey: DIMO_TELEMETRY_SYSTEM_KEY,
    isSystemGenerated: true,
    vehicleIds: [],
    customerIds: [],
    bookingIds: [],
    processorType: 'SYNQDRIVE',
    processorName: 'SynqDrive',
    destination: 'SynqDrive Platform',
    moduleOrigin: 'Telematics',
  };

  it('flags system-generated DIMO and ACTIVE as REVIEW_REQUIRED reasons', () => {
    const result = classifyOrgDataAuthorization(baseOrgAuth, []);

    expect(result.reviewReasons).toContain(
      DataAuthorizationLegacyMigrationReviewReason.SYSTEM_GENERATED_DIMO,
    );
    expect(result.reviewReasons).toContain(
      DataAuthorizationLegacyMigrationReviewReason.ACTIVE_NOT_COMPLIANT,
    );
    expect(result.reviewReasons).toContain(
      DataAuthorizationLegacyMigrationReviewReason.INCOMPLETE_SCOPE,
    );
    expect(result.reviewReasons).toContain(
      DataAuthorizationLegacyMigrationReviewReason.LEGAL_BASIS_UNCLEAR,
    );
  });

  it('maps canonical and legacy categories', () => {
    const result = mapLegacyCategories(['telematics_usage', 'GPS_LOCATION', 'unknown_cat']);
    expect(result.mapped).toEqual(expect.arrayContaining(['TELEMETRY_DATA', 'GPS_LOCATION']));
    expect(result.unmapped).toContain('UNKNOWN_CAT');
  });

  it('detects contradictory provider vs authorization state', () => {
    const result = classifyOrgDataAuthorization(baseOrgAuth, ['REVOKED']);
    expect(result.contradictoryProviderState).toBe(true);
    expect(result.reviewReasons).toContain(
      DataAuthorizationLegacyMigrationReviewReason.CONTRADICTORY_PROVIDER_STATE,
    );
  });

  it('classifies VPC as provider candidate without processing activity', () => {
    const result = classifyVehicleProviderConsent(
      {
        id: 'vpc-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        provider: 'DIMO',
        status: 'ACTIVE',
        scopes: ['telemetry'],
        proofReference: 'proof-1',
        grantType: 'DIMO_DIRECT',
      },
      'REVOKED',
    );

    expect(result.isProviderCandidate).toBe(true);
    expect(result.isProcessingActivityCandidate).toBe(false);
    expect(result.reviewReasons).toContain(
      DataAuthorizationLegacyMigrationReviewReason.CONTRADICTORY_PROVIDER_STATE,
    );
  });
});

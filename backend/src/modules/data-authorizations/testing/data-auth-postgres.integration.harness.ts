import { randomUUID } from 'crypto';
import {
  DataProcessingAgreementStatus,
  DataSharingAuthorizationStatus,
  DataSharingRecipientRole,
  DataSubjectConsentStatus,
  DataTransferMechanism,
  LegalBasisConsentRequirement,
  PrismaClient,
  PrivacyEnforcementMode,
  PrivacyEnforcementScopeType,
  PrivacyLegalBasisType,
  PrivacyPolicyLifecycleStatus,
  PrivacyProcessingDataCategory,
  PrivacyProcessingPurpose,
  ProcessorPartyRole,
  ProviderAccessGrantMechanism,
  ProviderAccessGrantStatus,
  TransferAssessmentStatus,
  type Booking,
  type Customer,
  type DataProcessingAgreement,
  type DataSharingAuthorization,
  type DataSubjectConsent,
  type EnforcementPolicy,
  type LegalBasisAssessment,
  type Organization,
  type ProcessingActivity,
  type ProviderAccessGrant,
  type Station,
  type Vehicle,
} from '@prisma/client';

export type DataAuthPostgresFixture = {
  suffix: string;
  orgA: Organization;
  orgB: Organization;
  vehicleA: Vehicle;
  vehicleB: Vehicle;
  customerA: Customer;
  customerB: Customer;
  stationA: Station;
  stationB: Station;
  bookingA: Booking;
  bookingB: Booking;
  processingActivityA: ProcessingActivity;
  legalBasisA: LegalBasisAssessment;
  enforcementPolicyA: EnforcementPolicy;
  consentA: DataSubjectConsent;
  providerGrantA: ProviderAccessGrant;
  dataSharingA: DataSharingAuthorization;
  dpaA: DataProcessingAgreement;
  policyFamilyId: string;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function probeDataAuthDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'processing_activities'
      ) AS exists
    `;
    return rows[0]?.exists === true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function createDataAuthPostgresFixture(
  prisma: PrismaClient,
): Promise<DataAuthPostgresFixture> {
  const suffix = uniqueSuffix();
  const policyFamilyId = randomUUID();
  const now = new Date('2026-07-01T00:00:00.000Z');

  const orgA = await prisma.organization.create({
    data: {
      companyName: `Data Auth PG Org A ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  const orgB = await prisma.organization.create({
    data: {
      companyName: `Data Auth PG Org B ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  const stationA = await prisma.station.create({
    data: {
      organizationId: orgA.id,
      name: `Station A ${suffix}`,
      code: `STA-A-${suffix}`.slice(0, 20),
    },
  });

  const stationB = await prisma.station.create({
    data: {
      organizationId: orgB.id,
      name: `Station B ${suffix}`,
      code: `STA-B-${suffix}`.slice(0, 20),
    },
  });

  const customerA = await prisma.customer.create({
    data: {
      organizationId: orgA.id,
      firstName: 'Alice',
      lastName: `TenantA ${suffix}`,
    },
  });

  const customerB = await prisma.customer.create({
    data: {
      organizationId: orgB.id,
      firstName: 'Bob',
      lastName: `TenantB ${suffix}`,
    },
  });

  const vehicleA = await prisma.vehicle.create({
    data: {
      organizationId: orgA.id,
      homeStationId: stationA.id,
      licensePlate: `DA-A-${suffix}`.slice(0, 12),
      vin: `VINA${suffix}`.slice(0, 17).padEnd(17, '0'),
      make: 'Test',
      model: 'EV',
      year: 2025,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
  });

  const vehicleB = await prisma.vehicle.create({
    data: {
      organizationId: orgB.id,
      homeStationId: stationB.id,
      licensePlate: `DA-B-${suffix}`.slice(0, 12),
      vin: `VINB${suffix}`.slice(0, 17).padEnd(17, '0'),
      make: 'Test',
      model: 'EV',
      year: 2025,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
  });

  const bookingA = await prisma.booking.create({
    data: {
      organizationId: orgA.id,
      customerId: customerA.id,
      vehicleId: vehicleA.id,
      pickupStationId: stationA.id,
      returnStationId: stationA.id,
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      endDate: new Date('2026-08-05T10:00:00.000Z'),
      status: 'CONFIRMED',
    },
  });

  const bookingB = await prisma.booking.create({
    data: {
      organizationId: orgB.id,
      customerId: customerB.id,
      vehicleId: vehicleB.id,
      pickupStationId: stationB.id,
      returnStationId: stationB.id,
      startDate: new Date('2026-08-01T10:00:00.000Z'),
      endDate: new Date('2026-08-05T10:00:00.000Z'),
      status: 'CONFIRMED',
    },
  });

  const processingActivityA = await prisma.processingActivity.create({
    data: {
      organizationId: orgA.id,
      activityCode: `fleet-gps-${suffix}`.slice(0, 40),
      title: `Fleet GPS ${suffix}`,
      policyFamilyId,
      versionNumber: 1,
      isCurrentVersion: true,
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      activatedAt: now,
      validFrom: now,
      purposeSummary: 'Live fleet map',
      dataCategories: {
        create: [{ organizationId: orgA.id, dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION }],
      },
      purposes: {
        create: [{ organizationId: orgA.id, purpose: PrivacyProcessingPurpose.LIVE_MAP }],
      },
    },
  });

  const legalBasisA = await prisma.legalBasisAssessment.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      policyFamilyId: randomUUID(),
      versionNumber: 1,
      isCurrentVersion: true,
      legalBasisType: PrivacyLegalBasisType.CONTRACT,
      consentRequirement: LegalBasisConsentRequirement.NOT_APPLICABLE,
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      activatedAt: now,
      validFrom: now,
    },
  });

  const enforcementPolicyA = await prisma.enforcementPolicy.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      policyFamilyId: randomUUID(),
      versionNumber: 1,
      isCurrentVersion: true,
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      enforcementMode: PrivacyEnforcementMode.ENFORCE,
      dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
      processingPurpose: PrivacyProcessingPurpose.LIVE_MAP,
      scopeType: PrivacyEnforcementScopeType.VEHICLE,
      pathId: 'live-gps',
      activatedAt: now,
      validFrom: now,
      vehicles: {
        create: [{ organizationId: orgA.id, vehicleId: vehicleA.id }],
      },
    },
  });

  const consentA = await prisma.dataSubjectConsent.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      legalBasisAssessmentId: legalBasisA.id,
      dataSubjectReference: `subject-${suffix}`,
      subjectType: 'CUSTOMER',
      purpose: PrivacyProcessingPurpose.LIVE_MAP,
      consentTextVersion: 'v1',
      privacyNoticeVersion: 'pn-v1',
      consentStatus: DataSubjectConsentStatus.GRANTED,
      grantedAt: now,
    },
  });

  const providerGrantA = await prisma.providerAccessGrant.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      vehicleId: vehicleA.id,
      provider: 'DIMO',
      providerStatus: ProviderAccessGrantStatus.ACTIVE,
      grantMechanism: ProviderAccessGrantMechanism.OAUTH,
      grantedAt: now,
      grantedScopes: {
        create: [{ organizationId: orgA.id, scopeKey: 'telemetry' }],
      },
    },
  });

  const dataSharingA = await prisma.dataSharingAuthorization.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      legalBasisAssessmentId: legalBasisA.id,
      recipient: `Partner ${suffix}`,
      recipientRole: DataSharingRecipientRole.PROCESSOR,
      purpose: PrivacyProcessingPurpose.LIVE_MAP,
      status: DataSharingAuthorizationStatus.AUTHORIZED,
      validFrom: now,
      transferCountry: 'US',
      transferMechanism: DataTransferMechanism.STANDARD_CONTRACTUAL_CLAUSES,
      dataCategories: {
        create: [{ organizationId: orgA.id, dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION }],
      },
    },
  });

  const dpaA = await prisma.dataProcessingAgreement.create({
    data: {
      organizationId: orgA.id,
      policyFamilyId: randomUUID(),
      versionNumber: 1,
      isCurrentVersion: true,
      processingActivityId: processingActivityA.id,
      processorName: 'DIMO GmbH',
      processorRole: ProcessorPartyRole.PROCESSOR,
      status: DataProcessingAgreementStatus.ACTIVE,
      signedAt: now,
      effectiveFrom: now,
      effectiveUntil: new Date('2027-07-01T00:00:00.000Z'),
      transferAssessmentStatus: TransferAssessmentStatus.ASSESSED,
      providerKind: 'TELEMATICS',
      linkedActivities: {
        create: [{ organizationId: orgA.id, processingActivityId: processingActivityA.id }],
      },
      transferCountries: {
        create: [
          {
            organizationId: orgA.id,
            countryCode: 'US',
            transferMechanism: DataTransferMechanism.STANDARD_CONTRACTUAL_CLAUSES,
          },
        ],
      },
    },
  });

  return {
    suffix,
    orgA,
    orgB,
    vehicleA,
    vehicleB,
    customerA,
    customerB,
    stationA,
    stationB,
    bookingA,
    bookingB,
    processingActivityA,
    legalBasisA,
    enforcementPolicyA,
    consentA,
    providerGrantA,
    dataSharingA,
    dpaA,
    policyFamilyId,
  };
}

/** Minimal tenant for VPS staging runtime checks — avoids consent columns absent on some prod schemas. */
export type DataAuthStagingRuntimeFixture = Pick<
  DataAuthPostgresFixture,
  'suffix' | 'orgA' | 'orgB' | 'vehicleA' | 'vehicleB' | 'processingActivityA' | 'providerGrantA'
>;

export async function createDataAuthStagingRuntimeFixture(
  prisma: PrismaClient,
): Promise<DataAuthStagingRuntimeFixture> {
  const suffix = uniqueSuffix();
  const policyFamilyId = randomUUID();
  const now = new Date('2026-07-01T00:00:00.000Z');

  const orgA = await prisma.organization.create({
    data: { name: `Data Auth Staging A ${suffix}`, slug: `da-stg-a-${suffix}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: `Data Auth Staging B ${suffix}`, slug: `da-stg-b-${suffix}` },
  });

  const stationA = await prisma.station.create({
    data: { organizationId: orgA.id, name: `Station A ${suffix}`, code: `STA-A-${suffix}`.slice(0, 20) },
  });
  const stationB = await prisma.station.create({
    data: { organizationId: orgB.id, name: `Station B ${suffix}`, code: `STA-B-${suffix}`.slice(0, 20) },
  });

  const vehicleA = await prisma.vehicle.create({
    data: {
      organizationId: orgA.id,
      homeStationId: stationA.id,
      licensePlate: `DA-A-${suffix}`.slice(0, 12),
      vin: `VINA${suffix}`.slice(0, 17).padEnd(17, '0'),
      make: 'Test',
      model: 'EV',
      year: 2025,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
  });
  const vehicleB = await prisma.vehicle.create({
    data: {
      organizationId: orgB.id,
      homeStationId: stationB.id,
      licensePlate: `DA-B-${suffix}`.slice(0, 12),
      vin: `VINB${suffix}`.slice(0, 17).padEnd(17, '0'),
      make: 'Test',
      model: 'EV',
      year: 2025,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
  });

  const processingActivityA = await prisma.processingActivity.create({
    data: {
      organizationId: orgA.id,
      activityCode: `fleet-gps-${suffix}`.slice(0, 40),
      title: `Fleet GPS ${suffix}`,
      policyFamilyId,
      versionNumber: 1,
      isCurrentVersion: true,
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      activatedAt: now,
      validFrom: now,
      purposeSummary: 'Live fleet map',
      dataCategories: {
        create: [{ organizationId: orgA.id, dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION }],
      },
      purposes: {
        create: [{ organizationId: orgA.id, purpose: PrivacyProcessingPurpose.LIVE_MAP }],
      },
    },
  });

  await prisma.enforcementPolicy.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      policyFamilyId: randomUUID(),
      versionNumber: 1,
      isCurrentVersion: true,
      status: PrivacyPolicyLifecycleStatus.ACTIVE,
      enforcementMode: PrivacyEnforcementMode.ENFORCE,
      dataCategory: PrivacyProcessingDataCategory.GPS_LOCATION,
      processingPurpose: PrivacyProcessingPurpose.LIVE_MAP,
      scopeType: PrivacyEnforcementScopeType.VEHICLE,
      pathId: 'live-gps',
      activatedAt: now,
      validFrom: now,
      vehicles: { create: [{ organizationId: orgA.id, vehicleId: vehicleA.id }] },
    },
  });

  const providerGrantA = await prisma.providerAccessGrant.create({
    data: {
      organizationId: orgA.id,
      processingActivityId: processingActivityA.id,
      vehicleId: vehicleA.id,
      provider: 'DIMO',
      providerStatus: ProviderAccessGrantStatus.ACTIVE,
      grantMechanism: ProviderAccessGrantMechanism.OAUTH,
      grantedAt: now,
      grantedScopes: { create: [{ organizationId: orgA.id, scopeKey: 'telemetry' }] },
    },
  });

  return { suffix, orgA, orgB, vehicleA, vehicleB, processingActivityA, providerGrantA };
}

export async function cleanupDataAuthStagingRuntimeFixture(
  prisma: PrismaClient,
  fixture: DataAuthStagingRuntimeFixture,
): Promise<void> {
  const orgIds = [fixture.orgA.id, fixture.orgB.id];
  await prisma.authorizationDecisionEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataAuthorizationAuditOutbox.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.providerAccessGrantScope.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.providerAccessGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicyVehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicy.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityCategory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityPurpose.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.station.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

export async function cleanupDataAuthPostgresFixture(
  prisma: PrismaClient,
  fixture: DataAuthPostgresFixture,
): Promise<void> {
  const orgIds = [fixture.orgA.id, fixture.orgB.id];

  await prisma.authorizationDecisionEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataAuthorizationAuditOutbox.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.consentWithdrawalPropagation.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataSubjectConsentStatusEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataSubjectConsent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.providerAccessGrantStatusEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.providerAccessGrantScope.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.providerAccessGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataSharingAuthorizationCategory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataSharingAuthorizationStatusEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataSharingAuthorization.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreementAuditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreementSharingLink.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreementTransferCountry.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreementSubprocessor.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreementDataLocation.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreementActivity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataProcessingAgreement.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicyVehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicyCustomer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicyBooking.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicyStation.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicyLifecycleEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.enforcementPolicy.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.legalBasisAssessmentEvidenceRef.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.legalBasisAssessmentLifecycleEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.legalBasisAssessment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDpiaDecision.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDpia.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityRiskAssessment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityRetentionException.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDeletionJobStep.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDeletionEvidence.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDeletionJob.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDeletionDecision.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityRetentionPolicy.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityRegisterAuditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityRegisterExport.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityLifecycleEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityCategory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityPurpose.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivityDataSubjectType.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.processingActivity.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.complianceEvidenceReportAuditEvent.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.complianceEvidenceReport.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.dataAuthorizationRevocationWorkflow.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.station.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

export function correlationId(suffix: string): string {
  return `corr-pg-${suffix}-${randomUUID()}`;
}

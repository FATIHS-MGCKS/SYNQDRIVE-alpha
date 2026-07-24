import {
  DataProcessingAgreementStatus,
  DataTransferMechanism,
  DpaAuditEventType,
  DpaSubprocessorStatus,
  ProcessorPartyRole,
  TransferAssessmentStatus,
} from '@prisma/client';
import { DpaAuditService } from './dpa-audit.service';
import { DpaContractGateService } from './dpa-contract-gate.service';
import { DataProcessingAgreementService } from './data-processing-agreement.service';
import { DpaSubprocessorService } from './dpa-subprocessor.service';
import { DpaTransferAssessmentService } from './dpa-transfer-assessment.service';
import { POLICY_RESOLVER_PROCESSOR_TYPE } from '../policy-resolver/policy-resolver.constants';

describe('Processor DPA integration (in-memory harness)', () => {
  const orgId = 'org-1';
  const activityId = 'pa-1';

  function buildHarness() {
    const agreements: Array<Record<string, unknown>> = [];
    const activities: Array<Record<string, unknown>> = [];
    const auditEvents: Array<Record<string, unknown>> = [];
    const subprocessors: Array<Record<string, unknown>> = [];
    const transferCountries: Array<Record<string, unknown>> = [];
    const activityLinks: Array<Record<string, unknown>> = [];

    const prisma = {
      processingActivity: {
        count: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length),
        findFirst: jest.fn(),
      },
      dataProcessingAgreement: {
        findMany: jest.fn(async () =>
          agreements.map((a) => ({
            ...a,
            linkedActivities: activityLinks.filter((l) => l.agreementId === a.id),
            transferCountries: transferCountries.filter((tc) => tc.agreementId === a.id),
            subprocessors: subprocessors.filter((sp) => sp.agreementId === a.id),
          })),
        ),
        findFirst: jest.fn(async ({ where }: { where: { id?: string; organizationId?: string } }) => {
          const row = agreements.find((a) => a.id === where.id && a.organizationId === where.organizationId);
          if (!row) return null;
          return {
            ...row,
            linkedActivities: activityLinks
              .filter((l) => l.agreementId === row.id)
              .map((l) => ({ processingActivity: { id: l.processingActivityId, title: 'A', activityCode: 'c' } })),
            subprocessors: subprocessors.filter((sp) => sp.agreementId === row.id),
            dataLocations: [],
            transferCountries: transferCountries.filter((tc) => tc.agreementId === row.id),
            sharingLinks: [],
            auditEvents: auditEvents.filter((e) => e.agreementId === row.id),
          };
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data };
          agreements.push(row);
          return row;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = agreements.find((a) => a.id === where.id);
          Object.assign(row!, data);
          return row;
        }),
        updateMany: jest.fn(),
      },
      dataProcessingAgreementActivity: {
        deleteMany: jest.fn(),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          activityLinks.push(data);
          return data;
        }),
      },
      dataProcessingAgreementSubprocessor: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          subprocessors.push(data);
          return data;
        }),
        findFirst: jest.fn(
          async ({ where }: { where: { id?: string; agreementId?: string; organizationId?: string } }) =>
            subprocessors.find(
              (sp) =>
                sp.id === where.id &&
                sp.agreementId === where.agreementId &&
                sp.organizationId === where.organizationId,
            ) ?? null,
        ),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = subprocessors.find((sp) => sp.id === where.id);
          Object.assign(row!, data);
          return row;
        }),
      },
      dataProcessingAgreementDataLocation: { create: jest.fn() },
      dataProcessingAgreementTransferCountry: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          transferCountries.push(data);
          return data;
        }),
      },
      dataProcessingAgreementAuditEvent: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          auditEvents.push(data);
          return data;
        }),
      },
      dataSharingAuthorization: { findFirst: jest.fn() },
      dataProcessingAgreementSharingLink: { create: jest.fn() },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));

    const audit = new DpaAuditService(prisma as never);
    const transferAssessment = new DpaTransferAssessmentService();
    const subprocessorsService = new DpaSubprocessorService(prisma as never, audit);
    const dpaService = new DataProcessingAgreementService(
      prisma as never,
      audit,
      subprocessorsService,
      transferAssessment,
    );
    const gate = new DpaContractGateService(prisma as never);

    return { prisma, agreements, activityLinks, auditEvents, subprocessors, transferCountries, dpaService, gate, subprocessorsService };
  }

  it('creates DPA with linked activities and transfer countries', async () => {
    const h = buildHarness();
    const created = await h.dpaService.create(
      orgId,
      {
        processorName: 'DIMO GmbH',
        processorRole: ProcessorPartyRole.PROCESSOR,
        processingActivityIds: [activityId],
        providerKind: 'TELEMATICS',
        transferCountries: [
          {
            countryCode: 'US',
            transferMechanism: DataTransferMechanism.STANDARD_CONTRACTUAL_CLAUSES,
          },
        ],
      },
      'user-1',
    );

    expect(created.processorName).toBe('DIMO GmbH');
    expect('documentStorageRef' in created).toBe(false);
    expect(h.auditEvents.some((e) => e.eventType === DpaAuditEventType.CREATED)).toBe(true);
  });

  it('blocks external processing without active DPA', async () => {
    const h = buildHarness();
    const result = await h.gate.evaluateForProcessing({
      organizationId: orgId,
      processingActivityId: activityId,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.EXTERNAL_PARTNER,
      processorId: 'partner-1',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toContain('DPA_MISSING');
  });

  it('allows external processing with signed active DPA', async () => {
    const h = buildHarness();
    h.agreements.push({
      id: 'dpa-1',
      organizationId: orgId,
      processorName: 'partner-1',
      status: DataProcessingAgreementStatus.ACTIVE,
      isCurrentVersion: true,
      processingActivityId: activityId,
      signedAt: new Date('2026-01-01'),
      effectiveFrom: new Date('2026-01-01'),
      effectiveUntil: new Date('2027-01-01'),
      transferAssessmentStatus: TransferAssessmentStatus.ASSESSED,
    });
    h.activityLinks.push({ agreementId: 'dpa-1', processingActivityId: activityId });

    const result = await h.gate.evaluateForProcessing({
      organizationId: orgId,
      processingActivityId: activityId,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM,
      processorId: 'partner-1',
    });
    expect(result.allowed).toBe(true);
  });

  it('requires review when subprocessor changes', async () => {
    const h = buildHarness();
    h.subprocessors.push({
      id: 'sp-1',
      organizationId: orgId,
      agreementId: 'dpa-1',
      name: 'Cloud host',
      status: DpaSubprocessorStatus.APPROVED,
      reviewRequired: false,
    });

    await h.subprocessorsService.update(
      orgId,
      'dpa-1',
      'sp-1',
      { name: 'New cloud host' },
      'user-1',
    );

    expect(
      h.auditEvents.some((e) => e.eventType === DpaAuditEventType.SUBPROCESSOR_REVIEW_REQUIRED),
    ).toBe(true);
  });
});

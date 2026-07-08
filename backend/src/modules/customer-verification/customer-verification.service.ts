import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerEligibilityPolicy,
  CustomerDocument,
  CustomerTimelineEventType,
  CustomerVerificationCheck,
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
  CustomerVerificationProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerVerificationPlanDto } from '@modules/customers/dto/verification-plan.dto';
import { CustomerVerificationReadModelService } from './customer-verification-read-model.service';
import { ManualPickupCheckDto } from './dto/manual-pickup-check.dto';
import { StartDiditSessionDto } from './dto/start-didit-session.dto';
import { DiditService } from './providers/didit/didit.service';
import { parseIsoDate } from './providers/didit/didit-decision.parser';
import {
  buildVerificationPlanDescription,
  kindForPlanDomain,
  mergeVerificationPlan,
  ResolvedVerificationPlan,
  VerificationPlanDecisionJson,
} from './types/customer-verification-plan.types';
import {
  CustomerVerificationEligibilityStatus,
  NormalizedDiditDecision,
  VERIFICATION_KIND_LABELS,
} from './types/customer-verification-eligibility.types';
import {
  buildDomainStatus,
  buildIdDocumentDisplayName,
  buildLicenseDisplayName,
  buildProofOfAddressDisplayName,
  computeMissingUploadSlots,
  documentTypeToVerificationKind,
} from './utils/customer-document-status.util';
import type { CustomerDocumentVerificationStatusDto } from './types/customer-document-status.types';
import {
  computeDocumentCategoryStatus,
  ID_DOCUMENT_TYPES,
  isDocumentStatusBlockingConfirm,
  LICENSE_DOCUMENT_TYPES,
  mergeKindCustomerStatus,
  POA_DOCUMENT_TYPES,
  resolveDocumentEligibilityStatus,
  resolveProofOfAddressStatus,
  normalizeVerificationStatus,
} from './utils/customer-verification-status.util';

type AuthUser = {
  id: string;
  organizationId?: string | null;
  platformRole?: string | null;
};

export type StartDiditSessionResponseDto = {
  url: string;
  sessionId: string;
  checkId: string;
  status: string;
};

type EligibilityOptions = {
  bookingId?: string | null;
  startDate?: Date | null;
  policy?: CustomerEligibilityPolicy;
};

@Injectable()
export class CustomerVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly diditService: DiditService,
    private readonly configService: ConfigService,
    private readonly readModelHelper: CustomerVerificationReadModelService,
  ) {}

  async startDiditSession(
    user: AuthUser,
    dto: StartDiditSessionDto,
  ): Promise<StartDiditSessionResponseDto> {
    const organizationId = await this.resolveOrganizationId(user, dto.customerId);
    await this.assertCustomerInOrg(organizationId, dto.customerId);

    if (dto.bookingId) {
      await this.assertBookingInOrg(
        organizationId,
        dto.bookingId,
        dto.customerId,
      );
    }

    const { didit, vendorData, mappedStatus } =
      await this.diditService.startSession({
        organizationId,
        customerId: dto.customerId,
        bookingId: dto.bookingId ?? null,
        kind: dto.kind,
      });

    const retentionDays = this.configService.get<number>(
      'didit.defaultRetentionDays',
      90,
    );
    const now = new Date();
    const retentionUntil = new Date(now);
    retentionUntil.setDate(retentionUntil.getDate() + retentionDays);

    const warnings = mappedStatus.warning
      ? [{ source: 'didit_status_mapper', message: mappedStatus.warning }]
      : undefined;

    const check = await this.prisma.customerVerificationCheck.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        bookingId: dto.bookingId ?? null,
        provider: CustomerVerificationProvider.DIDIT,
        kind: dto.kind,
        status: mappedStatus.status,
        providerSessionId: didit.session_id,
        providerWorkflowId: didit.workflow_id,
        providerStatus: didit.status,
        providerUrl: didit.url,
        vendorData,
        warnings,
        startedAt: now,
        retentionUntil,
      },
    });

    await this.syncCustomerReadModel(organizationId, dto.customerId);

    await this.logDiditSessionStarted(check, user.id);

    return {
      url: check.providerUrl!,
      sessionId: check.providerSessionId!,
      checkId: check.id,
      status: check.status,
    };
  }

  async listCustomerVerificationChecks(
    organizationId: string,
    customerId: string,
    bookingId?: string | null,
  ): Promise<CustomerVerificationCheck[]> {
    await this.assertCustomerInOrg(organizationId, customerId);
    return this.prisma.customerVerificationCheck.findMany({
      where: {
        organizationId,
        customerId,
        ...(bookingId ? { bookingId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getEligibilityStatus(
    organizationId: string,
    customerId: string,
    options: EligibilityOptions = {},
  ): Promise<CustomerVerificationEligibilityStatus> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found in this organization');
    }

    const policy =
      options.policy ?? (await this.getOrCreatePolicy(organizationId));
    const refDate = options.startDate ?? new Date();

    const [docs, checks] = await Promise.all([
      this.prisma.customerDocument.findMany({
        where: { organizationId, customerId },
      }),
      this.prisma.customerVerificationCheck.findMany({
        where: { organizationId, customerId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const latestCheckByKind = this.indexLatestChecksByKind(checks);

    const idDocStatus = computeDocumentCategoryStatus(
      docs,
      ID_DOCUMENT_TYPES,
      customer.idExpiry,
      refDate,
    );
    const licenseDocStatus = computeDocumentCategoryStatus(
      docs,
      LICENSE_DOCUMENT_TYPES,
      customer.licenseExpiry,
      refDate,
    );
    const poaDocStatus = computeDocumentCategoryStatus(
      docs,
      POA_DOCUMENT_TYPES,
      null,
      refDate,
    );

    const hasIdSubmission = docs.some((d) => ID_DOCUMENT_TYPES.includes(d.type));
    const hasLicenseSubmission = docs.some((d) =>
      LICENSE_DOCUMENT_TYPES.includes(d.type),
    );
    const hasPoaActivity =
      docs.some((d) => POA_DOCUMENT_TYPES.includes(d.type)) ||
      checks.some((c) => c.kind === 'PROOF_OF_ADDRESS');

    const idDocument = resolveDocumentEligibilityStatus(
      'ID_DOCUMENT',
      latestCheckByKind.get('ID_DOCUMENT') ?? null,
      idDocStatus,
      {
        requireForConfirm: policy.requireVerifiedIdForConfirmedBooking,
        requireForPickup: policy.requireVerifiedIdForPickup,
        hasAnySubmission:
          hasIdSubmission || latestCheckByKind.has('ID_DOCUMENT'),
      },
    );

    const drivingLicense = resolveDocumentEligibilityStatus(
      'DRIVING_LICENSE',
      latestCheckByKind.get('DRIVING_LICENSE') ?? null,
      licenseDocStatus,
      {
        requireForConfirm: policy.requireVerifiedLicenseForConfirmedBooking,
        requireForPickup: policy.requireVerifiedLicenseForPickup,
        hasAnySubmission:
          hasLicenseSubmission || latestCheckByKind.has('DRIVING_LICENSE'),
      },
    );

    const proofOfAddress = resolveProofOfAddressStatus(
      latestCheckByKind.get('PROOF_OF_ADDRESS') ?? null,
      poaDocStatus,
      hasPoaActivity,
    );

    const warnings: string[] = [];
    const confirmBlockingReasons: string[] = [];

    if (policy.requireVerifiedIdForConfirmedBooking) {
      if (isDocumentStatusBlockingConfirm(idDocument)) {
        confirmBlockingReasons.push(
          'Ausweisprüfung für Buchungsbestätigung erforderlich',
        );
      } else if (idDocument !== 'verified' && idDocument !== 'pickup_required') {
        warnings.push('Ausweisprüfung noch nicht abgeschlossen');
      }
    }

    if (policy.requireVerifiedLicenseForConfirmedBooking) {
      if (isDocumentStatusBlockingConfirm(drivingLicense)) {
        confirmBlockingReasons.push(
          'Führerscheinprüfung für Buchungsbestätigung erforderlich',
        );
      } else if (
        drivingLicense !== 'verified' &&
        drivingLicense !== 'pickup_required'
      ) {
        warnings.push('Führerscheinprüfung noch nicht abgeschlossen');
      }
    }

    if (policy.requireVerifiedIdForPickup && idDocument === 'pickup_required') {
      warnings.push('Ausweisprüfung beim Pickup vorgesehen');
    }
    if (
      policy.requireVerifiedLicenseForPickup &&
      drivingLicense === 'pickup_required'
    ) {
      warnings.push('Führerscheinprüfung beim Pickup vorgesehen');
    }

    if (proofOfAddress === 'required' || proofOfAddress === 'pending') {
      warnings.push('Adressnachweis optional — noch nicht bestätigt');
    }
    if (proofOfAddress === 'rejected') {
      warnings.push('Adressnachweis abgelehnt — manuelle Prüfung empfohlen');
    }

    const canConfirmBooking =
      confirmBlockingReasons.length === 0 &&
      (!policy.requireVerifiedIdForConfirmedBooking || idDocument === 'verified') &&
      (!policy.requireVerifiedLicenseForConfirmedBooking ||
        drivingLicense === 'verified');

    const pickupBlockingReasons: string[] = [];
    if (policy.requireVerifiedIdForPickup && idDocument !== 'verified') {
      pickupBlockingReasons.push('Ausweisprüfung für Pickup erforderlich');
    }
    if (
      policy.requireVerifiedLicenseForPickup &&
      drivingLicense !== 'verified'
    ) {
      pickupBlockingReasons.push('Führerscheinprüfung für Pickup erforderlich');
    }

    const canStartPickup = pickupBlockingReasons.length === 0;

    return {
      customerId,
      bookingId: options.bookingId ?? null,
      idDocument,
      drivingLicense,
      proofOfAddress,
      canConfirmBooking,
      canStartPickup,
      confirmBlockingReasons,
      pickupBlockingReasons,
      blockingReasons: [...confirmBlockingReasons],
      warnings,
    };
  }

  async syncCustomerReadModel(
    organizationId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const [docs, checks] = await Promise.all([
      this.prisma.customerDocument.findMany({
        where: { organizationId, customerId },
      }),
      this.prisma.customerVerificationCheck.findMany({
        where: { organizationId, customerId },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const latestCheckByKind = this.indexLatestChecksByKind(checks);
    const now = new Date();

    const idStatus = mergeKindCustomerStatus(
      latestCheckByKind.get('ID_DOCUMENT') ?? null,
      computeDocumentCategoryStatus(
        docs,
        ID_DOCUMENT_TYPES,
        customer.idExpiry,
        now,
      ),
    );
    const licenseStatus = mergeKindCustomerStatus(
      latestCheckByKind.get('DRIVING_LICENSE') ?? null,
      computeDocumentCategoryStatus(
        docs,
        LICENSE_DOCUMENT_TYPES,
        customer.licenseExpiry,
        now,
      ),
    );

    const idCheck = latestCheckByKind.get('ID_DOCUMENT');
    const licenseCheck = latestCheckByKind.get('DRIVING_LICENSE');

    const data: Prisma.CustomerUpdateInput = {
      idVerificationStatus: idStatus,
      licenseVerificationStatus: licenseStatus,
      idVerified: idStatus === 'VERIFIED',
      licenseVerified: licenseStatus === 'VERIFIED',
    };

    if (idCheck?.extractedJson) {
      this.applyIdExtractedFields(data, idCheck.extractedJson);
    }
    if (licenseCheck?.extractedJson) {
      this.applyLicenseExtractedFields(data, licenseCheck.extractedJson);
    }

    await this.prisma.customer.update({
      where: { id: customerId },
      data,
    });
  }

  async applyDiditDecision(params: {
    checkId?: string;
    sessionId?: string;
    normalizedDecision: NormalizedDiditDecision;
  }): Promise<CustomerVerificationCheck> {
    const check = await this.findCheckByIdOrSession(
      params.checkId,
      params.sessionId,
    );

    const now = new Date();
    const updateData: Prisma.CustomerVerificationCheckUpdateInput = {
      status: params.normalizedDecision.status,
      providerStatus: params.normalizedDecision.providerStatus ?? null,
      providerWorkflowId: params.normalizedDecision.workflowId ?? undefined,
      vendorData: params.normalizedDecision.vendorData ?? undefined,
      decisionJson: params.normalizedDecision.decisionJson ?? Prisma.JsonNull,
      extractedJson: params.normalizedDecision.extractedJson ?? Prisma.JsonNull,
      warnings: params.normalizedDecision.warnings ?? Prisma.JsonNull,
    };

    if (this.readModelHelper.isTerminalStatus(params.normalizedDecision.status)) {
      updateData.completedAt = now;
    }

    const updated = await this.prisma.customerVerificationCheck.update({
      where: { id: check.id },
      data: updateData,
    });

    await this.syncCustomerReadModel(updated.organizationId, updated.customerId);
    await this.logVerificationTimeline(updated, params.normalizedDecision.status);

    return updated;
  }

  async recordManualDocumentReview(params: {
    organizationId: string;
    customerId: string;
    document: CustomerDocument;
    status: 'VERIFIED' | 'REJECTED';
    userId?: string | null;
    rejectedReason?: string | null;
  }): Promise<CustomerVerificationCheck> {
    const kind = documentTypeToVerificationKind(params.document.type);
    if (!kind) {
      throw new BadRequestException('Unsupported document type for verification check');
    }

    const reviewedAt = params.document.reviewedAt ?? new Date();
    const checkStatus = params.status === 'VERIFIED' ? 'VERIFIED' : 'REJECTED';
    const decisionJson = {
      documentId: params.document.id,
      documentType: params.document.type,
      manualReview: true,
      reviewedByUserId: params.userId ?? null,
      reviewedAt: reviewedAt.toISOString(),
      rejectedReason: params.rejectedReason ?? null,
    };

    const existingChecks = await this.prisma.customerVerificationCheck.findMany({
      where: {
        organizationId: params.organizationId,
        customerId: params.customerId,
        kind,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const manualCheck = existingChecks.find(
      (check) =>
        check.provider === CustomerVerificationProvider.MANUAL &&
        check.decisionJson &&
        typeof check.decisionJson === 'object' &&
        !Array.isArray(check.decisionJson) &&
        (check.decisionJson as Record<string, unknown>).manualReview === true,
    );

    let check: CustomerVerificationCheck;
    if (manualCheck) {
      check = await this.prisma.customerVerificationCheck.update({
        where: { id: manualCheck.id },
        data: {
          status: checkStatus,
          checkedByUserId: params.userId ?? null,
          startedAt: manualCheck.startedAt ?? reviewedAt,
          completedAt: reviewedAt,
          decisionJson,
        },
      });
    } else {
      check = await this.prisma.customerVerificationCheck.create({
        data: {
          organizationId: params.organizationId,
          customerId: params.customerId,
          provider: CustomerVerificationProvider.MANUAL,
          kind,
          status: checkStatus,
          checkedByUserId: params.userId ?? null,
          startedAt: reviewedAt,
          completedAt: reviewedAt,
          decisionJson,
        },
      });
    }

    await this.syncCustomerReadModel(params.organizationId, params.customerId);
    await this.logVerificationTimeline(
      check,
      checkStatus,
      params.userId ?? undefined,
      'manual',
    );

    return check;
  }

  async getDocumentVerificationStatus(
    organizationId: string,
    customerId: string,
  ): Promise<CustomerDocumentVerificationStatusDto> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found in this organization');
    }

    const [documents, checks, policy] = await Promise.all([
      this.prisma.customerDocument.findMany({
        where: { organizationId, customerId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerVerificationCheck.findMany({
        where: { organizationId, customerId },
        orderBy: { updatedAt: 'desc' },
      }),
      this.getOrCreatePolicy(organizationId),
    ]);

    const latestCheckByKind = this.indexLatestChecksByKind(checks);
    const eligibility = await this.getEligibilityStatus(organizationId, customerId, {
      policy,
    });

    const userIds = new Set<string>();
    for (const check of checks) {
      if (check.checkedByUserId) userIds.add(check.checkedByUserId);
    }
    for (const doc of documents) {
      if (doc.reviewedByUserId) userIds.add(doc.reviewedByUserId);
      if (doc.uploadedByUserId) userIds.add(doc.uploadedByUserId);
    }

    const users =
      userIds.size > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true, firstName: true, lastName: true },
          })
        : [];

    const userNames = new Map(
      users.map((user) => [
        user.id,
        user.name?.trim() ||
          [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
          'Mitarbeiter',
      ]),
    );

    const idDocument = buildDomainStatus({
      kind: 'ID_DOCUMENT',
      customer,
      documents,
      latestCheck: latestCheckByKind.get('ID_DOCUMENT') ?? null,
      documentTypes: ID_DOCUMENT_TYPES,
      expiryDate: customer.idExpiry,
      displayName: buildIdDocumentDisplayName(customer),
      documentNumber: customer.idNumber,
      userNames,
    });

    const drivingLicense = buildDomainStatus({
      kind: 'DRIVING_LICENSE',
      customer,
      documents,
      latestCheck: latestCheckByKind.get('DRIVING_LICENSE') ?? null,
      documentTypes: LICENSE_DOCUMENT_TYPES,
      expiryDate: customer.licenseExpiry,
      displayName: buildLicenseDisplayName(customer),
      documentNumber: customer.licenseNumber,
      userNames,
    });

    const proofOfAddress = buildDomainStatus({
      kind: 'PROOF_OF_ADDRESS',
      customer,
      documents,
      latestCheck: latestCheckByKind.get('PROOF_OF_ADDRESS') ?? null,
      documentTypes: POA_DOCUMENT_TYPES,
      expiryDate: null,
      displayName: buildProofOfAddressDisplayName(),
      proofOfAddressEligibility: eligibility.proofOfAddress,
      userNames,
    });

    const missingUploadSlots = computeMissingUploadSlots({
      idDocument,
      drivingLicense,
      proofOfAddress,
      documents,
    });

    return {
      customerId,
      idDocument,
      drivingLicense,
      proofOfAddress,
      missingUploadSlots,
    };
  }

  async createManualPickupCheck(
    user: AuthUser,
    dto: ManualPickupCheckDto,
  ): Promise<{ checks: CustomerVerificationCheck[] }> {
    const organizationId = await this.resolveOrganizationId(user, dto.customerId);
    await this.assertCustomerInOrg(organizationId, dto.customerId);
    await this.assertBookingInOrg(
      organizationId,
      dto.bookingId,
      dto.customerId,
    );

    const idStatus = this.resolvePickupKindStatus(dto.idDocumentSeen, [
      dto.idDocumentSeen,
      dto.idNameMatchesBooking,
      dto.idDateOfBirthChecked,
      dto.minimumAgePassed,
    ]);
    const licenseStatus = this.resolvePickupKindStatus(dto.drivingLicenseSeen, [
      dto.drivingLicenseSeen,
      dto.licenseNameMatchesBooking,
      dto.licenseClassValid,
      dto.licenseNotExpired,
      dto.minimumLicenseDurationPassed ?? true,
    ]);

    const decisionJson = {
      pickupChecklist: {
        idDocumentSeen: dto.idDocumentSeen,
        idNameMatchesBooking: dto.idNameMatchesBooking,
        idDateOfBirthChecked: dto.idDateOfBirthChecked,
        minimumAgePassed: dto.minimumAgePassed,
        drivingLicenseSeen: dto.drivingLicenseSeen,
        licenseNameMatchesBooking: dto.licenseNameMatchesBooking,
        licenseClassValid: dto.licenseClassValid,
        licenseNotExpired: dto.licenseNotExpired,
        minimumLicenseDurationPassed: dto.minimumLicenseDurationPassed ?? null,
      },
      notes: dto.notes ?? null,
    };

    const now = new Date();
    const checks: CustomerVerificationCheck[] = [];

    for (const [kind, status] of [
      ['ID_DOCUMENT', idStatus],
      ['DRIVING_LICENSE', licenseStatus],
    ] as const) {
      const created = await this.prisma.customerVerificationCheck.create({
        data: {
          organizationId,
          customerId: dto.customerId,
          bookingId: dto.bookingId,
          provider: CustomerVerificationProvider.MANUAL,
          kind,
          status,
          checkedByUserId: user.id,
          startedAt: now,
          completedAt:
            status === 'VERIFIED' || status === 'REJECTED' ? now : null,
          decisionJson,
        },
      });
      checks.push(created);
      await this.logVerificationTimeline(created, status, user.id, 'pickup');
    }

    await this.syncCustomerReadModel(organizationId, dto.customerId);

    await this.prisma.customerTimelineEvent.create({
      data: {
        organizationId,
        customerId: dto.customerId,
        type: 'NOTE_ADDED',
        title: 'Pickup-Prüfung dokumentiert',
        description: dto.notes?.trim() || 'Operative Pickup-Prüfung erfasst.',
        metadata: {
          bookingId: dto.bookingId,
          verificationCheckIds: checks.map((c) => c.id),
        },
        createdByUserId: user.id,
      },
    });

    return { checks };
  }

  async getEligibilityForUser(
    user: AuthUser,
    customerId: string,
    bookingId?: string,
  ) {
    const organizationId = await this.resolveOrganizationId(user, customerId);
    return this.getEligibilityStatus(organizationId, customerId, { bookingId });
  }

  async listChecksForUser(
    user: AuthUser,
    customerId: string,
    bookingId?: string,
  ) {
    const organizationId = await this.resolveOrganizationId(user, customerId);
    return this.listCustomerVerificationChecks(
      organizationId,
      customerId,
      bookingId,
    );
  }

  /**
   * Documents the operator-selected verification strategy at customer create.
   * CustomerVerificationCheck is the canonical record — no read-model verification is set.
   */
  async applyVerificationPlanFromCreate(params: {
    organizationId: string;
    customerId: string;
    plan?: CustomerVerificationPlanDto;
    userId?: string | null;
  }): Promise<{ checks: CustomerVerificationCheck[] }> {
    const { organizationId, customerId, plan, userId } = params;
    await this.assertCustomerInOrg(organizationId, customerId);

    const policy = await this.getOrCreatePolicy(organizationId);
    const resolved = mergeVerificationPlan(plan, policy);
    const now = new Date();
    const selectedAt = now.toISOString();

    const existingChecks = await this.prisma.customerVerificationCheck.findMany({
      where: { organizationId, customerId },
      orderBy: { updatedAt: 'desc' },
    });

    const checks: CustomerVerificationCheck[] = [];
    const authUser: AuthUser = { id: userId ?? 'system', organizationId };

    const domains: Array<{
      domain: keyof ResolvedVerificationPlan;
      method: string;
      note?: string;
      skip?: boolean;
    }> = [
      {
        domain: 'idDocument',
        method: resolved.idDocument.method,
        note: resolved.idDocument.note,
      },
      {
        domain: 'drivingLicense',
        method: resolved.drivingLicense.method,
        note: resolved.drivingLicense.note,
      },
      {
        domain: 'proofOfAddress',
        method: resolved.proofOfAddress.method,
        note: resolved.proofOfAddress.note,
        skip: resolved.proofOfAddress.method === 'NOT_REQUIRED',
      },
    ];

    for (const entry of domains) {
      if (entry.skip || entry.domain === 'autoStartDidit') continue;

      const kind = kindForPlanDomain(
        entry.domain as 'idDocument' | 'drivingLicense' | 'proofOfAddress',
      );

      if (this.hasCreateCustomerPlanCheck(existingChecks, kind)) {
        const existing = existingChecks.find(
          (c) =>
            c.kind === kind && this.isCreateCustomerPlanCheck(c),
        );
        if (existing) checks.push(existing);
        continue;
      }

      const decisionBase: VerificationPlanDecisionJson = {
        selectedAt,
        selectedBy: userId ?? null,
        source: 'CREATE_CUSTOMER',
        method: entry.method,
        note: entry.note?.trim() || null,
      };

      if (entry.method === 'DIDIT' && resolved.autoStartDidit) {
        const session = await this.startDiditSession(authUser, {
          customerId,
          kind,
        });
        const started = await this.prisma.customerVerificationCheck.update({
          where: { id: session.checkId },
          data: {
            decisionJson: {
              ...decisionBase,
              autoStarted: true,
            } as Prisma.InputJsonValue,
          },
        });
        checks.push(started);
        continue;
      }

      const { provider, status, decisionJson } = this.mapPlanMethodToCheck(
        entry.method,
        decisionBase,
      );

      const created = await this.prisma.customerVerificationCheck.create({
        data: {
          organizationId,
          customerId,
          provider,
          kind,
          status,
          decisionJson: decisionJson as Prisma.InputJsonValue,
          checkedByUserId: entry.method === 'MANUAL' ? userId ?? null : null,
          startedAt: now,
        },
      });
      checks.push(created);
    }

    if (checks.length > 0) {
      await this.syncCustomerReadModel(organizationId, customerId);
      await this.logVerificationPlanTimeline(
        organizationId,
        customerId,
        resolved,
        checks.map((c) => c.id),
        userId,
      );
    }

    return { checks };
  }

  normalizeVerificationStatus(
    customerStatus: import('@prisma/client').CustomerVerificationStatus,
    options: {
      requireForConfirm: boolean;
      requireForPickup: boolean;
      hasAnySubmission: boolean;
    },
  ) {
    return normalizeVerificationStatus(customerStatus, options);
  }

  private resolvePickupKindStatus(
    seen: boolean,
    fields: boolean[],
  ): CustomerVerificationCheckStatus {
    if (!seen) return 'REJECTED';
    if (fields.every(Boolean)) return 'VERIFIED';
    return 'REQUIRES_REVIEW';
  }

  private mapPlanMethodToCheck(
    method: string,
    decisionBase: VerificationPlanDecisionJson,
  ): {
    provider: CustomerVerificationProvider;
    status: CustomerVerificationCheckStatus;
    decisionJson: VerificationPlanDecisionJson;
  } {
    switch (method) {
      case 'DIDIT':
        return {
          provider: CustomerVerificationProvider.DIDIT,
          status: 'NOT_STARTED',
          decisionJson: decisionBase,
        };
      case 'PICKUP':
        return {
          provider: CustomerVerificationProvider.MANUAL,
          status: 'NOT_STARTED',
          decisionJson: { ...decisionBase, plannedFor: 'PICKUP' },
        };
      case 'DEFERRED':
        return {
          provider: CustomerVerificationProvider.MANUAL,
          status: 'NOT_STARTED',
          decisionJson: decisionBase,
        };
      case 'MANUAL':
      default:
        return {
          provider: CustomerVerificationProvider.MANUAL,
          status: 'NOT_STARTED',
          decisionJson: decisionBase,
        };
    }
  }

  private isCreateCustomerPlanCheck(check: CustomerVerificationCheck): boolean {
    if (!check.decisionJson || typeof check.decisionJson !== 'object' || Array.isArray(check.decisionJson)) {
      return false;
    }
    return (check.decisionJson as Record<string, unknown>).source === 'CREATE_CUSTOMER';
  }

  private hasCreateCustomerPlanCheck(
    checks: CustomerVerificationCheck[],
    kind: CustomerVerificationCheckKind,
  ): boolean {
    return checks.some((c) => c.kind === kind && this.isCreateCustomerPlanCheck(c));
  }

  private async logVerificationPlanTimeline(
    organizationId: string,
    customerId: string,
    plan: ResolvedVerificationPlan,
    checkIds: string[],
    userId?: string | null,
  ): Promise<void> {
    await this.prisma.customerTimelineEvent.create({
      data: {
        organizationId,
        customerId,
        type: 'UPDATED',
        title: 'Verifikationsweg festgelegt',
        description: buildVerificationPlanDescription(plan),
        metadata: {
          eventKind: 'VERIFICATION_PLAN_SELECTED',
          verificationCheckIds: checkIds,
          verificationPlan: {
            idDocument: plan.idDocument.method,
            drivingLicense: plan.drivingLicense.method,
            proofOfAddress: plan.proofOfAddress.method,
            autoStartDidit: plan.autoStartDidit,
          },
        },
        createdByUserId: userId ?? null,
      },
    });
  }

  private async findCheckByIdOrSession(
    checkId?: string,
    sessionId?: string,
  ): Promise<CustomerVerificationCheck> {
    if (checkId) {
      const byId = await this.prisma.customerVerificationCheck.findUnique({
        where: { id: checkId },
      });
      if (byId) return byId;
    }
    if (sessionId) {
      const bySession = await this.prisma.customerVerificationCheck.findFirst({
        where: {
          provider: CustomerVerificationProvider.DIDIT,
          providerSessionId: sessionId,
        },
      });
      if (bySession) return bySession;
    }
    throw new NotFoundException('Customer verification check not found');
  }

  private indexLatestChecksByKind(
    checks: CustomerVerificationCheck[],
  ): Map<CustomerVerificationCheckKind, CustomerVerificationCheck> {
    const map = new Map<CustomerVerificationCheckKind, CustomerVerificationCheck>();
    for (const check of checks) {
      if (!map.has(check.kind)) map.set(check.kind, check);
    }
    return map;
  }

  private async logDiditSessionStarted(
    check: CustomerVerificationCheck,
    userId?: string,
  ): Promise<void> {
    const kindLabel = VERIFICATION_KIND_LABELS[check.kind];
    await this.prisma.customerTimelineEvent.create({
      data: {
        organizationId: check.organizationId,
        customerId: check.customerId,
        type: 'UPDATED',
        title: 'KYC-Prüfung über Didit gestartet',
        description: `${kindLabel} über Didit gestartet.`,
        metadata: {
          verificationCheckId: check.id,
          provider: check.provider,
          kind: check.kind,
          status: check.status,
        },
        createdByUserId: userId ?? null,
      },
    });
  }

  private async logVerificationTimeline(
    check: CustomerVerificationCheck,
    status: CustomerVerificationCheckStatus,
    userId?: string,
    source: 'didit' | 'pickup' | 'manual' = 'didit',
  ): Promise<void> {
    let type: CustomerTimelineEventType | null = null;
    let title: string | null = null;

    const kindLabel = VERIFICATION_KIND_LABELS[check.kind];

    if (status === 'VERIFIED') {
      type = 'DOCUMENT_VERIFIED';
      title =
        source === 'pickup'
          ? `Pickup-Prüfung bestätigt (${kindLabel})`
          : source === 'didit'
            ? `${kindLabel} über Didit erfolgreich`
            : `${kindLabel} manuell bestätigt`;
    } else if (status === 'REJECTED') {
      type = 'DOCUMENT_REJECTED';
      title =
        source === 'pickup'
          ? `Pickup-Prüfung abgelehnt (${kindLabel})`
          : source === 'didit'
            ? `${kindLabel} über Didit abgelehnt`
            : `${kindLabel} manuell abgelehnt`;
    } else if (status === 'REQUIRES_REVIEW') {
      type = 'UPDATED';
      title =
        source === 'didit'
          ? `${kindLabel} — manuelle Prüfung erforderlich`
          : `${kindLabel} — manuelle Prüfung erforderlich`;
    }

    if (!type || !title) return;

    const description =
      source === 'didit'
        ? `${kindLabel} wurde über Didit geprüft.`
        : source === 'pickup'
          ? `${kindLabel} wurde bei der Übergabe geprüft.`
          : `${kindLabel} wurde manuell durch einen Mitarbeiter geprüft.`;

    await this.prisma.customerTimelineEvent.create({
      data: {
        organizationId: check.organizationId,
        customerId: check.customerId,
        type,
        title,
        description,
        metadata: {
          verificationCheckId: check.id,
          provider: check.provider,
          kind: check.kind,
          status,
        },
        createdByUserId: userId ?? null,
      },
    });
  }

  private applyIdExtractedFields(
    data: Prisma.CustomerUpdateInput,
    extractedJson: Prisma.JsonValue,
  ): void {
    if (!extractedJson || typeof extractedJson !== 'object' || Array.isArray(extractedJson)) {
      return;
    }
    const extracted = extractedJson as Record<string, unknown>;
    const dob = parseIsoDate(
      typeof extracted.date_of_birth === 'string' ? extracted.date_of_birth : undefined,
    );
    const idExpiry = parseIsoDate(
      typeof extracted.expiration_date === 'string'
        ? extracted.expiration_date
        : undefined,
    );
    if (dob) data.dateOfBirth = dob;
    if (idExpiry) data.idExpiry = idExpiry;
  }

  private applyLicenseExtractedFields(
    data: Prisma.CustomerUpdateInput,
    extractedJson: Prisma.JsonValue,
  ): void {
    if (!extractedJson || typeof extractedJson !== 'object' || Array.isArray(extractedJson)) {
      return;
    }
    const extracted = extractedJson as Record<string, unknown>;
    const licenseExpiry = parseIsoDate(
      typeof extracted.expiration_date === 'string'
        ? extracted.expiration_date
        : undefined,
    );
    if (licenseExpiry) data.licenseExpiry = licenseExpiry;
  }

  private async getOrCreatePolicy(
    organizationId: string,
  ): Promise<CustomerEligibilityPolicy> {
    const existing = await this.prisma.customerEligibilityPolicy.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;
    return this.prisma.customerEligibilityPolicy.create({
      data: { organizationId },
    });
  }

  private async resolveOrganizationId(
    user: AuthUser,
    customerId: string,
  ): Promise<string> {
    if (!user?.id) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.platformRole === 'MASTER_ADMIN') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { organizationId: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      return customer.organizationId;
    }

    const organizationId = user.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('No organization context in token');
    }
    return organizationId;
  }

  private async assertCustomerInOrg(
    organizationId: string,
    customerId: string,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found in this organization');
    }
  }

  private async assertBookingInOrg(
    organizationId: string,
    bookingId: string,
    customerId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: { id: true, customerId: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found in this organization');
    }
    if (booking.customerId !== customerId) {
      throw new ForbiddenException(
        'Booking does not belong to the specified customer',
      );
    }
  }
}

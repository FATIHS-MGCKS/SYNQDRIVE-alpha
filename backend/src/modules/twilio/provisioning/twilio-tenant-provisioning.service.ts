import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ActivityAction,
  ActivityEntity,
  Prisma,
  VoiceControlPlaneProvider,
  VoicePhoneNumberLifecycle,
  VoicePhoneRegulatoryStatus,
  VoiceProviderAccountStatus,
  VoiceProviderAccountType,
  VoiceProvisioningErrorClass,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
  VoiceSubscriptionStatus,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { TWILIO_DEFAULT_EDGE, TWILIO_DEFAULT_REGION } from '@config/index';
import { PrismaService } from '@shared/database/prisma.service';
import { TwilioControlPlaneClient } from '../twilio-control-plane.client';
import { TwilioTenantClientFactory } from '../twilio-tenant-client.factory';
import {
  TwilioInvalidConfigurationError,
  TwilioProviderError,
  TwilioTenantIsolationViolationError,
} from '../errors/twilio-provider.errors';
import {
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
  VoiceSubscriptionRepository,
} from '@modules/voice-assistant/control-plane/voice-control-plane.repository';
import { isVoiceStagingOrganization } from '@modules/voice-assistant/staging/voice-staging.constants';
import {
  readTwilioProvisioningFlags,
  TWILIO_PROVISIONING_DEFAULTS,
} from './twilio-provisioning.config';
import {
  digestCanonicalValue,
  mapOverallRegulatoryStatus,
  mapRegulatoryItemStatus,
  maskE164,
  maskTwilioSid,
  sanitizeTwilioProvisioningLogMessage,
} from './twilio-provisioning.masking';
import { TwilioProvisioningProviderClient } from './twilio-provisioning-provider.client';
import { TwilioSecretStoreService } from './twilio-secret-store.service';
import type {
  TwilioCredentialRegistrationResult,
  TwilioPhoneNumberPurchaseInput,
  TwilioPhoneNumberPurchaseResult,
  TwilioPhoneNumberSearchInput,
  TwilioPhoneNumberSearchResponse,
  TwilioProvisioningActor,
  TwilioProvisioningJobView,
  TwilioProvisioningPreview,
  TwilioRegulatoryStatusView,
  TwilioSubaccountProvisionInput,
  TwilioSubaccountProvisionResult,
} from './twilio-provisioning.types';

type SearchCacheEntry = {
  expiresAt: number;
  results: TwilioPhoneNumberSearchResponse['results'];
};

type SelectionCacheEntry = {
  organizationId: string;
  phoneNumber: string;
  expiresAt: number;
};

@Injectable()
export class TwilioTenantProvisioningService {
  private readonly logger = new Logger(TwilioTenantProvisioningService.name);
  private readonly searchCache = new Map<string, SearchCacheEntry>();
  private readonly selectionCache = new Map<string, SelectionCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly controlPlane: TwilioControlPlaneClient,
    private readonly tenantClientFactory: TwilioTenantClientFactory,
    private readonly providerClient: TwilioProvisioningProviderClient,
    private readonly secretStore: TwilioSecretStoreService,
    private readonly subscriptionRepository: VoiceSubscriptionRepository,
    private readonly phoneNumberRepository: VoicePhoneNumberRepository,
    private readonly provisioningJobRepository: VoiceProvisioningJobRepository,
    private readonly audit: AuditService,
  ) {}

  async previewProvisioning(
    organizationId: string,
    options?: { numberType?: 'local' | 'mobile' },
  ): Promise<TwilioProvisioningPreview> {
    const context = await this.loadProvisioningContext(organizationId);
    const regulatory = await this.resolveRegulatoryStatus(organizationId, false);
    const blockers = [...context.blockers];
    const warnings = [...context.warnings];

    if (!context.parentTwilioConfigured) {
      blockers.push('Parent Twilio control-plane credentials are not configured.');
    }
    if (!context.voiceSubscriptionActive) {
      blockers.push('Active voice subscription is required before provisioning.');
    }
    if (context.trialRestricted) {
      warnings.push('Organization is in trial — cost-incurring actions remain restricted.');
    }
    if (regulatory.overall !== 'APPROVED' && regulatory.overall !== 'UNKNOWN') {
      warnings.push('Regulatory compliance is not fully approved for Germany numbers.');
    }

    return {
      organizationId,
      mutating: false,
      ready: blockers.length === 0,
      blockers,
      warnings,
      existingSubaccount: context.existingSubaccount,
      maskedSubaccountRef: context.maskedSubaccountRef,
      voiceSubscriptionActive: context.voiceSubscriptionActive,
      voiceSubscriptionStatus: context.voiceSubscriptionStatus,
      parentTwilioConfigured: context.parentTwilioConfigured,
      region: TWILIO_DEFAULT_REGION,
      edge: TWILIO_DEFAULT_EDGE,
      numberType: options?.numberType ?? TWILIO_PROVISIONING_DEFAULTS.defaultNumberType,
      regulatory,
      expectedSteps: this.buildExpectedSteps(context.existingSubaccount),
      trialRestricted: context.trialRestricted,
    };
  }

  async provisionSubaccount(
    input: TwilioSubaccountProvisionInput,
  ): Promise<TwilioSubaccountProvisionResult> {
    this.assertProvisioningConfirmation(input.actor);
    const flags = readTwilioProvisioningFlags();
    const dryRun = input.actor.dryRun === true || !flags.stagingProviderActionsEnabled;
    const preview = await this.previewProvisioning(input.organizationId);
    if (!preview.ready && !preview.existingSubaccount) {
      throw new BadRequestException(preview.blockers.join(' '));
    }
    this.assertMutationsAllowed(flags, dryRun);

    const { job, created } = await this.provisioningJobRepository.persistOrGet({
      organizationId: input.organizationId,
      jobType: VoiceProvisioningJobType.TWILIO_SUBACCOUNT_CREATE,
      idempotencyKey: input.actor.idempotencyKey,
      currentStep: 'validate_prerequisites',
      progressPct: 5,
      createdByUserId: input.actor.userId ?? null,
      payload: {
        friendlyName: input.friendlyName ?? `SynqDrive ${input.organizationId}`,
        dryRun,
      },
    });

    const existingAccount = await this.findTwilioSubaccount(input.organizationId);
    if (existingAccount) {
      return this.completeSubaccountProvisionResult(input.organizationId, job, existingAccount, dryRun);
    }

    if (dryRun) {
      return {
        organizationId: input.organizationId,
        dryRun: true,
        mutating: false,
        job: this.toJobView(job),
        providerAccountId: null,
        maskedSubaccountRef: null,
        secretRefRegistered: false,
      };
    }

    if (!created && job.status === VoiceProvisioningJobStatus.COMPLETED && job.providerAccountId) {
      const account = await this.prisma.voiceProviderAccount.findFirst({
        where: { id: job.providerAccountId, organizationId: input.organizationId },
      });
      if (account) {
        return this.completeSubaccountProvisionResult(input.organizationId, job, account, false);
      }
    }

    let workingJob = job;
    try {
      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        startedAt: new Date(),
        currentStep: 'create_subaccount',
        progressPct: 25,
      });

      const friendlyName = input.friendlyName ?? `SynqDrive ${input.organizationId}`;
      const createdSubaccount = await this.providerClient.createSubaccount(friendlyName);

      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        currentStep: 'create_runtime_credentials',
        progressPct: 55,
      });

      const credentials = await this.providerClient.createRestrictedSubaccountApiKey(
        createdSubaccount.accountSid,
        'SynqDrive Runtime',
      );
      const secretRef = this.secretStore.registerSubaccountCredentials(input.organizationId, {
        ...credentials,
        authToken: createdSubaccount.authToken,
      });

      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        currentStep: 'persist_provider_account',
        progressPct: 80,
      });

      const providerAccount = await this.prisma.voiceProviderAccount.create({
        data: {
          organizationId: input.organizationId,
          provider: VoiceControlPlaneProvider.TWILIO,
          accountType: VoiceProviderAccountType.SUBACCOUNT,
          maskedExternalRef: maskTwilioSid(createdSubaccount.accountSid, 'AC') ?? 'AC***',
          secretRef,
          region: TWILIO_DEFAULT_REGION,
          edge: TWILIO_DEFAULT_EDGE,
          status: VoiceProviderAccountStatus.ACTIVE,
          lastSyncedAt: new Date(),
        },
      });

      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        completedAt: new Date(),
        providerAccountId: providerAccount.id,
        errorClass: null,
        errorMessage: null,
      });

      this.tenantClientFactory.invalidateOrganization(input.organizationId);
      void this.auditCostAction(input.organizationId, input.actor.userId, {
        action: 'TWILIO_SUBACCOUNT_PROVISIONED',
        providerAccountId: providerAccount.id,
        dryRun: false,
      });

      return this.completeSubaccountProvisionResult(
        input.organizationId,
        workingJob,
        providerAccount,
        false,
      );
    } catch (err: unknown) {
      const message = sanitizeTwilioProvisioningLogMessage(
        err instanceof Error ? err.message : 'Twilio subaccount provisioning failed.',
      );
      this.logger.warn(
        `Subaccount provisioning failed org=${input.organizationId}: ${message}`,
      );
      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        status: VoiceProvisioningJobStatus.FAILED,
        failedAt: new Date(),
        currentStep: 'failed',
        errorClass: this.mapErrorClass(err),
        errorMessage: message,
        retryCount: job.retryCount + 1,
      });
      throw err;
    }
  }

  async registerRuntimeCredentials(
    organizationId: string,
    actor: TwilioProvisioningActor,
  ): Promise<TwilioCredentialRegistrationResult> {
    this.assertProvisioningConfirmation(actor);
    const flags = readTwilioProvisioningFlags();
    const dryRun = actor.dryRun === true || !flags.stagingProviderActionsEnabled;
    this.assertMutationsAllowed(flags, dryRun);

    const account = await this.findTwilioSubaccount(organizationId);
    if (!account?.secretRef) {
      throw new BadRequestException('Twilio subaccount credentials are not provisioned yet.');
    }

    if (dryRun) {
      return {
        organizationId,
        dryRun: true,
        mutating: false,
        secretRef: null,
        rotationPrepared: true,
        permissionScope: 'incoming-phone-numbers:read, incoming-phone-numbers:write, calls:write',
      };
    }

    return {
      organizationId,
      dryRun: false,
      mutating: false,
      secretRef: account.secretRef,
      rotationPrepared: true,
      permissionScope: 'incoming-phone-numbers:read, incoming-phone-numbers:write, calls:write',
    };
  }

  async searchPhoneNumbers(
    input: TwilioPhoneNumberSearchInput,
  ): Promise<TwilioPhoneNumberSearchResponse> {
    await this.assertOrganizationSubaccountReady(input.organizationId);

    const cacheKey = JSON.stringify({
      organizationId: input.organizationId,
      numberType: input.numberType ?? TWILIO_PROVISIONING_DEFAULTS.defaultNumberType,
      areaCode: input.areaCode ?? null,
      contains: input.contains ?? null,
      limit: input.limit ?? 10,
    });
    const now = Date.now();
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        organizationId: input.organizationId,
        mutating: false,
        results: cached.results,
        cached: true,
        expiresAt: new Date(cached.expiresAt).toISOString(),
      };
    }

    const flags = readTwilioProvisioningFlags();
    if (!flags.stagingProviderActionsEnabled) {
      return {
        organizationId: input.organizationId,
        mutating: false,
        results: [],
        cached: false,
        expiresAt: new Date(now + TWILIO_PROVISIONING_DEFAULTS.phoneSearchCacheTtlMs).toISOString(),
      };
    }

    const client = await this.tenantClientFactory.getClientForOrganization(input.organizationId);
    const rows = await this.providerClient.searchAvailablePhoneNumbers(client, {
      country: TWILIO_PROVISIONING_DEFAULTS.defaultCountry,
      numberType: input.numberType ?? TWILIO_PROVISIONING_DEFAULTS.defaultNumberType,
      areaCode: input.areaCode,
      contains: input.contains,
      limit: Math.min(Math.max(input.limit ?? 10, 1), 30),
    });

    const expiresAt = now + TWILIO_PROVISIONING_DEFAULTS.phoneSearchCacheTtlMs;
    const results = rows.map((row) => {
      const selectionToken = digestCanonicalValue(
        `${input.organizationId}:${row.phoneNumber}:${cacheKey}:${expiresAt}`,
      );
      this.selectionCache.set(selectionToken, {
        organizationId: input.organizationId,
        phoneNumber: row.phoneNumber,
        expiresAt,
      });
      return {
        selectionToken,
        maskedPhoneNumber: maskE164(row.phoneNumber) ?? '***',
        locality: row.locality,
        region: row.region,
        capabilities: row.capabilities,
        regulatoryRequirements: row.regulatoryRequirements,
        expiresAt: new Date(expiresAt).toISOString(),
      };
    });
    this.searchCache.set(cacheKey, { expiresAt, results });

    return {
      organizationId: input.organizationId,
      mutating: false,
      results,
      cached: false,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async purchasePhoneNumberBySelectionToken(input: {
    organizationId: string;
    selectionToken: string;
    actor: TwilioProvisioningActor;
  }): Promise<TwilioPhoneNumberPurchaseResult> {
    const phoneNumber = this.resolveSelectionToken(input.organizationId, input.selectionToken);
    return this.purchasePhoneNumber({
      organizationId: input.organizationId,
      phoneNumber,
      actor: input.actor,
    });
  }

  resolveSelectionToken(organizationId: string, selectionToken: string): string {
    const entry = this.selectionCache.get(selectionToken);
    if (!entry || entry.organizationId !== organizationId || entry.expiresAt < Date.now()) {
      throw new BadRequestException('Number selection expired. Please search again.');
    }
    return entry.phoneNumber;
  }

  async purchasePhoneNumber(
    input: TwilioPhoneNumberPurchaseInput,
  ): Promise<TwilioPhoneNumberPurchaseResult> {
    this.assertProvisioningConfirmation(input.actor);
    const flags = readTwilioProvisioningFlags();
    const dryRun = input.actor.dryRun === true || !flags.stagingProviderActionsEnabled;
    this.assertMutationsAllowed(flags, dryRun);

    const preview = await this.previewProvisioning(input.organizationId);
    const stagingTrialBypass =
      isVoiceStagingOrganization(input.organizationId) &&
      flags.stagingProviderActionsEnabled &&
      preview.trialRestricted;
    if (preview.trialRestricted && !stagingTrialBypass) {
      throw new ForbiddenException('Phone number purchase is restricted while voice subscription is in trial.');
    }

    const regulatory = await this.resolveRegulatoryStatus(input.organizationId, !dryRun);
    if (regulatory.overall === 'REJECTED') {
      throw new BadRequestException('Regulatory compliance rejected — phone number purchase is blocked.');
    }
    if (regulatory.overall === 'PENDING' || regulatory.overall === 'IN_REVIEW') {
      throw new BadRequestException('Regulatory compliance is not approved yet.');
    }

    const providerAccount = await this.findTwilioSubaccountOrThrow(input.organizationId);
    const purchaseDigest = digestCanonicalValue(input.phoneNumber);

    const { job, created } = await this.provisioningJobRepository.persistOrGet({
      organizationId: input.organizationId,
      jobType: VoiceProvisioningJobType.TWILIO_NUMBER_PURCHASE,
      idempotencyKey: input.actor.idempotencyKey,
      currentStep: dryRun ? 'dry_run' : 'validate_regulatory',
      progressPct: dryRun ? 100 : 10,
      providerAccountId: providerAccount.id,
      createdByUserId: input.actor.userId ?? null,
      payload: {
        maskedPhoneNumber: maskE164(input.phoneNumber),
        e164Digest: purchaseDigest,
        dryRun,
      },
    });

    const existingPhone = await this.prisma.voicePhoneNumber.findFirst({
      where: {
        organizationId: input.organizationId,
        e164Digest: purchaseDigest,
        archivedAt: null,
      },
    });
    if (existingPhone) {
      return {
        organizationId: input.organizationId,
        dryRun,
        mutating: false,
        job: this.toJobView(job),
        phoneNumberId: existingPhone.id,
        maskedPhoneNumber: existingPhone.maskedPhoneNumber,
        lifecycle: existingPhone.lifecycle,
        regulatoryStatus: existingPhone.regulatoryStatus,
      };
    }

    if (dryRun) {
      return {
        organizationId: input.organizationId,
        dryRun: true,
        mutating: false,
        job: this.toJobView(job),
        phoneNumberId: null,
        maskedPhoneNumber: maskE164(input.phoneNumber),
        lifecycle: VoicePhoneNumberLifecycle.DRAFT,
        regulatoryStatus: regulatory.overall,
      };
    }

    if (!created && job.status === VoiceProvisioningJobStatus.COMPLETED && job.phoneNumberId) {
      const phone = await this.phoneNumberRepository.findById(input.organizationId, job.phoneNumberId);
      if (phone) {
        return {
          organizationId: input.organizationId,
          dryRun: false,
          mutating: true,
          job: this.toJobView(job),
          phoneNumberId: phone.id,
          maskedPhoneNumber: phone.maskedPhoneNumber,
          lifecycle: phone.lifecycle,
          regulatoryStatus: phone.regulatoryStatus,
        };
      }
    }

    let workingJob = job;
    try {
      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        status: VoiceProvisioningJobStatus.IN_PROGRESS,
        startedAt: new Date(),
        currentStep: 'purchase_number',
        progressPct: 40,
      });

      const client = await this.tenantClientFactory.getClientForOrganization(input.organizationId);
      const purchased = await this.providerClient.purchasePhoneNumber(client, input.phoneNumber);

      const phone = await this.phoneNumberRepository.create({
        organizationId: input.organizationId,
        providerAccountId: providerAccount.id,
        maskedPhoneNumber: maskE164(purchased.phoneNumber) ?? '***',
        protectedE164: `vault://e164/${input.organizationId}/${purchaseDigest}`,
        protectedExternalRef: purchased.sid,
        e164Digest: purchaseDigest,
        externalRefDigest: digestCanonicalValue(purchased.sid),
        region: TWILIO_DEFAULT_REGION,
        capabilities: purchased.capabilities as Prisma.InputJsonValue,
        lifecycle: VoicePhoneNumberLifecycle.PROVISIONING,
        regulatoryStatus: regulatory.overall,
        regulatoryDetails: regulatory,
      });

      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'completed',
        progressPct: 100,
        completedAt: new Date(),
        phoneNumberId: phone.id,
        errorClass: null,
        errorMessage: null,
      });

      void this.auditCostAction(input.organizationId, input.actor.userId, {
        action: 'TWILIO_NUMBER_PURCHASED',
        phoneNumberId: phone.id,
        dryRun: false,
      });

      return {
        organizationId: input.organizationId,
        dryRun: false,
        mutating: true,
        job: this.toJobView(workingJob),
        phoneNumberId: phone.id,
        maskedPhoneNumber: phone.maskedPhoneNumber,
        lifecycle: phone.lifecycle,
        regulatoryStatus: phone.regulatoryStatus,
      };
    } catch (err: unknown) {
      const message = sanitizeTwilioProvisioningLogMessage(
        err instanceof Error ? err.message : 'Twilio phone number purchase failed.',
      );
      workingJob = await this.provisioningJobRepository.updateProgress(input.organizationId, job.id, {
        status: VoiceProvisioningJobStatus.FAILED,
        failedAt: new Date(),
        currentStep: 'failed',
        errorClass: this.mapErrorClass(err),
        errorMessage: message,
        retryCount: job.retryCount + 1,
      });
      throw err;
    }
  }

  async getRegulatoryStatus(organizationId: string): Promise<TwilioRegulatoryStatusView> {
    return this.resolveRegulatoryStatus(organizationId, false);
  }

  resetCachesForTests(): void {
    this.searchCache.clear();
    this.selectionCache.clear();
  }

  private async resolveRegulatoryStatus(
    organizationId: string,
    useProvider: boolean,
  ): Promise<TwilioRegulatoryStatusView> {
    const latestPhone = await this.prisma.voicePhoneNumber.findFirst({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
    if (latestPhone?.regulatoryDetails && typeof latestPhone.regulatoryDetails === 'object') {
      const details = latestPhone.regulatoryDetails as TwilioRegulatoryStatusView;
      return {
        bundle: details.bundle ?? 'pending',
        address: details.address ?? 'pending',
        endUser: details.endUser ?? 'pending',
        overall: latestPhone.regulatoryStatus,
      };
    }

    if (!useProvider) {
      return {
        bundle: 'pending',
        address: 'pending',
        endUser: 'pending',
        overall: VoicePhoneRegulatoryStatus.UNKNOWN,
      };
    }

    try {
      const client = await this.tenantClientFactory.getClientForOrganization(organizationId);
      const status = await this.providerClient.getRegulatoryStatus(client);
      const bundle = mapRegulatoryItemStatus(status.bundle);
      const address = mapRegulatoryItemStatus(status.address);
      const endUser = mapRegulatoryItemStatus(status.endUser);
      return {
        bundle,
        address,
        endUser,
        overall: mapOverallRegulatoryStatus(bundle, address, endUser),
      };
    } catch {
      return {
        bundle: 'pending',
        address: 'pending',
        endUser: 'pending',
        overall: VoicePhoneRegulatoryStatus.UNKNOWN,
      };
    }
  }

  private async loadProvisioningContext(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new TwilioTenantIsolationViolationError('Organization not found.');
    }

    const flags = readTwilioProvisioningFlags();
    const stagingOrg = isVoiceStagingOrganization(organizationId);
    const subscriptions = await this.subscriptionRepository.listByOrganization(organizationId);
    const activeSubscription = subscriptions.find(
      (row) => row.status === VoiceSubscriptionStatus.ACTIVE,
    );
    const trialSubscription = subscriptions.find(
      (row) => row.status === VoiceSubscriptionStatus.TRIAL,
    );
    const voiceSubscriptionActive = Boolean(
      activeSubscription || (stagingOrg && trialSubscription),
    );
    const trialRestricted =
      !activeSubscription &&
      !(stagingOrg && flags.stagingProviderActionsEnabled && trialSubscription);

    const existingAccount = await this.findTwilioSubaccount(organizationId);
    const parentTwilioConfigured = this.controlPlane.isConfigured();

    return {
      blockers: [] as string[],
      warnings: [] as string[],
      voiceSubscriptionActive,
      voiceSubscriptionStatus:
        activeSubscription?.status ?? trialSubscription?.status ?? subscriptions[0]?.status ?? null,
      trialRestricted,
      existingSubaccount: Boolean(existingAccount),
      maskedSubaccountRef: existingAccount?.maskedExternalRef ?? null,
      parentTwilioConfigured,
    };
  }

  private buildExpectedSteps(existingSubaccount: boolean) {
    if (existingSubaccount) {
      return [
        {
          code: 'verify_subaccount',
          label: 'Verify subaccount',
          description: 'Confirm the existing Twilio subaccount and runtime credentials.',
        },
        {
          code: 'search_numbers',
          label: 'Search numbers',
          description: 'Search German local numbers in the org subaccount.',
        },
        {
          code: 'purchase_number',
          label: 'Purchase number',
          description: 'Purchase an approved number after explicit master-admin confirmation.',
        },
      ];
    }

    return [
      {
        code: 'create_subaccount',
        label: 'Create subaccount',
        description: 'Create exactly one Twilio subaccount for the organization.',
      },
      {
        code: 'register_credentials',
        label: 'Register credentials',
        description: 'Store restricted runtime credentials in the secret store.',
      },
      {
        code: 'search_numbers',
        label: 'Search numbers',
        description: 'Search German local numbers in the org subaccount.',
      },
      {
        code: 'purchase_number',
        label: 'Purchase number',
        description: 'Purchase an approved number after explicit master-admin confirmation.',
      },
    ];
  }

  private async findTwilioSubaccount(organizationId: string) {
    return this.prisma.voiceProviderAccount.findFirst({
      where: {
        organizationId,
        provider: VoiceControlPlaneProvider.TWILIO,
        accountType: VoiceProviderAccountType.SUBACCOUNT,
        archivedAt: null,
      },
    });
  }

  private async findTwilioSubaccountOrThrow(organizationId: string) {
    const account = await this.findTwilioSubaccount(organizationId);
    if (!account) {
      throw new BadRequestException('Twilio subaccount is not provisioned for this organization.');
    }
    return account;
  }

  private async assertOrganizationSubaccountReady(organizationId: string): Promise<void> {
    await this.findTwilioSubaccountOrThrow(organizationId);
  }

  private assertProvisioningConfirmation(actor: TwilioProvisioningActor): void {
    if (!actor.idempotencyKey?.trim()) {
      throw new BadRequestException('idempotency-key header is required.');
    }
    if (!actor.confirm) {
      throw new BadRequestException('Destructive provisioning actions require confirm=true.');
    }
  }

  private assertMutationsAllowed(
    flags: ReturnType<typeof readTwilioProvisioningFlags>,
    dryRun: boolean,
  ): void {
    if (!flags.subaccountsEnabled) {
      throw new ForbiddenException('Twilio subaccount provisioning is disabled by feature flag.');
    }
    if (!dryRun && !flags.stagingProviderActionsEnabled) {
      throw new ForbiddenException(
        'Provider mutations are disabled until VOICE_AI_PROVISIONING_STAGING_ENABLED=true.',
      );
    }
  }

  private completeSubaccountProvisionResult(
    organizationId: string,
    job: { id: string; jobType: VoiceProvisioningJobType; status: VoiceProvisioningJobStatus; currentStep: string | null; progressPct: number | null; idempotencyKey: string; providerAccountId: string | null; phoneNumberId: string | null; errorClass: VoiceProvisioningErrorClass | null; errorMessage: string | null },
    account: { id: string; maskedExternalRef: string; secretRef: string | null },
    dryRun: boolean,
  ): TwilioSubaccountProvisionResult {
    return {
      organizationId,
      dryRun,
      mutating: !dryRun,
      job: this.toJobView(job),
      providerAccountId: account.id,
      maskedSubaccountRef: account.maskedExternalRef,
      secretRefRegistered: Boolean(account.secretRef),
    };
  }

  private toJobView(job: {
    id: string;
    jobType: VoiceProvisioningJobType;
    status: VoiceProvisioningJobStatus;
    currentStep: string | null;
    progressPct: number | null;
    idempotencyKey: string;
    providerAccountId: string | null;
    phoneNumberId: string | null;
    errorClass: VoiceProvisioningErrorClass | null;
    errorMessage: string | null;
  }): TwilioProvisioningJobView {
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      currentStep: job.currentStep,
      progressPct: job.progressPct,
      idempotencyKey: job.idempotencyKey,
      providerAccountId: job.providerAccountId,
      phoneNumberId: job.phoneNumberId,
      errorClass: job.errorClass,
      errorMessage: job.errorMessage,
    };
  }

  private mapErrorClass(err: unknown): VoiceProvisioningErrorClass {
    if (err instanceof TwilioInvalidConfigurationError) {
      return VoiceProvisioningErrorClass.CONFIGURATION;
    }
    if (err instanceof TwilioTenantIsolationViolationError) {
      return VoiceProvisioningErrorClass.PERMISSION;
    }
    if (err instanceof TwilioProviderError) {
      return VoiceProvisioningErrorClass.PROVIDER;
    }
    return VoiceProvisioningErrorClass.UNKNOWN;
  }

  private auditCostAction(
    organizationId: string,
    actorUserId: string | undefined,
    meta: Record<string, unknown>,
  ): void {
    void this.audit.record({
      actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.ADMIN_OVERRIDE,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: organizationId,
      description: String(meta.action ?? 'voice_twilio_provisioning'),
      level: 'CRITICAL',
      metaJson: meta,
    });
  }
}

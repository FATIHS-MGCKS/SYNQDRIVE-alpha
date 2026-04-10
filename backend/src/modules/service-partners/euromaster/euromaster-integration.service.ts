import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import euromasterConfig from '@config/euromaster.config';
import { EuromasterClient } from './euromaster.client';
import { EuromasterMapperService } from './euromaster-mapper.service';
import {
  EuromasterAppointmentInput,
  EuromasterAppointmentResult,
  EuromasterStatusResult,
  EuromasterBranchResult,
  EuromasterOperation,
  EUROMASTER_REQUIRED_SCOPES,
} from './euromaster.types';
import {
  EuromasterIntegrationDisabledError,
  EuromasterTenantNotAssignedError,
  EuromasterAuthorizationMissingError,
  EuromasterApiError,
} from './euromaster.errors';

/**
 * Domain-facing Euromaster integration service.
 * Orchestrates validation, data-auth enforcement, mapping, API calls,
 * and persistence. Other SynqDrive services call this, never the
 * raw client directly.
 */
@Injectable()
export class EuromasterIntegrationService {
  private readonly logger = new Logger(EuromasterIntegrationService.name);

  constructor(
    @Inject(euromasterConfig.KEY) private readonly conf: ConfigType<typeof euromasterConfig>,
    private readonly prisma: PrismaService,
    private readonly client: EuromasterClient,
    private readonly mapper: EuromasterMapperService,
  ) {}

  // ─── Public integration methods ───────────────────────────────────

  async createAppointment(
    input: EuromasterAppointmentInput,
  ): Promise<EuromasterAppointmentResult> {
    const orgId = input.organizationId;
    const start = Date.now();

    this.logger.log(`createAppointment started — org=${orgId}, type=${input.serviceType}`);

    this.assertEnabled();
    const { assignment, partner } = await this.validateTenantAssignment(orgId);
    await this.enforceDataAuth(orgId, partner.id, 'createAppointment');

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { companyName: true },
    });

    let result: EuromasterAppointmentResult;

    if (this.conf.liveApiEnabled) {
      const apiPayload = this.mapper.toApiRequest(
        input,
        this.getCustomerId(assignment),
        org?.companyName ?? 'Unknown',
      );

      try {
        const apiResponse = await this.client.createAppointment(apiPayload);
        result = this.mapper.fromApiResponse(apiResponse);
      } catch (err) {
        this.logger.error(`Euromaster API call failed for org=${orgId}: ${(err as Error).message}`);
        await this.persistFailedAttempt(orgId, partner.id, input, err as Error);
        throw err;
      }
    } else {
      result = this.mapper.createManualResult(input);
      this.logger.log(`Manual mode — case created locally for org=${orgId}`);
    }

    const serviceCase = await this.persistServiceCase(orgId, partner.id, input, result);

    const duration = Date.now() - start;
    this.logger.log(
      `createAppointment completed in ${duration}ms — org=${orgId}, mode=${result.mode}, ref=${result.externalReference}, caseId=${serviceCase.id}`,
    );

    return result;
  }

  async createTireServiceRequest(
    input: EuromasterAppointmentInput,
  ): Promise<EuromasterAppointmentResult> {
    const orgId = input.organizationId;
    await this.enforceDataAuth(orgId, await this.getPartnerId(orgId), 'tireService');
    return this.createAppointment({ ...input, serviceType: 'TIRE_SERVICE' });
  }

  async createFleetConditionServiceCase(
    input: EuromasterAppointmentInput,
  ): Promise<EuromasterAppointmentResult> {
    return this.createAppointment(input);
  }

  async syncExternalStatus(
    orgId: string,
    caseId: string,
  ): Promise<EuromasterStatusResult | null> {
    this.assertEnabled();
    const { partner } = await this.validateTenantAssignment(orgId);
    await this.enforceDataAuth(orgId, partner.id, 'statusCheck');

    const sc = await this.prisma.partnerServiceCase.findFirst({
      where: { id: caseId, organizationId: orgId, partnerId: partner.id },
    });
    if (!sc) return null;

    const extRef = (sc.metadata as Record<string, unknown>)?.externalReference as string | undefined;
    if (!extRef || !this.conf.liveApiEnabled) {
      return {
        externalReference: extRef ?? sc.id,
        status: sc.status,
        mode: 'manual',
      };
    }

    try {
      const apiStatus = await this.client.getAppointmentStatus(extRef);

      const statusMap: Record<string, string> = {
        SCHEDULED: 'BOOKED',
        IN_PROGRESS: 'IN_PROGRESS',
        COMPLETED: 'COMPLETED',
        CANCELLED: 'CANCELLED',
        NO_SHOW: 'CANCELLED',
      };
      const newStatus = statusMap[apiStatus.status];

      if (newStatus && newStatus !== sc.status) {
        await this.prisma.partnerServiceCase.update({
          where: { id: sc.id },
          data: {
            status: newStatus as any,
            completedAt: newStatus === 'COMPLETED' ? new Date() : undefined,
            metadata: {
              ...(sc.metadata as Record<string, unknown>),
              lastSyncAt: new Date().toISOString(),
              invoiceReference: apiStatus.invoiceReference,
              actualCostEur: apiStatus.actualCostEur,
            },
          },
        });

        await this.prisma.partnerServiceCaseEvent.create({
          data: {
            caseId: sc.id,
            type: 'EXTERNAL_STATUS_SYNC',
            payload: { from: sc.status, to: newStatus, externalStatus: apiStatus.status },
          },
        });
      }

      return {
        externalReference: extRef,
        status: apiStatus.status,
        lastUpdatedAt: apiStatus.lastUpdatedAt,
        completionNotes: apiStatus.completionNotes,
        invoiceReference: apiStatus.invoiceReference,
        actualCostEur: apiStatus.actualCostEur,
        mode: 'live',
      };
    } catch (err) {
      this.logger.warn(`Status sync failed for case ${caseId}: ${(err as Error).message}`);
      return {
        externalReference: extRef,
        status: sc.status,
        mode: 'manual',
      };
    }
  }

  async searchNearbyBranches(
    orgId: string,
    lat?: number,
    lng?: number,
    postalCode?: string,
    radiusKm = 30,
  ): Promise<EuromasterBranchResult[]> {
    this.assertEnabled();
    await this.validateTenantAssignment(orgId);

    if (!this.conf.liveApiEnabled) {
      return [];
    }

    try {
      const result = await this.client.searchBranches({
        latitude: lat,
        longitude: lng,
        postalCode,
        radiusKm,
      });
      return result.branches.map((b) => this.mapper.fromBranch(b));
    } catch (err) {
      this.logger.warn(`Branch search failed: ${(err as Error).message}`);
      return [];
    }
  }

  async validateEuromasterAccessForTenant(orgId: string): Promise<{
    enabled: boolean;
    assigned: boolean;
    liveApiEnabled: boolean;
    manualMode: boolean;
    dataAuthGranted: boolean;
    grantedScopes: string[];
    mode: string;
  }> {
    const enabled = this.conf.enabled;
    const liveApiEnabled = this.conf.liveApiEnabled;
    const manualMode = this.conf.manualMode;

    let assigned = false;
    let partnerId: string | null = null;
    try {
      const { partner } = await this.validateTenantAssignment(orgId);
      assigned = true;
      partnerId = partner.id;
    } catch { /* not assigned */ }

    let dataAuthGranted = false;
    let grantedScopes: string[] = [];
    if (partnerId) {
      const auth = await this.prisma.partnerDataAuthorization.findUnique({
        where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
      });
      if (auth?.status === 'GRANTED') {
        dataAuthGranted = true;
        grantedScopes = (auth.grantedScopes as string[]) ?? [];
      }
    }

    const mode = !enabled ? 'disabled' :
      !assigned ? 'not_assigned' :
      liveApiEnabled ? 'live' : 'manual';

    return { enabled, assigned, liveApiEnabled, manualMode, dataAuthGranted, grantedScopes, mode };
  }

  // ─── Validation helpers ───────────────────────────────────────────

  private assertEnabled(): void {
    if (!this.conf.enabled) {
      throw new EuromasterIntegrationDisabledError();
    }
  }

  private async validateTenantAssignment(orgId: string) {
    const assignment = await this.prisma.tenantServicePartnerAssignment.findFirst({
      where: {
        organizationId: orgId,
        partner: { provider: 'EUROMASTER' },
        status: 'ACTIVE',
      },
      include: { partner: true },
    });

    if (!assignment) {
      throw new EuromasterTenantNotAssignedError(orgId);
    }

    return { assignment, partner: assignment.partner };
  }

  private async enforceDataAuth(
    orgId: string,
    partnerId: string,
    operation: EuromasterOperation,
  ): Promise<void> {
    const required = EUROMASTER_REQUIRED_SCOPES[operation];
    if (!required.length) return;

    const auth = await this.prisma.partnerDataAuthorization.findUnique({
      where: { organizationId_partnerId: { organizationId: orgId, partnerId } },
    });

    if (!auth || auth.status !== 'GRANTED') {
      throw new EuromasterAuthorizationMissingError([...required], orgId);
    }

    const granted = new Set((auth.grantedScopes as string[]) ?? []);
    const missing = required.filter((s) => !granted.has(s));
    if (missing.length > 0) {
      throw new EuromasterAuthorizationMissingError([...missing], orgId);
    }
  }

  private async getPartnerId(orgId: string): Promise<string> {
    const { partner } = await this.validateTenantAssignment(orgId);
    return partner.id;
  }

  private getCustomerId(assignment: any): string {
    const config = (assignment.configJson ?? {}) as Record<string, unknown>;
    return (config.customerId as string) ?? assignment.organizationId;
  }

  // ─── Persistence helpers ──────────────────────────────────────────

  private async persistServiceCase(
    orgId: string,
    partnerId: string,
    input: EuromasterAppointmentInput,
    result: EuromasterAppointmentResult,
  ) {
    const metadata = this.mapper.buildCaseMetadata(input, result);
    const title = this.mapper.mapServiceTypeToTitle(input.serviceType);

    const statusMap: Record<string, string> = {
      confirmed: 'BOOKED',
      pending: 'REQUESTED',
      rejected: 'CANCELLED',
      requires_callback: 'REQUESTED',
      manual_pending: 'DRAFT',
    };

    const sc = await this.prisma.partnerServiceCase.create({
      data: {
        organizationId: orgId,
        partnerId,
        vehicleId: input.vehicleId,
        type: input.serviceType,
        status: (statusMap[result.status] ?? 'DRAFT') as any,
        title,
        description: input.serviceDescription ?? input.notes,
        externalReference: result.externalReference,
        scheduledAt: result.scheduledAt ? new Date(result.scheduledAt) : undefined,
        createdBy: input.createdBy,
        metadata: metadata as any,
      },
    });

    await this.prisma.partnerServiceCaseEvent.create({
      data: {
        caseId: sc.id,
        type: result.mode === 'live' ? 'EXTERNAL_CREATED' : 'MANUAL_CREATED',
        payload: {
          externalReference: result.externalReference,
          status: result.status,
          mode: result.mode,
        },
      },
    });

    return sc;
  }

  private async persistFailedAttempt(
    orgId: string,
    partnerId: string,
    input: EuromasterAppointmentInput,
    error: Error,
  ) {
    try {
      const sc = await this.prisma.partnerServiceCase.create({
        data: {
          organizationId: orgId,
          partnerId,
          vehicleId: input.vehicleId,
          type: input.serviceType,
          status: 'DRAFT',
          title: `${this.mapper.mapServiceTypeToTitle(input.serviceType)} (failed)`,
          description: input.serviceDescription ?? input.notes,
          createdBy: input.createdBy,
          metadata: {
            failedAt: new Date().toISOString(),
            errorCode: (error as any).code,
            errorMessage: error.message,
            vehiclePlate: input.vehiclePlate,
          },
        },
      });

      await this.prisma.partnerServiceCaseEvent.create({
        data: {
          caseId: sc.id,
          type: 'EXTERNAL_CALL_FAILED',
          payload: {
            errorCode: (error as any).code,
            errorMessage: error.message,
            statusCode: (error as any).statusCode,
          },
        },
      });
    } catch (persistErr) {
      this.logger.error(`Failed to persist error case: ${(persistErr as Error).message}`);
    }
  }
}
